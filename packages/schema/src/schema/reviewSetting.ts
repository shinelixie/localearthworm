import { createId } from "@paralleldrive/cuid2";
import { boolean, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * 复习设置（对齐 julebu 的 review 配置）
 * 每个用户一条，未设置时使用系统推荐值。
 */
export const reviewSetting = pgTable(
  "review_setting",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),

    /** 纳入复习的模式 */
    enabledModes: jsonb("enabled_modes")
      .$type<string[]>()
      .notNull()
      .default(["chinese_to_english", "dictation", "listening"]),

    /** 只复习错题（曾经遗忘过的卡） */
    errorsOnly: boolean("errors_only").notNull().default(false),

    /** 错几轮算错题 */
    wrongRoundsThreshold: integer("wrong_rounds_threshold").notNull().default(3),

    /** 看了答案是否算错 */
    countShownAnswerAsError: boolean("count_shown_answer_as_error").notNull().default(true),

    /** 每个模式每日复习上限 */
    dailyLimitsByMode: jsonb("daily_limits_by_mode")
      .$type<Record<string, number>>()
      .notNull()
      .default({ chinese_to_english: 20, dictation: 20, listening: 20 }),

    /** 使用系统推荐配置（忽略自定义每日上限） */
    useSystemRecommended: boolean("use_system_recommended").notNull().default(true),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique().on(t.userId),
  }),
);

/** 每次复习的流水，用于每日额度与统计 */
export const reviewLog = pgTable("review_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("user_id").notNull(),
  cardId: text("card_id").notNull(),
  coursePackId: text("course_pack_id").notNull(),
  mode: text("mode").notNull(),
  /** again / hard / good / easy */
  rating: text("rating").notNull(),
  /** 是否跳过 */
  skipped: boolean("skipped").notNull().default(false),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
});
