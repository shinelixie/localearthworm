import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";

import { reviewCard, reviewLog, statement } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import {
  DEFAULT_REVIEW_SETTING,
  ReviewSettingService,
} from "../review-setting/review-setting.service";
import {
  newCardState,
  ratingLabel,
  ReviewSignals,
  scheduleCard,
  signalsToRating,
} from "./review.fsrs";

/** 手动评分（保留给旧客户端 / 后台修正用） */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

@Injectable()
export class ReviewService {
  constructor(
    @Inject(DB) private db: DbType,
    private readonly settingService: ReviewSettingService,
  ) {}

  /** 把某课程下的全部语句加入复习队列（已存在的跳过） */
  async enqueue(
    userId: string,
    coursePackId: string,
    courseId: string,
    mode = "chinese_to_english",
  ) {
    const rows = await this.db.query.statement.findMany({
      where: eq(statement.courseId, courseId),
    });

    if (rows.length === 0) {
      return { added: 0 };
    }

    const initial = newCardState();

    const inserted = await this.db
      .insert(reviewCard)
      .values(
        rows.map((item) => ({
          userId,
          coursePackId,
          courseId,
          statementId: item.id,
          english: item.english,
          chinese: item.chinese,
          mode,
          ...initial,
        })),
      )
      .onConflictDoNothing({ target: [reviewCard.userId, reviewCard.statementId] })
      .returning({ id: reviewCard.id });

    return { added: inserted.length };
  }

