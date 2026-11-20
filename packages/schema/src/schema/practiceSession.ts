import { createId } from "@paralleldrive/cuid2";
import { index, integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 一次练习会话（对齐 julebu 的 practice session / course analytics）
 * 每完成一节课落一条，用于成长分析的会话级明细。
 */
export const practiceSession = pgTable(
  "practice_session",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    coursePackId: text("course_pack_id").notNull(),
    courseId: text("course_id").notNull(),
    mode: text("mode").notNull(),
    /** 拆分方式（word_first / chunk_first / top_down / sentence_only / custom） */
    splitMode: text("split_mode"),
    /** 难度档位 */
    presetKey: text("preset_key"),

    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at").notNull().defaultNow(),

    /** 练习时长（毫秒） */
    durationMs: integer("duration_ms").notNull().default(0),
    exerciseCount: integer("exercise_count").notNull().default(0),
    answerCount: integer("answer_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    /** 累计尝试次数（含重试） */
    attemptsSum: integer("attempts_sum").notNull().default(0),
    correctRate: real("correct_rate").notNull().default(0),
    /** 本次评级 S/A/B/C/D */
    rank: text("rank"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    userStartedIdx: index("practice_session_user_started_idx").on(t.userId, t.startedAt),
  }),
);
