import type { SplitTree, SplitTreeNode, SplitTreeToken } from "~/types";
import type { StatementAnalysis } from "~/types/models/statement-analysis";

/**
 * 与后端 tools/generate-split-trees.mjs 一致的切词：
 * 按空白切块，首尾标点剔除到 punct，单词内部保留连字符/撇号。
 * 注意：单词内部若含破折号（如 unique—a），word 仍会包含它，
 * 片段对齐时再按字母数字拆开。
 */
export function tokenizeSentence(raw: string): SplitTreeToken[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk, idx) => {
      const leading = (chunk.match(/^[^A-Za-z0-9']+/) || [""])[0];
      const trailing = (chunk.match(/[^A-Za-z0-9']+$/) || [""])[0];
      const end = trailing ? chunk.length - trailing.length : chunk.length;
      const word = chunk.slice(leading.length, Math.max(leading.length, end));
      return { idx, word, punct: `${leading}${trailing}` };
    });
}

/** 只保留有单词的 token（纯标点 token 并进相邻片段） */
export function wordTokenIndexes(tokens: SplitTreeToken[]) {
  return tokens.map((token, index) => (token.word ? index : -1)).filter((index) => index >= 0);
}

/** 把文本拆成字母数字片段，用于「单词覆盖」校验 */
export function wordSegments(text: string): string[] {
  return (
    String(text ?? "")
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  );
}

/** 语法标注里的逐词中文（按 normalize 后的单词索引） */
export function analysisMeaningMap(analysis?: StatementAnalysis | null) {
  const map = new Map<string, string>();
  for (const segment of analysis?.segments ?? []) {
    for (const word of segment.words ?? []) {
      const key = wordSegments(word.text).join("");
      if (!key || map.has(key)) continue;
      if (word.meaning?.trim()) map.set(key, word.meaning.trim());
    }
  }
  return map;
}

export interface AnalysisValidation {
  ok: boolean;
  expectedCount: number;
  actualCount: number;
  message: string;
}

/** 校验语法分析的单词是否与英文原文逐词对齐 */
export function validateAnalysisWords(
  english: string,
  analysis?: StatementAnalysis | null,
): AnalysisValidation {
  const expected = tokenizeSentence(english).flatMap((token) => wordSegments(token.word));
  const actual = (analysis?.segments ?? []).flatMap((segment) =>
    (segment.words ?? []).flatMap((word) => wordSegments(word.text)),
  );

  if (expected.length === actual.length) {
    const index = expected.findIndex((word, i) => word !== actual[i]);
    if (index === -1) {
      return {
        ok: true,
        expectedCount: expected.length,
        actualCount: actual.length,
        message: `已覆盖全部 ${expected.length} 个单词`,
      };
    }
    return {
      ok: false,
      expectedCount: expected.length,
      actualCount: actual.length,
      message: `第 ${index + 1} 个词不一致：原文 ${expected[index]}，标注 ${actual[index]}`,
    };
  }

  const missing = expected.length > actual.length;
  return {
    ok: false,
    expectedCount: expected.length,
    actualCount: actual.length,
    message: missing
      ? `标注少了 ${expected.length - actual.length} 个词（原文 ${expected.length}，标注 ${actual.length}）`
      : `标注多了 ${actual.length - expected.length} 个词（原文 ${expected.length}，标注 ${actual.length}）`,
  };
}

/**
 * 把一棵拆分树摊平成「分块编辑」能用的一层语块。
 *
 * 树的层级由生成脚本自底向上算（叶子 level 1，父节点 = 子节点最大 level + 1），
 * 所以 level 2 才是语块层；但 LLM 生成的树往往嵌得很深，level 2 的节点之间
 * 会夹着 level 1 的单词/短语（例如 "over"、"if"），只取 level 2 会漏词、
 * 拼不出连续覆盖。这里做一次前序遍历：遇到 level 2 节点就整块收下，
 * 遇到没有子节点的叶子也收下，其余节点继续下钻。这样得到的语块天然连续，
 * 而且能反映深层改动（不再只显示根节点的两三个大块）。
 */
export function treeChunkGroups(tree?: SplitTree | null) {
  if (!tree?.tree || !Array.isArray(tree.tokens) || !tree.tokens.length) return [];
  const wordIndexes = wordTokenIndexes(tree.tokens);

  const toWordIndex = (tokenIndex: number) => {
    const index = wordIndexes.findIndex((wordIndex) => wordIndex >= tokenIndex);
    return index >= 0 ? index : Math.max(0, wordIndexes.length - 1);
  };
  const toLastWordIndex = (tokenIndex: number) => {
    let result = 0;
    wordIndexes.forEach((wordIndex, index) => {
      if (wordIndex <= tokenIndex) result = index;
    });
    return result;
  };

  const nodes: SplitTreeNode[] = [];
  const collect = (node: SplitTreeNode, isRoot: boolean) => {
    const children = node.children ?? [];
    if (!children.length) {
      nodes.push(node);
      return;
    }
    // 根节点只代表整句；当它本身就是语块层（level<=2）时整体算一块
    if (isRoot && node.level <= 2) {
      nodes.push(node);
      return;
    }
    if (!isRoot && node.level === 2) {
      nodes.push(node);
      return;
    }
    children.forEach((child) => collect(child, false));
  };
  collect(tree.tree, true);

  if (!nodes.length) {
    return [{ start: 0, end: Math.max(0, wordIndexes.length - 1), zh: tree.tree.zh ?? "" }];
  }
  return nodes
    .filter((node) => Array.isArray(node.range))
    .map((node) => ({
      start: toWordIndex(node.range[0]),
      end: Math.max(toWordIndex(node.range[0]), toLastWordIndex(node.range[1])),
      zh: node.zh ?? "",
    }))
    .filter((group) => group.end >= group.start);
}

/** 树的最大层级（生成脚本里根节点 level = 树高）。三层平铺树为 3。 */
export function treeMaxLevel(tree?: SplitTree | null): number {
  let max = 0;
  const walk = (node: SplitTreeNode) => {
    max = Math.max(max, node.level ?? 0);
    (node.children ?? []).forEach(walk);
  };
  if (tree?.tree) walk(tree.tree);
  return max;
}

const CONJUNCTIONS = new Set([
  "and",
  "but",
  "or",
  "so",
  "yet",
  "because",
  "although",
  "though",
  "while",
  "when",
  "if",
  "unless",
  "that",
  "which",
  "who",
  "whom",
  "whose",
  "where",
]);

/** 默认分块：标点后断开；下一个词是连词/关系词时也断开 */
export function defaultBreaks(tokens: SplitTreeToken[]): boolean[] {
  const wordIndexes = wordTokenIndexes(tokens);
  return wordIndexes.slice(0, -1).map((tokenIndex, index) => {
    const token = tokens[tokenIndex];
    const nextToken = tokens[wordIndexes[index + 1]];
    const nextWord = wordSegments(nextToken?.word ?? "").join("");
    return /[,;:.!?]/.test(token.punct ?? "") || CONJUNCTIONS.has(nextWord);
  });
}

/** 由「单词之间的断点」得到分组区间（单词下标，闭区间） */
export function groupsFromBreaks(breaks: boolean[], wordCount: number) {
  if (wordCount <= 0) return [];
  const groups: { start: number; end: number }[] = [];
  let start = 0;
  for (let i = 0; i < wordCount - 1; i += 1) {
    if (breaks[i]) {
      groups.push({ start, end: i });
      start = i + 1;
    }
  }
  groups.push({ start, end: wordCount - 1 });
  return groups;
}

export interface FlatTreeInput {
  english: string;
  chinese: string;
  tokens: SplitTreeToken[];
  /** 单词之间是否断开，长度 = 单词数 - 1 */
  breaks: boolean[];
  /** 以分块起始单词下标为 key 的中文 */
  groupZh: Record<number, string>;
  /** 每个单词的中文（叶子提示），按 normalize 后的单词索引 */
  wordZh: Map<string, string>;
}

/**
 * 生成「根 → 语块 → 单词」三层平铺树。
 * 语块是 level 2，单词叶子是 level 1，正好覆盖：
 * 从单词练（全部）、从语块练（level>=2）、从整到拆（前序）。
 */
export function buildFlatSplitTree(input: FlatTreeInput): SplitTree | null {
  const { english, chinese, tokens, breaks, groupZh, wordZh } = input;
  const wordIndexes = wordTokenIndexes(tokens);
  if (!wordIndexes.length) return null;

  const leaves = wordIndexes.map((tokenIndex, index) => {
    const rangeStart = index === 0 ? 0 : tokenIndex;
    const rangeEnd =
      index + 1 < wordIndexes.length ? wordIndexes[index + 1] - 1 : tokens.length - 1;
    const word = tokens[tokenIndex].word;
    return {
      level: 1,
      range: [rangeStart, Math.max(rangeStart, rangeEnd)] as [number, number],
      en: word,
      zh: wordZh.get(wordSegments(word).join("")) ?? "",
      children: [],
    };
  });

  const groups = groupsFromBreaks(breaks, wordIndexes.length).map((group) => {
    const groupWords = tokens
      .slice(leaves[group.start].range[0], leaves[group.end].range[1] + 1)
      .map((token) => token.word)
      .filter(Boolean);
    return {
      level: 2,
      range: [leaves[group.start].range[0], leaves[group.end].range[1]] as [number, number],
      en: groupWords.join(" "),
      zh: groupZh[group.start] ?? "",
      children: leaves.slice(group.start, group.end + 1),
    };
  });

  const root = {
    level: 3,
    range: [0, tokens.length - 1] as [number, number],
    en: tokens
      .map((token) => token.word)
      .filter(Boolean)
      .join(" "),
    zh: chinese,
    children: groups,
  };

  return { rawText: english, tokens, tree: root };
}

/** 安全解析 JSON（拆分树高级编辑用） */
export function parseJsonObject(text: string): { value?: any; error?: string } {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object") return { error: "JSON 顶层必须是对象" };
    return { value };
  } catch (error: any) {
    return { error: error?.message || "JSON 解析失败" };
  }
}

/**
 * 兼容两种粘贴格式：
 *   1. 完整树：{ rawText, tokens, tree }
 *   2. 只贴根节点：{ level, range, en, zh, children }（tokens 用当前英文自动生成）
 * 只有根节点时，range 必须仍然对应当前英文的 token 下标。
 */
export function normalizeSplitTreeInput(
  input: any,
  english: string,
): { tree?: SplitTree; error?: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "JSON 顶层必须是对象" };
  }

  const node = input.tree ?? input;
  if (!node || typeof node !== "object" || !Array.isArray(node.range)) {
    return { error: "找不到拆分树根节点（应有 range / children）" };
  }

  const tokens =
    Array.isArray(input.tokens) && input.tokens.length ? input.tokens : tokenizeSentence(english);
  const rawText = typeof input.rawText === "string" && input.rawText ? input.rawText : english;

  return { tree: { rawText, tokens, tree: node } };
}
