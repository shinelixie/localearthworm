import { createId } from "@paralleldrive/cuid2";
import { boolean, integer, pgTable, real, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * 复习卡片（对齐线上 julebu 的 practiceReview 体系）
 * 排期使用 FSRS-6（ts-fsrs），字段与 FSRS Card 一一对应。
 */
export const reviewCard = pgTable(
  "review_card",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    coursePackId: text("course_pack_id").notNull(),
    courseId: text("course_id").notNull(),
    statementId: text("statement_id").notNull(),
    english: text("english").notNull(),
    chinese: text("chinese").notNull(),
    /** 入队时的练习模式，用于按模式筛选复习 */
    mode: text("mode").notNull().default("chinese_to_english"),
    /** 最近一次复习评级，用于「只复习错题」 */
    lastRating: text("last_rating"),

    /** FSRS: 记忆稳定度（天） */
    stability: real("stability").notNull().default(0),
    /** FSRS: 难度 1~10 */
    difficulty: real("difficulty").notNull().default(0),
    /** FSRS: 距上次复习的天数 */
    elapsedDays: integer("elapsed_days").notNull().default(0),
    /** FSRS: 本次排期间隔（天） */
    scheduledDays: integer("scheduled_days").notNull().default(0),
    /** FSRS: 学习阶段步进 */
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    /** FSRS State: 0=New 1=Learning 2=Review 3=Relearning */
    state: integer("state").notNull().default(0),

    dueAt: timestamp("due_at").notNull().defaultNow(),
    lastReviewAt: timestamp("last_review_at"),
    /** 间隔达到毕业阈值后不再进入队列 */
    graduated: boolean("graduated").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique().on(t.userId, t.statementId),
  }),
);
