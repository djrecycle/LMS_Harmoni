ALTER TYPE "public"."answer_type" ADD VALUE 'multiple_select';--> statement-breakpoint
ALTER TYPE "public"."answer_type" ADD VALUE 'matching';--> statement-breakpoint
ALTER TYPE "public"."answer_type" ADD VALUE 'essay';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'multiple_select';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'matching';--> statement-breakpoint
ALTER TYPE "public"."question_type" ADD VALUE 'essay';--> statement-breakpoint
CREATE TABLE "exam" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" text NOT NULL,
	"title" text NOT NULL,
	"info" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"composition" jsonb NOT NULL,
	"job" text,
	"job_error" text,
	"job_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"section" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"tp" text DEFAULT '' NOT NULL,
	"materi" text DEFAULT '' NOT NULL,
	"indikator" text DEFAULT '' NOT NULL,
	"level" text DEFAULT '' NOT NULL,
	"question_id" uuid
);
--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "match_rows" jsonb;--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "quiz" ADD COLUMN "exam_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD COLUMN "points" real;--> statement-breakpoint
ALTER TABLE "exam" ADD CONSTRAINT "exam_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_item" ADD CONSTRAINT "exam_item_exam_id_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_item" ADD CONSTRAINT "exam_item_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_teacher_idx" ON "exam" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "exam_item_exam_idx" ON "exam_item" USING btree ("exam_id");--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_exam_id_exam_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exam"("id") ON DELETE set null ON UPDATE no action;