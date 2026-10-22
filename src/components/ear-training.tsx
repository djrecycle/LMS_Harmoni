"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Play } from "lucide-react";
import { toast } from "sonner";
import { savePracticeResult } from "@/app/actions/practice";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { playChord, playSequence } from "@/lib/audio";
import { midiToNote } from "@/lib/music";
import { EAR_CHOICES, PRACTICE_KIND_LABEL, earNotes, randomEarQuestion, type EarMode, type EarQuestion } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const TOTAL = 10;

/** Short explanation (materi) shown above each trainer. */
const MATERI: Record<EarMode, { title: string; body: string }> = {
  interval: {
    title: "What is an interval?",
    body: "An interval is the distance between two notes, counted in semitones (half steps). Each interval has its own character: a minor 3rd sounds sad, a major 3rd sounds bright. Learn the sound of each one, then recognise it by ear.",
  },
  chord: {
    title: "What is a triad?",
    body: "A triad is three notes stacked in thirds. The distances from the root decide the chord type: major (4 + 3 semitones) sounds happy, minor (3 + 4) sounds sad, diminished (3 + 3) sounds tense, and augmented (4 + 4) sounds dreamy and unresolved.",
  },
  scale: {
    title: "What is a scale?",
    body: "A scale is a set of notes in a fixed pattern of whole steps (W = 2 semitones) and half steps (H = 1 semitone). Major is W-W-H-W-W-W-H and natural minor is W-H-W-W-H-W-W. Listen for the mood: major sounds bright, minor sounds dark.",
  },
};

type Status = "ready" | "question" | "feedback" | "done";

export function EarTrainingPractice({ mode }: { mode: EarMode }) {
  const t = useT();
  const [melodic, setMelodic] = useState(false);
  const [status, setStatus] = useState<Status>("ready");
  const [question, setQuestion] = useState<EarQuestion | null>(null);
  const [index, setIndex] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const correctRef = useRef(0);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  const choices = EAR_CHOICES[mode];
  const materi = MATERI[mode];
  const inQuiz = status === "question" || status === "feedback";

  function play(q: EarQuestion) {
    cancel.current?.();
    cancel.current = null;
    const notes = earNotes(mode, q);
    if (mode === "scale") {
      cancel.current = playSequence(notes, { delay: 0.35, duration: 0.3 });
    } else if (mode === "interval" && q.melodic) {
      cancel.current = playSequence(notes, { delay: 0.7, duration: 0.6 });
    } else {
      playChord(notes);
    }
  }

  function ask(n: number) {
    const q = randomEarQuestion(mode, melodic);
    setQuestion(q);
    setPick(null);
    setIndex(n);
    setStatus("question");
    play(q);
  }

  function start() {
    correctRef.current = 0;
    setCorrect(0);
    ask(1);
  }

  function next() {
    if (index >= TOTAL) void finish();
    else ask(index + 1);
  }

  function answer(id: string) {
    if (status !== "question" || !question) return;
    setPick(id);
    if (id === question.answer) {
      correctRef.current += 1;
      setCorrect(correctRef.current);
    }
    setStatus("feedback");
  }

  async function finish() {
    const score = Math.round((correctRef.current / TOTAL) * 100);
    setStatus("done");
    const r = await savePracticeResult({
      kind: mode,
      title: t("{0}: {1}/{2} correct", t(PRACTICE_KIND_LABEL[mode]), correctRef.current, TOTAL),
      score,
      detail: { correct: correctRef.current, total: TOTAL, ...(mode === "interval" ? { melodic } : {}) },
    });
    if (!r.ok) toast.error(r.error);
  }

  const answerName = question ? choices.find((c) => c.id === question.answer)?.name ?? "" : "";
  const notesText = question ? earNotes(mode, question).map(midiToNote).join(" · ") : "";
  const gridCols = choices.length > 8 ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className="grid gap-5">
      <section className="rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="font-bold">{t(materi.title)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(materi.body)}</p>
      </section>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-xs">
        {mode === "interval" && (
          <label className="text-sm font-semibold">
            {t("How to play")}
            <Select value={melodic ? "melodic" : "harmonic"} onChange={(e) => setMelodic(e.target.value === "melodic")} disabled={inQuiz} className="mt-1.5 w-56">
              <option value="harmonic">{t("Together (harmonic)")}</option>
              <option value="melodic">{t("One after another (melodic)")}</option>
            </Select>
          </label>
        )}
        {status === "ready" || status === "done" ? (
          <Button size="lg" onClick={start}>
            <Headphones /> {status === "ready" ? t("Start") : t("Play again")}
          </Button>
        ) : (
          <Button size="lg" variant="secondary" onClick={() => question && play(question)}>
            <Play /> {t("Listen again")}
          </Button>
        )}
        {inQuiz && <p className="text-sm font-semibold text-muted-foreground sm:ml-auto">{t("Question {0} of {1}", index, TOTAL)}</p>}
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-5 text-center" aria-live="polite">
          {status === "ready" && <p className="font-semibold">{t("Press Start to hear the first sound, then choose your answer.")}</p>}
          {status === "question" && <p className="font-semibold text-primary">{t("🎧 What do you hear?")}</p>}
          {status === "feedback" && question && (
            <div>
              <p className={cn("text-2xl font-extrabold", pick === question.answer ? "text-success" : "text-danger")}>{pick === question.answer ? t("Correct! 🎉") : t("Not quite")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Answer:")} <b className="text-foreground">{t(answerName)}</b> · <span className="font-mono">{notesText}</span>
              </p>
            </div>
          )}
          {status === "done" && (
            <div>
              <p className={cn("text-5xl font-extrabold", correct / TOTAL >= 0.8 ? "text-success" : correct / TOTAL >= 0.5 ? "text-primary" : "text-danger")}>{Math.round((correct / TOTAL) * 100)}</p>
              <p className="font-semibold">{t("{0} of {1} correct", correct, TOTAL)}</p>
            </div>
          )}
        </div>

        <div className={cn("grid gap-2", gridCols)}>
          {choices.map((c) => {
            const isAnswer = status === "feedback" && question?.answer === c.id;
            const isWrong = status === "feedback" && pick === c.id && !isAnswer;
            return (
              <button
                key={c.id}
                type="button"
                disabled={status !== "question"}
                onClick={() => answer(c.id)}
                className={cn(
                  "rounded-xl border-2 px-3 py-3 text-sm font-bold transition",
                  status === "question" && "bg-card hover:border-primary hover:bg-primary-soft",
                  status !== "question" && "bg-card text-muted-foreground",
                  isAnswer && "border-success bg-success-soft text-success",
                  isWrong && "border-danger bg-danger-soft text-danger",
                )}
              >
                {t(c.name)}
              </button>
            );
          })}
        </div>

        {status === "feedback" && (
          <div className="mt-5 flex justify-center">
            <Button size="lg" onClick={next}>
              {index >= TOTAL ? t("See my score") : t("Next question")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
