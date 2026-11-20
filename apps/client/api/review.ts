import type {
  ReviewCard,
  ReviewCourseSummary,
  ReviewGrade,
  ReviewSignals,
  ReviewSubmitResult,
  ReviewSummary,
} from "~/types/models/review";
import { getHttp } from "./http";

export async function postEnqueueReview(coursePackId: string, courseId: string, mode?: string) {
  const http = getHttp();
  return (await http<{ added: number }>(`review/${coursePackId}/enqueue`, {
    method: "post",
    body: { courseId, mode },
  })) as { added: number };
}

export async function fetchReviewSummary(coursePackId: string) {
  const http = getHttp();
  return (await http<ReviewSummary>(`review/${coursePackId}/summary`, {
    method: "get",
  })) as ReviewSummary;
}

export async function fetchReviewSummaryByCourse(coursePackId: string) {
  const http = getHttp();
  return (await http<ReviewCourseSummary[]>(`review/${coursePackId}/summary-by-course`, {
    method: "get",
  })) as ReviewCourseSummary[];
}

export async function fetchDueReviewCards(coursePackId: string, limit = 20) {
  const http = getHttp();
  return (await http<ReviewCard[]>(`review/${coursePackId}/cards`, {
    method: "get",
    query: { limit },
  })) as ReviewCard[];
}

/** 提交复习：信号 -> FSRS 排期 */
export async function postReviewSubmit(cardId: string, signals: ReviewSignals) {
  const http = getHttp();
  return (await http<ReviewSubmitResult>(`review/cards/${cardId}/submit`, {
    method: "post",
    body: signals,
  })) as ReviewSubmitResult;
}

export async function postReviewGraduate(cardId: string) {
  const http = getHttp();
  return (await http<ReviewCard>(`review/cards/${cardId}/graduate`, {
    method: "post",
  })) as ReviewCard;
}

export async function postReviewGrade(cardId: string, grade: ReviewGrade) {
  const http = getHttp();
  return (await http<ReviewCard>(`review/cards/${cardId}/grade`, {
    method: "post",
    body: { grade },
  })) as ReviewCard;
}
