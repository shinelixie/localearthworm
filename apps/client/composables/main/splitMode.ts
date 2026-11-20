import type { SplitTree, SplitTreeNode, Statement } from "~/types";

/** 拆分方式（对齐 julebu 的「选择拆分方式」） */
export type SplitMode = "custom" | "word_first" | "chunk_first" | "top_down" | "sentence_only";

/** 包含题型（勾选维度） */
export type SplitStage = "phrase" | "core_chunk" | "combo_chunk" | "full_sentence";

export interface SplitOption {
  key: SplitMode;
  label: string;
  hint: string;
  description: string;
  stages: SplitStage[];
  badge?: string;
}

export const SPLIT_OPTIONS: SplitOption[] = [
  {
    key: "custom",
    label: "自定义",
    hint: "自己勾选题型",
    description: "自己决定练哪几层，适合已有明确弱项的时候。",
    stages: ["phrase", "core_chunk", "combo_chunk", "full_sentence"],
  },
  {
    key: "word_first",
    label: "从单词练",
    hint: "适合新课入门",
    description: "从最小意群起步，虚词也单独练，再滚雪球式逐级合并，最后拼出整句。题量最多。",
    stages: ["phrase", "core_chunk", "combo_chunk", "full_sentence"],
  },
  {
    key: "chunk_first",
    label: "从语块练",
    hint: "适合有一定基础",
    description: "跳过单词级碎片，直接从完整分句/介词短语起步，保留滚雪球合并链路，节奏快。",
    stages: ["core_chunk", "combo_chunk", "full_sentence"],
  },
  {
    key: "top_down",
    label: "从整到拆",
    hint: "先整句后拆解",
    description: "先给出完整句子，再自顶向下逐层拆开，适合理解句子结构。",
    stages: ["phrase", "core_chunk", "combo_chunk", "full_sentence"],
  },
  {
    key: "sentence_only",
    label: "只练整句",
    hint: "适合冲刺复习",
    description: "跳过拆分，直接整句输出，最快节奏。",
    stages: ["full_sentence"],
  },
];

export const STAGE_LABELS: Record<SplitStage, string> = {
  phrase: "小意群",
  core_chunk: "完整分句/短语",
  combo_chunk: "滚雪球合并",
  full_sentence: "完整句子",
};

const STAGE_ORDER: SplitStage[] = ["phrase", "core_chunk", "combo_chunk", "full_sentence"];

/** 语块切分（L1 候选边界）：遇到介词/连词/关系词或标点处断开 */
const BREAK_BEFORE = new Set([
  "of",
  "in",
  "on",
  "at",
  "from",
  "by",
  "with",
  "for",
  "to",
  "that",
  "which",
  "who",
  "whom",
  "whose",
  "because",
  "although",
  "though",
  "while",
  "when",
  "if",
  "as",
  "and",
  "but",
  "or",
  "so",
  "than",
  "over",
  "under",
  "between",
  "among",
  "during",
  "after",
  "before",
  "into",
  "about",
  "through",
  "against",
  "despite",
  "where",
]);

