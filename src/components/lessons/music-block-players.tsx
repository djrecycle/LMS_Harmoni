"use client";

/**
 * Widgets for the music blocks of lessons and practice materials (see src/lib/music-blocks.ts), shared by the
 * students' view and the teacher's block editor:
 *  - SongBlockPlayer: a "Lagu Piano" block (or an old Melody block) in the full song player;
 *  - RhythmBlockPlayer: a rhythm on a percussion staff that plays at a tempo, with metronome, and lets the student tap along;
 *  - ChordBlockPlayer: a chord progression on a staff that plays at a tempo; each chord can be clicked to hear it;
 *  - useTransport, TempoControl, MetronomeButton: the count-in / metronome / play cursor they share.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, Minus, Play, Plus, Square, Timer, Volume2 } from "lucide-react";
import { ScoreView, totalBeats, type ScoreEvent } from "@/components/score-view";
import { SongPlayer } from "@/components/song-player";
import { Button } from "@/components/ui/button";
import { audioTime, loadAudio, playChord, scheduleClick, scheduleNote, unlockAudio } from "@/lib/audio";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";
import { chordMidis } from "@/lib/music";
import { CHORDS_DEFAULT_BPM, isRestGlyph, METERS, NOTE_GLYPH_BEATS, RHYTHM_DEFAULT_BPM, type Meter } from "@/lib/music-blocks";
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

/* -------------------------------- transport -------------------------------- */

export type TransportRun = { t0: number; spb: number };

/**
 * Plays scheduled sounds on a beat grid: an optional count-in, metronome clicks, and `sounds` (each gets the exact
 *  audio time to start at). `beat` follows the music for a play cursor (negative during the count-in, null when stopped).
 */
export function useTransport() {
  const [beat, setBeat] = useState<number | null>(null);
  const run = useRef<(TransportRun & { raf: number; timer: ReturnType<typeof setInterval> }) | null>(null);

  const stop = useCallback(() => {
    const r = run.current;
    if (r) {
      cancelAnimationFrame(r.raf);
      clearInterval(r.timer);
    }
    run.current = null;
    setBeat(null);
  }, []);

  useEffect(() => {
    void loadAudio();
    return () => {
      const r = run.current;
      if (r) {
        cancelAnimationFrame(r.raf);
        clearInterval(r.timer);
      }
    };
  }, []);

  /**
   * `meter` sets the bar for accents (and the click step: 6/8 ticks in eighths); `countIn` is in bars (0 or 1).
   */
  async function start(o: {
    bpm: number;
    meter?: Meter;
    countIn: number;
    total: number;
    metronome: boolean;
    sounds: { beat: number; play: (time: number, spb: number) => void }[];
    onEnd?: (r: TransportRun) => void;
  }) {
    stop();
    await unlockAudio();
    const { bar, click } = METERS[o.meter ?? "4/4"];
    const lead = o.countIn * bar;
    const spb = 60 / o.bpm;
    const t0 = audioTime() + 0.15 + lead * spb;
    const events: { at: number; fn: (time: number) => void }[] = [];
    // Count-in clicks always; metronome clicks during the music when on. Accent on each bar's first beat.
    for (let b = -lead; b < o.total - 1e-6; b += click) {
      if (b >= 0 && !o.metronome) break;
      const accent = Math.abs(((b % bar) + bar) % bar) < 1e-6;
      events.push({ at: t0 + b * spb, fn: (time) => scheduleClick(time, accent, "click") });
    }
    for (const s of o.sounds) events.push({ at: t0 + s.beat * spb, fn: (time) => s.play(time, spb) });
    events.sort((a, b) => a.at - b.at);
    let next = 0;
    const timer = setInterval(() => {
      while (next < events.length && events[next].at < audioTime() + 0.15) {
        const e = events[next++];
        e.fn(e.at);
      }
    }, 25);
    const r = { t0, spb, raf: 0, timer };
    run.current = r;
    setBeat(-lead);
    const tick = () => {
      if (run.current !== r) return;
      const b = (audioTime() - t0) / spb;
      setBeat(b);
      if (b > o.total + 0.3) {
        stop();
        o.onEnd?.(r);
        return;
      }
      r.raf = requestAnimationFrame(tick);
    };
    r.raf = requestAnimationFrame(tick);
  }

  return { beat, playing: beat !== null, start, stop, current: () => run.current as TransportRun | null };
}

