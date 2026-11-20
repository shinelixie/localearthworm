import { createId } from "@paralleldrive/cuid2";
import { integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * 练习续练位置（拆分练习用）
 * 拆分题是前端按「拆分方式 × 阶段」动态生成的，服务端没有对应的语句数组，
 * 所以这里存「片段下标 + 生成参数」，下次进入按同样参数重建列表后恢复。
 */
export const practiceState = pgTable(
  "practice_state",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    coursePackId: text("course_pack_id").notNull(),
    courseId: text("course_id").notNull(),
    /** chinese_to_english / dictation / listening */
    practiceMode: text("practice_mode").notNull(),
    /** word_first / chunk_first / top_down / sentence_only / custom */
    splitMode: text("split_mode").notNull(),
    /** 勾选阶段的稳定指纹（排序后 join），算法/选项变化时自然失效 */
    stagesKey: text("stages_key").notNull().default("default"),
    statementIndex: integer("statement_index").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique().on(
      t.userId,
      t.coursePackId,
      t.courseId,
      t.practiceMode,
      t.splitMode,
      t.stagesKey,
    ),
  }),
);

/**
 * 上次练习（主页「继续游戏」）
 * 每节课一行，课程包里取 updatedAt 最新的一行。
 */
export const lastPractice = pgTable(
  "last_practice",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    coursePackId: text("course_pack_id").notNull(),
    courseId: text("course_id").notNull(),
    practiceMode: text("practice_mode").notNull(),
    difficulty: text("difficulty").notNull(),
    splitMode: text("split_mode").notNull(),
    stages: jsonb("stages").$type<string[]>().notNull(),
    statementIndex: integer("statement_index").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique().on(t.userId, t.coursePackId, t.courseId),
  }),
);

/**
 * 学习路线完成记录：拆分方式 × 难度
 * 与 user_course_mode_progress（练习模式 × 难度星级）是两个维度。
 */
export const practiceRouteProgress = pgTable(
  "practice_route_progress",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id").notNull(),
    coursePackId: text("course_pack_id").notNull(),
    courseId: text("course_id").notNull(),
    practiceMode: text("practice_mode").notNull(),
    splitMode: text("split_mode").notNull(),
    difficulty: text("difficulty").notNull(),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique().on(
      t.userId,
      t.coursePackId,
      t.courseId,
      t.practiceMode,
      t.splitMode,
      t.difficulty,
    ),
  }),
);
