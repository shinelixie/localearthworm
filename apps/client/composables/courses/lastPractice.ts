import type { SplitMode, SplitStage } from "~/composables/main/splitMode";
import type { PracticeDifficulty, PracticeMode } from "~/types/models/learning-path";
import { fetchLastPracticeForPack, putLastPracticeApi } from "~/api/practice-state";

/**
 * 最近一次练习会话（按课程记）
 *
 * 主页「继续游戏」需要恢复上次的模式/难度/拆分方式和位置。
 * localStorage 作为即时缓存；同时防抖写数据库，清浏览器数据后
 * 还能从服务端恢复。
 */
export interface LastPractice {
  coursePackId: string;
  courseId: string;
  mode: PracticeMode;
  difficulty: PracticeDifficulty;
  splitMode: SplitMode;
  stages: SplitStage[];
  statementIndex: number;
  updatedAt: number;
}

const STORAGE_KEY = "earthwormLastPracticeV1";

/**
 * 四六级课程包从「50 句一课」改成「一句一课」后，
 * 浏览器缓存里可能还留着旧 course_id（cet4-500_c01）。
 * 这里按「旧课序号 × 50 + 句内下标」换算成新的单句课程。
 */
const LEGACY_CET_PACKS: Record<string, { maxCourseNo: number; maxIndex: number }> = {
  "cet4-500": { maxCourseNo: 5, maxIndex: 201 },
  "cet6-500": { maxCourseNo: 8, maxIndex: 397 },
};

function migrateLegacyCachedCourse(item: LastPractice): LastPractice {
  const config = LEGACY_CET_PACKS[item.coursePackId];
  if (!config) return item;
  const match = item.courseId.match(new RegExp(`^${item.coursePackId}_c(\\d{2})$`));
  if (!match) return item;
  const courseNo = Number(match[1]);
  if (!Number.isInteger(courseNo) || courseNo < 1 || courseNo > config.maxCourseNo) return item;

  const newIndex = Math.min((courseNo - 1) * 50 + (item.statementIndex ?? 0) + 1, config.maxIndex);
  return {
    ...item,
    courseId: `${item.coursePackId}_c${String(newIndex).padStart(3, "0")}`,
    statementIndex: 0,
  };
}

function readAll(): Record<string, LastPractice> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, LastPractice>;
    if (!parsed || typeof parsed !== "object") return {};

    let changed = false;
    const migrated: Record<string, LastPractice> = {};
    for (const item of Object.values(parsed)) {
      if (!item?.coursePackId || !item?.courseId) continue;
      const next = migrateLegacyCachedCourse(item);
      if (next !== item) changed = true;
      migrated[pairKey(next.coursePackId, next.courseId)] = next;
    }
    if (changed) writeAll(migrated);
    return migrated;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, LastPractice>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 隐私模式写不了 localStorage，忽略
  }
}

function pairKey(coursePackId: string, courseId: string) {
  return `${coursePackId}:${courseId}`;
}

function toApi(last: Omit<LastPractice, "updatedAt">) {
  return {
    coursePackId: last.coursePackId,
    courseId: last.courseId,
    practiceMode: last.mode,
    difficulty: last.difficulty,
    splitMode: last.splitMode,
    stages: last.stages,
    statementIndex: last.statementIndex,
  };
}

function fromApi(row: {
  coursePackId: string;
  courseId: string;
  practiceMode: string;
  difficulty: string;
  splitMode: string;
  stages: string[] | null;
  statementIndex: number;
  updatedAt?: string | null;
}): LastPractice {
  return {
    coursePackId: row.coursePackId,
    courseId: row.courseId,
    mode: row.practiceMode as PracticeMode,
    difficulty: row.difficulty as PracticeDifficulty,
    splitMode: row.splitMode as SplitMode,
    stages: (row.stages ?? []) as SplitStage[],
    statementIndex: row.statementIndex,
    updatedAt: row.updatedAt ? Date.parse(row.updatedAt) || Date.now() : Date.now(),
  };
}

const SYNC_DELAY = 1200;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, Omit<LastPractice, "updatedAt">>();

function scheduleSync(last: Omit<LastPractice, "updatedAt">) {
  const key = pairKey(last.coursePackId, last.courseId);
  pending.set(key, { ...last, stages: [...last.stages] });
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      const payload = pending.get(key);
      pending.delete(key);
      if (payload) void putLastPracticeApi(toApi(payload)).catch(() => {});
    }, SYNC_DELAY),
  );
}

export function saveLastPractice(input: Omit<LastPractice, "updatedAt">) {
  const all = readAll();
  all[pairKey(input.coursePackId, input.courseId)] = {
    ...input,
    stages: [...input.stages],
    updatedAt: Date.now(),
  };
  writeAll(all);
  scheduleSync(input);
}

/** 离开页面时立即同步，避免防抖没触发 */
export function flushLastPractice() {
  for (const [key, payload] of pending) {
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    void putLastPracticeApi(toApi(payload)).catch(() => {});
  }
  timers.clear();
  pending.clear();
}

export function getLastPractice(coursePackId: string, courseId: string): LastPractice | null {
  return readAll()[pairKey(coursePackId, courseId)] ?? null;
}

/** 某个课程包里最近练习的那节课（主页「继续游戏」用） */
export function getLastPracticeForPack(coursePackId: string): LastPractice | null {
  const all = readAll();
  let latest: LastPractice | null = null;
  for (const item of Object.values(all)) {
    if (item.coursePackId !== coursePackId) continue;
    if (!latest || item.updatedAt >= latest.updatedAt) latest = item;
  }
  return latest;
}

/**
 * 主页继续游戏用：本地优先（并顺手迁移到服务端），
 * 本地没有（清过缓存/换浏览器）再查数据库。
 */
export async function loadLastPracticeForPack(coursePackId: string): Promise<LastPractice | null> {
  const local = getLastPracticeForPack(coursePackId);
  if (local) {
    void putLastPracticeApi(toApi(local)).catch(() => {});
    return local;
  }

  try {
    const row = await fetchLastPracticeForPack(coursePackId);
    if (!row) return null;
    const last = fromApi(row);
    const all = readAll();
    all[pairKey(last.coursePackId, last.courseId)] = last;
    writeAll(all);
    return last;
  } catch {
    return null;
  }
}
