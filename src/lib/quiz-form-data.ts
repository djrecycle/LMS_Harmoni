import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { QuestionSummary } from "@/components/quiz-form";

const S = schema;

export async function quizFormData(teacherId: string): Promise<{ classroom: { id: string; name: string }[]; bank: QuestionSummary[] }> {
  const [classroom, rows, usage] = await Promise.all([
    db.select({ id: S.classroom.id, name: S.classroom.name }).from(S.classroom).where(eq(S.classroom.teacherId, teacherId)).orderBy(S.classroom.name),
    db
      .select({
        id: S.question.id,
        type: S.question.type,
        answerType: S.question.answerType,
        prompt: S.question.prompt,
        mediaKey: S.question.mediaKey,
        sound: S.question.sound,
        options: S.question.options,
        answerKey: S.question.answerKey,
        topic: S.question.topic,
        kelas: S.question.kelas,
        semester: S.question.semester,
        points: S.question.points,
        createdAt: S.question.createdAt,
      })
      .from(S.question)
      .where(eq(S.question.teacherId, teacherId))
      .orderBy(S.question.topic, S.question.createdAt),
    // How many quizzes use each question (same as the "used in N quizzes" badge in the question bank).
    db
      .select({ questionId: S.quizQuestion.questionId, n: count() })
      .from(S.quizQuestion)
      .innerJoin(S.question, eq(S.question.id, S.quizQuestion.questionId))
      .where(eq(S.question.teacherId, teacherId))
      .groupBy(S.quizQuestion.questionId),
  ]);
  const used = new Map(usage.map((u) => [u.questionId, u.n]));
  const bank = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), usedIn: used.get(r.id) ?? 0 }));
  return { classroom, bank };
}
