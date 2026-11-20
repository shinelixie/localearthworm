import { type Course } from "~/types";
import { getHttp } from "./http";

export interface StatementApiResponse {
  id: string;
  order: number;
  chinese: string;
  english: string;
  soundmark: string;
  isMastered: boolean;
  analysis?: import("~/types/models/statement-analysis").StatementAnalysis | null;
  splitTree?: import("~/types/models/split-tree").SplitTree | null;
}

export interface CourseApiResponse {
  id: string;
  title: string;
  description: string;
  order: number;
  statements: StatementApiResponse[];
  coursePackId: string;
  completionCount: number;
  /** 本课句子数量，仅课程包列表接口返回 */
  statementCount?: number;
  /** 已学句子数量，用于课程列表的进度条（仅课程包列表接口返回） */
  learnedCount?: number;
  statementIndex: number;
  video: string;
}

/** 课程管理：修改句子原文/翻译/音标 */
export async function updateStatementContent(
  statementId: string,
  input: { english?: string; chinese?: string; soundmark?: string },
) {
  const http = getHttp();
  return await http<StatementApiResponse>(`course-pack/statements/${statementId}`, {
    method: "patch",
    body: input,
  });
}

/** 课程管理：保存某句的语法分析 */
export async function saveStatementAnalysis(
  statementId: string,
  analysis: import("~/types/models/statement-analysis").StatementAnalysis,
) {
  const http = getHttp();
  return await http<{ success: boolean }>(`grammar-analysis/${statementId}`, {
    method: "post",
    body: { analysis },
  });
}

/** 课程管理：保存某句的拆分树 */
export async function saveStatementSplitTree(
  statementId: string,
  tree: import("~/types/models/split-tree").SplitTree,
) {
  const http = getHttp();
  return await http<{ success: boolean }>(`split-tree/${statementId}`, {
    method: "post",
    body: { tree },
  });
}

export async function fetchCourse(coursePackId: string, courseId: string) {
  const http = getHttp();
  return (await http<CourseApiResponse>(`course-pack/${coursePackId}/courses/${courseId}`, {
    method: "get",
  })) as Course;
}

type CompleteCourseResponse = { nextCourse: CourseApiResponse | undefined };
export async function fetchCompleteCourse(coursePackId: string, courseId: string) {
  const http = getHttp();
  return transformerFetchCompleteCourse(
    await http<CompleteCourseResponse>(
      `/course-pack/${coursePackId}/courses/${courseId}/complete`,
      { method: "post" },
    ),
  );
}

function transformerFetchCompleteCourse(apiResponse: CompleteCourseResponse): {
  nextCourse: Course | undefined;
} {
  return {
    nextCourse: apiResponse.nextCourse as Course,
  };
}
