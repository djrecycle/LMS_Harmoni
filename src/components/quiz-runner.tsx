"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleCheck, Clock, Flag, LoaderCircle, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { finishQuiz, saveAnswer, type Feedback } from "@/app/actions/quiz";
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
}: {
  quizId: string;
  attemptId: string;
  title: string;
  instant: boolean;
  question: StudentQuestion[];
  initialState: Record<string, AnswerState>;
  remainingSeconds: number | null;
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

  const s = question[i];
  const k = state[s.id] ?? { answer: null, feedback: null, saved: false };
  const locked = instant && k.saved;
  const existsAnswer = (j: StudentAnswer) => j !== null && j !== "" && !(Array.isArray(j) && j.length === 0);

  const close = useCallback(async () => {
    if (berakhir.current) return;
    berakhir.current = true;
    setMenutup(true);
    const r = await finishQuiz(attemptId);
    if (!r.ok) {
      berakhir.current = false;
      setMenutup(false);
      return void toast.error(r.error);
    }
    router.replace(`/student/quizzes/${quizId}/result/${attemptId}`);
  }, [attemptId, quizId, router]);

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
    const r = await saveAnswer(attemptId, questionId, answer);
    if (!r.ok) {
      if (/time/i.test(r.error ?? "")) void close();
      toast.error(r.error ?? t("Could not save the answer."));
      return false;
    }
    setState((p) => ({ ...p, [questionId]: { answer, feedback: r.data && instant ? r.data : null, saved: true } }));
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
