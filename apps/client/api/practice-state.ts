import { getHttp } from "./http";

export interface PracticeStateApi {
  coursePackId: string;
  courseId: string;
  practiceMode: string;
  splitMode: string;
  stagesKey: string;
  statementIndex: number;
  updatedAt?: string;
}

export interface PracticeStateQuery {
  coursePackId: string;
  courseId: string;
  practiceMode: string;
  splitMode: string;
  stagesKey: string;
}

export async function putPracticeState(payload: PracticeStateApi) {
  const http = getHttp();
  return await http("/practice-state", { method: "put", body: payload });
}

export async function fetchPracticeState(query: PracticeStateQuery) {
  const http = getHttp();
  return (await http<PracticeStateApi | null>("/practice-state", {
    method: "get",
    query,
  })) as PracticeStateApi | null;
}

export interface LastPracticeApi {
  coursePackId: string;
  courseId: string;
  practiceMode: string;
  difficulty: string;
  splitMode: string;
  stages: string[];
  statementIndex: number;
  updatedAt?: string;
}

export async function putLastPracticeApi(payload: Omit<LastPracticeApi, "updatedAt">) {
  const http = getHttp();
  return await http("/practice-state/last-practice", { method: "put", body: payload });
}

export async function fetchLastPracticeForPack(coursePackId: string) {
  const http = getHttp();
  return (await http<LastPracticeApi | null>("/practice-state/last-practice", {
    method: "get",
    query: { coursePackId },
  })) as LastPracticeApi | null;
}

export interface RouteNodeApi {
  splitMode: string;
  difficulty: string;
}

export async function putRouteNode(payload: {
  coursePackId: string;
  courseId: string;
  practiceMode: string;
  splitMode: string;
  difficulty: string;
}) {
  const http = getHttp();
  return await http("/practice-state/route", { method: "put", body: payload });
}

export async function fetchRouteNodes(
  coursePackId: string,
  courseId: string,
  practiceMode: string,
) {
  const http = getHttp();
  return (await http<RouteNodeApi[]>("/practice-state/route", {
    method: "get",
    query: { coursePackId, courseId, practiceMode },
  })) as RouteNodeApi[];
}

export interface RouteSummaryApi {
  courseId: string;
  practiceMode: string;
  splitMode: string;
  difficulty: string;
}

export async function fetchRouteSummary(coursePackId: string, practiceMode?: string) {
  const http = getHttp();
  return (await http<RouteSummaryApi[]>("/practice-state/route/summary", {
    method: "get",
    query: practiceMode ? { coursePackId, practiceMode } : { coursePackId },
  })) as RouteSummaryApi[];
}
