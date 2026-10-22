"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { isUuid, getOwnedClassroom, getOwnedQuiz, isStudentInClassroom } from "@/lib/access";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { noteToMidi } from "@/lib/music";
import { attemptDeadline, recalculateAttempt, finishAttempt } from "@/lib/grading";
import { requireTeacher, requireStudent } from "@/lib/session";
import { gradeAnswer, formatAnswerKey, type AnswerType } from "@/lib/questions";
import { fromWibInput } from "@/lib/utils";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/", "layout");

/* ------------------------------------------------------------------ */
/* Teacher                                                             */
/* ------------------------------------------------------------------ */

const quizSchema = z
  .object({
    classroomId: z.uuid("Choose a class"),
    /** Other classes that each get their own copy of this quiz (separate grades and attempts). */
    extraClassroomIds: z.array(z.uuid()).max(50).default([]),
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(150),
    description: z.string().trim().max(500).nullable().optional(),
    startsAt: z.string().nullable().optional(),
    endsAt: z.string().nullable().optional(),
    durationMinutes: z.number().int().min(1).max(240).nullable().optional(),
    maxAttempts: z.number().int().min(1).max(10),
    instantFeedback: z.boolean(),
    published: z.boolean(),
    questionIds: z.array(z.uuid()).max(100),
  })
  .superRefine(async (v, ctx) => {
  const t = await getT();
    if (v.published && v.questionIds.length === 0) ctx.addIssue({ code: "custom", path: ["questionIds"], message: t("Choose at least one question before publishing the quiz") });
    const a = fromWibInput(v.startsAt);
    const b = fromWibInput(v.endsAt);
    if (a && b && b <= a) ctx.addIssue({ code: "custom", path: ["endsAt"], message: t("The end time must be after the start time") });
  });

export async function saveQuiz(data: unknown, id?: string): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = await quizSchema.safeParseAsync(data);
  if (!p.success) return zodError(p.error);
  const v = p.data;

  const classroom = await getOwnedClassroom(teacher.id, v.classroomId);
  if (!classroom) return fail(t("Invalid class."));

  const extraIds = [...new Set(v.extraClassroomIds)].filter((x) => x !== classroom.id);
  if (extraIds.length) {
    const owned = await db.select({ id: S.classroom.id }).from(S.classroom).where(and(eq(S.classroom.teacherId, teacher.id), inArray(S.classroom.id, extraIds)));
    if (owned.length !== extraIds.length) return fail(t("Invalid class."));
  }

  const uniqueQuestion = [...new Set(v.questionIds)];
  if (uniqueQuestion.length) {
    const owned = await db.select({ id: S.question.id }).from(S.question).where(and(eq(S.question.teacherId, teacher.id), inArray(S.question.id, uniqueQuestion)));
    if (owned.length !== uniqueQuestion.length) return fail(t("Some questions are invalid."));
  }

  const grade = {
    classroomId: classroom.id,
    title: v.title,
    description: v.description || null,
    startsAt: fromWibInput(v.startsAt),
    endsAt: fromWibInput(v.endsAt),
    durationMinutes: v.durationMinutes ?? null,
    maxAttempts: v.maxAttempts,
    instantFeedback: v.instantFeedback,
    published: v.published,
  };

  let quizId = id;
  if (id) {
    const current = await getOwnedQuiz(teacher.id, id);
    if (!current) return fail(t("Quiz not found."));
    await db.update(S.quiz).set(grade).where(eq(S.quiz.id, current.id));
  } else {
    const [fresh] = await db.insert(S.quiz).values({ teacherId: teacher.id, ...grade }).returning({ id: S.quiz.id });
    quizId = fresh.id;
  }

  await db.delete(S.quizQuestion).where(eq(S.quizQuestion.quizId, quizId!));
  if (uniqueQuestion.length) await db.insert(S.quizQuestion).values(uniqueQuestion.map((questionId, position) => ({ quizId: quizId!, questionId, position })));

  // Send a copy to each extra class.
  for (const classroomId of extraIds) {
    const [copy] = await db.insert(S.quiz).values({ teacherId: teacher.id, ...grade, classroomId }).returning({ id: S.quiz.id });
    if (uniqueQuestion.length) await db.insert(S.quizQuestion).values(uniqueQuestion.map((questionId, position) => ({ quizId: copy.id, questionId, position })));
  }

  refresh();
  const n = extraIds.length + 1;
  const message =
    n > 1
      ? v.published
        ? t("Quiz published to {0} classes.", n)
        : t("Quiz saved as a draft in {0} classes.", n)
      : v.published
        ? t("Quiz published.")
        : t("Quiz saved as a draft.");
  return succeed(message, { id: quizId! });
}

