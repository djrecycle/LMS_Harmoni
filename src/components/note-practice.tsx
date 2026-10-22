"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { savePracticeResult } from "@/app/actions/practice";
import { Piano } from "@/components/piano";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { playSequence } from "@/lib/audio";
import { randomMelody } from "@/lib/practice";
import { midiToNote } from "@/lib/music";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Phase = "ready" | "listen" | "main" | "result";

export function NotePractice() {
  const t = useT();
  const [length, setLength] = useState(3);
  const [phase, setPhase] = useState<Phase>("ready");
  const [melody, setMelody] = useState<number[]>([]);
  const [played, setPlayed] = useState<number[]>([]);
  const [highlight, setHighlight] = useState<number[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  function play(m: number[]) {
    cancel.current?.();
    setPhase("listen");
    cancel.current = playSequence(m, {
      delay: 0.65,
      onNote: (n) => setHighlight(n === null ? [] : [n]),
      onCompleted: () => setPhase("main"),
    });
  }

  function newQuestion() {
    const m = randomMelody(length);
    setMelody(m);
    setPlayed([]);
    setScore(null);
    play(m);
  }

  async function press(midi: number) {
    if (phase !== "main") return;
    const fresh = [...played, midi];
    setPlayed(fresh);
    if (fresh.length < melody.length) return;
    const correct = fresh.filter((n, i) => n === melody[i]).length;
    const grade = Math.round((correct / melody.length) * 100);
    setScore(grade);
    setPhase("result");
    const r = await savePracticeResult({ kind: "note", title: t("Repeat {0} notes", melody.length), score: grade, detail: { melody: melody.map(midiToNote), played: fresh.map(midiToNote) } });
    if (!r.ok) toast.error(r.error);
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <label className="text-sm font-semibold">
          {t("Melody length")}
          <Select value={length} onChange={(e) => setLength(Number(e.target.value))} disabled={phase === "listen"} className="mt-1.5 w-40">
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} {t("notes")}
              </option>
            ))}
          </Select>
        </label>
        <Button size="lg" onClick={newQuestion} disabled={phase === "listen"}>
          {phase === "ready" ? <Headphones /> : <RotateCcw />} {phase === "ready" ? t("Start") : t("New melody")}
        </Button>
        {melody.length > 0 && phase !== "listen" && (
          <Button size="lg" variant="secondary" onClick={() => play(melody)} disabled={phase === "result" && false}>
            <Play /> {t("Listen again")}
          </Button>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 text-center">
          {phase === "ready" && <p className="font-semibold">{t("Press")} <b>{t("Start")}</b> {t("to hear the melody, then repeat it on the piano.")}</p>}
          {phase === "listen" && <p className="font-semibold text-primary">{t("🎧 Listen carefully…")}</p>}
          {phase === "main" && <p className="font-semibold text-accent-foreground dark:text-accent">{t("🎹 Your turn! Play")} {melody.length} {t("notes you just heard.")}</p>}
          {phase === "result" && score !== null && (
            <div>
              <p className={cn("text-5xl font-extrabold", score >= 80 ? "text-success" : score >= 50 ? "text-primary" : "text-danger")}>{score}</p>
              <p className="font-semibold">{score === 100 ? t("Perfect! Your ears are sharp 🎉") : score >= 50 ? t("Not bad! Try again.") : t("Listen again, then try slowly.")}</p>
            </div>
          )}
        </div>

        {melody.length > 0 && (
          <div className="mb-4 flex flex-wrap justify-center gap-2" aria-live="polite">
            {melody.map((n, i) => {
              const done = i < played.length;
              const correct = done && played[i] === n;
              return (
                <span key={i} className={cn("grid h-14 w-14 place-items-center rounded-xl border-2 text-sm font-bold", !done && "border-dashed text-transparent", done && (correct ? "border-success bg-success-soft text-success" : "border-danger bg-danger-soft text-danger"))}>
                  {done ? midiToNote(played[i]) : "?"}
                  {phase === "result" && !correct && <span className="sr-only">{t("correct:")} {midiToNote(n)}</span>}
                </span>
              );
            })}
          </div>
        )}
        {phase === "result" && (
          <p className="mb-4 text-center text-sm text-muted-foreground">
            {t("Correct melody:")} <b className="font-mono text-foreground">{melody.map(midiToNote).join(" → ")}</b>
          </p>
        )}

        <Piano disabled={phase === "listen"} highlight={highlight} onNotePress={press} />
      </div>
    </div>
  );
}
