"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, CircleDot, Drum, Headphones, Music2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { savePracticeResult } from "@/app/actions/practice";
import { PRACTICE_NOT_LINKED } from "@/lib/practice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Select } from "@/components/ui/input";
import { unlockAudio, scheduleClick, audioLatency, audioTime, RHYTHM_VOICES, type ClickVoice } from "@/lib/audio";
import { gradeRhythm, RHYTHM_PATTERNS, type BeatResult, type RhythmPattern } from "@/lib/practice";
import { ScoreView } from "@/components/score-view";
import { glyphNotation, isRestGlyph, METERS, NOTE_GLYPH_BEATS } from "@/lib/music-blocks";
import { onsetsToPattern } from "@/lib/rhythm";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Phase = "ready" | "listen" | "turn" | "result";
type View = "dots" | "staff";

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: "Easy (1 bar)", 2: "Medium (2 bars)", 3: "Hard (4 bars)" };
const VIEW_KEY = "rhythm-practice-view";
const VOICE_KEY = "rhythm-practice-voice";

/**
 * `saveResult: false` keeps the score local — saving needs a student session (a teacher previewing a lesson would be redirected).
 *  `materialId` links the saved score to the lesson it was practised in (for the teacher's practice recap).
 */
export function RhythmPractice({
  initialPatternId,
  initialBpm,
  saveResult = true,
  materialId,
  teacherPatterns = [],
}: {
  initialPatternId?: string;
  initialBpm?: number;
  saveResult?: boolean;
  materialId?: string;
  /** Rhythm blocks of the teacher's practice materials (see src/lib/rhythm-materials.ts). */
  teacherPatterns?: RhythmPattern[];
} = {}) {
  const t = useT();
  const patterns = useMemo(() => [...teacherPatterns, ...RHYTHM_PATTERNS], [teacherPatterns]);
  const [patternId, setPatternId] = useState(patterns.some((p) => p.id === initialPatternId) ? initialPatternId! : patterns[0].id);
  const [bpm, setBpm] = useState(initialBpm ?? patterns.find((p) => p.id === patternId)?.bpm ?? 80);
  const [view, setView] = useState<View>("dots");
  const [cursor, setCursor] = useState<number | null>(null);
  const viewRef = useRef<View>("dots");
  viewRef.current = view;
  // The percussion sound of the pattern and of the student's taps (the metronome keeps its click).
  const [voice, setVoice] = useState<ClickVoice>("drum");
  const voiceRef = useRef<ClickVoice>("drum");
  voiceRef.current = voice;
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "dots" || v === "staff") setView(v);
      const s = localStorage.getItem(VOICE_KEY);
      if (RHYTHM_VOICES.some((x) => x.id === s)) setVoice(s as ClickVoice);
    } catch {}
    // A teacher's pattern starts with the sound the teacher chose.
    const first = patterns.find((p) => p.id === patternId);
    if (first?.voice) setVoice(first.voice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chooseVoice = (v: ClickVoice) => {
    setVoice(v);
    try {
      localStorage.setItem(VOICE_KEY, v);
    } catch {}
    // Let the student hear the sound they picked.
    void unlockAudio().then(() => scheduleClick(audioTime() + 0.02, true, v));
  };
  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };
  const [phase, setPhase] = useState<Phase>("ready");
  const [info, setInfo] = useState("");
  const [result, setResult] = useState<{ score: number; detail: BeatResult[]; extra: number } | null>(null);
  const [tapCount, setTapCount] = useState(0);

  const pattern = patterns.find((p) => p.id === patternId) ?? patterns[0];
  const meter = pattern.meter ?? "4/4";
  // Quarter notes per bar, and the metronome step (6/8 ticks in eighths).
  const { bar, click } = METERS[meter];
  // Note values for the staff view: the teacher's own, or worked out from the onsets; padded with rests to the full length.
  const glyphs = useMemo(() => {
    const g = pattern.glyphs ?? onsetsToPattern(pattern.onset, bar);
    let beats = g.reduce((s, x) => s + NOTE_GLYPH_BEATS[x], 0);
    const out = [...g];
    while (beats < pattern.length - 1e-6) {
      const quarter = pattern.length - beats >= 1 && Math.abs(beats - Math.round(beats)) < 1e-6;
      out.push(quarter ? "rest-quarter" : "rest-eighth");
      beats += quarter ? 1 : 0.5;
    }
    return out;
  }, [pattern, bar]);
  const staffEvents = useMemo(() => glyphs.map((g) => ({ midis: isRestGlyph(g) ? null : [71], beats: NOTE_GLYPH_BEATS[g], glyph: glyphNotation(g) })), [glyphs]);
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
      if (now < tD) text = String(Math.min(bar, Math.floor((now - t0) / d) + 1));
      else if (now < tD + L * d) percent = ((now - tD) / (L * d)) * 100;
      else if (now < tC) text = "…";
      else if (now < tS) text = String(Math.min(bar, Math.floor((now - tC) / d) + 1));
      else if (now < tS + L * d) percent = ((now - tS) / (L * d)) * 100;
      setInfo((prev) => (prev === text ? prev : text));
      if (playhead.current) {
        playhead.current.style.opacity = percent >= 0 ? "1" : "0";
        if (percent >= 0) playhead.current.style.left = `${percent}%`;
      }
      if (viewRef.current === "staff") {
        const beat = percent >= 0 ? (percent / 100) * L : null;
        setCursor((prev) => (prev === beat ? prev : beat));
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
    const tD = t0 + bar * d; // start of the example (after a one-bar count-in)
    const tC = tD + L * d + d; // start of the count-in before the student's turn
    const tS = tC + bar * d; // start of the student's pattern

    for (let b = 0; b < bar - 1e-6; b += click) scheduleClick(t0 + b * d, b === 0);
    // The example, on the chosen percussion sound; the first note of each bar is accented.
    for (const o of pattern.onset) scheduleClick(tD + o * d, Math.abs(o % bar) < 1e-6, voice);
    for (let b = 0; b < bar - 1e-6; b += click) scheduleClick(tC + b * d, b === 0);
    for (let b = 0; b < L - 1e-6; b += click) scheduleClick(tS + b * d, Math.abs(b % bar) < 1e-6);
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
    setCursor(null);
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
    const name = pattern.materialId ? pattern.name : t(pattern.name);
    const r = await savePracticeResult({
      kind: "rhythm",
      title: t("Rhythm: {0} ({1} BPM)", name, bpm),
      score: h.score,
      detail: { patternId: pattern.materialId ? `teacher:${pattern.materialId}` : patternId, bpm, diffs: h.detail.map((d) => d.diffMs), extra: h.extra },
      materialId,
    });
    if (!r.ok) toast.error(r.error);
    else if (materialId && !r.data?.linked) toast.warning(PRACTICE_NOT_LINKED);
  }

  const tap = useCallback(() => {
    if (phaseRef.current !== "turn") return;
    const now = audioTime();
    const { tS, d } = schedule.current;
    scheduleClick(now + 0.005, true, voiceRef.current); // tap sound feedback
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
      <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-[1fr_11rem_12rem_auto] sm:items-end">
        <label className="text-sm font-semibold">
          {t("Rhythm pattern")}
          <Select
            value={patternId}
            onChange={(e) => {
              setPatternId(e.target.value);
              setResult(null);
              setPhaseAll("ready");
              const next = patterns.find((p) => p.id === e.target.value);
              if (next?.bpm) setBpm(next.bpm);
              if (next?.voice) setVoice(next.voice);
            }}
            disabled={activeInProgress}
            className="mt-1.5"
          >
            {teacherPatterns.length > 0 && (
              <optgroup label={t("From your teacher")}>
                {teacherPatterns.map((p) => (
                  <option key={p.id} value={p.id}>
                    {"★".repeat(p.level ?? 1)} {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            {([1, 2, 3] as const).map((level) => (
              <optgroup key={level} label={`${"★".repeat(level)} ${t(LEVEL_LABEL[level])}`}>
                {RHYTHM_PATTERNS.filter((p) => (p.level ?? 1) === level).map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(p.name)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </label>
        <label className="text-sm font-semibold">
          {t("Sound")}
          <Select value={voice} onChange={(e) => chooseVoice(e.target.value as ClickVoice)} disabled={activeInProgress} className="mt-1.5">
            {RHYTHM_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {t(v.label)}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm font-semibold">
          {t("Tempo:")} {bpm} BPM
          <input type="range" min={40} max={200} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} disabled={activeInProgress} className="mt-3 block w-full accent-[var(--primary)]" />
        </label>
        <Button size="lg" onClick={start} disabled={activeInProgress}>
          {phase === "result" ? <RotateCcw /> : <Headphones />} {phase === "result" ? t("Repeat") : t("Start")}
        </Button>
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {"★".repeat(pattern.level ?? 1)} · {t("{0} bars", Math.round(pattern.length / bar))} · {meter} · {pattern.materialId ? pattern.description : t(pattern.description)}
          </p>
          {pattern.materialId && (
            <Link href={`/student/practice/materials/${pattern.materialId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              <BookOpen className="size-4" /> {t("See the material")}
            </Link>
          )}
          <div className="inline-flex rounded-lg border bg-card p-0.5" role="radiogroup" aria-label={t("Display")}>
            {(
              [
                ["dots", CircleDot, t("Dots")],
                ["staff", Music2, t("Staff notation")],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => chooseView(v)}
                className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {view === "staff" && <ScoreView events={staffEvents} clef="rhythm" meter={meter} cursorBeat={cursor} className="my-4" />}

        {/* Pattern timeline */}
        <div className={cn("relative my-6 h-20 rounded-xl bg-muted", view === "staff" && "hidden")} aria-hidden>
          {Array.from({ length: pattern.length + 1 }, (_, b) => (
            <span key={b} className={cn("absolute top-0 h-full w-px", b % bar === 0 ? "bg-foreground/30" : "bg-foreground/10")} style={{ left: `${(b / pattern.length) * 100}%` }} />
          ))}
          {pattern.onset.map((o, i) => (
            <span
              key={i}
              className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow", pattern.length > 8 ? "size-4" : "size-6")}
              style={{ left: `${(o / pattern.length) * 100}%` }}
            />
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
