import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { round } from "./utils";

const { attempt, answer, quizQuestion, question } = schema;

/** Recalculate score, max score, grade (0-100), and the number of questions awaiting manual grading for one attempt. */
export async function recalculateAttempt(attemptId: string) {
  const [agg] = await db
    .select({
      score: sql<number>`coalesce(sum(${answer.score}), 0)`.mapWith(Number),
      maxScore: sql<number>`coalesce(sum(${answer.maxScore}), 0)`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${answer.correct} is null and ${answer.teacherGraded} = false)`.mapWith(Number),
    })
    .from(answer)
    .where(eq(answer.attemptId, attemptId));

  const grade = agg.maxScore > 0 ? round((agg.score / agg.maxScore) * 100, 1) : 0;
  await db
    .update(attempt)
    .set({ score: agg.score, maxScore: agg.maxScore, grade, pendingReview: agg.pending })
    .where(eq(attempt.id, attemptId));
  return { score: agg.score, maxScore: agg.maxScore, grade, pending: agg.pending };
}

/**
 * Close an attempt: unanswered questions are recorded as wrong (score 0),
 *  then the score is recalculated. Safe to call repeatedly.
 */
export async function finishAttempt(attemptId: string) {
  const [p] = await db.select().from(attempt).where(eq(attempt.id, attemptId)).limit(1);
  if (!p) return null;
  if (p.status === "completed") return p;

  const all = await db
    .select({ questionId: quizQuestion.questionId, points: question.points })
    .from(quizQuestion)
    .innerJoin(question, eq(question.id, quizQuestion.questionId))
    .where(eq(quizQuestion.quizId, p.quizId));
  const done = await db.select({ questionId: answer.questionId }).from(answer).where(eq(answer.attemptId, attemptId));
  const doneSet = new Set(done.map((s) => s.questionId));
  const empty = all.filter((s) => !doneSet.has(s.questionId));
  if (empty.length) {
    await db
      .insert(answer)
      .values(empty.map((s) => ({ attemptId, questionId: s.questionId, answer: null, correct: false, score: 0, maxScore: s.points })))
      .onConflictDoNothing();
  }
  await db.update(attempt).set({ status: "completed", completedAt: new Date() }).where(eq(attempt.id, attemptId));
  await recalculateAttempt(attemptId);
  const [fresh] = await db.select().from(attempt).where(and(eq(attempt.id, attemptId))).limit(1);
  return fresh;
}

/** Deadline for finishing; null if the quiz has no time limit. */
export function attemptDeadline(startedAt: Date, durationMinutes: number | null): Date | null {
  return durationMinutes ? new Date(startedAt.getTime() + durationMinutes * 60_000) : null;
}
