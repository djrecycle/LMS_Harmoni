import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getOwnedQuiz } from "./access";
import { EXAM_SECTIONS, pointsPerQuestion, readComposition, type ExamSection } from "./exam";
import { getOwnedExam, listExamItems } from "./exam-store";

/**
 * "Try as a student": the teacher answers a quiz or an exam the way a student sees it. Nothing is saved; answers are
 * only checked on the server (the key never reaches the browser before an answer is given).
 */
export type PreviewSource = { kind: "quiz" | "exam"; id: string };

type Row = typeof schema.question.$inferSelect;

/** The questions in order with the points each is worth, or null when the quiz/exam is not this teacher's. */
export async function previewQuestions(teacherId: string, source: PreviewSource): Promise<{ title: string; instant: boolean; durationMinutes: number | null; rows: { question: Row; points: number }[] } | null> {
  if (source.kind === "quiz") {
    const quiz = await getOwnedQuiz(teacherId, source.id);
    if (!quiz) return null;
    const list = await db
      .select({ question: schema.question, points: schema.quizQuestion.points })
      .from(schema.quizQuestion)
      .innerJoin(schema.question, eq(schema.question.id, schema.quizQuestion.questionId))
      .where(eq(schema.quizQuestion.quizId, quiz.id))
      .orderBy(asc(schema.quizQuestion.position));
    return { title: quiz.title, instant: quiz.instantFeedback, durationMinutes: quiz.durationMinutes, rows: list.map((r) => ({ question: r.question, points: r.points ?? r.question.points })) };
  }
  const exam = await getOwnedExam(teacherId, source.id);
  if (!exam) return null;
  const items = (await listExamItems(exam.id)).filter((r) => r.question);
  // Same weighting as a published exam: each section's weight spread over its questions.
  const filled = Object.fromEntries(EXAM_SECTIONS.map((s) => [s, items.filter((r) => r.item.section === s).length])) as Record<ExamSection, number>;
  const points = pointsPerQuestion(readComposition(exam.composition), filled);
  return {
    title: exam.title,
    instant: false,
    durationMinutes: null,
    rows: items.map((r) => ({ question: r.question as Row, points: points[r.item.section] || r.question!.points })),
  };
}
