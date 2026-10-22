import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, Clock, ListChecks, RotateCw } from "lucide-react";
import { QuizRunner } from "@/components/quiz-runner";
import { StartQuizButton } from "@/components/start-quiz";
import { Alert, Badge } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { isUuid, isStudentInClassroom } from "@/lib/access";
import { attemptDeadline, finishAttempt } from "@/lib/grading";
import { requireStudent } from "@/lib/session";
import { toStudentQuestion, formatAnswerKey } from "@/lib/questions";
import { formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Quizzes") };
}
const S = schema;

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const student = await requireStudent();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [quiz] = await db.select().from(S.quiz).where(and(eq(S.quiz.id, id), eq(S.quiz.published, true))).limit(1);
  if (!quiz || !(await isStudentInClassroom(student.id, quiz.classroomId))) notFound();

  const attempt = await db.select().from(S.attempt).where(and(eq(S.attempt.quizId, quiz.id), eq(S.attempt.studentId, student.id))).orderBy(asc(S.attempt.startedAt));
  const inProgress = attempt.find((p) => p.status === "in_progress");
  const completed = attempt.filter((p) => p.status === "completed");

  /* --- --- In progress --- --- */
  if (inProgress) {
    const limit = attemptDeadline(inProgress.startedAt, quiz.durationMinutes);
    if (limit && Date.now() > limit.getTime()) {
      await finishAttempt(inProgress.id);
      redirect(`/student/quizzes/${quiz.id}/result/${inProgress.id}`);
    }
    const [questionRows, answerRows] = await Promise.all([
      db
        .select({ s: S.question })
        .from(S.quizQuestion)
        .innerJoin(S.question, eq(S.question.id, S.quizQuestion.questionId))
        .where(eq(S.quizQuestion.quizId, quiz.id))
        .orderBy(asc(S.quizQuestion.position)),
      db.select().from(S.answer).where(eq(S.answer.attemptId, inProgress.id)),
    ]);
    const question = questionRows.map(({ s }) => toStudentQuestion(s)); // the key is not sent along
    const initialState: Record<string, { answer: never; feedback: null | { correct: boolean | null; score: number | null; maxScore: number; answerKey: string | null; explanation: string | null }; saved: boolean }> = {};
    for (const j of answerRows) {
      const s = questionRows.find((x) => x.s.id === j.questionId)?.s;
      if (!s) continue;
      initialState[j.questionId] = {
        answer: j.answer as never,
        saved: true,
        // Feedback only for questions that were actually answered (and if the teacher enabled it)
        feedback: quiz.instantFeedback
          ? { correct: j.correct, score: j.score, maxScore: j.maxScore, answerKey: s.answerKey && j.correct === false ? formatAnswerKey(s.answerKey, s.options, t) : null, explanation: s.explanation }
          : null,
      };
    }
    return (
      <QuizRunner
        quizId={quiz.id}
        attemptId={inProgress.id}
        title={quiz.title}
        instant={quiz.instantFeedback}
        question={question}
        initialState={initialState}
        remainingSeconds={limit ? Math.max(1, Math.round((limit.getTime() - Date.now()) / 1000)) : null}
      />
    );
  }

  /* --- --- Intro page --- --- */
  const count = (await db.select({ id: S.quizQuestion.id }).from(S.quizQuestion).where(eq(S.quizQuestion.quizId, quiz.id))).length;
  const now = new Date();
  const pendingOpen = quiz.startsAt && quiz.startsAt > now;
  const close = quiz.endsAt && quiz.endsAt < now;
  const remainingChance = quiz.maxAttempts - completed.length;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/student/quizzes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("All quizzes")}
      </Link>
      <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{quiz.title}</h1>
        {quiz.description && <p className="mt-2 text-muted-foreground">{quiz.description}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="primary">
            <ListChecks className="size-3" /> {count} {t("questions")}
          </Badge>
          {quiz.durationMinutes && (
            <Badge tone="warning">
              <Clock className="size-3" /> {quiz.durationMinutes} {t("minutes")}
            </Badge>
          )}
          <Badge>
            <RotateCw className="size-3" /> {quiz.maxAttempts} {t("attempts")}
          </Badge>
          {quiz.endsAt && <Badge>{t("Closes")} {formatDateTime(quiz.endsAt)}</Badge>}
        </div>
        <ul className="mt-5 grid gap-1.5 text-sm text-muted-foreground">
          <li>{t("• Questions can be text, image, audio, video, or piano. Have headphones ready if you can.")}</li>
          <li>• {quiz.instantFeedback ? t("You will know right away whether each answer is correct.") : t("Your grade and explanations appear after you submit the quiz.")}</li>
          {quiz.durationMinutes && <li>{t("• The timer starts as soon as you press start, and your answers are submitted automatically when time runs out.")}</li>}
          {quiz.maxAttempts > 1 && <li>{t("• Your best attempt is the one that counts.")}</li>}
        </ul>

        <div className="mt-6">
          {pendingOpen ? (
            <Alert kind="info">{t("This quiz opens on")} {formatDateTime(quiz.startsAt)}.</Alert>
          ) : close && remainingChance > 0 ? (
            <Alert kind="error">{t("This quiz is closed.")}</Alert>
          ) : remainingChance <= 0 ? (
            <Alert kind="info">{t("You have used all your attempts. See your results below.")}</Alert>
          ) : (
            <StartQuizButton quizId={quiz.id} label={completed.length ? t("Try again") : t("Start quiz")} />
          )}
        </div>
      </div>

      {completed.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-bold">{t("Attempt history")}</h2>
          <div className="grid gap-2">
            {completed.map((p, i) => (
              <Link key={p.id} href={`/student/quizzes/${quiz.id}/result/${p.id}`} className="flex items-center justify-between rounded-xl border bg-card p-3.5 shadow-xs hover:border-primary">
                <div>
                  <p className="font-semibold">{t("Attempts")} {i + 1}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(p.completedAt)}
                    {p.pendingReview > 0 ? t(" · {0} questions waiting for the teacher to grade", p.pendingReview) : ""}
                  </p>
                </div>
                <span className="text-2xl font-extrabold text-primary">{Math.round(p.grade)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