export async function deleteQuiz(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const k = await getOwnedQuiz(teacher.id, id);
  if (!k) return fail(t("Quiz not found."));
  await db.delete(S.quiz).where(eq(S.quiz.id, k.id));
  refresh();
  return succeed(t("The quiz and all its results were deleted."));
}

export async function editStatusQuiz(id: string, published: boolean): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const k = await getOwnedQuiz(teacher.id, id);
  if (!k) return fail(t("Quiz not found."));
  if (published) {
    const [exists] = await db.select({ id: S.quizQuestion.id }).from(S.quizQuestion).where(eq(S.quizQuestion.quizId, k.id)).limit(1);
    if (!exists) return fail(t("Add questions before publishing the quiz."));
  }
  await db.update(S.quiz).set({ published }).where(eq(S.quiz.id, k.id));
  refresh();
  return succeed(published ? t("Quiz published.") : t("Quiz moved back to draft."));
}

/** Restart a quiz for one student: deletes all their attempts (and answers) so they can take it again from scratch. */
export async function resetStudentAttempts(quizId: string, studentId: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  if (typeof studentId !== "string" || !studentId) return fail(t("Invalid data."));
  const k = await getOwnedQuiz(teacher.id, quizId);
  if (!k) return fail(t("Quiz not found."));
  const removed = await db
    .delete(S.attempt)
    .where(and(eq(S.attempt.quizId, k.id), eq(S.attempt.studentId, studentId)))
    .returning({ id: S.attempt.id });
  if (removed.length === 0) return fail(t("This student has no attempts to reset."));
  refresh();
  return succeed(t("Quiz restarted. The student can take it again."));
}

/** Manual grading: the teacher scores answers that cannot be graded automatically (or overrides an automatic grade). */
export async function overrideAnswerGrade(data: { answerId: string; score: number; note?: string }): Promise<ActionResult<{ grade: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = z.object({ answerId: z.uuid(), score: z.number().min(0).max(1000), note: z.string().max(1000).optional() }).safeParse(data);
  if (!p.success) return zodError(p.error);

  const [row] = await db
    .select({ j: S.answer, quizTeacherId: S.quiz.teacherId })
    .from(S.answer)
    .innerJoin(S.attempt, eq(S.attempt.id, S.answer.attemptId))
    .innerJoin(S.quiz, eq(S.quiz.id, S.attempt.quizId))
    .where(eq(S.answer.id, p.data.answerId))
    .limit(1);
  if (!row || row.quizTeacherId !== teacher.id) return fail(t("Answer not found."));
  if (p.data.score > row.j.maxScore) return fail(t("The maximum score for this question is {0}.", row.j.maxScore));

  await db
    .update(S.answer)
    .set({ score: p.data.score, correct: p.data.score >= row.j.maxScore, teacherGraded: true, teacherNote: p.data.note?.trim() || null })
    .where(eq(S.answer.id, row.j.id));
  const result = await recalculateAttempt(row.j.attemptId);
  refresh();
  return succeed(t("Grade saved."), { grade: result.grade });
}

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

const GRACE_SECONDS = 15; // tolerance for network delay when submitting

export async function startQuiz(quizId: string): Promise<ActionResult<{ attemptId: string }>> {
  const t = await getT();
  const student = await requireStudent();
  if (!isUuid(quizId)) return fail(t("Quiz not found."));
  const [k] = await db.select().from(S.quiz).where(and(eq(S.quiz.id, quizId), eq(S.quiz.published, true))).limit(1);
  if (!k || !(await isStudentInClassroom(student.id, k.classroomId))) return fail(t("Quiz not found."));

  const now = new Date();
  if (k.startsAt && k.startsAt > now) return fail(t("This quiz is not open yet."));
  if (k.endsAt && k.endsAt < now) return fail(t("This quiz is closed."));

  const attemptExists = await db.select().from(S.attempt).where(and(eq(S.attempt.quizId, k.id), eq(S.attempt.studentId, student.id)));
  const inProgress = attemptExists.find((p) => p.status === "in_progress");
  if (inProgress) return succeed(undefined, { attemptId: inProgress.id });
  if (attemptExists.filter((p) => p.status === "completed").length >= k.maxAttempts) return fail(t("You have used all your attempts for this quiz."));

  const [questionExists] = await db.select({ id: S.quizQuestion.id }).from(S.quizQuestion).where(eq(S.quizQuestion.quizId, k.id)).limit(1);
  if (!questionExists) return fail(t("This quiz has no questions yet."));

  const [fresh] = await db.insert(S.attempt).values({ quizId: k.id, studentId: student.id }).returning({ id: S.attempt.id });
  refresh();
  return succeed(undefined, { attemptId: fresh.id });
}

