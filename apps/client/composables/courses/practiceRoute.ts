import type { SplitMode } from "~/composables/main/splitMode";
import type { PracticeDifficulty, PracticeMode } from "~/types/models/learning-path";
import { fetchRouteNodes, putRouteNode } from "~/api/practice-state";

/**
 * 课程学习路线：拆分方式 × 难度
 * 顺序为「拆分方式优先、难度递进」：从单词练 → 从语块练 → 从整到拆 → 只练整句。
 * 完成状态记在 localStorage（按 课程包+课程+练习模式 分开）。
 */
export const ROUTE_SPLIT_MODES: SplitMode[] = [
  "word_first",
  "chunk_first",
  "top_down",
  "sentence_only",
];

export interface PracticeRouteNode {
  splitMode: SplitMode;
  difficulty: PracticeDifficulty;
}

export function getPracticeRoute(difficulties: PracticeDifficulty[]): PracticeRouteNode[] {
  return ROUTE_SPLIT_MODES.flatMap((splitMode) =>
    difficulties.map((difficulty) => ({ splitMode, difficulty })),
  );
}

export interface FullPracticeRouteNode extends PracticeRouteNode {
  practiceMode: PracticeMode;
}

/**
 * 完整路线：练习模式 × 拆分方式 × 难度（3 × 4 × 3 = 36）
 * 顺序为模式优先，模式内再按拆分方式、难度递进。
 */
export function getFullPracticeRoute(
  modes: PracticeMode[],
  difficulties: PracticeDifficulty[],
): FullPracticeRouteNode[] {
  return modes.flatMap((practiceMode) =>
    getPracticeRoute(difficulties).map((node) => ({ ...node, practiceMode })),
  );
}

const STORAGE_KEY = "earthwormPracticeRouteV1";

type CompletedMap = Record<string, string[]>;

function pairKey(coursePackId: string, courseId: string, mode: PracticeMode) {
  return `${coursePackId}:${courseId}:${mode}`;
}

function nodeKey(splitMode: SplitMode, difficulty: PracticeDifficulty) {
  return `${splitMode}:${difficulty}`;
}

function readAll(): CompletedMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CompletedMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: CompletedMap) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 隐私模式写不了，忽略
  }
}

export function getCompletedRouteNodes(
  coursePackId: string,
  courseId: string,
  mode: PracticeMode,
): string[] {
  return readAll()[pairKey(coursePackId, courseId, mode)] ?? [];
}

export function isRouteNodeComplete(
  coursePackId: string,
  courseId: string,
  mode: PracticeMode,
  splitMode: SplitMode,
  difficulty: PracticeDifficulty,
) {
  return getCompletedRouteNodes(coursePackId, courseId, mode).includes(
    nodeKey(splitMode, difficulty),
  );
}

export function markRouteNodeComplete(
  coursePackId: string,
  courseId: string,
  mode: PracticeMode,
  splitMode: SplitMode,
  difficulty: PracticeDifficulty,
) {
  if (splitMode === "custom") return; // 自定义不占路线节点
  const all = readAll();
  const key = pairKey(coursePackId, courseId, mode);
  const list = new Set(all[key] ?? []);
  list.add(nodeKey(splitMode, difficulty));
  all[key] = [...list];
  writeAll(all);

  // 同步到数据库（失败时本地仍在，下次打开会再补）
  void putRouteNode({
    coursePackId,
    courseId,
    practiceMode: mode,
    splitMode,
    difficulty,
  }).catch(() => {});
}

/**
 * 路由弹窗打开时：本地记录合并服务端记录，并把本地独有的节点补到服务端。
 */
export async function loadCompletedRouteNodes(
  coursePackId: string,
  courseId: string,
  mode: PracticeMode,
): Promise<string[]> {
  const local = new Set(getCompletedRouteNodes(coursePackId, courseId, mode));

  try {
    // 迁移：把本地已有勾选补写服务端（最多 12 个节点，幂等）
    for (const key of local) {
      const [splitMode, difficulty] = key.split(":");
      if (!splitMode || !difficulty) continue;
      void putRouteNode({
        coursePackId,
        courseId,
        practiceMode: mode,
        splitMode,
        difficulty,
      }).catch(() => {});
    }

    const rows = await fetchRouteNodes(coursePackId, courseId, mode);
    for (const row of rows) {
      local.add(nodeKey(row.splitMode as SplitMode, row.difficulty as PracticeDifficulty));
    }

    const all = readAll();
    all[pairKey(coursePackId, courseId, mode)] = [...local];
    writeAll(all);
  } catch {
    // 后端不可用时保留本地结果
  }

  return [...local];
}
