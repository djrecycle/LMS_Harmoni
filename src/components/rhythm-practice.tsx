"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Drum, Headphones, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { savePracticeResult } from "@/app/actions/practice";
import { PRACTICE_NOT_LINKED } from "@/lib/practice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Select } from "@/components/ui/input";
import { unlockAudio, scheduleClick, audioLatency, scheduleNote, audioTime } from "@/lib/audio";
import { gradeRhythm, RHYTHM_PATTERNS, type BeatResult } from "@/lib/practice";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Phase = "ready" | "listen" | "turn" | "result";

/**
 * `saveResult: false` keeps the score local — saving needs a student session (a teacher previewing a lesson would be redirected).
 *  `materialId` links the saved score to the lesson it was practised in (for the teacher's practice recap).
 */
export function RhythmPractice({
  initialPatternId,
  initialBpm,
  saveResult = true,
  materialId,
}: { initialPatternId?: string; initialBpm?: number; saveResult?: boolean; materialId?: string } = {}) {
  const t = useT();
  const [patternId, setPatternId] = useState(RHYTHM_PATTERNS.some((p) => p.id === initialPatternId) ? initialPatternId! : RHYTHM_PATTERNS[0].id);
  const [bpm, setBpm] = useState(initialBpm ?? 80);
  const [phase, setPhase] = useState<Phase>("ready");
  const [info, setInfo] = useState("");
  const [result, setResult] = useState<{ score: number; detail: BeatResult[]; extra: number } | null>(null);
  const [tapCount, setTapCount] = useState(0);

  const pattern = RHYTHM_PATTERNS.find((p) => p.id === patternId)!;
  const phaseRef = useRef<Phase>("ready");
  const taps = useRef<number[]>([]);
  const schedule = useRef({ tS: 0, d: 0 });
  const playhead = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const raf = useRef(0);

  const setPhaseAll = (f: Phase) => {
    phaseRef.current = f;
    setPhase(f);
  };

  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    cancelAnimationFrame(raf.current);
  }, []);
  useEffect(() => clear, [clear]);

  /** Runs the playhead animation and count text based on the audio clock. */
  function animation(t0: number, tD: number, tC: number, tS: number, d: number, L: number) {
    const frame = () => {
      const now = audioTime();
      let text = "";
      let percent = -1;
      if (now < tD) text = String(Math.min(4, Math.floor((now - t0) / d) + 1));
      else if (now < tD + L * d) percent = ((now - tD) / (L * d)) * 100;
      else if (now < tC) text = "…";
      else if (now < tS) text = String(Math.min(4, Math.floor((now - tC) / d) + 1));
      else if (now < tS + L * d) percent = ((now - tS) / (L * d)) * 100;
      setInfo((prev) => (prev === text ? prev : text));
      if (playhead.current) {
        playhead.current.style.opacity = percent >= 0 ? "1" : "0";
        if (percent >= 0) playhead.current.style.left = `${percent}%`;
      }
      if (phaseRef.current === "listen" || phaseRef.current === "turn") raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
  }

  async function start() {
    await unlockAudio();
    clear();
    setResult(null);
    taps.current = [];
    setTapCount(0);

    const d = 60 / bpm;
    const L = pattern.length;
    const t0 = audioTime() + 0.5;
    const tD = t0 + 4 * d; // start of the example
    const tC = tD + L * d + d; // start of the count-in before the student's turn
    const tS = tC + 4 * d; // start of the student's pattern

    for (let i = 0; i < 4; i++) scheduleClick(t0 + i * d, i === 0);
    for (const o of pattern.onset) scheduleNote(84, tD + o * d, 0.12, 0.9);
    for (let i = 0; i < 4; i++) scheduleClick(tC + i * d, i === 0);
    for (let b = 0; b < L; b++) scheduleClick(tS + b * d, b % 4 === 0);
    schedule.current = { tS, d };

    const ms = (t: number) => Math.max(0, (t - audioTime()) * 1000);
    setPhaseAll("listen");
    animation(t0, tD, tC, tS, d, L);
    timers.current.push(setTimeout(() => setPhaseAll("turn"), ms(tC)));
    timers.current.push(setTimeout(() => void completed(), ms(tS + L * d + 0.45 * d)));
  }

  async function completed() {
    cancelAnimationFrame(raf.current);
    if (playhead.current) playhead.current.style.opacity = "0";
    const { tS, d } = schedule.current;
    const h = gradeRhythm(
      pattern.onset.map((o) => tS + o * d),
      taps.current,
      d,
    );
    setResult(h);
    setPhaseAll("result");
    setInfo("");
    if (!saveResult) return;
    const r = await savePracticeResult({ kind: "rhythm", title: t("Rhythm: {0} ({1} BPM)", t(pattern.name), bpm), score: h.score, detail: { patternId, bpm, diffs: h.detail.map((d) => d.diffMs), extra: h.extra }, materialId });
    if (!r.ok) toast.error(r.error);
    else if (materialId && !r.data?.linked) toast.warning(PRACTICE_NOT_LINKED);
  }

  const tap = useCallback(() => {
    if (phaseRef.current !== "turn") return;
    const now = audioTime();
    const { tS, d } = schedule.current;
    scheduleNote(84, now, 0.1, 0.8); // tap sound feedback
    const t = now - audioLatency(); // compensate for output delay to be fair
    if (t >= tS - 0.45 * d) {
      taps.current.push(t);
      setTapCount((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && phaseRef.current === "turn") {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [tap]);

  const activeInProgress = phase === "listen" || phase === "turn";

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <label className="text-sm font-semibold">
          {t("Rhythm pattern")}
          <Select value={patternId} onChange={(e) => setPatternId(e.target.value)} disabled={activeInProgress} className="mt-1.5">
            {RHYTHM_PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(p.name)}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm font-semibold">
          {t("Tempo:")} {bpm} BPM
          <input type="range" min={50} max={140} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} disabled={activeInProgress} className="mt-3 block w-full accent-[var(--primary)]" />
        </label>
        <Button size="lg" onClick={start} disabled={activeInProgress}>
          {phase === "result" ? <RotateCcw /> : <Headphones />} {phase === "result" ? t("Repeat") : t("Start")}
        </Button>
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <p className="mb-1 text-sm text-muted-foreground">{t(pattern.description)}</p>

        {/* Pattern timeline */}
        <div className="relative my-6 h-20 rounded-xl bg-muted" aria-hidden>
          {Array.from({ length: pattern.length + 1 }, (_, b) => (
            <span key={b} className={cn("absolute top-0 h-full w-px", b % 4 === 0 ? "bg-foreground/30" : "bg-foreground/10")} style={{ left: `${(b / pattern.length) * 100}%` }} />
          ))}
          {pattern.onset.map((o, i) => (
            <span key={i} className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow" style={{ left: `${(o / pattern.length) * 100}%` }} />
          ))}
          <div ref={playhead} className="absolute top-0 h-full w-1 -translate-x-1/2 rounded-full bg-accent opacity-0 shadow-[0_0_12px_var(--accent)]" />
        </div>

        <div className="grid min-h-40 place-items-center text-center">
          {phase === "ready" && <p className="text-lg font-semibold">{t("Press")} <b>{t("Start")}</b>{t(". Listen to the pattern first, then tap it yourself.")}</p>}
          {phase === "listen" && (
            <div>
              <Badge tone="primary" className="mb-2">
                {t("1. Listen")}
              </Badge>
              <p className="text-6xl font-extrabold tabular-nums">{info}</p>
            </div>
          )}
          {phase === "turn" && (
            <div className="grid w-full justify-items-center gap-3">
              <Badge tone="warning">{t("2. Your turn!")} {info && t("(count {0})", info)}</Badge>
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
          {phase === "result" && result && (
            <div className="grid w-full gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t("Accuracy score")}</p>
                <p className={cn("text-6xl font-extrabold", result.score >= 80 ? "text-success" : result.score >= 50 ? "text-primary" : "text-danger")}>{result.score}</p>
                <p className="font-semibold">{result.score >= 90 ? t("Perfect! 🥁") : result.score >= 70 ? t("Very good!") : result.score >= 40 ? t("Almost! Try once more.") : t("Listen to the pattern again, then try slowly.")}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {result.detail.map((h) => (
                  <Badge key={h.index} tone={h.diffMs === null ? "danger" : Math.abs(h.diffMs) <= 120 ? "success" : "warning"}>
                    #{h.index + 1}{" "}
                    {h.diffMs === null ? "missed" : Math.abs(h.diffMs) <= 120 ? "exact" : h.diffMs < 0 ? t("early {0} ms", -h.diffMs) : t("late {0} ms", h.diffMs)}
                  </Badge>
                ))}
                {result.extra > 0 && <Badge tone="danger">{result.extra} {t("extra taps")}</Badge>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