  async summary(userId: string, coursePackId: string) {
    const now = new Date().toISOString();
    const setting = await this.settingService.get(userId);
    const modes = setting.enabledModes.length
      ? setting.enabledModes
      : DEFAULT_REVIEW_SETTING.enabledModes;

    const [row] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        due: sql<number>`count(*) filter (where ${reviewCard.dueAt} <= ${now}::timestamp and ${reviewCard.graduated} = false)::int`,
        graduated: sql<number>`count(*) filter (where ${reviewCard.graduated} = true)::int`,
        learning: sql<number>`count(*) filter (where ${reviewCard.graduated} = false and ${reviewCard.reps} > 0)::int`,
      })
      .from(reviewCard)
      .where(
        and(
          eq(reviewCard.userId, userId),
          eq(reviewCard.coursePackId, coursePackId),
          inArray(reviewCard.mode, modes),
        ),
      );

    return {
      total: row?.total ?? 0,
      due: row?.due ?? 0,
      graduated: row?.graduated ?? 0,
      learning: row?.learning ?? 0,
    };
  }

  /** 全部课程包的复习待办，用于复习首页 */
  async overviewByCoursePack(userId: string) {
    const setting = await this.settingService.get(userId);
    const modes = setting.enabledModes.length
      ? setting.enabledModes
      : DEFAULT_REVIEW_SETTING.enabledModes;
    const now = new Date().toISOString();

    const rows = await this.db
      .select({
        coursePackId: reviewCard.coursePackId,
        total: sql<number>`count(*)::int`,
        due: sql<number>`count(*) filter (where ${reviewCard.dueAt} <= ${now}::timestamp and ${reviewCard.graduated} = false)::int`,
        graduated: sql<number>`count(*) filter (where ${reviewCard.graduated} = true)::int`,
      })
      .from(reviewCard)
      .where(and(eq(reviewCard.userId, userId), inArray(reviewCard.mode, modes)))
      .groupBy(reviewCard.coursePackId);

    return rows;
  }

  /** 每门课的卡片统计，用于课程列表角标 */
  async summaryByCourse(userId: string, coursePackId: string) {
    const now = new Date().toISOString();
    const setting = await this.settingService.get(userId);
    const modes = setting.enabledModes.length
      ? setting.enabledModes
      : DEFAULT_REVIEW_SETTING.enabledModes;

    const rows = await this.db
      .select({
        courseId: reviewCard.courseId,
        total: sql<number>`count(*)::int`,
        due: sql<number>`count(*) filter (where ${reviewCard.dueAt} <= ${now}::timestamp and ${reviewCard.graduated} = false)::int`,
      })
      .from(reviewCard)
      .where(
        and(
          eq(reviewCard.userId, userId),
          eq(reviewCard.coursePackId, coursePackId),
          inArray(reviewCard.mode, modes),
        ),
      )
      .groupBy(reviewCard.courseId);

    return rows;
  }

  /**
   * 到期卡片：受「启用模式 / 只复习错题 / 每日上限」三项设置约束
   */
  async dueCards(userId: string, coursePackId: string, limit = 20) {
    const setting = await this.settingService.get(userId);
    const modes = setting.enabledModes.length
      ? setting.enabledModes
      : DEFAULT_REVIEW_SETTING.enabledModes;

    const limits = setting.useSystemRecommended
      ? DEFAULT_REVIEW_SETTING.dailyLimitsByMode
      : setting.dailyLimitsByMode;

    const todayCounts = await this.settingService.todayCounts(userId);

    const errorsFilter = setting.errorsOnly
      ? or(eq(reviewCard.lastRating, "again"), gt(reviewCard.lapses, 0))
      : undefined;

    const rows = await this.db.query.reviewCard.findMany({
      where: and(
        eq(reviewCard.userId, userId),
        eq(reviewCard.coursePackId, coursePackId),
        lte(reviewCard.dueAt, new Date()),
        eq(reviewCard.graduated, false),
        inArray(reviewCard.mode, modes),
        errorsFilter,
      ),
      orderBy: [asc(reviewCard.dueAt)],
      limit: limit * 3,
    });

    const used: Record<string, number> = {};
    const result: typeof rows = [];

    for (const card of rows) {
      const cap = Math.max((limits[card.mode] ?? 0) - (todayCounts[card.mode] ?? 0), 0);
      const consumed = used[card.mode] ?? 0;
      if (consumed >= cap) continue;

      used[card.mode] = consumed + 1;
      result.push(card);
      if (result.length >= limit) break;
    }

    return result;
  }

  /** 复习作答：行为信号 + 用户设置 -> FSRS 排期 */
  async submit(userId: string, cardId: string, signals: ReviewSignals) {
    const card = await this.findCard(userId, cardId);
    const setting = await this.settingService.get(userId);

    const rating = signalsToRating(signals, {
      countShownAnswerAsError: setting.countShownAnswerAsError,
      wrongRoundsThreshold: setting.wrongRoundsThreshold,
    });

    const next = scheduleCard(card, rating);

    const [updated] = await this.db
      .update(reviewCard)
      .set({ ...next, lastRating: ratingLabel(rating) })
      .where(eq(reviewCard.id, cardId))
      .returning();

    await this.db.insert(reviewLog).values({
      userId,
      cardId,
      coursePackId: card.coursePackId,
      mode: card.mode,
      rating: ratingLabel(rating),
      skipped: signals.skipped ?? false,
    });

    return {
      card: updated,
      rating: ratingLabel(rating),
      scheduledDays: next.scheduledDays,
      dueAt: next.dueAt,
      graduated: next.graduated,
    };
  }

  /** 手动评分（兼容旧接口） */
  async grade(userId: string, cardId: string, grade: ReviewGrade) {
    const card = await this.findCard(userId, cardId);
    const rating = { again: 1, hard: 2, good: 3, easy: 4 }[grade] as 1 | 2 | 3 | 4;
    const next = scheduleCard(card, rating);

    const [updated] = await this.db
      .update(reviewCard)
      .set({ ...next, lastRating: grade })
      .where(eq(reviewCard.id, cardId))
      .returning();

    return updated;
  }

  /** 标记毕业（不再进队列） */
  async markGraduated(userId: string, cardId: string) {
    await this.findCard(userId, cardId);
    const [updated] = await this.db
      .update(reviewCard)
      .set({ graduated: true })
      .where(eq(reviewCard.id, cardId))
      .returning();
    return updated;
  }

  /** 清空某课程包的复习卡 */
  async clearByCoursePack(userId: string, coursePackId: string) {
    const removed = await this.db
      .delete(reviewCard)
      .where(and(eq(reviewCard.userId, userId), eq(reviewCard.coursePackId, coursePackId)))
      .returning({ id: reviewCard.id });
    return { removed: removed.length };
  }

  private async findCard(userId: string, cardId: string) {
    const card = await this.db.query.reviewCard.findFirst({
      where: and(eq(reviewCard.id, cardId), eq(reviewCard.userId, userId)),
    });

    if (!card) {
      throw new NotFoundException("review card not found");
    }
    return card;
  }
}