export function TempoControl({ bpm, onChange, disabled }: { bpm: number; onChange: (bpm: number) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border p-0.5" role="group" aria-label={t("Tempo")}>
      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("Slower")} disabled={disabled || bpm <= 40} onClick={() => onChange(Math.max(40, bpm - 5))}>
        <Minus />
      </Button>
      <span className="min-w-[4.5rem] text-center text-sm font-semibold">
        {t("Tempo")} {bpm}
      </span>
      <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("Faster")} disabled={disabled || bpm >= 200} onClick={() => onChange(Math.min(200, bpm + 5))}>
        <Plus />
      </Button>
    </div>
  );
}

export function MetronomeButton({ on, onChange, disabled }: { on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <Button type="button" size="sm" variant={on ? "secondary" : "outline"} aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)}>
      <Timer /> {t("Metronome")}
    </Button>
  );
}

/** "Count: 3" during the one-bar count-in. */
export function CountIn({ beat, meter = "4/4" }: { beat: number | null; meter?: Meter }) {
  const t = useT();
  if (beat === null || beat >= 0) return null;
  const bar = METERS[meter].bar;
  return <span className="text-sm font-bold text-primary">{t("Count: {0}", Math.min(bar, Math.floor(beat) + bar + 1))}</span>;
}

/** Time signature picker (sukat). */
export function MeterSelect({ value, onChange, disabled }: { value: Meter; onChange: (m: Meter) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <label className="inline-flex items-center gap-1.5 text-sm font-semibold">
      {t("Time signature")}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Meter)}
        className="h-9 rounded-lg border bg-card px-2 text-sm"
        aria-label={t("Time signature")}
      >
        {(Object.keys(METERS) as Meter[]).map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </label>
  );
}

/* --------------------------------- rhythm --------------------------------- */

const RHYTHM_PITCH = 71; // any pitch: drawn on a one-line percussion staff

export function rhythmEvents(pattern: NoteGlyphKind[]): ScoreEvent[] {
  return pattern.map((g) => ({ midis: isRestGlyph(g) ? null : [RHYTHM_PITCH], beats: NOTE_GLYPH_BEATS[g] }));
}

export function rhythmOnsetBeats(pattern: NoteGlyphKind[]): number[] {
  const out: number[] = [];
  let beat = 0;
  for (const g of pattern) {
    if (!isRestGlyph(g)) out.push(beat);
    beat += NOTE_GLYPH_BEATS[g];
  }
  return out;
}

/** Matches taps (audio times) to the notes; a tap counts within 0.15 s (or 0.3 beat if shorter). */
function scoreTaps(taps: number[], onsets: number[], r: TransportRun) {
  const tol = Math.min(0.15, r.spb * 0.3);
  const used = new Set<number>();
  let hit = 0;
  for (const o of onsets) {
    const at = r.t0 + o * r.spb;
    let best = -1;
    taps.forEach((tap, i) => {
      if (!used.has(i) && Math.abs(tap - at) <= tol && (best < 0 || Math.abs(tap - at) < Math.abs(taps[best] - at))) best = i;
    });
    if (best >= 0) {
      used.add(best);
      hit++;
    }
  }
  return { hit, total: onsets.length, extra: taps.length - used.size };
}

/**
 * Plays a rhythm pattern after a one-bar count-in, with a cursor over the staff. The student can tap along
 *  (button, or Space / Enter while the player has focus); taps are matched to the notes and scored at the end.
 */
