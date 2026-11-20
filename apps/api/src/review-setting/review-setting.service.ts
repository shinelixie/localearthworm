import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";

import { reviewLog, reviewSetting } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";

export const SYSTEM_MODES = ["chinese_to_english", "dictation", "listening"] as const;

export const DEFAULT_REVIEW_SETTING = {
  enabledModes: [...SYSTEM_MODES] as string[],
  errorsOnly: false,
  wrongRoundsThreshold: 3,
  countShownAnswerAsError: true,
  dailyLimitsByMode: {
    chinese_to_english: 20,
    dictation: 20,
    listening: 20,
  } as Record<string, number>,
  useSystemRecommended: true,
};

export interface UpdateReviewSettingInput {
  enabledModes?: string[];
  errorsOnly?: boolean;
  wrongRoundsThreshold?: number;
  countShownAnswerAsError?: boolean;
  dailyLimitsByMode?: Record<string, number>;
  useSystemRecommended?: boolean;
}

@Injectable()
export class ReviewSettingService {
  constructor(@Inject(DB) private db: DbType) {}

  async get(userId: string) {
    const row = await this.db.query.reviewSetting.findFirst({
      where: eq(reviewSetting.userId, userId),
    });

    if (!row) return { ...DEFAULT_REVIEW_SETTING };

    return {
      enabledModes: row.enabledModes?.length
        ? row.enabledModes
        : DEFAULT_REVIEW_SETTING.enabledModes,
      errorsOnly: row.errorsOnly,
      wrongRoundsThreshold: row.wrongRoundsThreshold,
      countShownAnswerAsError: row.countShownAnswerAsError,
      dailyLimitsByMode: {
        ...DEFAULT_REVIEW_SETTING.dailyLimitsByMode,
        ...(row.dailyLimitsByMode ?? {}),
      },
      useSystemRecommended: row.useSystemRecommended,
    };
  }

  async update(userId: string, input: UpdateReviewSettingInput) {
    const current = await this.get(userId);
    const merged = {
      enabledModes: input.enabledModes?.length ? input.enabledModes : current.enabledModes,
      errorsOnly: input.errorsOnly ?? current.errorsOnly,
      wrongRoundsThreshold: clamp(
        input.wrongRoundsThreshold ?? current.wrongRoundsThreshold,
        1,
        10,
      ),
      countShownAnswerAsError: input.countShownAnswerAsError ?? current.countShownAnswerAsError,
      dailyLimitsByMode: {
        ...current.dailyLimitsByMode,
        ...(input.dailyLimitsByMode ?? {}),
      },
      useSystemRecommended: input.useSystemRecommended ?? current.useSystemRecommended,
    };

    await this.db
      .insert(reviewSetting)
      .values({ userId, ...merged })
      .onConflictDoUpdate({
        target: [reviewSetting.userId],
        set: { ...merged, updatedAt: new Date() },
      });

    return merged;
  }

  /** 今日各模式已复习条数 */
  async todayCounts(userId: string) {
    const rows = await this.db
      .select({
        mode: reviewLog.mode,
        count: sql<number>`count(*)::int`,
      })
      .from(reviewLog)
      .where(and(eq(reviewLog.userId, userId), sql`date(${reviewLog.reviewedAt}) = current_date`))
      .groupBy(reviewLog.mode);

    const result: Record<string, number> = {};
    for (const row of rows) result[row.mode] = row.count;
    return result;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.round(value), min), max);
}
