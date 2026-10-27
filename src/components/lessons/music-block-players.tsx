"use client";

/**
 * Student-side widgets for the music blocks of lessons and practice materials (see src/lib/music-blocks.ts):
 *  - SongBlockPlayer: a "Lagu Piano" block (or an old Melody block) in the full song player;
 *  - RhythmBlockPlayer: a rhythm pattern that plays at a chosen tempo, with metronome, and lets the student tap along;
 *  - ChordChips: chord / note names that sound when clicked.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Hand, Minus, Play, Plus, Square, Timer, Volume2 } from "lucide-react";
import { NoteGlyph, type NoteGlyphKind } from "@/components/lessons/note-glyph";
import { SongPlayer } from "@/components/song-player";
import { Button } from "@/components/ui/button";
import { audioTime, loadAudio, playChord, scheduleClick, unlockAudio } from "@/lib/audio";
import { chordMidis } from "@/lib/music";
import { isRestGlyph, NOTE_GLYPH_BEATS } from "@/lib/music-blocks";
import type { Song, SongNote } from "@/lib/songs";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/* ---------------------------------- song ---------------------------------- */

export function SongBlockPlayer({ id, title, bpm, doMidi, notes }: { id: string; title?: string; bpm: number; doMidi?: number; notes: SongNote[] }) {
  const t = useT();
  // `id` is a hash of the notes, so a re-render with equal notes keeps the player (and its progress) as it is.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const song = useMemo<Song>(() => ({ id, title: title ?? "", level: 1, bpm, notes, doMidi }), [id, title, bpm, doMidi]);
  if (!notes.length) return <p className="text-sm text-muted-foreground">{t("The song has no notes yet.")}</p>;
  return <SongPlayer songs={[song]} saveScores={false} />;
}

/* --------------------------------- rhythm --------------------------------- */

const COUNT_IN = 4;

/** Glyph start beats, sounding onsets, and total length of a pattern. */
function layout(pattern: NoteGlyphKind[]) {
  let beat = 0;
  const starts: number[] = [];
  const onsets: number[] = [];
  for (const g of pattern) {
    starts.push(beat);
    if (!isRestGlyph(g)) onsets.push(beat);
    beat += NOTE_GLYPH_BEATS[g];
  }
  return { starts, onsets, total: beat };
}

/**
 * Plays a rhythm pattern after a one-bar count-in, highlighting each note as it sounds. The student can tap along
 *  (button, or Space / Enter while the player has focus); taps are matched to the notes and scored at the end.
 */
