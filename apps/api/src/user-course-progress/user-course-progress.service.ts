import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";

import {
  courseHistory,
  coursePack,
  lastPractice,
  reviewCard,
  userCourseModeProgress,
  userCourseProgress,
} from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

@Injectable()
export class UserCourseProgressService {
  constructor(@Inject(DB) private db: DbType) {}

  async findStatement(userId: string, coursePackId: string, courseId: string) {
    const result = await this.db.query.userCourseProgress.findFirst({
      where: and(
        eq(userCourseProgress.userId, userId),
        eq(userCourseProgress.coursePackId, coursePackId),
        eq(userCourseProgress.courseId, courseId),
      ),
    });

    return result ? result.statementIndex : 0;
  }

  async getUserRecentCoursePacks(userId: string, limit: number) {
    // 单个包可能有很多节课（四六级现在是一句一课），多取一些才能凑够 limit 个不同包
    const fetchSize = Math.max(limit * 200, 2000);

    // 最近使用以「上次练习」为准：它覆盖整句、听写、听力和拆分练习，
    // 每次换题都会更新；user_course_progress 只覆盖普通整句练习，作为兜底。
    const lastPracticeRows = await this.db
      .select({
        id: lastPractice.id,
        coursePackId: lastPractice.coursePackId,
        courseId: lastPractice.courseId,
        updatedAt: lastPractice.updatedAt,
        title: coursePack.title,
        description: coursePack.description,
        cover: coursePack.cover,
        isFree: coursePack.isFree,
      })
      .from(lastPractice)
      .where(eq(lastPractice.userId, userId))
      .orderBy(desc(lastPractice.updatedAt))
      .limit(fetchSize)
      .leftJoin(coursePack, eq(lastPractice.coursePackId, coursePack.id));

    const progressRows = await this.db
      .select({
        id: userCourseProgress.id,
        coursePackId: userCourseProgress.coursePackId,
        courseId: userCourseProgress.courseId,
        updatedAt: userCourseProgress.updatedAt,
        title: coursePack.title,
        description: coursePack.description,
        cover: coursePack.cover,
        isFree: coursePack.isFree,
      })
      .from(userCourseProgress)
      .where(eq(userCourseProgress.userId, userId))
      .orderBy(desc(userCourseProgress.updatedAt))
      // 进度按课存（同一课程包会有多条），这里多取一些再去重，保证能凑够 limit 个包
      .limit(fetchSize)
      .leftJoin(coursePack, eq(userCourseProgress.coursePackId, coursePack.id));

    // 同一个包只保留最新的一条；最后按时间倒序取前 limit 个
    const merged = new Map<string, (typeof lastPracticeRows)[number]>();
    for (const row of [...lastPracticeRows, ...progressRows]) {
      const existing = merged.get(row.coursePackId);
      const rowTime = row.updatedAt ? row.updatedAt.getTime() : 0;
      const existingTime = existing?.updatedAt ? existing.updatedAt.getTime() : 0;
      if (!existing || rowTime > existingTime) {
        merged.set(row.coursePackId, row);
      }
    }

    return [...merged.values()]
      .sort((a, b) => {
        const aTime = a.updatedAt ? a.updatedAt.getTime() : 0;
        const bTime = b.updatedAt ? b.updatedAt.getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, limit);
  }

  async upsert(userId: string, coursePackId: string, courseId: string, statementIndex: number) {
    await this.db
      .insert(userCourseProgress)
      .values({
        userId,
        coursePackId,
        courseId,
        statementIndex,
      })
      .onConflictDoUpdate({
        target: [
          userCourseProgress.userId,
          userCourseProgress.coursePackId,
          userCourseProgress.courseId,
        ],
        // updatedAt 显式写：on conflict 的更新不一定触发 $onUpdateFn，
        // 而「最近使用的课程包」靠它排序
        set: { statementIndex, updatedAt: new Date() },
      });
  }

  /**
   * 重置单课进度：清掉断点下标和「已完整学过 N 次」记录。
   * 只重置 statementIndex 不够——learnedCount 在 completionCount > 0 时恒等于总句数，
   * 不删 courseHistory 的话进度条会一直停在 100%。
   */
  async resetCourse(userId: string, coursePackId: string, courseId: string) {
    await this.db
      .delete(userCourseProgress)
      .where(
        and(
          eq(userCourseProgress.userId, userId),
          eq(userCourseProgress.coursePackId, coursePackId),
          eq(userCourseProgress.courseId, courseId),
        ),
      );

    await this.db
      .delete(courseHistory)
      .where(
        and(
          eq(courseHistory.userId, userId),
          eq(courseHistory.coursePackId, coursePackId),
          eq(courseHistory.courseId, courseId),
        ),
      );

    // 学习路径星级与复习卡片一起清掉，重置才是真的从头开始
    await this.db
      .delete(userCourseModeProgress)
      .where(
        and(
          eq(userCourseModeProgress.userId, userId),
          eq(userCourseModeProgress.coursePackId, coursePackId),
          eq(userCourseModeProgress.courseId, courseId),
        ),
      );

    await this.db
      .delete(reviewCard)
      .where(and(eq(reviewCard.userId, userId), eq(reviewCard.courseId, courseId)));
  }

  /** 重置整个课程包：本包下所有课的断点与完成次数一起清零 */
  async resetCoursePack(userId: string, coursePackId: string) {
    await this.db
      .delete(userCourseProgress)
      .where(
        and(
          eq(userCourseProgress.userId, userId),
          eq(userCourseProgress.coursePackId, coursePackId),
        ),
      );

    await this.db
      .delete(courseHistory)
      .where(and(eq(courseHistory.userId, userId), eq(courseHistory.coursePackId, coursePackId)));

    await this.db
      .delete(userCourseModeProgress)
      .where(
        and(
          eq(userCourseModeProgress.userId, userId),
          eq(userCourseModeProgress.coursePackId, coursePackId),
        ),
      );

    await this.db
      .delete(reviewCard)
      .where(and(eq(reviewCard.userId, userId), eq(reviewCard.coursePackId, coursePackId)));
  }
}
