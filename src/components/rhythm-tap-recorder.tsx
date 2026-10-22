"use client";

import { useEffect, useRef, useState } from "react";
import { Hand, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { audioLatency, audioTime, loadAudio, scheduleClick, unlockAudio, type ClickVoice } from "@/lib/audio";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";
import { rhythmFromTaps } from "@/lib/rhythm";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const COUNT_IN = 4;
const MAX_BEATS = 16;

type Phase = "idle" | "count-in" | "recording";

/**
 * Record a rhythm by tapping: a 4-click count-in at `bpm`, then the metronome keeps going while the teacher taps
 *  (button or space bar). Taps are snapped to half beats and handed back as a glyph list.
 */
export function RhythmTapRecorder({ bpm, voice, onRecorded }: { bpm: number; voice: ClickVoice; onRecorded: (pattern: NoteGlyphKind[] | null) => void }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("idle");
  const [beat, setBeat] = useState(0); // count-in: 1..4, recording: 1..16
  const [taps, setTaps] = useState(0);
  const run = useRef<{ start: number; spb: number; onsets: number[]; timers: ReturnType<typeof setTimeout>[]; loop: ReturnType<typeof setInterval> | null } | null>(null);
  const finishRef = useRef<() => void>(() => {});

  function cleanup() {
    const r = run.current;
    if (!r) return;
    if (r.loop) clearInterval(r.loop);
    r.timers.forEach(clearTimeout);
    run.current = null;
  }
  useEffect(() => cleanup, []);

  function finish() {
    const r = run.current;
    if (!r) return;
    cleanup();
    setPhase("idle");
    setBeat(0);
    onRecorded(r.onsets.length ? rhythmFromTaps(r.onsets) : null);
  }
  finishRef.current = finish;

  async function startRecording() {
    cleanup();
    await unlockAudio();
    await loadAudio();
    const spb = 60 / Math.max(30, Math.min(220, bpm));
    const first = audioTime() + 0.15;
    const r = { start: first + COUNT_IN * spb, spb, onsets: [] as number[], timers: [] as ReturnType<typeof setTimeout>[], loop: null as ReturnType<typeof setInterval> | null };
    run.current = r;
    setTaps(0);
    setPhase("count-in");
    setBeat(1);
    // Look-ahead click scheduling: count-in, then the guide metronome until 16 beats are done.
    let next = 0;
    r.loop = setInterval(() => {
      while (next < COUNT_IN + MAX_BEATS && first + next * spb < audioTime() + 0.15) {
        const idx = next;
        const at = first + idx * spb;
        scheduleClick(at, idx % 4 === 0, "click");
        r.timers.push(
          setTimeout(() => {
            if (run.current !== r) return;
            if (idx < COUNT_IN) setBeat(idx + 1);
            else {
              setPhase("recording");
              setBeat(idx - COUNT_IN + 1);
            }
          }, Math.max(0, (at - audioTime()) * 1000)),
        );
        next++;
      }
      if (next >= COUNT_IN + MAX_BEATS && audioTime() > r.start + MAX_BEATS * r.spb) finishRef.current();
    }, 25);
  }

  function tap() {
    const r = run.current;
    if (!r) return;
    const now = audioTime();
    scheduleClick(now, false, voice);
    r.onsets.push((now - audioLatency() - r.start) / r.spb);
    setTaps((n) => n + 1);
  }

  // Space bar taps while recording.
  useEffect(() => {
    if (phase === "idle") return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      tap();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  return (
    <div className="grid gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {phase === "idle" ? (
          <Button variant="secondary" size="sm" onClick={startRecording}>
            <Mic /> {t("Record by tapping")}
          </Button>
        ) : (
          <Button variant="danger-soft" size="sm" onClick={finish}>
            <Square /> {t("Done")}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {phase === "count-in"
            ? t("Get ready… {0}", COUNT_IN - beat + 1)
            : phase === "recording"
              ? t("Beat {0} of {1} · {2} taps", beat, MAX_BEATS, taps)
              : t("After 4 count-in clicks, tap along with the metronome (button or space bar). Taps snap to half beats.")}
        </span>
      </div>
      {phase !== "idle" && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            tap();
          }}
          className={cn(
            "flex h-28 w-full select-none items-center justify-center gap-2 rounded-xl border-2 text-lg font-bold transition-colors active:translate-y-px active:bg-primary active:text-primary-foreground",
            phase === "recording" ? "border-primary bg-primary-soft text-primary" : "border-dashed text-muted-foreground",
          )}
        >
          <Hand className="size-6" /> {t("TAP")}
        </button>
      )}
    </div>
  );
}
