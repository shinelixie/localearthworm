import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import type { Statement } from "~/types";
import { tokenizeSentence } from "~/composables/manage/splitTreeTools";
import GrammarEditor from "../GrammarEditor.vue";
import SplitEditor from "../SplitEditor.vue";

function previewCounts(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAll("span")
    .map((span) => span.text())
    .filter((text) => /^\d+ 题$/.test(text));
}

function makeStatement(overrides: Partial<Statement> = {}): Statement {
  return {
    id: "s1",
    order: 1,
    english: "The cat sleeps on the mat.",
    chinese: "猫在垫子上睡觉。",
    soundmark: "",
    isMastered: false,
    analysis: null,
    splitTree: null,
    ...overrides,
  } as Statement;
}

describe("manage editors", () => {
  it("renders the split editor and emits a valid flat tree", async () => {
    const wrapper = mount(SplitEditor, {
      props: { statement: makeStatement() },
    });
    await nextTick();

    expect(wrapper.text()).toContain("The");
    expect(wrapper.text()).toContain("保存拆分树");

    const save = wrapper.findAll("button").find((button) => button.text().includes("保存拆分树"));
    expect(save).toBeTruthy();
    await save!.trigger("click");

    const emitted = wrapper.emitted("save");
    expect(emitted).toBeTruthy();
    const tree = (emitted as any[][])[0][0];
    expect(tree.tokens).toHaveLength(6);
    expect(tree.tree.range).toEqual([0, 5]);
    expect(tree.tree.children.length).toBeGreaterThan(0);
  });

  it("syncs the visual blocks after a JSON tree is saved", async () => {
    const statement = makeStatement();
    const wrapper = mount(SplitEditor, { props: { statement } });
    await nextTick();

    const jsonTab = wrapper.findAll("button").find((button) => button.text() === "树 JSON");
    await jsonTab!.trigger("click");

    const nodeOnly = {
      level: 3,
      range: [0, 5],
      en: "The cat sleeps on the mat",
      zh: "猫在垫子上睡觉",
      children: [
        {
          level: 2,
          range: [0, 2],
          en: "The cat sleeps",
          zh: "甲块",
          children: [],
        },
        {
          level: 2,
          range: [3, 5],
          en: "on the mat",
          zh: "乙块",
          children: [],
        },
      ],
    };
    await wrapper.find("textarea").setValue(JSON.stringify(nodeOnly));

    const save = wrapper.findAll("button").find((button) => button.text().includes("保存拆分树"));
    await save!.trigger("click");

    const savedTree = (wrapper.emitted("save") as any[][])[0][0];
    await wrapper.setProps({
      statement: makeStatement({ splitTree: savedTree }),
    });
    await nextTick();

    const visualTab = wrapper.findAll("button").find((button) => button.text() === "分块编辑");
    await visualTab!.trigger("click");
    await nextTick();

    const values = wrapper.findAll("input").map((input) => input.element.value);
    expect(values).toContain("甲块");
    expect(values).toContain("乙块");
  });

  it("shows the same four-mode previews in the visual and JSON tabs", async () => {
    const english = "The cat sleeps on the mat.";
    // 多层嵌套树：根下既有 level 2 语块，也有 level 3 分支
    const nestedTree = {
      rawText: english,
      tokens: tokenizeSentence(english),
      tree: {
        level: 4,
        range: [0, 5],
        en: "The cat sleeps on the mat",
        zh: "猫在垫子上睡觉",
        children: [
          {
            level: 2,
            range: [0, 2],
            en: "The cat sleeps",
            zh: "甲块",
            children: [
              { level: 1, range: [0, 0], en: "The", zh: "这只", children: [] },
              { level: 1, range: [1, 1], en: "cat", zh: "猫", children: [] },
              { level: 1, range: [2, 2], en: "sleeps", zh: "睡觉", children: [] },
            ],
          },
          {
            level: 3,
            range: [3, 5],
            en: "on the mat",
            zh: "乙块",
            children: [
              { level: 1, range: [3, 3], en: "on", zh: "在", children: [] },
              {
                level: 2,
                range: [4, 5],
                en: "the mat",
                zh: "垫子上",
                children: [
                  { level: 1, range: [4, 4], en: "the", zh: "这个", children: [] },
                  { level: 1, range: [5, 5], en: "mat", zh: "垫子", children: [] },
                ],
              },
            ],
          },
        ],
      },
    };

    const wrapper = mount(SplitEditor, {
      props: { statement: makeStatement({ splitTree: nestedTree as any }) },
    });
    await nextTick();
    const visualCounts = previewCounts(wrapper);

    const jsonTab = wrapper.findAll("button").find((button) => button.text() === "树 JSON");
    await jsonTab!.trigger("click");
    await nextTick();

    expect(previewCounts(wrapper)).toEqual(visualCounts);
  });

  it("renders a grammar analysis and emits it on save", async () => {
    const analysis = {
      segments: [
        {
          role: "主语",
          roleEn: "subject",
          text: "The cat",
          explanation: "主语是 the cat。",
          words: [
            { text: "The", phonetic: "/ðə/", meaning: "这只", pos: "冠词" },
            { text: "cat", phonetic: "/kæt/", meaning: "猫", pos: "名词" },
          ],
        },
        {
          role: "谓语",
          roleEn: "predicate",
          text: "sleeps",
          explanation: "谓语是 sleeps。",
          words: [{ text: "sleeps", phonetic: "/sliːps/", meaning: "睡觉", pos: "动词" }],
        },
      ],
    };
    const wrapper = mount(GrammarEditor, {
      props: { statement: makeStatement({ analysis }) },
    });
    await nextTick();

    expect(wrapper.text()).toContain("主语");
    expect(wrapper.text()).toContain("睡觉");

    const save = wrapper.findAll("button").find((button) => button.text().includes("保存语法分析"));
    expect(save).toBeTruthy();
    await save!.trigger("click");

    const emitted = wrapper.emitted("save");
    expect(emitted).toBeTruthy();
    const saved = (emitted as any[][])[0][0];
    expect(saved.segments).toHaveLength(2);
    expect(saved.segments[0].text).toBe("The cat");
  });
});