export function RhythmBlockPlayer({ pattern, bpm = RHYTHM_DEFAULT_BPM, meter = "4/4" }: { pattern: NoteGlyphKind[]; bpm?: number; meter?: Meter }) {
  const t = useT();
  const [tempo, setTempo] = useState(bpm);
  const [metronome, setMetronome] = useState(true);
  const [sound, setSound] = useState(true);
  const [tapFlash, setTapFlash] = useState(false);
  const [result, setResult] = useState<{ hit: number; total: number; extra: number } | null>(null);
  const taps = useRef<number[]>([]);
  const tr = useTransport();
  const events = useMemo(() => rhythmEvents(pattern), [pattern]);
  const onsets = useMemo(() => rhythmOnsetBeats(pattern), [pattern]);
  const total = totalBeats(events);

  function play() {
    setResult(null);
    taps.current = [];
    void tr.start({
      bpm: tempo,
      meter,
      countIn: 1,
      total,
      metronome,
      sounds: sound ? onsets.map((o) => ({ beat: o, play: (time: number) => scheduleClick(time, true, "kentongan") })) : [],
      onEnd: (r) => setResult(taps.current.length ? scoreTaps(taps.current, onsets, r) : null),
    });
  }

  function tap() {
    if (!tr.playing) return;
    taps.current.push(audioTime());
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 120);
  }

  if (!pattern.length) return <span className="text-sm text-muted-foreground">—</span>;

  return (
    <div
      className="grid gap-3 outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (tr.playing && (e.key === " " || e.key === "Enter")) {
          e.preventDefault();
          tap();
        }
      }}
    >
      <ScoreView events={events} clef="percussion" meter={meter} cursorBeat={tr.beat !== null && tr.beat >= 0 ? tr.beat : null} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => (tr.playing ? tr.stop() : play())}>
          {tr.playing ? <Square /> : <Play />} {tr.playing ? t("Stop") : t("Play")}
        </Button>
        <TempoControl bpm={tempo} onChange={setTempo} disabled={tr.playing} />
        <MetronomeButton on={metronome} onChange={setMetronome} disabled={tr.playing} />
        <label className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <input type="checkbox" checked={sound} disabled={tr.playing} onChange={(e) => setSound(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          {t("Play the pattern")}
        </label>
        <CountIn beat={tr.beat} meter={meter} />
      </div>
      {tr.playing && (
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

export function chordEvents(items: string[], beats: number[]): ScoreEvent[] {
  return items.map((item, i) => ({ midis: chordMidis(item), beats: beats[i] ?? 4, label: item }));
}

/** Index of the event sounding at `beat`, or null. */
export function activeEvent(events: ScoreEvent[], beat: number | null) {
  if (beat === null || beat < 0) return null;
  let pos = 0;
  for (let i = 0; i < events.length; i++) {
    if (beat >= pos && beat < pos + events[i].beats) return i;
    pos += events[i].beats;
  }
  return null;
}

/** Plays every chord of the progression at its time (piano sound). */
export function chordSounds(events: ScoreEvent[]) {
  let pos = 0;
  return events.flatMap((e) => {
    const start = pos;
    pos += e.beats;
    const midis = e.midis;
    if (!midis?.length) return [];
    return [{ beat: start, play: (time: number, spb: number) => midis.forEach((m) => scheduleNote(m, time, e.beats * spb * 0.95, 0.7)) }];
  });
}

/** Chord / note names; each sounds when clicked, and lights up while the progression plays. */
export function ChordChipRow({ items, active }: { items: string[]; active?: number | null }) {
  const t = useT();
  const [clicked, setClicked] = useState<number | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item, i) => {
        const midis = chordMidis(item);
        const on = active === i || clicked === i;
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
              setClicked(i);
              setTimeout(() => setClicked((x) => (x === i ? null : x)), 600);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold transition-colors hover:bg-primary hover:text-primary-foreground",
              on && "bg-primary text-primary-foreground",
            )}
          >
            <Volume2 className="size-3" /> {item}
          </button>
        );
      })}
    </div>
  );
}

export function ChordBlockPlayer({
  label,
  items,
  beats,
  bpm = CHORDS_DEFAULT_BPM,
  meter = "4/4",
}: {
  label?: string;
  items: string[];
  beats?: number[];
  bpm?: number;
  meter?: Meter;
}) {
  const t = useT();
  const [tempo, setTempo] = useState(bpm);
  const [metronome, setMetronome] = useState(true);
  const tr = useTransport();
  const events = useMemo(() => chordEvents(items, beats ?? []), [items, beats]);
  const playable = events.some((e) => e.midis?.length);

  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold">{label || t("Chords / notes")}</p>
      {items.length === 0 ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        <>
          {playable && <ScoreView events={events} meter={meter} cursorBeat={tr.beat !== null && tr.beat >= 0 ? tr.beat : null} />}
          <ChordChipRow items={items} active={activeEvent(events, tr.beat)} />
          {playable && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  tr.playing ? tr.stop() : void tr.start({ bpm: tempo, meter, countIn: metronome ? 1 : 0, total: totalBeats(events), metronome, sounds: chordSounds(events) })
                }
              >
                {tr.playing ? <Square /> : <Play />} {tr.playing ? t("Stop") : t("Play")}
              </Button>
              <TempoControl bpm={tempo} onChange={setTempo} disabled={tr.playing} />
              <MetronomeButton on={metronome} onChange={setMetronome} disabled={tr.playing} />
              <CountIn beat={tr.beat} meter={meter} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
