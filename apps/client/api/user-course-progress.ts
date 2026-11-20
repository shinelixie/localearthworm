import type { UserProgress, UserRecentCoursePack } from "~/types";
import { getHttp } from "./http";

export interface UserProgressApiResponse {
  courseId: string;
}
export interface UserRecentCoursePackApiResponse {
  id: number;
  coursePackId: string;
  courseId: string;
  title: string;
  description: string;
  cover: string;
  isFree: boolean;
}

export interface UserProgressUpdate {
  coursePackId: string;
  courseId: string;
  statementIndex: number;
}

export async function fetchUpdateCourseProgress(userProgressUpdate: UserProgressUpdate) {
  const http = getHttp();
  return (await http<UserProgressApiResponse>(`user-course-progress`, {
    body: userProgressUpdate,
    method: "put",
  })) as UserProgress;
}

export async function fetchUserRecentCoursePacks() {
  const http = getHttp();
  return (await http<UserRecentCoursePackApiResponse[]>(
    `/user-course-progress/recent-course-packs`,
    {
      method: "get",
    },
  )) as UserRecentCoursePack[];
}

/** 重置单课进度（断点 + 完成次数） */
export async function fetchResetCourseProgress(coursePackId: string, courseId: string) {
  const http = getHttp();
  return await http(`/user-course-progress/course/${coursePackId}/${courseId}`, {
    method: "delete",
  });
}

/** 重置整个课程包进度 */
export async function fetchResetCoursePackProgress(coursePackId: string) {
  const http = getHttp();
  return await http(`/user-course-progress/course-pack/${coursePackId}`, {
    method: "delete",
  });
}
