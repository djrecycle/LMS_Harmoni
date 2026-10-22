CREATE TYPE "public"."practice_analysis_source" AS ENUM('rule', 'ai');--> statement-breakpoint
ALTER TYPE "public"."practice_kind" ADD VALUE 'tempo';--> statement-breakpoint
ALTER TYPE "public"."practice_kind" ADD VALUE 'melody';--> statement-breakpoint
ALTER TYPE "public"."practice_kind" ADD VALUE 'solfege';--> statement-breakpoint
CREATE TABLE "practice_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"text" text NOT NULL,
	"source" "practice_analysis_source" NOT NULL,
	"attempts" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_result" ADD COLUMN "material_id" uuid;--> statement-breakpoint
ALTER TABLE "practice_analysis" ADD CONSTRAINT "practice_analysis_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_analysis" ADD CONSTRAINT "practice_analysis_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_analysis_unique" ON "practice_analysis" USING btree ("material_id","student_id");--> statement-breakpoint
ALTER TABLE "practice_result" ADD CONSTRAINT "practice_result_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_result_material_idx" ON "practice_result" USING btree ("material_id","student_id");