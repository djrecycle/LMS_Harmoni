"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { savePracticeResult } from "@/app/actions/practice";
import { PRACTICE_NOT_LINKED } from "@/lib/practice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { audioTime, scheduleNote, unlockAudio } from "@/lib/audio";
import { SOLFEGE_STEPS, type SolfegeDetail } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const ROUNDS = 5;
const DO = 60; // C4

/** Round 1-2: 2 notes, 3-4: 3 notes, 5: 4 notes. Starts near "do" and moves mostly by step so it stays singable. */
function randomRound(round: number): number[] {
  const length = round < 2 ? 2 : round < 4 ? 3 : 4;
  const out: number[] = [];
  let i = Math.floor(Math.random() * 3); // do, re or mi
  while (out.length < length) {
    out.push(i);
    const step = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() < 0.5 ? -2 : 2;
    i = Math.max(0, Math.min(SOLFEGE_STEPS.length - 1, i + step));
  }
  return out; // indexes into SOLFEGE_STEPS
}

/**
 * Solfège ear practice: the app plays the do-mi-sol chord of C major as a reference, then a short melody; the student
 *  answers with do-re-mi buttons. 5 rounds; the score is the share of notes named correctly.
 *  `saveResult: false` keeps the score local (teacher preview); `materialId` links it to the lesson.
 */
export function SolfegePractice({ saveResult = true, materialId }: { saveResult?: boolean; materialId?: string }) {
  const t = useT();
  const [round, setRound] = useState(-1); // -1 = not started, ROUNDS = finished
  const [question, setQuestion] = useState<number[]>([]);
  const [answer, setAnswer] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const tally = useRef<{ correct: number; total: number; missed: Record<string, number> }>({ correct: 0, total: 0, missed: {} });
  const [score, setScore] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  async function play(q: number[]) {
    await unlockAudio();
    const start = audioTime() + 0.1;
    [0, 4, 7].forEach((s) => scheduleNote(DO + s, start, 1, 0.55));
    q.forEach((idx, i) => scheduleNote(DO + SOLFEGE_STEPS[idx].semitones, start + 1.6 + i * 0.7, 0.55, 0.8));
    setPlaying(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPlaying(false), (1.6 + q.length * 0.7) * 1000);
  }

  function next(r: number) {
    const q = randomRound(r);
    setRound(r);
    setQuestion(q);
    setAnswer([]);
    setChecked(false);
    void play(q);
  }

  function begin() {
    tally.current = { correct: 0, total: 0, missed: {} };
    setScore(null);
    next(0);
  }

  function press(idx: number) {
    if (checked || answer.length >= question.length) return;
    const a = [...answer, idx];
    setAnswer(a);
    // Hear the syllable that was pressed, so the student can compare.
    void unlockAudio().then(() => scheduleNote(DO + SOLFEGE_STEPS[idx].semitones, audioTime() + 0.02, 0.4, 0.7));
    if (a.length === question.length) check(a);
  }

  function check(a: number[]) {
    setChecked(true);
    const t0 = tally.current;
    question.forEach((q, i) => {
      t0.total++;
      if (a[i] === q) t0.correct++;
      else {
        const s = SOLFEGE_STEPS[q].syllable;
        t0.missed[s] = (t0.missed[s] ?? 0) + 1;
      }
    });
  }

  async function finish() {
    const { correct, total, missed } = tally.current;
    const s = Math.round((correct / Math.max(1, total)) * 100);
    setScore(s);
    setRound(ROUNDS);
    if (!saveResult) return;
    const detail: SolfegeDetail = { rounds: ROUNDS, notesTotal: total, notesCorrect: correct, missed };
    const r = await savePracticeResult({ kind: "solfege", title: t("Solfège: name the notes ({0} rounds)", ROUNDS), score: s, detail, materialId });
    if (!r.ok) toast.error(r.error);
    else if (materialId && !r.data?.linked) toast.warning(PRACTICE_NOT_LINKED);
  }

  const roundCorrect = checked && answer.every((a, i) => a === question[i]);

  return (
    <div className="grid min-h-56 gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      {round === -1 && (
        <div className="grid justify-items-center gap-3 text-center">
          <p className="max-w-md text-lg font-semibold">{t("You will hear the do-mi-sol chord first, then a few notes. Answer with the solfège syllables in the order you heard them.")}</p>
          <Button size="lg" onClick={begin}>
            <Headphones /> {t("Start")}
          </Button>
        </div>
      )}

      {round >= 0 && round < ROUNDS && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="primary">{t("Round {0} of {1}", round + 1, ROUNDS)}</Badge>
            <Button variant="outline" size="sm" onClick={() => play(question)} disabled={playing}>
              <Headphones /> {t("Listen again")}
            </Button>
          </div>
          <div className="flex min-h-12 flex-wrap items-center justify-center gap-2">
            {question.map((q, i) => {
              const a = answer[i];
              return (
                <span
                  key={i}
                  className={cn(
                    "grid min-w-16 place-items-center rounded-lg border-2 px-3 py-2 font-mono text-lg font-bold",
                    a === undefined ? "border-dashed text-muted-foreground" : !checked ? "border-primary bg-primary-soft text-primary" : a === q ? "border-success bg-success-soft text-success" : "border-danger bg-danger-soft text-danger",
                  )}
                >
                  {a === undefined ? "?" : SOLFEGE_STEPS[a].syllable}
                  {checked && a !== q && <span className="text-xs font-semibold">→ {SOLFEGE_STEPS[q].syllable}</span>}
                </span>
              );
            })}
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {SOLFEGE_STEPS.map((s, i) => (
              <Button key={s.syllable} variant="secondary" className="h-12 font-mono text-base" onClick={() => press(i)} disabled={checked}>
                {s.syllable}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!checked && (
              <Button variant="ghost" size="sm" onClick={() => setAnswer((a) => a.slice(0, -1))} disabled={!answer.length}>
                <Undo2 /> {t("Delete last")}
              </Button>
            )}
            {checked && (
              <>
                <span className={cn("text-sm font-bold", roundCorrect ? "text-success" : "text-danger")}>{roundCorrect ? t("Correct!") : t("Not quite. Listen again to compare.")}</span>
                <Button size="sm" onClick={() => (round + 1 < ROUNDS ? next(round + 1) : void finish())}>
                  {round + 1 < ROUNDS ? t("Next round") : t("See score")}
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {round === ROUNDS && score !== null && (
        <div className="grid justify-items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{t("Solfège score")}</p>
          <p className={cn("text-6xl font-extrabold", score >= 80 ? "text-success" : score >= 50 ? "text-primary" : "text-danger")}>{score}</p>
          <p className="text-sm">
            {t("{0} of {1} notes named correctly", tally.current.correct, tally.current.total)}
          </p>
          <Button onClick={begin}>
            <RotateCcw /> {t("Repeat")}
          </Button>
        </div>
      )}
    </div>
  );
}
