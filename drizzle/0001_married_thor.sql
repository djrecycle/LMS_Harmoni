CREATE TYPE "public"."teaching_doc_kind" AS ENUM('cp_tp_atp', 'modul_ajar', 'materi_guru', 'materi_siswa');--> statement-breakpoint
CREATE TYPE "public"."teaching_doc_status" AS ENUM('pending', 'done', 'error');--> statement-breakpoint
CREATE TABLE "modul_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perangkat_setting" (
	"teacher_id" text PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teaching_doc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" text NOT NULL,
	"kind" "teaching_doc_kind" NOT NULL,
	"title" text NOT NULL,
	"data" jsonb,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_id" uuid,
	"status" "teaching_doc_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modul_template" ADD CONSTRAINT "modul_template_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perangkat_setting" ADD CONSTRAINT "perangkat_setting_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teaching_doc" ADD CONSTRAINT "teaching_doc_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modul_template_teacher_idx" ON "modul_template" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "teaching_doc_teacher_idx" ON "teaching_doc" USING btree ("teacher_id","kind");