"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CircleCheck, CircleX, Clock, Eye, Flag, LoaderCircle, Lightbulb, MinusCircle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { finishQuiz, saveAnswer, type Feedback } from "@/app/actions/quiz";
import { previewAnswer } from "@/app/actions/student-preview";
import { QuestionWidget } from "@/components/question-widget";
import { Button } from "@/components/ui/button";
import { Alert, Progress } from "@/components/ui/misc";
import type { StudentAnswer, StudentQuestion } from "@/lib/questions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type AnswerState = { answer: StudentAnswer; feedback: Feedback | null; saved: boolean };

export function QuizRunner({
  quizId,
  attemptId,
  title,
  instant,
  question,
  initialState,
  remainingSeconds,
  preview,
}: {
  quizId: string;
  attemptId: string;
  title: string;
  instant: boolean;
  question: StudentQuestion[];
  initialState: Record<string, AnswerState>;
  remainingSeconds: number | null;
  /** "Try as a student" (teacher): answers are only checked, never saved, and the end shows a summary instead of a grade. */
  preview?: { kind: "quiz" | "exam"; id: string; backHref: string };
}) {
  const t = useT();
  const router = useRouter();
  const [i, setI] = useState(() => {
    const pending = question.findIndex((s) => !initialState[s.id]?.saved);
    return pending === -1 ? 0 : pending;
  });
  const [state, setState] = useState<Record<string, AnswerState>>(initialState);
  const [remaining, setRemaining] = useState<number | null>(remainingSeconds);
  const [busy, start] = useTransition();
  const [menutup, setMenutup] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const berakhir = useRef(false);
  const [summary, setSummary] = useState(false);

  const s = question[i];
  const k = state[s.id] ?? { answer: null, feedback: null, saved: false };
  const locked = instant && k.saved;
  const existsAnswer = (j: StudentAnswer) => j !== null && j !== "" && !(Array.isArray(j) && j.length === 0);

  const close = useCallback(async () => {
    if (berakhir.current) return;
    berakhir.current = true;
    if (preview) return setSummary(true);
    setMenutup(true);
    const r = await finishQuiz(attemptId);
    if (!r.ok) {
      berakhir.current = false;
      setMenutup(false);
      return void toast.error(r.error);
    }
    router.replace(`/student/quizzes/${quizId}/result/${attemptId}`);
  }, [attemptId, quizId, router, preview]);

  // Countdown (when the quiz has a duration)
  useEffect(() => {
    if (remainingSeconds === null) return;
    const end = Date.now() + remainingSeconds * 1000;
    const timer = setInterval(() => {
      const d = Math.max(0, Math.round((end - Date.now()) / 1000));
      setRemaining(d);
      if (d <= 0) {
        clearInterval(timer);
        toast.info(t("Time is up. Your answers were submitted."));
        void close();
      }
    }, 500);
    return () => clearInterval(timer);
  }, [remainingSeconds, close]);

  const edit = (v: StudentAnswer) => setState((p) => ({ ...p, [s.id]: { ...(p[s.id] ?? { feedback: null }), answer: v, saved: p[s.id]?.saved ?? false } }));

  /** Send the answer for question `questionId` to the server. Returns true on success. */
  async function send(questionId: string, answer: StudentAnswer): Promise<boolean> {
    const r = preview ? await previewAnswer({ kind: preview.kind, id: preview.id }, questionId, answer) : await saveAnswer(attemptId, questionId, answer);
    if (!r.ok) {
      if (/time/i.test(r.error ?? "")) void close();
      toast.error(r.error ?? t("Could not save the answer."));
      return false;
    }
    // In a preview the feedback is kept for the summary, but still only shown right away with instant feedback.
    setState((p) => ({ ...p, [questionId]: { answer, feedback: r.data && (instant || preview) ? r.data : null, saved: true } }));
    return true;
  }

  const check = () => start(async () => void (await send(s.id, k.answer)));

  // Without instant feedback: save automatically when moving between questions.
  const move = (to: number) =>
    start(async () => {
      if (!instant && existsAnswer(k.answer)) await send(s.id, k.answer);
      setI(to);
      setEndConfirm(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  const submit = () =>
    start(async () => {
      if (!instant && existsAnswer(k.answer)) {
        if (!(await send(s.id, k.answer))) return;
      }
      await close();
    });

  const answered = question.filter((x) => state[x.id]?.saved || (x.id === s.id && existsAnswer(k.answer))).length;
  const last = i === question.length - 1;
  const minutes = remaining !== null ? String(Math.floor(remaining / 60)).padStart(2, "0") : "";
  const seconds = remaining !== null ? String(remaining % 60).padStart(2, "0") : "";

  if (preview && summary) {
    return (
      <PreviewSummary
        question={question}
        state={state}
        backHref={preview.backHref}
        onAgain={() => {
          setState({});
          setI(0);
          setEndConfirm(false);
          setSummary(false);
          berakhir.current = false;
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    );
  }

  if (menutup) {
    return (
      <div className="grid min-h-64 place-items-center text-center">
        <div className="grid justify-items-center gap-3">
          <LoaderCircle className="size-8 animate-spin text-primary" />
          <p className="font-semibold">{t("Calculating your grade…")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {preview && (
        <Alert kind="info" className="mb-4" title={t("Trying as a student")}>
          {t("This is exactly what students see. Your answers are only checked, not saved, and do not count as a grade.")}{" "}
          <Link href={preview.backHref} className="font-semibold underline">
            {t("Back")}
          </Link>
        </Alert>
      )}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-muted-foreground">{title}</p>
          <p className="text-sm font-bold">
            {t("Question")} {i + 1} {t("of")} {question.length}
          </p>
        </div>
        {remaining !== null && (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-sm font-bold", remaining <= 60 ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary")} role="timer" aria-label={t("Time remaining")}>
            <Clock className="size-4" /> {minutes}:{seconds}
          </span>
        )}
      </div>
      <Progress value={((i + (locked ? 1 : 0)) / question.length) * 100} className="mb-5" label={t("Quiz progress")} />

      <div className="mb-3 flex flex-wrap gap-1.5" aria-label={t("Question navigation")}>
        {question.map((x, n) => (
          <button
            key={x.id}
            type="button"
            onClick={() => move(n)}
            aria-label={t("Question {0}", n + 1)}
            aria-current={n === i ? "step" : undefined}
            className={cn(
              "grid size-9 place-items-center rounded-lg text-sm font-bold transition-colors",
              n === i ? "bg-primary text-primary-foreground" : state[x.id]?.saved ? "bg-success-soft text-success" : "bg-muted text-muted-foreground hover:bg-primary-soft",
            )}
          >
            {n + 1}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <QuestionWidget key={s.id} question={s} value={k.answer} onEdit={edit} locked={locked} feedback={k.feedback} />

        {instant && k.feedback && (
          <div className="mt-5" aria-live="polite">
            {k.feedback.correct === true && (
              <Alert kind="success" title={t("Correct! 🎉")}>
                {k.feedback.explanation}
              </Alert>
            )}
            {k.feedback.correct === false && (
              <Alert kind="error" title={t("Not quite right")}>
                {k.feedback.answerKey && (
                  <p>
                    {t("The correct answer:")} <b className="text-foreground">{k.feedback.answerKey}</b>
                  </p>
                )}
                {k.feedback.explanation && (
                  <p className="mt-1 flex gap-1.5">
                    <Lightbulb className="mt-0.5 size-4 shrink-0" /> {k.feedback.explanation}
                  </p>
                )}
              </Alert>
            )}
            {k.feedback.correct === null && (
              <Alert kind="info" title={t("Your answer was saved")}>
                {t("This question will be graded by your teacher.")}
              </Alert>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" disabled={i === 0 || busy} onClick={() => move(i - 1)}>
          <ArrowLeft /> {t("Previous")}
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {instant && !k.saved && (
            <Button size="lg" disabled={busy || !existsAnswer(k.answer)} onClick={check}>
              {busy ? <LoaderCircle className="animate-spin" /> : k.answer !== null && <CircleCheck />} {t("Check answer")}
            </Button>
          )}
          {!last && (instant ? k.saved : true) && (
            <Button size="lg" disabled={busy} onClick={() => move(i + 1)} variant={instant ? "default" : "secondary"}>
              {t("Next")} <ArrowRight />
            </Button>
          )}
          {last && (instant ? k.saved : true) && !endConfirm && (
            <Button size="lg" variant="accent" disabled={busy} onClick={() => (answered < question.length ? setEndConfirm(true) : void submit())}>
              <Flag /> {t("Finish & submit")}
            </Button>
          )}
        </div>
      </div>

      {endConfirm && (
        <Alert kind="warning" className="mt-4" title={t("{0} questions unanswered", question.length - answered)}>
          <p>{t("Empty questions count as wrong. Are you sure you want to submit now?")}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="accent" size="sm" disabled={busy} onClick={submit}>
              {t("Yes, submit")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEndConfirm(false)}>
              {t("Back")}
            </Button>
          </div>
        </Alert>
      )}
    </div>
  );
}

/** End of a "try as a student" run: the score it would get, and every question with the key. */
function PreviewSummary({ question, state, backHref, onAgain }: { question: StudentQuestion[]; state: Record<string, AnswerState>; backHref: string; onAgain: () => void }) {
  const t = useT();
  const max = question.reduce((n, q) => n + (state[q.id]?.feedback?.maxScore ?? q.points), 0);
  const score = question.reduce((n, q) => n + (state[q.id]?.feedback?.score ?? 0), 0);
  const pending = question.filter((q) => state[q.id]?.feedback && state[q.id]!.feedback!.correct === null).length;
  const grade = max > 0 ? Math.round((score / max) * 1000) / 10 : 0;
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Alert kind="info" title={t("Preview result (not saved)")}>
        {t("This is the grade a student with these answers would get.")}
      </Alert>
      <div className="grid gap-1 rounded-2xl border bg-card p-5 text-center shadow-sm">
        <p className="text-sm font-semibold text-muted-foreground">{t("Grade")}</p>
        <p className="text-4xl font-extrabold">{grade}</p>
        <p className="text-sm text-muted-foreground">
          {t("Score {0} of {1}", Math.round(score * 100) / 100, Math.round(max * 100) / 100)}
          {pending > 0 && ` · ${t("{0} questions waiting for the teacher to grade", pending)}`}
        </p>
      </div>
      <ol className="grid gap-2">
        {question.map((q, n) => {
          const f = state[q.id]?.feedback;
          const icon = !f ? <MinusCircle className="size-5 text-muted-foreground" /> : f.correct === true ? <CircleCheck className="size-5 text-success" /> : f.correct === false ? <CircleX className="size-5 text-danger" /> : <Eye className="size-5 text-warning" />;
          return (
            <li key={q.id} className="grid gap-1 rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-start gap-2">
                <span className="shrink-0">{icon}</span>
                <p className="min-w-0 flex-1 font-semibold break-words whitespace-pre-line">
                  {n + 1}. {q.prompt}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">{f?.score != null ? `${Math.round(f.score * 100) / 100}/${Math.round(f.maxScore * 100) / 100}` : !f ? t("Not answered") : t("Graded by the teacher")}</span>
              </div>
              {f?.answerKey && f.correct !== true && (
                <p className="pl-7 text-muted-foreground">
                  {t("The correct answer:")} <b className="text-foreground">{f.answerKey}</b>
                </p>
              )}
              {f?.explanation && (
                <p className="flex gap-1.5 pl-7 text-xs text-muted-foreground">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0" /> {f.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAgain}>
          <RotateCcw /> {t("Try again")}
        </Button>
        <Button asChild variant="outline">
          <Link href={backHref}>
            <ArrowLeft /> {t("Back")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
