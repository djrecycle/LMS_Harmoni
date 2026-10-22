"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Drum, Headphones, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { savePracticeResult } from "@/app/actions/practice";
import { PRACTICE_NOT_LINKED } from "@/lib/practice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { audioLatency, audioTime, scheduleClick, scheduleNote, unlockAudio } from "@/lib/audio";
import { gradeTempo, type TempoDetail } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Phase = "ready" | "count" | "guide" | "solo" | "result";

const COUNT = 4; // listen only
const GUIDE = 4; // tap along with the clicks
const SOLO = 8; // the clicks stop: keep the beat alone

/**
 * Steady-beat practice: 4 count-in clicks, 4 clicks to tap along with, then the metronome goes quiet and the
 *  student keeps tapping 8 more beats. Graded on staying on the beat and keeping even spacing (lib/practice gradeTempo).
 *  `saveResult: false` keeps the score local (teacher preview); `materialId` links it to the lesson.
 */
export function TempoPractice({ initialBpm = 80, saveResult = true, materialId }: { initialBpm?: number; saveResult?: boolean; materialId?: string }) {
  const t = useT();
  const [bpm, setBpm] = useState(initialBpm);
  const [phase, setPhase] = useState<Phase>("ready");
  const [beat, setBeat] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [result, setResult] = useState<{ score: number; detail: TempoDetail } | null>(null);

  const phaseRef = useRef<Phase>("ready");
  const taps = useRef<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const plan = useRef({ tSolo: 0, d: 0 });

  const setPhaseAll = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clear, [clear]);

  async function start() {
    await unlockAudio();
    clear();
    setResult(null);
    taps.current = [];
    setTapCount(0);

    const d = 60 / bpm;
    const t0 = audioTime() + 0.4;
    const tGuide = t0 + COUNT * d;
    const tSolo = tGuide + GUIDE * d;
    plan.current = { tSolo, d };
    for (let i = 0; i < COUNT + GUIDE; i++) scheduleClick(t0 + i * d, i % 4 === 0);

    const ms = (at: number) => Math.max(0, (at - audioTime()) * 1000);
    setPhaseAll("count");
    for (let i = 0; i < COUNT + GUIDE + SOLO; i++) {
      timers.current.push(
        setTimeout(() => {
          if (i === COUNT) setPhaseAll("guide");
          if (i === COUNT + GUIDE) setPhaseAll("solo");
          setBeat(i < COUNT ? i + 1 : i < COUNT + GUIDE ? i - COUNT + 1 : i - COUNT - GUIDE + 1);
        }, ms(t0 + i * d)),
      );
    }
    timers.current.push(setTimeout(() => void finish(), ms(tSolo + SOLO * d + 0.45 * d)));
  }

  async function finish() {
    const { tSolo, d } = plan.current;
    const expected = Array.from({ length: SOLO }, (_, i) => tSolo + i * d);
    const graded = gradeTempo(expected, taps.current, d, bpm);
    setResult(graded);
    setPhaseAll("result");
    if (!saveResult) return;
    const r = await savePracticeResult({ kind: "tempo", title: t("Steady tempo ({0} BPM)", bpm), score: graded.score, detail: graded.detail, materialId });
    if (!r.ok) toast.error(r.error);
    else if (materialId && !r.data?.linked) toast.warning(PRACTICE_NOT_LINKED);
  }

  const tap = useCallback(() => {
    if (phaseRef.current !== "guide" && phaseRef.current !== "solo") return;
    const now = audioTime();
    scheduleNote(84, now, 0.1, 0.8);
    taps.current.push(now - audioLatency());
    setTapCount((n) => n + 1);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && (phaseRef.current === "guide" || phaseRef.current === "solo")) {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [tap]);

  const busy = phase === "count" || phase === "guide" || phase === "solo";
  const d = result?.detail;

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="text-sm font-semibold">
          {t("Tempo:")} {bpm} BPM
          <input type="range" min={50} max={140} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} disabled={busy} className="mt-3 block w-full accent-[var(--primary)]" />
        </label>
        <Button size="lg" onClick={start} disabled={busy}>
          {phase === "result" ? <RotateCcw /> : <Headphones />} {phase === "result" ? t("Repeat") : t("Start")}
        </Button>
      </div>

      <div className="grid min-h-56 place-items-center rounded-2xl border bg-card p-5 text-center shadow-sm sm:p-7">
        {phase === "ready" && (
          <p className="max-w-md text-lg font-semibold">
            {t("Listen to 4 clicks, tap along with the next 4, then the clicks stop: keep tapping the same beat 8 more times on your own.")}
          </p>
        )}
        {phase === "count" && (
          <div>
            <Badge tone="primary" className="mb-2">
              {t("1. Listen")}
            </Badge>
            <p className="text-6xl font-extrabold tabular-nums">{beat}</p>
          </div>
        )}
        {(phase === "guide" || phase === "solo") && (
          <div className="grid w-full justify-items-center gap-3">
            <Badge tone={phase === "guide" ? "warning" : "success"}>{phase === "guide" ? t("2. Tap along with the clicks") : t("3. Keep the beat on your own!")}</Badge>
            <div className="flex gap-1.5" aria-hidden>
              {Array.from({ length: phase === "guide" ? GUIDE : SOLO }, (_, i) => (
                <span key={i} className={cn("size-3 rounded-full", i < beat ? (phase === "guide" ? "bg-accent" : "bg-success") : "bg-muted")} />
              ))}
            </div>
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                tap();
              }}
              className="piano-key grid size-32 place-items-center rounded-full bg-gradient-to-br from-accent to-orange-500 text-accent-foreground shadow-lg transition-transform active:scale-90 sm:size-36"
              aria-label={t("Tap")}
            >
              <Drum className="size-14" />
            </button>
            <p className="text-sm text-muted-foreground">
              {t("Tap the button (or press")} <kbd className="rounded bg-muted px-1.5 font-mono">{t("Space")}</kbd>) · {tapCount} {t("taps")}
            </p>
          </div>
        )}
        {phase === "result" && result && d && (
          <div className="grid w-full gap-3">
            <div>
              <p className="text-sm text-muted-foreground">{t("Tempo score")}</p>
              <p className={cn("text-6xl font-extrabold", result.score >= 80 ? "text-success" : result.score >= 50 ? "text-primary" : "text-danger")}>{result.score}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {d.actualBpm !== null ? (
                <Badge tone={Math.abs(d.actualBpm - d.bpm) <= d.bpm * 0.05 ? "success" : "warning"}>
                  {t("Your tempo: {0} BPM (target {1})", d.actualBpm, d.bpm)}
                </Badge>
              ) : (
                <Badge tone="danger">{t("Too few taps to measure the tempo")}</Badge>
              )}
              {d.cv !== null && (
                <Badge tone={d.cv <= 0.06 ? "success" : d.cv <= 0.12 ? "warning" : "danger"}>
                  {d.cv <= 0.06 ? t("Very steady") : d.cv <= 0.12 ? t("Fairly steady") : t("Not steady yet")}
                </Badge>
              )}
              {d.diffs.filter((x) => x === null).length > 0 && <Badge tone="danger">{t("{0} beats missed", d.diffs.filter((x) => x === null).length)}</Badge>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
