CREATE TABLE IF NOT EXISTS "fragment_translation" (
	"id" text PRIMARY KEY NOT NULL,
	"source_text" text NOT NULL,
	"translation" text NOT NULL,
	"source_lang" text DEFAULT 'en' NOT NULL,
	"target_lang" text DEFAULT 'zh-CN' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "fragment_translation_source_text_source_lang_target_lang_unique" UNIQUE("source_text","source_lang","target_lang")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tts_audio" (
	"id" text PRIMARY KEY NOT NULL,
	"source_text" text NOT NULL,
	"voice" text NOT NULL,
	"rate" text NOT NULL,
	"audio" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tts_audio_source_text_voice_rate_unique" UNIQUE("source_text","voice","rate")
);
--> statement-breakpoint
ALTER TABLE "user_course_progress" DROP CONSTRAINT "user_course_progress_user_id_course_pack_id_unique";--> statement-breakpoint
ALTER TABLE "user_course_progress" ADD CONSTRAINT "user_course_progress_user_id_course_pack_id_course_id_unique" UNIQUE("user_id","course_pack_id","course_id");