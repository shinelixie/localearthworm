import { describe, expect, it } from "vitest";

import type { Statement } from "~/types";
import { buildMergeTree, chunkSentence, splitStatements } from "../splitMode";

const statement: Statement = {
  id: "s1",
  order: 1,
  chinese: "如果我们探测到了来自外星文明的信号，我们应该如何回应是一个备受争议的问题。",
  english:
    "There is considerable debate over how we should react if we detect a signal from an alien civilisation.",
  soundmark: "",
  isMastered: false,
};

describe("chunkSentence", () => {
  it("breaks at prepositions and conjunctions", () => {
    const chunks = chunkSentence(statement.english);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toBe(statement.english);
    // 断开点应在介词/连词前：over / if / from 都会成为某个语块的开头
    expect(chunks.some((chunk) => /^(over|if|from)\b/i.test(chunk))).toBe(true);
  });

  it("keeps short sentences whole", () => {
    expect(chunkSentence("I like it")).toEqual(["I like it"]);
  });
});

describe("buildMergeTree", () => {
  it("produces only contiguous, non-overlapping fragments", () => {
    const sentence =
      "We become defensive when criticised, and apply negative stereotypes to others to boost our own esteem.";
    const chunks = chunkSentence(sentence);
    const validFragments = new Set<string>();
    for (let start = 0; start < chunks.length; start++) {
      for (let end = start + 1; end <= chunks.length; end++) {
        validFragments.add(chunks.slice(start, end).join(" "));
      }
    }

    for (const node of buildMergeTree(sentence)) {
      expect(validFragments.has(node.text), `出现重叠/半截语块切片: ${node.text}`).toBe(true);
    }
  });

  it("rolls the merge chain up to the full sentence", () => {
    const sentence =
      "Many studies of longevity show that people live the longest in environments where physical activity is part of everyday life.";
    const nodes = buildMergeTree(sentence);
    const mergeNodes = nodes.filter((node) => node.level === 3);

    // 滚雪球：第 i 个合并题 = 第 1..i 个分句的前缀
    for (let i = 1; i < mergeNodes.length; i++) {
      expect(mergeNodes[i].text).toContain(mergeNodes[i - 1].text);
      expect(mergeNodes[i].text.length).toBeGreaterThan(mergeNodes[i - 1].text.length);
    }

    expect(nodes[nodes.length - 1].text).toBe(sentence);
  });
});

describe("splitStatements", () => {
  it("returns only the full sentence for sentence_only", () => {
    const items = splitStatements([statement], "sentence_only");
    expect(items).toHaveLength(1);
    expect(items[0].english).toBe(statement.english);
    expect(items[0].isFragment).toBe(false);
  });

  it("word_first starts from leaves and ends with the full sentence", () => {
    // 用含多语块分句的句子：首题必须是最小意群（片段）
    const sentence =
      "Many studies of longevity show that people live the longest in environments where physical activity is part of everyday life.";
    const items = splitStatements([{ ...statement, english: sentence }], "word_first");
    expect(items.length).toBeGreaterThanOrEqual(4);
    const last = items[items.length - 1];
    expect(last.english).toBe(sentence);
    expect(last.isFragment).toBe(false);
    expect(items[0].isFragment).toBe(true);
    expect(items[0].hint).toContain("意群 1");
  });

  it("both modes coincide when no unit has multiple chunks (nothing to prune)", () => {
    // 每个分句单元只有一个语块时，叶子层为空，两种模式题目序列相同是正确行为
    const wf = splitStatements([statement], "word_first");
    const cf = splitStatements([statement], "chunk_first");
    expect(cf.map((item) => item.english)).toEqual(wf.map((item) => item.english));
  });

  it("chunk_first skips leaves entirely and keeps the roll-up chain", () => {
    const items = splitStatements([statement], "chunk_first");
    // 不含任何 L1 意群题
    expect(items.every((item) => (item.level ?? 0) >= 2)).toBe(true);
    // 首题就是完整分句/短语
    expect(items[0].hint).toMatch(/分句|子句|短语/);
    // 仍保留滚雪球合并层
    expect(items.some((item) => item.hint?.includes("滚雪球"))).toBe(true);
    const last = items[items.length - 1];
    expect(last.english).toBe(statement.english);
  });

  it("chunk_first is strictly fewer steps than word_first on the same sentence", () => {
    // 需要含多语块分句的句子，剪掉叶子层才真的变短
    const sentence =
      "Many studies of longevity show that people live the longest in environments where physical activity is part of everyday life.";
    const wf = splitStatements([{ ...statement, english: sentence }], "word_first");
    const cf = splitStatements([{ ...statement, english: sentence }], "chunk_first");
    expect(cf.length).toBeLessThan(wf.length);
    // 前几题不再逐题相同（chunk_first 首题 != word_first 首题）
    expect(cf[0].english).not.toBe(wf[0].english);
  });

  it("respects custom stages", () => {
    const onlyFull = splitStatements([statement], "custom", ["full_sentence"]);
    expect(onlyFull).toHaveLength(1);

    const phraseOnly = splitStatements([statement], "custom", ["phrase"]);
    // 全部是片段；无可用意群时兜底为整句
    expect(phraseOnly.every((item) => item.isFragment || item.level === 4)).toBe(true);
  });

  it("deduplicates identical fragments", () => {
    const items = splitStatements([statement], "custom", ["phrase", "core_chunk", "full_sentence"]);
    const keys = items.map((item) => `${item.english.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every item a unique id", () => {
    const items = splitStatements([statement], "word_first");
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fragments never leak the full-sentence translation", () => {
    const items = splitStatements([statement], "word_first");
    for (const fragment of items.filter((item) => item.isFragment)) {
      expect(fragment.chinese).toBe("");
    }
    const last = items[items.length - 1];
    expect(last.isFragment).toBe(false);
    expect(last.chinese).toBe(statement.chinese);
  });

  describe("reference sentence (longevity studies)", () => {
    const sentence =
      "Many studies of longevity show that people live the longest in environments where physical activity is part of everyday life.";
    const ref: Statement = { ...statement, english: sentence, chinese: "多项长寿研究表明…" };

    it("chunk_first reproduces the spec's 7 steps", () => {
      const items = splitStatements([ref], "chunk_first");
      expect(items).toHaveLength(7);
      expect(items.map((item) => item.english)).toEqual([
        "Many studies of longevity show",
        "that people live the longest",
        "Many studies of longevity show that people live the longest",
        "in environments",
        "Many studies of longevity show that people live the longest in environments",
        "where physical activity is part of everyday life.",
        sentence,
      ]);
    });

    it("word_first starts from leaves", () => {
      const items = splitStatements([ref], "word_first");
      expect(items[0].english).toBe("Many studies");
      expect(items[0].hint).toContain("意群 1");
    });
  });
});