export function chunkSentence(sentence: string): string[] {
  const tokens = sentence.split(/\s+/).filter(Boolean);
  if (tokens.length <= 3) return [sentence.trim()];

  const chunks: string[] = [];
  let current: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const bare = token.toLowerCase().replace(/[^a-z']/g, "");
    const prev = tokens[i - 1] ?? "";
    const breakHere = current.length > 0 && (BREAK_BEFORE.has(bare) || /[,;:]$/.test(prev));

    if (breakHere) {
      chunks.push(current.join(" "));
      current = [];
    }
    current.push(token);
  }
  if (current.length) chunks.push(current.join(" "));

  return chunks.filter(Boolean);
}

export interface PracticeItem extends Statement {
  /** 这一题在整句中的位置提示 */
  hint?: string;
  /** 是否是拆分出来的片段（非整句） */
  isFragment?: boolean;
  /** 合并题来源的子片段（滚雪球合并 = 已掌握前缀 + 新分句） */
  mergeChildren?: string[];
  /** 1 = 小意群，2 = 完整分句/短语，3 = 滚雪球合并，4 = 整句 */
  level?: number;
}

export interface MergeNode {
  text: string;
  level: 1 | 2 | 3 | 4;
  children?: string[];
  /** 分句序号（1-based），level 2/3 用 */
  unitIndex?: number;
  /** 分句总数 */
  unitCount?: number;
  /** level 2：是否子句（从属连词/关系词开头） */
  clause?: boolean;
  /** level 2：是否介词短语 */
  phrase?: boolean;
  /** level 1：在该分句内的意群序号 */
  leafIndex?: number;
}

/** 从属连词：开一个新分句单元 */
const SUBORDINATORS = new Set([
  "that",
  "when",
  "while",
  "although",
  "though",
  "because",
  "if",
  "unless",
  "whether",
  "since",
  "until",
  "once",
  "as",
]);

/** 关系代词/副词：开一个新分句单元，且其引导的从句内部不切分 */
const RELATIVES = new Set(["which", "who", "whom", "whose", "where"]);

/** 并列连词：开一个新并列分句 */
const COORDINATORS = new Set(["and", "but", "or", "so", "yet", "nor"]);

/** 介词：多数情况开一个新短语单元 */
const PREPS = new Set([
  "in",
  "on",
  "at",
  "from",
  "over",
  "under",
  "between",
  "among",
  "during",
  "with",
  "for",
  "by",
  "into",
  "about",
  "through",
  "against",
  "despite",
  "across",
  "of",
  "to",
]);

/** 弱附着介词：前面单元短且未断句时并入（of longevity / to boost 这类） */
const WEAK_ATTACHERS = new Set(["of", "to"]);

function firstWord(chunk: string) {
  return (chunk.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z']/g, "");
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface Unit {
  text: string;
  chunks: string[];
  clause: boolean;
  phrase: boolean;
}

/**
 * 把 L1 语块划分成句法单元（L2）：
 * - 从属连词/关系词/并列连词开头 → 必开新单元（子句/并列分句）
 * - 介词开头 → 开新单元（短语），除非：
 *   当前单元由关系词引导（定语从句内部不切，of everyday life 保留在从句内）
 *   或弱附着介词且当前单元 < 3 词且未断句（of longevity / to boost 并入主单元）
 */
function groupIntoUnits(chunks: string[]): Unit[] {
  const units: Unit[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const w = firstWord(chunk);
    const prev = chunks[i - 1] ?? "";
    const last = units[units.length - 1];
    const lastIsRelative = last !== undefined && RELATIVES.has(firstWord(last.text));
    const weakAttach =
      WEAK_ATTACHERS.has(w) &&
      last !== undefined &&
      wordCount(last.text) < 3 &&
      !/[,;:]$/.test(prev);

    const isBoundary =
      i === 0 ||
      SUBORDINATORS.has(w) ||
      COORDINATORS.has(w) ||
      RELATIVES.has(w) ||
      (PREPS.has(w) && !lastIsRelative && !weakAttach);

    if (isBoundary) {
      units.push({
        text: chunk,
        chunks: [chunk],
        clause: SUBORDINATORS.has(w) || RELATIVES.has(w),
        phrase: PREPS.has(w) && !SUBORDINATORS.has(w) && !COORDINATORS.has(w) && !RELATIVES.has(w),
      });
    } else if (last) {
      last.text = `${last.text} ${chunk}`;
      last.chunks.push(chunk);
    } else {
      units.push({ text: chunk, chunks: [chunk], clause: false, phrase: false });
    }
  }

  return units;
}

function hintFor(node: MergeNode) {
  switch (node.level) {
    case 1:
      return `意群 ${node.leafIndex}`;
    case 2:
      if (node.clause) return `子句 ${node.unitIndex}/${node.unitCount}`;
      if (node.phrase) return `短语 ${node.unitIndex}/${node.unitCount}`;
      return `分句 ${node.unitIndex}/${node.unitCount}`;
    case 3:
      return `合并语块 1-${node.unitIndex}（滚雪球）`;
    default:
      return "完整句子";
  }
}

/**
 * 构建句法树并展开成练习序列（一棵树驱动两种模式）。
 *
 * - L1 叶子：L1 语块（1~3 词微意群，「从单词练」才保留）
 * - L2 分句单元：完整分句/介词短语（「从语块练」从这里起步）
 * - L3 滚雪球合并：每完成一个新分句，把「已掌握前缀 + 新分句」拼成更长的句子
 * - L4 整句
 *
 * 所有节点都是相邻片段的拼接，不出现重叠/半截切片；整句永远在最后。
 */
export function buildMergeTree(sentence: string): MergeNode[] {
  const normalized = sentence.trim();
  const chunks = chunkSentence(normalized);
  const units = groupIntoUnits(chunks);

  if (units.length <= 1) {
    return [{ text: normalized, level: 4 }];
  }

  const nodes: MergeNode[] = [];
  let prefix = "";

  units.forEach((unit, index) => {
    const i = index + 1;

    // L1 叶子：仅当单元由多个语块组成时输出（单语块单元与单元文本重复）
    if (unit.chunks.length > 1) {
      unit.chunks.forEach((chunk, li) => {
        nodes.push({
          text: chunk,
          level: 1,
          leafIndex: li + 1,
          unitIndex: i,
          unitCount: units.length,
        });
      });
    }

    // L2 分句单元
    nodes.push({
      text: unit.text,
      level: 2,
      children: unit.chunks,
      unitIndex: i,
      unitCount: units.length,
      clause: unit.clause,
      phrase: unit.phrase,
    });

    // L3 滚雪球合并：前缀须跨 2 个以上分句才输出（避免 2 分句时重复 L2）
    const newPrefix = prefix ? `${prefix} ${unit.text}` : unit.text;
    if (i >= 2 && i < units.length) {
      const prevPrefix = prefix || unit.text;
      nodes.push({
        text: newPrefix,
        level: 3,
        children: [prevPrefix, unit.text],
        unitIndex: i,
        unitCount: units.length,
      });
    }
    prefix = newPrefix;
  });

  nodes.push({ text: normalized, level: 4, children: [] });

  return nodes;
}

const LEVEL_BY_STAGE: Record<SplitStage, number> = {
  phrase: 1,
  core_chunk: 2,
  combo_chunk: 3,
  full_sentence: 4,
};

function stagesFor(mode: SplitMode, customStages: SplitStage[]): SplitStage[] {
  if (mode === "custom") {
    return STAGE_ORDER.filter((stage) => customStages.includes(stage));
  }
  const option = SPLIT_OPTIONS.find((item) => item.key === mode);
  return option ? option.stages : ["full_sentence"];
}

// ---------------- LLM 生成的拆分树 ----------------

const TREE_STAGE_MIN_LEVEL: Record<SplitStage, number> = {
  phrase: 1,
  core_chunk: 2,
  combo_chunk: 3,
  full_sentence: Number.POSITIVE_INFINITY,
};

/** 校验：子节点连续、不重叠、不漏词，父区间由子节点完全覆盖 */
function isValidTreeNode(node: SplitTreeNode, tokenCount: number): boolean {
  if (!node || !Array.isArray(node.range) || node.range.length !== 2) return false;
  const [start, end] = node.range;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  if (start < 0 || end >= tokenCount || start > end) return false;

  const children = node.children ?? [];
  if (!children.length) {
    return typeof node.zh === "string";
  }

  let expected = start;
  for (const child of children) {
    if (!isValidTreeNode(child, tokenCount)) return false;
    if (child.range[0] !== expected) return false;
    expected = child.range[1] + 1;
  }
  return expected - 1 === end;
}

export function isValidSplitTree(tree: SplitTree | null | undefined): tree is SplitTree {
  if (!tree?.tree || !Array.isArray(tree.tokens) || !tree.tokens.length) return false;
  if (tree.tokens.some((token, index) => token.idx !== index)) return false;
  const root = tree.tree;
  if (!root.range || root.range[0] !== 0 || root.range[1] !== tree.tokens.length - 1) return false;
  return isValidTreeNode(root, tree.tokens.length);
}

function treeMinLevel(mode: SplitMode, customStages: SplitStage[]) {
  if (mode === "word_first") return 1;
  if (mode === "chunk_first") return 2;
  const stages = stagesFor(mode, customStages);
  return Math.min(...stages.map((stage) => TREE_STAGE_MIN_LEVEL[stage]));
}

function treeHintFor(
  node: SplitTreeNode,
  isRoot: boolean,
  leafOrder: Map<SplitTreeNode, number>,
  level2Order: Map<SplitTreeNode, number>,
  level2Count: number,
) {
  if (isRoot) return "完整句子";
  if (!node.children?.length) {
    return `意群 ${leafOrder.get(node) ?? 0}`;
  }
  if (node.level === 2) {
    return `分句 ${level2Order.get(node) ?? 0}/${level2Count}`;
  }
  return "合并语块（滚雪球）";
}

function buildTreePracticeItems(
  statement: Statement,
  tree: SplitTree,
  mode: SplitMode,
  customStages: SplitStage[],
): PracticeItem[] {
  const root = tree.tree;

  // 叶子序号 / level 2 序号，用于提示
  const leafOrder = new Map<SplitTreeNode, number>();
  const level2Order = new Map<SplitTreeNode, number>();
  let leafCount = 0;
  let level2Count = 0;
  const indexNode = (node: SplitTreeNode) => {
    if (!node.children?.length) {
      leafCount += 1;
      leafOrder.set(node, leafCount);
      return;
    }
    if (node.level === 2) {
      level2Count += 1;
      level2Order.set(node, level2Count);
    }
    node.children.forEach(indexNode);
  };
  indexNode(root);

  const nodes: SplitTreeNode[] = [];
  if (mode === "top_down") {
    const preOrder = (node: SplitTreeNode) => {
      nodes.push(node);
      node.children?.forEach(preOrder);
    };
    preOrder(root);
  } else {
    // 从单词/语块练：后序遍历，自底向上合并，整句最后
    const minLevel = treeMinLevel(mode, customStages);
    const postOrder = (node: SplitTreeNode) => {
      node.children?.forEach(postOrder);
      if (node === root || node.level >= minLevel) nodes.push(node);
    };
    postOrder(root);
  }

  return nodes.map((node, index) => {
    const isRoot = node === root;
    return {
      ...statement,
      id: isRoot ? statement.id : `${statement.id}-t${index}`,
      order: index + 1,
      // 整句保留原句标点用于展示；片段用不含标点的 en
      english: isRoot ? statement.english : node.en,
      // 整句用数据库里的原译文（更稳定）；片段用树里 LLM 生成的自然中文
      chinese: isRoot ? statement.chinese || node.zh : node.zh || "",
      isMastered: false,
      hint: treeHintFor(node, isRoot, leafOrder, level2Order, level2Count),
      isFragment: !isRoot,
      mergeChildren: node.children?.map((child) => child.en),
      level: node.level,
    };
  });
}

/**
 * 把整句拆成一组递进的练习项。
 * 整句永远排在最后一项（top_down 模式除外），练完整句才算过关。
 * 有 LLM 拆分树时按树遍历（每个节点自带中文）；没有树时退回本地启发式切分。
 */
export function splitStatements(
  statements: Statement[],
  mode: SplitMode,
  customStages: SplitStage[] = [],
): PracticeItem[] {
  if (mode === "sentence_only") {
    return statements.map((statement) => ({
      ...statement,
      hint: "完整句子",
      isFragment: false,
    }));
  }

  const stages = stagesFor(mode, customStages);
  const allowedLevels = new Set(stages.map((stage) => LEVEL_BY_STAGE[stage]));
  const result: PracticeItem[] = [];

  for (const statement of statements) {
    // 优先使用离线生成的拆分树（含每个节点的中文）
    if (isValidSplitTree(statement.splitTree)) {
      result.push(...buildTreePracticeItems(statement, statement.splitTree, mode, customStages));
      continue;
    }

    const mergeTree = buildMergeTree(statement.english);
    let nodes: MergeNode[];
    if (mode === "top_down") {
      // 没有树时的降级：按层级从高到低（整句 → 合并 → 分句 → 意群）
      nodes = [...mergeTree].sort((a, b) => b.level - a.level);
    } else {
      const picked = mergeTree.filter((node) => allowedLevels.has(node.level));
      nodes = picked.length > 0 ? picked : [mergeTree[mergeTree.length - 1]];
    }

    let order = 0;
    for (const node of nodes) {
      const isFullSentence = node.level === 4;
      result.push({
        ...statement,
        id: isFullSentence ? statement.id : `${statement.id}-f${order}`,
        order: order + 1,
        english: node.text,
        chinese: isFullSentence ? statement.chinese : "",
        isMastered: false,
        hint: hintFor(node),
        isFragment: !isFullSentence,
        mergeChildren: node.children && node.children.length > 0 ? node.children : undefined,
        level: node.level,
      });
      order += 1;
    }
  }

  return result;
}

/** 生成「包含题型」列表，供自定义勾选 */
export function stageOptionsFor(mode: SplitMode) {
  const option = SPLIT_OPTIONS.find((item) => item.key === mode);
  const enabled = new Set(option?.stages ?? ["full_sentence"]);
  return STAGE_ORDER.map((stage) => ({
    key: stage,
    label: STAGE_LABELS[stage],
    enabled: enabled.has(stage),
  }));
}
