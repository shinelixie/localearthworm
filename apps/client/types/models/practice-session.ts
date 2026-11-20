export interface SessionOverview {
  sessions: number;
  totalDurationMs: number;
  totalAnswers: number;
  totalCorrect: number;
  completedCourses: number;
  learningDays: number;
  avgCorrectRate: number;
  longestStreak: number;
}

export interface DailyPoint {
  date: string;
  durationMs: number;
  sessions: number;
}

export interface SessionRecord {
  id: string;
  coursePackId: string;
  courseId: string;
  mode: string;
  splitMode?: string | null;
  presetKey: string | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  exerciseCount: number;
  answerCount: number;
  correctCount: number;
  attemptsSum: number;
  correctRate: number;
  rank: string | null;
}

export interface RecordSessionPayload {
  coursePackId: string;
  courseId: string;
  mode: string;
  splitMode?: string;
  presetKey?: string;
  durationMs: number;
  exerciseCount: number;
  answerCount: number;
  correctCount: number;
  attemptsSum: number;
  startedAt?: string;
}
