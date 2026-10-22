CREATE TYPE "public"."attendance_status" AS ENUM('hadir', 'sakit', 'izin', 'alpa');--> statement-breakpoint
CREATE TYPE "public"."day_of_week" AS ENUM('senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu');--> statement-breakpoint
CREATE TABLE "academic_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" text NOT NULL,
	"title" text NOT NULL,
	"tahun_ajaran" text,
	"data" jsonb,
	"source_file_name" text,
	"status" "teaching_doc_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_session_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"status" "attendance_status" DEFAULT 'hadir' NOT NULL,
	"keterangan" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" text NOT NULL,
	"classroom_id" uuid NOT NULL,
	"tanggal" date NOT NULL,
	"waktu" text,
	"materi" text,
	"kegiatan" text,
	"kendala" text,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" text NOT NULL,
	"classroom_id" uuid,
	"class_name" text,
	"hari" "day_of_week" NOT NULL,
	"jam_mulai" text NOT NULL,
	"jam_selesai" text NOT NULL,
	"mata_pelajaran" text NOT NULL,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "academic_calendar" ADD CONSTRAINT "academic_calendar_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_class_session_id_class_session_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_classroom_id_classroom_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classroom"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_schedule" ADD CONSTRAINT "teacher_schedule_teacher_id_user_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_schedule" ADD CONSTRAINT "teacher_schedule_classroom_id_classroom_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classroom"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academic_calendar_teacher_idx" ON "academic_calendar" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_record_unique" ON "attendance_record" USING btree ("class_session_id","student_id");--> statement-breakpoint
CREATE INDEX "class_session_classroom_date_idx" ON "class_session" USING btree ("classroom_id","tanggal");--> statement-breakpoint
CREATE INDEX "teacher_schedule_teacher_idx" ON "teacher_schedule" USING btree ("teacher_id","hari");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");