"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { deleteQuiz, overrideAnswerGrade, editStatusQuiz, resetStudentAttempts } from "@/app/actions/quiz";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";

export function PublishButton({ id, published }: { id: string; published: boolean }) {
  const t = useT();
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      variant={published ? "outline" : "default"}
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await editStatusQuiz(id, !published);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      {published ? <EyeOff /> : <Eye />}
      {published ? t("Move back to draft") : t("Publish")}
    </Button>
  );
}

export function DeleteQuizButton({ id, compact }: { id: string; compact?: boolean }) {
  const t = useT();
  const router = useRouter();
  return (
    <DeleteButton
      action={deleteQuiz}
      id={id}
      label={compact ? t("Delete") : t("Delete quiz")}
      confirmText={t("Delete with its results?")}
      size={compact ? "sm" : "md"}
      onDone={() => (compact ? router.refresh() : router.push("/teacher/quizzes"))}
    />
  );
}

/** Lets a student take the quiz again by deleting their attempts (two-step confirmation). */
export function ResetAttemptsButton({ quizId, studentId }: { quizId: string; studentId: string }) {
  const t = useT();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, start] = useTransition();
  if (!asking) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
        <RotateCcw /> {t("Restart")}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-warning-soft px-2 py-1">
      <span className="text-xs font-semibold">{t("Delete this student's answers?")}</span>
      <Button
        size="sm"
        className="h-7 px-2.5"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await resetStudentAttempts(quizId, studentId);
            if (r.ok) {
              toast.success(r.message);
              router.refresh();
            } else toast.error(r.error);
            setAsking(false);
          })
        }
      >
        {t("Yes")}
      </Button>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAsking(false)} disabled={busy}>
        {t("Cancel")}
      </Button>
    </span>
  );
}

/** Manual grading form for one answer. */
export function GradingForm({ answerId, initialScore, maxScore, initialNote, pending }: { answerId: string; initialScore: number | null; maxScore: number; initialNote: string | null; pending: boolean }) {
  const t = useT();
  const router = useRouter();
  const [score, setScore] = useState(initialScore === null ? "" : String(initialScore));
  const [note, setNote] = useState(initialNote ?? "");
  const [busy, start] = useTransition();
  return (
    <form
      className="grid gap-2 rounded-lg bg-warning-soft/60 p-3 sm:grid-cols-[7rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await overrideAnswerGrade({ answerId, score: Number(score), note });
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      <label className="text-xs font-semibold">
        {t("Score (max")} {maxScore})
        <Input type="number" min={0} max={maxScore} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} required className="mt-1 h-10" />
      </label>
      <label className="text-xs font-semibold">
        {t("Note for the student (optional)")}
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className="mt-1 h-10" />
      </label>
      <Button type="submit" disabled={busy || score === ""} variant={pending ? "default" : "outline"}>
        {pending ? t("Give grade") : t("Change grade")}
      </Button>
    </form>
  );
}