export type Feedback = {
  correct: boolean | null;
  score: number | null;
  maxScore: number;
  answerKey: string | null;
  explanation: string | null;
};

function clearAnswer(answerShape: AnswerType, answer: unknown, optionCount: number): { ok: true; grade: unknown } | { ok: false } {
  switch (answerShape) {
    case "multiple_choice":
      return typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer < optionCount ? { ok: true, grade: answer } : { ok: false };
    case "true_false":
      return typeof answer === "boolean" ? { ok: true, grade: answer } : { ok: false };
    case "fill_in":
      return typeof answer === "string" ? { ok: true, grade: answer.trim().slice(0, 500) } : { ok: false };
    case "midi":
      return Array.isArray(answer) && answer.length <= 64 && answer.every((n) => typeof n === "string" && noteToMidi(n) !== null)
        ? { ok: true, grade: answer }
        : { ok: false };
  }
}

/** Save + grade one answer. Grading always happens on the server; the key is never sent before the question is answered. */
export async function saveAnswer(attemptId: string, questionId: string, answer: unknown): Promise<ActionResult<Feedback>> {
  const t = await getT();
  const student = await requireStudent();
  if (!isUuid(attemptId) || !isUuid(questionId)) return fail(t("Invalid data."));

  const [p] = await db
    .select({ p: S.attempt, k: S.quiz })
    .from(S.attempt)
    .innerJoin(S.quiz, eq(S.quiz.id, S.attempt.quizId))
    .where(and(eq(S.attempt.id, attemptId), eq(S.attempt.studentId, student.id)))
    .limit(1);
  if (!p) return fail(t("Attempt not found."));
  if (p.p.status !== "in_progress") return fail(t("This quiz is already finished."));

  const limit = attemptDeadline(p.p.startedAt, p.k.durationMinutes);
  if (limit && Date.now() > limit.getTime() + GRACE_SECONDS * 1000) {
    await finishAttempt(p.p.id);
    refresh();
    return fail(t("Time is up."));
  }

  const [row] = await db
    .select({ question: S.question })
    .from(S.quizQuestion)
    .innerJoin(S.question, eq(S.question.id, S.quizQuestion.questionId))
    .where(and(eq(S.quizQuestion.quizId, p.k.id), eq(S.quizQuestion.questionId, questionId)))
    .limit(1);
  if (!row) return fail(t("This question is not part of this quiz."));
  const question = row.question;

  const clean = clearAnswer(question.answerType, answer, question.options?.length ?? 0);
  if (!clean.ok) return fail(t("Invalid answer."));

  const [current] = await db.select().from(S.answer).where(and(eq(S.answer.attemptId, p.p.id), eq(S.answer.questionId, question.id))).limit(1);
  // With instant feedback, an answer locks once it is checked (so the key cannot be found by trial and error).
  if (current && p.k.instantFeedback) return fail(t("This question was already answered."));

  const result = question.answerKey ? gradeAnswer(question.answerKey, clean.grade, question.points) : { correct: null, score: null };
  await db
    .insert(S.answer)
    .values({ attemptId: p.p.id, questionId: question.id, answer: clean.grade as never, correct: result.correct, score: result.score, maxScore: question.points })
    .onConflictDoUpdate({
      target: [S.answer.attemptId, S.answer.questionId],
      set: { answer: clean.grade as never, correct: result.correct, score: result.score, maxScore: question.points, answeredAt: new Date() },
    });

  if (!p.k.instantFeedback) return succeed(t("Answer saved."), { correct: null, score: null, maxScore: question.points, answerKey: null, explanation: null });
  return succeed(undefined, {
    correct: result.correct,
    score: result.score,
    maxScore: question.points,
    answerKey: question.answerKey && result.correct === false ? formatAnswerKey(question.answerKey, question.options, t) : null,
    explanation: question.explanation,
  });
}

export async function finishQuiz(attemptId: string): Promise<ActionResult<{ quizId: string }>> {
  const t = await getT();
  const student = await requireStudent();
  if (!isUuid(attemptId)) return fail(t("Invalid data."));
  const [p] = await db.select().from(S.attempt).where(and(eq(S.attempt.id, attemptId), eq(S.attempt.studentId, student.id))).limit(1);
  if (!p) return fail(t("Attempt not found."));
  await finishAttempt(p.id);
  refresh();
  return succeed(t("Quiz finished."), { quizId: p.quizId });
}
