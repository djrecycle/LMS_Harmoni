CREATE TABLE "classroom_piano_song" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "piano_song" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" text NOT NULL,
	"title" text NOT NULL,
	"origin" text DEFAULT '' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"bpm" integer DEFAULT 90 NOT NULL,
	"format" text DEFAULT 'angka' NOT NULL,
	"do_note" text DEFAULT 'C4' NOT NULL,
	"notation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classroom_piano_song" ADD CONSTRAINT "classroom_piano_song_song_id_piano_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."piano_song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_piano_song" ADD CONSTRAINT "classroom_piano_song_classroom_id_classroom_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classroom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piano_song" ADD CONSTRAINT "piano_song_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_piano_song_unique" ON "classroom_piano_song" USING btree ("song_id","classroom_id");--> statement-breakpoint
CREATE INDEX "classroom_piano_song_classroom_idx" ON "classroom_piano_song" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "piano_song_teacher_idx" ON "piano_song" USING btree ("teacher_id");