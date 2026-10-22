import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, CircleCheck, CircleX, Clock } from "lucide-react";
import { GradingForm } from "@/components/quiz-actions";
import { MediaPlayer } from "@/components/media-player";
import { SoundPlayer } from "@/components/sound-player";
import { Badge, PageHeader, StatCard } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { isUuid, getOwnedQuiz } from "@/lib/access";
import { QUESTION_TYPE_LABELS, formatAnswer, formatAnswerKey } from "@/lib/questions";
import { requireTeacher } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Student Answers") };
}
const S = schema;

export default async function StudentAnswer({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id, attemptId } = await params;
  const quiz = await getOwnedQuiz(teacher.id, id);
  if (!quiz || !isUuid(attemptId)) notFound();

  const [p] = await db
    .select({ p: S.attempt, student: S.user.name })
    .from(S.attempt)
    .innerJoin(S.user, eq(S.user.id, S.attempt.studentId))
    .where(and(eq(S.attempt.id, attemptId), eq(S.attempt.quizId, quiz.id)))
    .limit(1);
  if (!p) notFound();

  const [list, allAttempt] = await Promise.all([
    db
      .select({ j: S.answer, s: S.question, position: S.quizQuestion.position })
      .from(S.answer)
      .innerJoin(S.question, eq(S.question.id, S.answer.questionId))
      .leftJoin(S.quizQuestion, and(eq(S.quizQuestion.questionId, S.question.id), eq(S.quizQuestion.quizId, quiz.id)))
      .where(eq(S.answer.attemptId, p.p.id))
      .orderBy(asc(S.quizQuestion.position)),
    db.select().from(S.attempt).where(and(eq(S.attempt.quizId, quiz.id), eq(S.attempt.studentId, p.p.studentId))).orderBy(asc(S.attempt.startedAt)),
  ]);

  return (
    <>
      <Link href={`/teacher/quizzes/${quiz.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {quiz.title}
      </Link>
      <PageHeader title={t("{0}'s answers", p.student)} description={t("Taken {0}{1}", formatDateTime(p.p.startedAt), p.p.completedAt ? t(" · finished {0}", formatDateTime(p.p.completedAt)) : t(" · not finished"))} />

      {allAttempt.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("Attempt:")}</span>
          {allAttempt.map((x, i) => (
            <Link key={x.id} href={`/teacher/quizzes/${quiz.id}/attempts/${x.id}`} className={x.id === p.p.id ? "rounded-full bg-primary px-3 py-1 font-bold text-primary-foreground" : "rounded-full bg-muted px-3 py-1 font-semibold hover:bg-primary-soft"}>
              #{i + 1} · {Math.round(x.grade)}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Grade")} value={Math.round(p.p.grade * 10) / 10} />
        <StatCard label={t("Score")} value={`${p.p.score}/${p.p.maxScore}`} />
        <StatCard label={t("Awaiting review")} value={p.p.pendingReview} />
      </div>

      <ol className="grid gap-4">
        {list.map(({ j, s }, i) => {
          const pending = j.correct === null && !j.teacherGraded;
          return (
            <li key={j.id} className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">{i + 1}</span>
                <Badge>{t(QUESTION_TYPE_LABELS[s.type])}</Badge>
                {pending ? (
                  <Badge tone="warning">
                    <Clock className="size-3" /> {t("Needs grading")}
                  </Badge>
                ) : j.correct ? (
                  <Badge tone="success">
                    <CircleCheck className="size-3" /> {t("Correct")}
                  </Badge>
                ) : (
                  <Badge tone="danger">
                    <CircleX className="size-3" /> {j.score && j.score > 0 ? t("Partial") : t("Incorrect")}
                  </Badge>
                )}
                {j.teacherGraded && <Badge tone="primary">{t("Graded by teacher")}</Badge>}
                <span className="ml-auto text-sm font-extrabold">
                  {j.score ?? 0}/{j.maxScore}
                </span>
              </div>
              <p className="font-semibold">{s.prompt}</p>
              {s.mediaKey && (
                <div className="mt-3 max-w-md">
                  <MediaPlayer kind={s.type === "audio" || s.type === "midi" ? "audio" : s.type === "video" ? "video" : "image"} mediaKey={s.mediaKey} />
                </div>
              )}
              {s.sound && <SoundPlayer sound={s.sound} reveal className="mt-3 max-w-md" />}
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">{t("Student's answer")}</dt>
                  <dd className="mt-0.5 font-semibold break-words">{formatAnswer(j.answer, s.options, t)}</dd>
                </div>
                <div className="rounded-lg bg-success-soft p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">{t("Answer key")}</dt>
                  <dd className="mt-0.5 font-semibold break-words">{s.answerKey ? formatAnswerKey(s.answerKey, s.options, t) : "-"}</dd>
                </div>
              </dl>
              {s.answerType === "fill_in" && s.answerKey?.kind === "fill_in" && s.answerKey.answer.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">{t("Fill-in question without a key: graded manually by the teacher.")}</p>
              )}
              {j.teacherNote && !pending && <p className="mt-2 text-sm text-muted-foreground">{t("Note:")} {j.teacherNote}</p>}
              <div className="mt-3">
                <GradingForm answerId={j.id} initialScore={j.score} maxScore={j.maxScore} initialNote={j.teacherNote} pending={pending} />
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
