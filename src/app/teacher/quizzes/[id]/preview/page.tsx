import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, CircleCheck, Pencil } from "lucide-react";
import { MediaPlayer } from "@/components/media-player";
import { ChoiceLabel, SoundPlayer } from "@/components/sound-player";
import { MidiKeyPreview } from "@/components/midi-key-preview";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { getOwnedQuiz } from "@/lib/access";
import { QUESTION_TYPE_LABELS, formatAnswerKey } from "@/lib/questions";
import { requireTeacher } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Quiz Preview") };
}
const S = schema;

/** Read-only view of every question in a quiz, with its answer key, for the teacher. */
export default async function QuizPreview({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const quiz = await getOwnedQuiz(teacher.id, id);
  if (!quiz) notFound();

  const [[classroom], list] = await Promise.all([
    db.select({ name: S.classroom.name }).from(S.classroom).where(eq(S.classroom.id, quiz.classroomId)),
    db
      .select({ s: S.question })
      .from(S.quizQuestion)
      .innerJoin(S.question, eq(S.question.id, S.quizQuestion.questionId))
      .where(eq(S.quizQuestion.quizId, quiz.id))
      .orderBy(asc(S.quizQuestion.position)),
  ]);
  const totalPoints = list.reduce((sum, { s }) => sum + s.points, 0);

  return (
    <>
      <Link href={`/teacher/quizzes/${quiz.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {quiz.title}
      </Link>
      <PageHeader
        title={t("Preview: {0}", quiz.title)}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={quiz.published ? "success" : "warning"}>{quiz.published ? t("Published") : t("Draft")}</Badge>
            {classroom?.name} · {list.length} {t("questions")} · {totalPoints} {t("points")}
            {quiz.durationMinutes ? t(" · {0} minutes", quiz.durationMinutes) : ""}
            {quiz.startsAt ? t(" · opens {0}", formatDateTime(quiz.startsAt)) : ""}
            {quiz.endsAt ? t(" · closes {0}", formatDateTime(quiz.endsAt)) : ""}
          </span>
        }
        action={
          <Button asChild variant="outline">
            <Link href={`/teacher/quizzes/${quiz.id}/edit`}>
              <Pencil /> {t("Edit")}
            </Link>
          </Button>
        }
      />

      {quiz.description && <p className="mb-5 rounded-xl border bg-card p-4 text-sm whitespace-pre-line text-muted-foreground shadow-xs">{quiz.description}</p>}

      {list.length === 0 ? (
        <EmptyState title={t("This quiz has no questions yet.")}>{t("Add questions from the question bank on the edit page.")}</EmptyState>
      ) : (
        <ol className="grid gap-4">
          {list.map(({ s }, i) => {
            const key = s.answerKey;
            return (
              <li key={s.id} id={`q-${s.id}`} className="scroll-mt-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary">{i + 1}</span>
                  <Badge>{t(QUESTION_TYPE_LABELS[s.type])}</Badge>
                  {s.topic && <Badge className="max-w-full break-words">{s.topic}</Badge>}
                  <span className="ml-auto text-sm font-extrabold">
                    {s.points} {t("points")}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/teacher/question-bank/${s.id}?back=${encodeURIComponent(`/teacher/quizzes/${quiz.id}/preview#q-${s.id}`)}`}>
                      <Pencil /> {t("Edit question")}
                    </Link>
                  </Button>
                </div>
                <p className="font-semibold break-words whitespace-pre-line">{s.prompt}</p>
                {s.mediaKey && (
                  <div className="mt-3 max-w-md">
                    <MediaPlayer kind={s.type === "audio" || s.type === "midi" ? "audio" : s.type === "video" ? "video" : "image"} mediaKey={s.mediaKey} />
                  </div>
                )}
                {s.sound && <SoundPlayer sound={s.sound} reveal className="mt-3 max-w-md" />}

                {s.answerType === "multiple_choice" && s.options && s.options.length > 0 && (
                  <ul className="mt-3 grid gap-2 text-sm">
                    {s.options.map((opt, j) => {
                      const correct = key?.kind === "multiple_choice" && key.correct === j;
                      return (
                        <li key={j} className={correct ? "flex items-start gap-2 rounded-lg border border-success/40 bg-success-soft p-2.5 font-semibold" : "flex items-start gap-2 rounded-lg border p-2.5"}>
                          <span className="font-bold">{String.fromCharCode(65 + j)}.</span>
                          <span className="min-w-0 flex-1 break-words">
                            <ChoiceLabel text={opt} sound={s.sound} />
                          </span>
                          {correct && <CircleCheck className="size-4 shrink-0 text-success" />}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {s.answerType === "true_false" && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:max-w-xs">
                    {[true, false].map((v) => {
                      const correct = key?.kind === "true_false" && key.correct === v;
                      return (
                        <span key={String(v)} className={correct ? "flex items-center justify-center gap-1.5 rounded-lg border border-success/40 bg-success-soft p-2.5 font-semibold" : "rounded-lg border p-2.5 text-center"}>
                          {v ? t("True") : t("False")}
                          {correct && <CircleCheck className="size-4 text-success" />}
                        </span>
                      );
                    })}
                  </div>
                )}

                {(s.answerType === "fill_in" || s.answerType === "midi") && (
                  <div className="mt-3 rounded-lg bg-success-soft p-3 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground">{t("Answer key")}</p>
                    <p className="mt-0.5 font-semibold break-words">{key ? formatAnswerKey(key, s.options, t) : "-"}</p>
                    {key?.kind === "fill_in" && key.answer.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{t("Fill-in question without a key: graded manually by the teacher.")}</p>}
                  </div>
                )}

                {key?.kind === "midi" && <MidiKeyPreview notes={key.note} mode={key.mode} />}

                {s.explanation && (
                  <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground">{t("Explanation")}</p>
                    <p className="mt-0.5 break-words whitespace-pre-line">{s.explanation}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
