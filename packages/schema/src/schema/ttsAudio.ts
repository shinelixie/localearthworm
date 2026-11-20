import { createId } from "@paralleldrive/cuid2";
import { customType, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/** PostgreSQL bytea（mp3 原始字节） */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * TTS 音频缓存
 *
 * 除了磁盘缓存（storage/tts）之外，把合成结果也落库一份：
 * 这样可以随数据库一起备份/导出，换机器或清磁盘后不用重新合成。
 * 一条记录 = 一个 (text, voice, rate) 组合。
 */
export const ttsAudio = pgTable(
  "tts_audio",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    /** 合成文本 */
    sourceText: text("source_text").notNull(),
    voice: text("voice").notNull(),
    rate: text("rate").notNull(),
    /** mp3 原始字节 */
    audio: bytea("audio").notNull(),
    /** 字节数（导出/校验用） */
    size: integer("size").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    unq: unique().on(t.sourceText, t.voice, t.rate),
  }),
);
