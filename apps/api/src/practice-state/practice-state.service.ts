import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { lastPractice, practiceRouteProgress, practiceState } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

export interface PracticeStateInput {
  coursePackId: string;
  courseId: string;
  practiceMode: string;
  splitMode: string;
  stagesKey?: string;
  statementIndex: number;
}

export interface LastPracticeInput {
  coursePackId: string;
  courseId: string;
  practiceMode: string;
  difficulty: string;
  splitMode: string;
  stages?: string[];
  statementIndex: number;
}

export interface RouteNodeInput {
  coursePackId: string;
  courseId: string;
  practiceMode: string;
  splitMode: string;
  difficulty: string;
}

@Injectable()
export class PracticeStateService {
  constructor(@Inject(DB) private readonly db: DbType) {}

  async upsertState(userId: string, input: PracticeStateInput) {
    const stagesKey = input.stagesKey || "default";
    await this.db
      .insert(practiceState)
      .values({
        userId,
        coursePackId: input.coursePackId,
        courseId: input.courseId,
        practiceMode: input.practiceMode,
        splitMode: input.splitMode,
        stagesKey,
        statementIndex: Math.max(0, input.statementIndex || 0),
      })
      .onConflictDoUpdate({
        target: [
          practiceState.userId,
          practiceState.coursePackId,
          practiceState.courseId,
          practiceState.practiceMode,
          practiceState.splitMode,
          practiceState.stagesKey,
        ],
        set: { statementIndex: Math.max(0, input.statementIndex || 0), updatedAt: new Date() },
      });
    return { success: true };
  }

  async getState(
    userId: string,
    query: {
      coursePackId: string;
      courseId: string;
      practiceMode: string;
      splitMode: string;
      stagesKey?: string;
    },
  ) {
    const row = await this.db.query.practiceState.findFirst({
      where: and(
        eq(practiceState.userId, userId),
        eq(practiceState.coursePackId, query.coursePackId),
        eq(practiceState.courseId, query.courseId),
        eq(practiceState.practiceMode, query.practiceMode),
        eq(practiceState.splitMode, query.splitMode),
        eq(practiceState.stagesKey, query.stagesKey || "default"),
      ),
    });
    return row ?? null;
  }

  async upsertLastPractice(userId: string, input: LastPracticeInput) {
    const values = {
      practiceMode: input.practiceMode,
      difficulty: input.difficulty,
      splitMode: input.splitMode,
      stages: input.stages ?? [],
      statementIndex: Math.max(0, input.statementIndex || 0),
      updatedAt: new Date(),
    };
    await this.db
      .insert(lastPractice)
      .values({
        userId,
        coursePackId: input.coursePackId,
        courseId: input.courseId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [lastPractice.userId, lastPractice.coursePackId, lastPractice.courseId],
        set: values,
      });
    return { success: true };
  }

  async getLastPracticeForPack(userId: string, coursePackId: string) {
    const row = await this.db.query.lastPractice.findFirst({
      where: and(eq(lastPractice.userId, userId), eq(lastPractice.coursePackId, coursePackId)),
      orderBy: [desc(lastPractice.updatedAt)],
    });
    return row ?? null;
  }

  async markRouteNode(userId: string, input: RouteNodeInput) {
    await this.db
      .insert(practiceRouteProgress)
      .values({
        userId,
        coursePackId: input.coursePackId,
        courseId: input.courseId,
        practiceMode: input.practiceMode,
        splitMode: input.splitMode,
        difficulty: input.difficulty,
        completedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          practiceRouteProgress.userId,
          practiceRouteProgress.coursePackId,
          practiceRouteProgress.courseId,
          practiceRouteProgress.practiceMode,
          practiceRouteProgress.splitMode,
          practiceRouteProgress.difficulty,
        ],
        set: { completedAt: new Date(), updatedAt: new Date() },
      });
    return { success: true };
  }

  async getRouteNodes(
    userId: string,
    query: { coursePackId: string; courseId: string; practiceMode: string },
  ) {
    return await this.db
      .select({
        splitMode: practiceRouteProgress.splitMode,
        difficulty: practiceRouteProgress.difficulty,
      })
      .from(practiceRouteProgress)
      .where(
        and(
          eq(practiceRouteProgress.userId, userId),
          eq(practiceRouteProgress.coursePackId, query.coursePackId),
          eq(practiceRouteProgress.courseId, query.courseId),
          eq(practiceRouteProgress.practiceMode, query.practiceMode),
        ),
      );
  }

  /** 整个课程包的学习路线完成情况（课程列表/学习路径用） */
  async getRouteSummary(userId: string, coursePackId: string, practiceMode?: string) {
    const conditions = [
      eq(practiceRouteProgress.userId, userId),
      eq(practiceRouteProgress.coursePackId, coursePackId),
    ];
    if (practiceMode) {
      conditions.push(eq(practiceRouteProgress.practiceMode, practiceMode));
    }
    return await this.db
      .select({
        courseId: practiceRouteProgress.courseId,
        practiceMode: practiceRouteProgress.practiceMode,
        splitMode: practiceRouteProgress.splitMode,
        difficulty: practiceRouteProgress.difficulty,
      })
      .from(practiceRouteProgress)
      .where(and(...conditions));
  }
}
