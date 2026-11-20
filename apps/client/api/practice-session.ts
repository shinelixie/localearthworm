import type {
  DailyPoint,
  RecordSessionPayload,
  SessionOverview,
  SessionRecord,
} from "~/types/models/practice-session";
import { getHttp } from "./http";

export async function postRecordSession(payload: RecordSessionPayload) {
  const http = getHttp();
  return (await http<SessionRecord>("practice-session/record", {
    method: "post",
    body: payload,
  })) as SessionRecord;
}

export async function fetchSessionOverview() {
  const http = getHttp();
  return (await http<SessionOverview>("practice-session/analytics/overview", {
    method: "get",
  })) as SessionOverview;
}

export async function fetchDailyLearning(days = 30) {
  const http = getHttp();
  return (await http<DailyPoint[]>("practice-session/analytics/daily", {
    method: "get",
    query: { days },
  })) as DailyPoint[];
}

export async function fetchRecentSessions(limit = 10) {
  const http = getHttp();
  return (await http<SessionRecord[]>("practice-session/analytics/sessions", {
    method: "get",
    query: { limit },
  })) as SessionRecord[];
}
