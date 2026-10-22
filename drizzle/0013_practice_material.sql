CREATE TABLE "classroom_practice_material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_material_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"type_media" "type_media" DEFAULT 'text' NOT NULL,
	"media_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classroom_practice_material" ADD CONSTRAINT "classroom_practice_material_practice_material_id_practice_material_id_fk" FOREIGN KEY ("practice_material_id") REFERENCES "public"."practice_material"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_practice_material" ADD CONSTRAINT "classroom_practice_material_classroom_id_classroom_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classroom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_material" ADD CONSTRAINT "practice_material_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_practice_material_unique" ON "classroom_practice_material" USING btree ("practice_material_id","classroom_id");--> statement-breakpoint
CREATE INDEX "classroom_practice_material_classroom_idx" ON "classroom_practice_material" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "practice_material_teacher_idx" ON "practice_material" USING btree ("teacher_id");