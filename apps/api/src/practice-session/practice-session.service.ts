import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, sql } from "drizzle-orm";

import { practiceSession } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

export interface RecordSessionInput {
  coursePackId: string;
  courseId: string;
  mode: string;
  /** 拆分方式（word_first / chunk_first / top_down / sentence_only / custom） */
  splitMode?: string;
  presetKey?: string;
  durationMs?: number;
  exerciseCount?: number;
  answerCount?: number;
  correctCount?: number;
  attemptsSum?: number;
  startedAt?: string;
}

const RANK_THRESHOLDS = {
  beginner: { S: 8, A: 14, B: 22 },
  intermediate: { S: 7, A: 12, B: 20 },
  advanced: { S: 6, A: 10, B: 18 },
};

@Injectable()
export class PracticeSessionService {
  constructor(@Inject(DB) private db: DbType) {}

  /** 记录一次练习会话 */
  async record(userId: string, input: RecordSessionInput) {
    const answerCount = Math.max(input.answerCount ?? 0, 0);
    const correctCount = Math.min(Math.max(input.correctCount ?? 0, 0), answerCount || 0);
    const correctRate = answerCount === 0 ? 0 : correctCount / answerCount;
    const durationMs = Math.max(input.durationMs ?? 0, 0);
    const secPerQuestion = answerCount === 0 ? 0 : durationMs / 1000 / answerCount;

    const rank = this.computeRank(correctRate, secPerQuestion, input.presetKey ?? "beginner");
    const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();

    const [row] = await this.db
      .insert(practiceSession)
      .values({
        userId,
        coursePackId: input.coursePackId,
        courseId: input.courseId,
        mode: input.mode,
        splitMode: input.splitMode ?? null,
        presetKey: input.presetKey ?? "beginner",
        startedAt,
        completedAt: new Date(),
        durationMs,
        exerciseCount: Math.max(input.exerciseCount ?? answerCount, 0),
        answerCount,
        correctCount,
        attemptsSum: Math.max(input.attemptsSum ?? answerCount, 0),
        correctRate,
        rank,
      })
      .returning();

    return row;
  }

  /** 总览：次数、总时长、学习天数、最长连续、平均正确率 */
  async overview(userId: string) {
    const [row] = await this.db
      .select({
        sessions: sql<number>`count(*)::int`,
        totalDurationMs: sql<number>`coalesce(sum(${practiceSession.durationMs}), 0)::int`,
        totalAnswers: sql<number>`coalesce(sum(${practiceSession.answerCount}), 0)::int`,
        totalCorrect: sql<number>`coalesce(sum(${practiceSession.correctCount}), 0)::int`,
        completedCourses: sql<number>`count(distinct ${practiceSession.courseId})::int`,
        learningDays: sql<number>`count(distinct date(${practiceSession.startedAt}))::int`,
        avgCorrectRate: sql<number>`coalesce(avg(${practiceSession.correctRate}), 0)::float`,
      })
      .from(practiceSession)
      .where(eq(practiceSession.userId, userId));

    const dates = await this.db
      .select({ day: sql<string>`date(${practiceSession.startedAt})::text` })
      .from(practiceSession)
      .where(eq(practiceSession.userId, userId))
      .groupBy(sql`date(${practiceSession.startedAt})`)
      .orderBy(sql`date(${practiceSession.startedAt})`);

    return {
      sessions: row?.sessions ?? 0,
      totalDurationMs: row?.totalDurationMs ?? 0,
      totalAnswers: row?.totalAnswers ?? 0,
      totalCorrect: row?.totalCorrect ?? 0,
      completedCourses: row?.completedCourses ?? 0,
      learningDays: row?.learningDays ?? 0,
      avgCorrectRate: Number((row?.avgCorrectRate ?? 0).toFixed(4)),
      longestStreak: this.longestStreak(dates.map((item) => item.day)),
    };
  }

  /** 最近 N 天每日时长（补零） */
  async daily(userId: string, days = 30) {
    const rows = await this.db
      .select({
        day: sql<string>`date(${practiceSession.startedAt})::text`,
        durationMs: sql<number>`coalesce(sum(${practiceSession.durationMs}), 0)::int`,
        sessions: sql<number>`count(*)::int`,
      })
      .from(practiceSession)
      .where(eq(practiceSession.userId, userId))
      .groupBy(sql`date(${practiceSession.startedAt})`)
      .orderBy(sql`date(${practiceSession.startedAt})`);

    const map = new Map(rows.map((row) => [row.day, row]));
    const result: { date: string; durationMs: number; sessions: number }[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const key = date.toISOString().slice(0, 10);
      const hit = map.get(key);
      result.push({
        date: key,
        durationMs: hit?.durationMs ?? 0,
        sessions: hit?.sessions ?? 0,
      });
    }
    return result;
  }

  /** 按课程包聚合 */
  async byCoursePack(userId: string) {
    return await this.db
      .select({
        coursePackId: practiceSession.coursePackId,
        sessions: sql<number>`count(*)::int`,
        durationMs: sql<number>`coalesce(sum(${practiceSession.durationMs}), 0)::int`,
        avgCorrectRate: sql<number>`coalesce(avg(${practiceSession.correctRate}), 0)::float`,
        lastPracticedAt: sql<string>`max(${practiceSession.startedAt})`,
      })
      .from(practiceSession)
      .where(eq(practiceSession.userId, userId))
      .groupBy(practiceSession.coursePackId)
      .orderBy(sql`max(${practiceSession.startedAt}) desc`);
  }

  /** 最近会话明细 */
  async sessions(userId: string, limit = 10) {
    return await this.db
      .select()
      .from(practiceSession)
      .where(eq(practiceSession.userId, userId))
      .orderBy(desc(practiceSession.startedAt))
      .limit(Math.min(Math.max(limit, 1), 50));
  }

  private computeRank(correctRate: number, secPerQuestion: number, presetKey: string) {
    const threshold =
      RANK_THRESHOLDS[presetKey as keyof typeof RANK_THRESHOLDS] ?? RANK_THRESHOLDS.beginner;

    if (correctRate >= 0.95 && secPerQuestion > 0 && secPerQuestion <= threshold.S) return "S";
    if (correctRate >= 0.9 && secPerQuestion > 0 && secPerQuestion <= threshold.A) return "A";
    if (correctRate >= 0.8 && secPerQuestion > 0 && secPerQuestion <= threshold.B) return "B";
    if (correctRate >= 0.7) return "C";
    return "D";
  }

  private longestStreak(days: string[]) {
    if (days.length === 0) return 0;

    let longest = 1;
    let current = 1;

    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1]).getTime();
      const now = new Date(days[i]).getTime();
      const diff = Math.round((now - prev) / (24 * 60 * 60 * 1000));
      if (diff === 1) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 1;
      }
    }
    return longest;
  }
}
