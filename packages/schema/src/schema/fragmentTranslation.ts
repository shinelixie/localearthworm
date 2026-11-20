import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * 拆分片段的中文翻译缓存
 *
 * 片段是运行时按拆分方式生成的，同一段英文（如 when criticised）会在不同课、
 * 不同拆分阶段反复出现。按原文 + 语言方向唯一存一条，避免重复调用翻译模型；
 * 缓存落库后重启、清磁盘都不影响，也方便直接查表校对。
 */
export const fragmentTranslation = pgTable(
  "fragment_translation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    /** 英文原文（片段或整句） */
    sourceText: text("source_text").notNull(),
    /** 中文译文 */
    translation: text("translation").notNull(),
    sourceLang: text("source_lang").notNull().default("en"),
    targetLang: text("target_lang").notNull().default("zh-CN"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique().on(t.sourceText, t.sourceLang, t.targetLang),
  }),
);
