import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, CircleCheck, CircleX, Clock } from "lucide-react";
import { MediaPlayer } from "@/components/media-player";
import { SoundPlayer } from "@/components/sound-player";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/access";
import { requireStudent } from "@/lib/session";
import { QUESTION_TYPE_LABELS, formatAnswer, formatAnswerKey } from "@/lib/questions";
import { formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Quiz Result") };
}
const S = schema;

export default async function QuizResult({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const t = await getT();
  const student = await requireStudent();
  const { id, attemptId } = await params;
  if (!isUuid(id) || !isUuid(attemptId)) notFound();

  // Only this student's own attempts, and only finished ones (the key only opens after the quiz is submitted).
  const [p] = await db
    .select({ p: S.attempt, k: S.quiz })
    .from(S.attempt)
    .innerJoin(S.quiz, eq(S.quiz.id, S.attempt.quizId))
    .where(and(eq(S.attempt.id, attemptId), eq(S.attempt.quizId, id), eq(S.attempt.studentId, student.id), eq(S.attempt.status, "completed")))
    .limit(1);
  if (!p) notFound();

  const list = await db
    .select({ j: S.answer, s: S.question })
    .from(S.answer)
    .innerJoin(S.question, eq(S.question.id, S.answer.questionId))
    .leftJoin(S.quizQuestion, and(eq(S.quizQuestion.questionId, S.question.id), eq(S.quizQuestion.quizId, id)))
    .where(eq(S.answer.attemptId, p.p.id))
    .orderBy(asc(S.quizQuestion.position));

  const grade = Math.round(p.p.grade);
  const correct = list.filter((d) => d.j.correct === true).length;
  const semangat = grade >= 85 ? t("Outstanding! 🎉") : grade >= 70 ? t("Very good!") : grade >= 50 ? t("Not bad, keep practicing!") : t("Don't give up, try again!");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/student/quizzes/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {p.k.title}
      </Link>

      <div className="mb-6 rounded-2xl bg-gradient-to-br from-[oklch(0.52_0.22_277)] to-[oklch(0.42_0.2_300)] p-6 text-center text-white shadow-md sm:p-8">
        <p className="text-sm font-semibold opacity-80">{t("Your grade")}</p>
        <p className="text-6xl font-extrabold tracking-tight sm:text-7xl">{grade}</p>
        <p className="mt-1 font-semibold">{semangat}</p>
        <p className="mt-2 text-sm opacity-80">
          {correct} {t("of")} {list.length} {t("questions correct · score")} {p.p.score}/{p.p.maxScore} · {formatDateTime(p.p.completedAt)}
        </p>
        {p.p.pendingReview > 0 && (
          <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            <Clock className="size-3.5" /> {p.p.pendingReview} {t("questions are still waiting to be graded by the teacher. Your grade may change.")}
          </p>
        )}
      </div>

      <h2 className="mb-3 text-lg font-bold">{t("Explanation")}</h2>
      <ol className="grid gap-3">
        {list.map(({ j, s }, i) => {
          const pending = j.correct === null && !j.teacherGraded;
          return (
            <li key={j.id} className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">{i + 1}</span>
                <Badge>{t(QUESTION_TYPE_LABELS[s.type])}</Badge>
                {pending ? (
                  <Badge tone="warning">
                    <Clock className="size-3" /> {t("Waiting for teacher")}
                  </Badge>
                ) : j.correct ? (
                  <Badge tone="success">
                    <CircleCheck className="size-3" /> {t("Correct")}
                  </Badge>
                ) : (
                  <Badge tone="danger">
                    <CircleX className="size-3" /> {j.score && j.score > 0 ? t("Partly correct") : t("Not quite right")}
                  </Badge>
                )}
                <span className="ml-auto text-sm font-bold">
                  {j.score ?? 0}/{j.maxScore}
                </span>
              </div>
              <p className="font-semibold">{s.prompt}</p>
              {s.mediaKey && (
                <div className="mt-2 max-w-md">
                  <MediaPlayer kind={s.type === "audio" || s.type === "midi" ? "audio" : s.type === "video" ? "video" : "image"} mediaKey={s.mediaKey} />
                </div>
              )}
              {s.sound && <SoundPlayer sound={s.sound} reveal className="mt-2 max-w-md" />}
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">{t("Your answer")}</dt>
                  <dd className="font-semibold break-words">{formatAnswer(j.answer, s.options, t)}</dd>
                </div>
                <div className="rounded-lg bg-success-soft p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">{t("Correct answer")}</dt>
                  <dd className="font-semibold break-words">{s.answerKey ? formatAnswerKey(s.answerKey, s.options, t) : "-"}</dd>
                </div>
              </dl>
              {s.explanation && <p className="mt-2 text-sm text-muted-foreground">💡 {s.explanation}</p>}
              {j.teacherNote && <p className="mt-2 rounded-lg bg-primary-soft p-2.5 text-sm">{t("Teacher's note:")} {j.teacherNote}</p>}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/student/quizzes">{t("Back to quiz list")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/student/grades">{t("Grade history")}</Link>
        </Button>
      </div>
    </div>
  );
}
