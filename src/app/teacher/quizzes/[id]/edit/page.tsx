import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { QuizForm } from "@/components/quiz-form";
import { PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { getOwnedQuiz } from "@/lib/access";
import { quizFormData } from "@/lib/quiz-form-data";
import { requireTeacher } from "@/lib/session";
import { toWibInput } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit Quiz") };
}
const S = schema;

export default async function EditQuiz({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const quiz = await getOwnedQuiz(teacher.id, id);
  if (!quiz) notFound();
  const [data, question, taken] = await Promise.all([
    quizFormData(teacher.id),
    db.select({ questionId: S.quizQuestion.questionId }).from(S.quizQuestion).where(eq(S.quizQuestion.quizId, quiz.id)).orderBy(asc(S.quizQuestion.position)),
    // The teacher's own tries in Student view do not lock the quiz.
    db
      .select({ id: S.attempt.id })
      .from(S.attempt)
      .innerJoin(S.user, eq(S.user.id, S.attempt.studentId))
      .where(and(eq(S.attempt.quizId, quiz.id), isNull(S.user.demoOwnerId)))
      .limit(1),
  ]);
  return (
    <>
      <PageHeader title={t("Edit quiz")} description={quiz.title} />
      <QuizForm
        {...data}
        alreadyTaken={taken.length > 0}
        quiz={{
          id: quiz.id,
          classroomId: quiz.classroomId,
          title: quiz.title,
          description: quiz.description,
          startsAt: toWibInput(quiz.startsAt),
          endsAt: toWibInput(quiz.endsAt),
          durationMinutes: quiz.durationMinutes,
          maxAttempts: quiz.maxAttempts,
          instantFeedback: quiz.instantFeedback,
          published: quiz.published,
          questionIds: question.map((s) => s.questionId),
        }}
      />
    </>
  );
}
