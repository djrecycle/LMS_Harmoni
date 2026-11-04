CREATE TYPE "public"."teacher_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "teacher_status" "teacher_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "storage_quota_mb" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "user_single_admin_idx" ON "user" USING btree ("is_admin") WHERE "user"."is_admin" = true;