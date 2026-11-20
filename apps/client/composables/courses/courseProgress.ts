import type { SplitMode } from "~/composables/main/splitMode";
import type { PracticeMode } from "~/types/models/learning-path";

/**
 * 本地练习进度缓存。
 *
 * 服务端进度只对「整句练习」生效；
 * 拆分练习的片段列表是动态生成的（题数与顺序都不同），
 * 单独缓存到 localStorage，否则刷新页面或重新进入课程会从第一题开始。
 */
export interface CourseProgressScope {
  coursePackId: string;
  courseId: string;
  splitMode?: SplitMode;
  stages?: string[];
  /** 练习模式（中译英/听写/听力）；同一拆分方式在不同模式下进度分开 */
  practiceMode?: PracticeMode;
}

const KEY_PREFIX = "courseProgress";
// 拆分算法变更后，旧的题目索引不再有效，提升版本号让缓存自动失效
const KEY_VERSION = "v1";

export function stagesKeyFor(stages?: string[]) {
  return [...(stages ?? [])].sort().join("-") || "default";
}

function scopeKey(scope: CourseProgressScope) {
  return [
    KEY_PREFIX,
    KEY_VERSION,
    scope.coursePackId,
    scope.courseId,
    scope.splitMode ?? "sentence_only",
    scope.practiceMode ?? "all",
    stagesKeyFor(scope.stages),
  ].join(":");
}

/** 加练习模式之前的旧 key，用于一次性迁移 */
function legacyScopeKey(scope: CourseProgressScope) {
  return [
    KEY_PREFIX,
    KEY_VERSION,
    scope.coursePackId,
    scope.courseId,
    scope.splitMode ?? "sentence_only",
    stagesKeyFor(scope.stages),
  ].join(":");
}

export function readCourseProgress(scope: CourseProgressScope): number | null {
  if (typeof localStorage === "undefined") return null;

  const raw = localStorage.getItem(scopeKey(scope));
  if (raw !== null && raw !== "") {
    const index = Number(raw);
    if (Number.isInteger(index) && index >= 0) return index;
  }

  // 旧缓存没有练习模式，读到后迁移到新 key
  if (scope.practiceMode) {
    const legacy = localStorage.getItem(legacyScopeKey(scope));
    if (legacy !== null && legacy !== "") {
      const index = Number(legacy);
      if (Number.isInteger(index) && index >= 0) {
        saveCourseProgress(scope, index);
        return index;
      }
    }
  }

  return null;
}

export function saveCourseProgress(scope: CourseProgressScope, statementIndex: number) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(scopeKey(scope), String(statementIndex));
}

export function clearCourseProgress(scope: CourseProgressScope) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(scopeKey(scope));
}

/** 清除某课程在所有拆分方式下的本地进度 */
export function clearCourseProgresses(coursePackId: string, courseId: string) {
  if (typeof localStorage === "undefined") return;

  const prefix = `${KEY_PREFIX}:${KEY_VERSION}:${coursePackId}:${courseId}:`;
  const keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }

  keys.forEach((key) => localStorage.removeItem(key));
}
