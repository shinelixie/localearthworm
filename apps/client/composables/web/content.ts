/**
 * 纯前端版的内容数据源。构建时 tools/build-web-data.mjs 已把全部课程包
 * （含句子、语法 analysis、拆分 split_tree）打进 public/data/courses.json，
 * 这里运行期按包懒加载、按 ID 建索引，供 web 后端路由映射成 API 响应形状。
 */

export interface WebStatement {
  id: string;
  order: number;
  english: string;
  chinese: string;
  soundmark: string;
  courseId: string;
  isMastered: boolean;
  analysis: unknown | null;
  splitTree: unknown | null;
}

export interface WebCourse {
  id: string;
  title: string;
  description: string;
  video: string;
  order: number;
  coursePackId: string;
  statementCount: number;
  statements: WebStatement[];
}

export interface WebPack {
  id: string;
  order: number;
  title: string;
  description: string;
  isFree: boolean;
  cover: string;
  shareLevel: string;
  courses: WebCourse[];
}

interface WebData {
  version: number;
  exportedAt: string;
  packs: WebPack[];
}

let dataPromise: Promise<WebData> | null = null;

export function loadWebData(): Promise<WebData> {
  if (dataPromise) return dataPromise;
  dataPromise = (async () => {
    // baseURL 是相对子路径（GitHub Pages 是 /localearthworm-web/，本地是 /）。
    // new URL() 的 base 必须是「绝对」URL，所以拼上 origin 再交给它。
    const configBase =
      ((globalThis as any).__NUXT__?.config?.app?.baseURL as string | undefined) || "/";
    const absoluteBase = `${window.location.origin}${configBase.replace(/\/?$/, "/")}`;
    const url = new URL("data/courses.json", absoluteBase).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`加载课程数据失败：${res.status}`);
    return (await res.json()) as WebData;
  })();
  return dataPromise;
}

let statementIndex: Map<string, { course: WebCourse; statement: WebStatement }> | null = null;

function ensureIndex(data: WebData) {
  if (statementIndex) return statementIndex;
  const index = new Map<string, { course: WebCourse; statement: WebStatement }>();
  for (const pack of data.packs) {
    for (const course of pack.courses) {
      for (const statement of course.statements) index.set(statement.id, { course, statement });
    }
  }
  statementIndex = index;
  return index;
}

export async function getPack(coursePackId: string): Promise<WebPack | undefined> {
  const data = await loadWebData();
  return data.packs.find((pack) => pack.id === coursePackId);
}

export async function getCourse(
  coursePackId: string,
  courseId: string,
): Promise<WebCourse | undefined> {
  const pack = await getPack(coursePackId);
  return pack?.courses.find((course) => course.id === courseId);
}

export async function getStatement(statementId: string) {
  const data = await loadWebData();
  return ensureIndex(data).get(statementId);
}
