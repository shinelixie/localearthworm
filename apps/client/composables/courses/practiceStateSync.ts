import type { CourseProgressScope } from "./courseProgress";
import { fetchPracticeState, putPracticeState } from "~/api/practice-state";
import { stagesKeyFor } from "./courseProgress";

/**
 * 拆分练习进度的服务端同步
 *
 * 前端仍以 localStorage 为即时缓存（打开页面零等待），
 * 这里负责把变化防抖写回数据库；本地没有缓存时再从数据库恢复
 * （例如清了浏览器数据/换浏览器）。
 */

const SAVE_DELAY = 1500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scopeId(scope: CourseProgressScope) {
  return [
    scope.coursePackId,
    scope.courseId,
    scope.practiceMode ?? "chinese_to_english",
    scope.splitMode ?? "sentence_only",
    stagesKeyFor(scope.stages),
  ].join(":");
}

function payload(scope: CourseProgressScope, statementIndex: number) {
  return {
    coursePackId: scope.coursePackId,
    courseId: scope.courseId,
    practiceMode: scope.practiceMode ?? "chinese_to_english",
    splitMode: scope.splitMode ?? "sentence_only",
    stagesKey: stagesKeyFor(scope.stages),
    statementIndex,
  };
}

export function schedulePracticeStateSave(scope: CourseProgressScope, statementIndex: number) {
  const id = scopeId(scope);
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void putPracticeState(payload(scope, statementIndex)).catch(() => {
        // 后端不可用时保留本地缓存，下次变化再同步
      });
    }, SAVE_DELAY),
  );
}

/** 离开页面时立即落盘，避免防抖没触发 */
export function flushPracticeState(scope: CourseProgressScope, statementIndex: number) {
  const id = scopeId(scope);
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.delete(id);
  void putPracticeState(payload(scope, statementIndex)).catch(() => {});
}

/** 本地没有缓存时从数据库取续练位置 */
export async function fetchPracticeStateIndex(scope: CourseProgressScope): Promise<number | null> {
  try {
    const row = await fetchPracticeState({
      coursePackId: scope.coursePackId,
      courseId: scope.courseId,
      practiceMode: scope.practiceMode ?? "chinese_to_english",
      splitMode: scope.splitMode ?? "sentence_only",
      stagesKey: stagesKeyFor(scope.stages),
    });
    return row?.statementIndex ?? null;
  } catch {
    return null;
  }
}