export function RhythmBlockPlayer({ pattern }: { pattern: NoteGlyphKind[] }) {
  const t = useT();
  const [bpm, setBpm] = useState(80);
  const [metronome, setMetronome] = useState(true);
  const [sound, setSound] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [tapFlash, setTapFlash] = useState(false);
  const [result, setResult] = useState<{ hit: number; total: number; extra: number } | null>(null);
  const run = useRef<{ t0: number; spb: number; taps: number[]; raf: number; timer: ReturnType<typeof setInterval> } | null>(null);
  const { starts, onsets, total } = useMemo(() => layout(pattern), [pattern]);

  useEffect(() => {
    void loadAudio();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stop() {
    const r = run.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    clearInterval(r.timer);
    run.current = null;
    setPlaying(false);
    setCount(null);
    setActive(null);
  }

  function score(r: NonNullable<typeof run.current>) {
    if (!r.taps.length) return setResult(null);
    const tol = Math.min(0.15, r.spb * 0.3);
    const used = new Set<number>();
    let hit = 0;
    for (const o of onsets) {
      const at = r.t0 + o * r.spb;
      let best = -1;
      r.taps.forEach((tap, i) => {
        if (!used.has(i) && Math.abs(tap - at) <= tol && (best < 0 || Math.abs(tap - at) < Math.abs(r.taps[best] - at))) best = i;
      });
      if (best >= 0) {
        used.add(best);
        hit++;
      }
    }
    setResult({ hit, total: onsets.length, extra: r.taps.length - used.size });
  }

  async function play() {
    stop();
    setResult(null);
    await unlockAudio();
    const spb = 60 / bpm;
    const t0 = audioTime() + 0.15 + COUNT_IN * spb;
    // Every click in time order (the scheduler below walks them once).
    const events: { at: number; accent: boolean; voice: "click" | "kentongan" }[] = [];
    for (let i = 0; i < COUNT_IN; i++) events.push({ at: t0 - (COUNT_IN - i) * spb, accent: i === 0, voice: "click" });
    if (metronome) for (let b = 0; b < Math.ceil(total); b++) events.push({ at: t0 + b * spb, accent: b % 4 === 0, voice: "click" });
    if (sound) for (const o of onsets) events.push({ at: t0 + o * spb, accent: true, voice: "kentongan" });
    events.sort((a, b) => a.at - b.at);
    let next = 0;
    const timer = setInterval(() => {
      while (next < events.length && events[next].at < audioTime() + 0.15) {
        const e = events[next++];
        scheduleClick(e.at, e.accent, e.voice);
      }
    }, 25);
    const r = { t0, spb, taps: [] as number[], raf: 0, timer };
    run.current = r;
    setPlaying(true);
    const tick = () => {
      if (run.current !== r) return;
      const beat = (audioTime() - t0) / spb;
      setCount(beat < 0 ? Math.min(COUNT_IN, Math.floor(beat) + COUNT_IN + 1) : null);
      let idx: number | null = null;
      starts.forEach((s, i) => {
        if (beat >= s && beat < s + NOTE_GLYPH_BEATS[pattern[i]]) idx = i;
      });
      setActive(idx);
      if (beat > total + 0.5) {
        stop();
        score(r);
        return;
      }
      r.raf = requestAnimationFrame(tick);
    };
    r.raf = requestAnimationFrame(tick);
  }

  function tap() {
    const r = run.current;
    if (!r) return;
    r.taps.push(audioTime());
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 120);
  }

  if (!pattern.length) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <div
      className="grid gap-3 outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (playing && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          tap();
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-1.5">
        {pattern.map((g, i) => (
          <span key={i} className={cn("rounded-md p-1 transition-colors", active === i && (isRestGlyph(g) ? "bg-muted" : "bg-primary text-primary-foreground"))}>
            <NoteGlyph kind={g} className="size-8" />
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => (playing ? stop() : void play())}>
          {playing ? <Square /> : <Play />} {playing ? t("Stop") : t("Play")}
        </Button>
        <div className="inline-flex items-center gap-1 rounded-lg border p-0.5" role="group" aria-label={t("Tempo")}>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("Slower")} disabled={playing || bpm <= 40} onClick={() => setBpm((b) => b - 5)}>
            <Minus />
          </Button>
          <span className="min-w-16 text-center text-sm font-semibold">{bpm} BPM</span>
          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("Faster")} disabled={playing || bpm >= 180} onClick={() => setBpm((b) => b + 5)}>
            <Plus />
          </Button>
        </div>
        <Button type="button" size="sm" variant={metronome ? "secondary" : "outline"} aria-pressed={metronome} disabled={playing} onClick={() => setMetronome((x) => !x)}>
          <Timer /> {t("Metronome")}
        </Button>
        <label className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <input type="checkbox" checked={sound} disabled={playing} onChange={(e) => setSound(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          {t("Play the pattern")}
        </label>
        {count !== null && <span className="text-sm font-bold text-primary">{t("Count: {0}", count)}</span>}
      </div>
      {playing && (
        <Button
          type="button"
          variant="outline"
          className={cn("h-14 text-base", tapFlash && "border-primary bg-primary-soft")}
          onPointerDown={(e) => {
            e.preventDefault();
            tap();
          }}
        >
          <Hand /> {t("Tap here along with the rhythm (or Space)")}
        </Button>
      )}
      {result && (
        <p className="text-sm font-semibold">
          {t("{0} of {1} taps on time", result.hit, result.total)}
          {result.extra > 0 && ` · ${t("{0} extra taps", result.extra)}`}
        </p>
      )}
    </div>
  );
}

/* --------------------------------- chords --------------------------------- */

export function ChordChips({ label, items }: { label?: string; items: string[] }) {
  const t = useT();
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  return (
    <>
      <span className="text-sm font-semibold">{label ?? t("Chords / notes")}:</span>
      {items.length === 0 ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        items.map((item, i) => {
          const midis = chordMidis(item);
          if (!midis) {
            return (
              <span key={i} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold">
                {item}
              </span>
            );
          }
          return (
            <button
              key={i}
              type="button"
              title={t("Click to hear it")}
              onClick={() => {
                playChord(midis);
                setPlayingIdx(i);
                setTimeout(() => setPlayingIdx((x) => (x === i ? null : x)), 600);
              }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold transition-colors hover:bg-primary hover:text-primary-foreground",
                playingIdx === i && "bg-primary text-primary-foreground",
              )}
            >
              <Volume2 className="size-3" /> {item}
            </button>
          );
        })
      )}
    </>
  );
}
