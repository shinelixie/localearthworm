export type ReviewGrade = "again" | "hard" | "good" | "easy";

/** 复习作答的行为信号（与 julebu submitReview 对齐） */
export interface ReviewSignals {
  skipped?: boolean;
  firstAttemptCorrect?: boolean;
  attemptCount?: number;
  showFullAnswer?: number;
  showWordHint?: number;
  typoCount?: number;
  audioPlayCount?: number;
}

export interface ReviewCard {
  id: string;
  coursePackId: string;
  courseId: string;
  statementId: string;
  english: string;
  chinese: string;
  /** FSRS 字段 */
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  dueAt: string;
  lastReviewAt: string | null;
  graduated: boolean;
}

export interface ReviewSubmitResult {
  card: ReviewCard;
  rating: ReviewGrade;
  scheduledDays: number;
  dueAt: string;
  graduated: boolean;
}

export interface ReviewSummary {
  total: number;
  due: number;
  graduated: number;
  learning: number;
}

export interface ReviewCourseSummary {
  courseId: string;
  total: number;
  due: number;
}
