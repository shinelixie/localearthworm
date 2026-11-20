import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import type { Statement } from "~/types";
import type { SplitTree } from "~/types/models/split-tree";
import { isValidSplitTree } from "~/composables/main/splitMode";
import { treeChunkGroups } from "~/composables/manage/splitTreeTools";
import SplitEditor from "../SplitEditor.vue";

// Sentence 01（ielts100s7000_s001）的离线 LLM 拆分树，root level=8 的嵌套树
const REAL_TREE: SplitTree = {
  rawText:
    "There is considerable debate over how we should react if we detect a signal from an alien civilisation.",
  tokens: [
    { idx: 0, word: "There", punct: "" },
    { idx: 1, word: "is", punct: "" },
    { idx: 2, word: "considerable", punct: "" },
    { idx: 3, word: "debate", punct: "" },
    { idx: 4, word: "over", punct: "" },
    { idx: 5, word: "how", punct: "" },
    { idx: 6, word: "we", punct: "" },
    { idx: 7, word: "should", punct: "" },
    { idx: 8, word: "react", punct: "" },
    { idx: 9, word: "if", punct: "" },
    { idx: 10, word: "we", punct: "" },
    { idx: 11, word: "detect", punct: "" },
    { idx: 12, word: "a", punct: "" },
    { idx: 13, word: "signal", punct: "" },
    { idx: 14, word: "from", punct: "" },
    { idx: 15, word: "an", punct: "" },
    { idx: 16, word: "alien", punct: "" },
    { idx: 17, word: "civilisation", punct: "." },
  ],
  tree: {
    level: 8,
    range: [0, 17],
    en: "There is considerable debate over how we should react if we detect a signal from an alien civilisation",
    zh: "如果我们探测到了来自外星文明的信号，我们应该如何回应存在相当大的争议。",
    children: [
      {
        level: 2,
        range: [0, 3],
        en: "There is considerable debate",
        zh: "存在相当大的争议",
        children: [
          { level: 1, range: [0, 1], en: "There is", zh: "存在/有", children: [] },
          { level: 1, range: [2, 3], en: "considerable debate", zh: "相当大的争议", children: [] },
        ],
      },
      {
        level: 7,
        range: [4, 17],
        en: "over how we should react if we detect a signal from an alien civilisation",
        zh: "关于如果我们探测到了来自外星文明的信号，我们应该如何回应",
        children: [
          { level: 1, range: [4, 4], en: "over", zh: "关于", children: [] },
          {
            level: 6,
            range: [5, 17],
            en: "how we should react if we detect a signal from an alien civilisation",
            zh: "如果我们探测到了来自外星文明的信号，我们应该如何回应",
            children: [
              {
                level: 3,
                range: [5, 8],
                en: "how we should react",
                zh: "我们应该如何回应",
                children: [
                  { level: 1, range: [5, 5], en: "how", zh: "如何", children: [] },
                  {
                    level: 2,
                    range: [6, 8],
                    en: "we should react",
                    zh: "我们应该回应",
                    children: [
                      { level: 1, range: [6, 6], en: "we", zh: "我们", children: [] },
                      { level: 1, range: [7, 8], en: "should react", zh: "应该回应", children: [] },
                    ],
                  },
                ],
              },
              {
                level: 5,
                range: [9, 17],
                en: "if we detect a signal from an alien civilisation",
                zh: "如果我们探测到了来自外星文明的信号",
                children: [
                  { level: 1, range: [9, 9], en: "if", zh: "如果", children: [] },
                  {
                    level: 4,
                    range: [10, 17],
                    en: "we detect a signal from an alien civilisation",
                    zh: "我们探测到了来自外星文明的信号",
                    children: [
                      {
                        level: 2,
                        range: [10, 11],
                        en: "we detect",
                        zh: "我们探测到",
                        children: [
                          { level: 1, range: [10, 10], en: "we", zh: "我们", children: [] },
                          { level: 1, range: [11, 11], en: "detect", zh: "探测到", children: [] },
                        ],
                      },
                      {
                        level: 3,
                        range: [12, 17],
                        en: "a signal from an alien civilisation",
                        zh: "来自外星文明的信号",
                        children: [
                          { level: 1, range: [12, 13], en: "a signal", zh: "信号", children: [] },
                          {
                            level: 2,
                            range: [14, 17],
                            en: "from an alien civilisation",
                            zh: "来自外星文明",
                            children: [
                              { level: 1, range: [14, 14], en: "from", zh: "来自", children: [] },
                              {
                                level: 1,
                                range: [15, 17],
                                en: "an alien civilisation",
                                zh: "外星文明",
                                children: [],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
} as SplitTree;

const ENGLISH = REAL_TREE.rawText;

function makeStatement(overrides: Partial<Statement> = {}): Statement {
  return {
    id: "ielts100s7000_s001",
    order: 1,
    english: ENGLISH,
    chinese: "如果我们探测到了来自外星文明的信号，我们应该如何回应存在相当大的争议。",
    soundmark: "",
    isMastered: false,
    analysis: null,
    splitTree: REAL_TREE,
    ...overrides,
  } as Statement;
}

describe("Sentence 01 嵌套树 → 分块编辑（用户报障复现）", () => {
  it("treeChunkGroups 对嵌套树的输出", () => {
    const groups = treeChunkGroups(REAL_TREE);
    console.log("treeChunkGroups =>", JSON.stringify(groups));
    expect(isValidSplitTree(REAL_TREE)).toBe(true);
  });

  it("用户在树 JSON 里改中文后保存，分块编辑应显示新中文", async () => {
    const wrapper = mount(SplitEditor, { props: { statement: makeStatement() } });
    await nextTick();

    const initialZh = wrapper.findAll("input").map((input) => input.element.value);
    console.log("初始分块中文:", JSON.stringify(initialZh));

    // 切到「树 JSON」，把第一个语块（There is considerable debate）的中文改掉
    const jsonTab = wrapper.findAll("button").find((button) => button.text() === "树 JSON");
    await jsonTab!.trigger("click");
    await nextTick();

    const textarea = wrapper.find("textarea");
    const text = (textarea.element as HTMLTextAreaElement).value;
    const edited = text.replace(/("zh":\s*)"存在相当大的争议"/, '$1"改过的争议"');
    expect(edited !== text).toBe(true); // 确实改到了
    await textarea.setValue(edited);

    const save = wrapper.findAll("button").find((button) => button.text().includes("保存拆分树"));
    expect(save!.attributes("disabled")).toBeUndefined();
    await save!.trigger("click");

    const emitted = wrapper.emitted("save") as any[][];
    expect(emitted).toBeTruthy();
    const savedTree = emitted[emitted.length - 1][0];
    expect(savedTree.tree.children[0].zh).toBe("改过的争议");

    // 父组件 saveSplit() 的回写：statement.splitTree = tree
    await wrapper.setProps({ statement: makeStatement({ splitTree: savedTree }) });
    await nextTick();

    const visualTab = wrapper.findAll("button").find((button) => button.text() === "分块编辑");
    await visualTab!.trigger("click");
    await nextTick();

    const afterSaveZh = wrapper.findAll("input").map((input) => input.element.value);
    console.log("保存后分块中文:", JSON.stringify(afterSaveZh));

    expect(afterSaveZh).toContain("改过的争议");
  });
});
