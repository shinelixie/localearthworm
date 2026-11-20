CREATE TABLE IF NOT EXISTS "learning_path_config" (
	"id" text PRIMARY KEY NOT NULL,
	"course_pack_id" text NOT NULL,
	"modes" jsonb,
	"difficulties" jsonb,
	"stars" jsonb,
	"daily_limits_by_mode" jsonb,
	"node_order" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "learning_path_config_course_pack_id_unique" UNIQUE("course_pack_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_course_mode_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_pack_id" text NOT NULL,
	"course_id" text NOT NULL,
	"mode" text NOT NULL,
	"difficulty" text NOT NULL,
	"best_rank" text,
	"avg_oral_score" real,
	"stars" integer DEFAULT 0 NOT NULL,
	"completion_count" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "user_course_mode_progress_user_id_course_id_mode_difficulty_unique" UNIQUE("user_id","course_id","mode","difficulty")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_daily_mode_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"mode" text NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "user_daily_mode_activity_user_id_day_mode_unique" UNIQUE("user_id","day","mode")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_card" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"course_pack_id" text NOT NULL,
	"course_id" text NOT NULL,
	"statement_id" text NOT NULL,
	"english" text NOT NULL,
	"chinese" text NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"due_at" timestamp DEFAULT now() NOT NULL,
	"last_review_at" timestamp,
	"graduated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "review_card_user_id_statement_id_unique" UNIQUE("user_id","statement_id")
);
--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "analysis" jsonb;