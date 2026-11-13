"use server";

import { z } from "zod";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { clearAnswer } from "@/lib/answer-check";
import { isUuid } from "@/lib/access";
import { formatAnswerKey, gradeAnswer } from "@/lib/questions";
import { previewQuestions } from "@/lib/student-preview";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";
import type { Feedback } from "./quiz";

const sourceSchema = z.object({ kind: z.enum(["quiz", "exam"]), id: z.string() });

/**
 * "Try as a student": check one answer of the teacher's own quiz or exam. Nothing is saved and no grade is made.
 * Always returns the full feedback; the page shows it right away only when the quiz gives instant feedback.
 */
export async function previewAnswer(source: unknown, questionId: string, answer: unknown): Promise<ActionResult<Feedback>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const src = sourceSchema.safeParse(source);
  if (!src.success || !isUuid(src.data.id) || !isUuid(questionId)) return fail(t("Invalid data."));
  const data = await previewQuestions(teacher.id, src.data);
  const row = data?.rows.find((r) => r.question.id === questionId);
  if (!row) return fail(t("This question is not part of this quiz."));
  const q = row.question;
  const clean = clearAnswer(q.answerType, answer, q.options?.length ?? 0, q.matchRows?.length ?? 0);
  if (!clean.ok) return fail(t("Invalid answer."));
  const result = q.answerKey ? gradeAnswer(q.answerKey, clean.grade, row.points) : { correct: null, score: null };
  return succeed(undefined, {
    correct: result.correct,
    score: result.score,
    maxScore: row.points,
    answerKey: q.answerKey ? formatAnswerKey(q.answerKey, q.options, t, q.matchRows) : null,
    explanation: q.explanation,
  });
}
