import { describe, expect, it } from "vitest";

import { isValidSplitTree } from "../../main/splitMode";
import {
  analysisMeaningMap,
  buildFlatSplitTree,
  defaultBreaks,
  groupsFromBreaks,
  normalizeSplitTreeInput,
  tokenizeSentence,
  treeChunkGroups,
  validateAnalysisWords,
} from "../splitTreeTools";

describe("manage/splitTreeTools", () => {
  it("tokenizes words and punctuation like the offline script", () => {
    const tokens = tokenizeSentence('When next year\'s crop, "hello"—world.');
    expect(tokens.map((token) => token.word)).toEqual([
      "When",
      "next",
      "year's",
      "crop",
      'hello"—world',
    ]);
    expect(tokens[3].punct).toBe(",");
    expect(tokens[4].punct).toBe('".');
  });

  it("validates analysis word coverage", () => {
    const english = "The cat sleeps.";
    const analysis = {
      segments: [
        {
          role: "主语",
          roleEn: "subject",
          text: "The cat",
          explanation: "",
          words: [
            { text: "The", phonetic: "", meaning: "这只", pos: "冠词" },
            { text: "cat", phonetic: "", meaning: "猫", pos: "名词" },
          ],
        },
        {
          role: "谓语",
          roleEn: "predicate",
          text: "sleeps",
          explanation: "",
          words: [{ text: "sleeps", phonetic: "", meaning: "睡觉", pos: "动词" }],
        },
      ],
    };
    expect(validateAnalysisWords(english, analysis).ok).toBe(true);
    expect(
      validateAnalysisWords(english, {
        segments: [analysis.segments[0]],
      }).ok,
    ).toBe(false);
  });

  it("builds a flat three-level split tree that passes validation", () => {
    const english = "The cat sleeps on the mat.";
    const tokens = tokenizeSentence(english);
    const words = tokens.filter((token) => token.word);
    const breaks = new Array(words.length - 1).fill(false);
    breaks[2] = true; // The cat sleeps | on the mat

    const tree = buildFlatSplitTree({
      english,
      chinese: "猫在垫子上睡觉。",
      tokens,
      breaks,
      groupZh: { 0: "猫睡觉", 3: "在垫子上" },
      wordZh: new Map([["cat", "猫"]]),
    });

    expect(tree).not.toBeNull();
    expect(isValidSplitTree(tree)).toBe(true);
    expect(tree!.tree.level).toBe(3);
    expect(tree!.tree.children).toHaveLength(2);
    expect(tree!.tree.children![0].level).toBe(2);
    expect(tree!.tree.children![0].children!.map((node) => node.en)).toEqual([
      "The",
      "cat",
      "sleeps",
    ]);
    expect(tree!.tree.children![0].zh).toBe("猫睡觉");
  });

  it("handles long sentences with dashes, quotes and numbers", () => {
    const english =
      'Only in the past 20 years have specialists realized that signed languages are unique—a "speech of the hand."';
    const tokens = tokenizeSentence(english);
    const breaks = defaultBreaks(tokens);
    const tree = buildFlatSplitTree({
      english,
      chinese: "直到最近20年，语言学专家们才认识到了手语的独特性。",
      tokens,
      breaks,
      groupZh: {},
      wordZh: new Map(),
    });
    expect(tree).not.toBeNull();
    expect(isValidSplitTree(tree)).toBe(true);
    expect(tree!.tree.range[1]).toBe(tokens.length - 1);
  });

  it("accepts a bare root node and fills tokens from the current English", () => {
    const english = "The cat sleeps.";
    const tokens = tokenizeSentence(english);
    const node = {
      level: 2,
      range: [0, tokens.length - 1],
      en: "The cat sleeps",
      zh: "猫在睡觉",
      children: [
        { level: 1, range: [0, 0], en: "The", zh: "这只", children: [] },
        { level: 1, range: [1, 1], en: "cat", zh: "猫", children: [] },
        { level: 1, range: [2, 2], en: "sleeps", zh: "睡觉", children: [] },
      ],
    };

    const normalized = normalizeSplitTreeInput(node, english);
    expect(normalized.error).toBeUndefined();
    expect(normalized.tree?.tokens).toHaveLength(tokens.length);
    expect(isValidSplitTree(normalized.tree)).toBe(true);
    expect(normalized.tree?.tree).toEqual(node);
  });

  it("keeps a complete rawText/tokens/tree object as-is", () => {
    const english = "The cat sleeps.";
    const tokens = tokenizeSentence(english);
    const full = buildFlatSplitTree({
      english,
      chinese: "猫在睡觉。",
      tokens,
      breaks: [],
      groupZh: {},
      wordZh: new Map(),
    })!;

    const normalized = normalizeSplitTreeInput(full, english);
    expect(normalized.tree).toEqual(full);
  });

  it("rejects a non-node JSON value", () => {
    expect(normalizeSplitTreeInput({ hello: "world" }, "The cat sleeps.").error).toBeTruthy();
    expect(normalizeSplitTreeInput([], "The cat sleeps.").error).toBeTruthy();
  });

  it("derives groups from break flags", () => {
    expect(groupsFromBreaks([], 1)).toEqual([{ start: 0, end: 0 }]);
    expect(groupsFromBreaks([true, false, true], 4)).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 2 },
      { start: 3, end: 3 },
    ]);
  });

  it("reads chunk groups back from an existing tree", () => {
    const english = "The cat sleeps on the mat.";
    const tokens = tokenizeSentence(english);
    const words = tokens.filter((token) => token.word);
    const breaks = new Array(words.length - 1).fill(false);
    breaks[2] = true;
    const tree = buildFlatSplitTree({
      english,
      chinese: "猫在垫子上睡觉。",
      tokens,
      breaks,
      groupZh: { 0: "猫睡觉", 3: "在垫子上" },
      wordZh: new Map(),
    });
    expect(treeChunkGroups(tree)).toEqual([
      { start: 0, end: 2, zh: "猫睡觉" },
      { start: 3, end: 5, zh: "在垫子上" },
    ]);
  });

  it("prefers level-2 chunks in a nested tree", () => {
    const english = "a b c d.";
    const tokens = tokenizeSentence(english);
    const leaf = (index: number, word: string, zh: string) => ({
      level: 1,
      range: [index, index] as [number, number],
      en: word,
      zh,
      children: [],
    });
    const tree = {
      rawText: english,
      tokens,
      tree: {
        level: 3,
        range: [0, 3] as [number, number],
        en: "a b c d",
        zh: "四块",
        children: [
          {
            level: 2,
            range: [0, 1] as [number, number],
            en: "a b",
            zh: "甲",
            children: [leaf(0, "a", "A"), leaf(1, "b", "B")],
          },
          {
            level: 2,
            range: [2, 3] as [number, number],
            en: "c d",
            zh: "乙",
            children: [leaf(2, "c", "C"), leaf(3, "d", "D")],
          },
        ],
      },
    };
    expect(treeChunkGroups(tree)).toEqual([
      { start: 0, end: 1, zh: "甲" },
      { start: 2, end: 3, zh: "乙" },
    ]);
  });

  it("flattens a deep nested tree to contiguous chunk-level groups", () => {
    const english = "a b c d e f.";
    const tokens = tokenizeSentence(english);
    const tree = {
      rawText: english,
      tokens,
      tree: {
        level: 4,
        range: [0, 5] as [number, number],
        en: "a b c d e f",
        zh: "整句",
        children: [
          { level: 2, range: [0, 1] as [number, number], en: "a b", zh: "甲块", children: [] },
          {
            level: 3,
            range: [2, 5] as [number, number],
            en: "c d e f",
            zh: "乙块",
            children: [
              { level: 1, range: [2, 2] as [number, number], en: "c", zh: "丙", children: [] },
              {
                level: 2,
                range: [3, 5] as [number, number],
                en: "d e f",
                zh: "丁块",
                children: [
                  { level: 1, range: [3, 3] as [number, number], en: "d", zh: "D", children: [] },
                  {
                    level: 1,
                    range: [4, 5] as [number, number],
                    en: "e f",
                    zh: "戊",
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(treeChunkGroups(tree)).toEqual([
      { start: 0, end: 1, zh: "甲块" },
      { start: 2, end: 2, zh: "丙" },
      { start: 3, end: 5, zh: "丁块" },
    ]);
  });

  it("auto-breaks at punctuation and conjunctions", () => {
    const tokens = tokenizeSentence("I like tea, and she likes coffee.");
    expect(defaultBreaks(tokens)).toEqual([false, false, true, false, false, false]);
  });

  it("builds a meaning map from analysis", () => {
    const map = analysisMeaningMap({
      segments: [
        {
          role: "谓语",
          roleEn: "predicate",
          text: "apply",
          explanation: "",
          words: [{ text: "apply", phonetic: "", meaning: "应用", pos: "动词" }],
        },
      ],
    });
    expect(map.get("apply")).toBe("应用");
  });
});
