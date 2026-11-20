export interface SplitTreeToken {
  idx: number;
  /** 单词本身（不含标点） */
  word: string;
  /** 该词上的标点，如 "," "." */
  punct: string;
}

export interface SplitTreeNode {
  /** 归一化层级：叶子=1，父节点=子节点最大层级+1 */
  level: number;
  /** 闭区间 [startTokenIdx, endTokenIdx] */
  range: [number, number];
  /** 英文（不含标点） */
  en: string;
  /** 自然中文（合并节点按中文语序意译） */
  zh: string;
  children?: SplitTreeNode[];
}

export interface SplitTree {
  rawText: string;
  tokens: SplitTreeToken[];
  tree: SplitTreeNode;
}
