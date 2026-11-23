ALTER TABLE "quiz_question" ADD COLUMN "exam_item_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_exam_item_id_exam_item_id_fk" FOREIGN KEY ("exam_item_id") REFERENCES "public"."exam_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Practice questions copied from an exam before this column existed: link them to the blueprint row whose question has the same text.
UPDATE "quiz_question" qq SET "exam_item_id" = i."id"
FROM "quiz" q, "question" c, "exam_item" i, "question" o
WHERE q."id" = qq."quiz_id" AND q."practice" AND q."exam_id" IS NOT NULL AND qq."exam_item_id" IS NULL
  AND c."id" = qq."question_id" AND i."exam_id" = q."exam_id" AND o."id" = i."question_id"
  AND o."type" = c."type" AND o."prompt" = c."prompt";
