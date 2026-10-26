"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Headphones, Pause, Play, RotateCcw, Usb } from "lucide-react";
import { toast } from "sonner";
import { savePracticeResult } from "@/app/actions/practice";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { loadAudio, noteOff, noteOn, scheduleNote, stopAllNotes, unlockAudio, audioTime } from "@/lib/audio";
import { isBlackKey, midiToNote, solfegeOf } from "@/lib/music";
import type { SongDetail } from "@/lib/practice";
import { SONGS, songLength, type Song } from "@/lib/songs";
import { useMidi } from "@/lib/use-midi";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Mode = "play" | "listen";
type Labels = "letter" | "solfege" | "none";

/** Beats visible above the hit line. */
const VISIBLE_BEATS = 4;
/** The song starts this many beats early so the first note falls in from the top. */
const LEAD_IN = VISIBLE_BEATS;
/** How early (in beats) a key press still counts for the next note. */
const EARLY_WINDOW = 0.5;
const SPEEDS = [0.5, 0.75, 1] as const;

const WHITE_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"];
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
const BLACK_KEY_MAP: Record<string, number> = { w: 1, e: 3, t: 6, y: 8, u: 10, o: 13, p: 15, "]": 18 };

/** Whole octaves around the song: from the C below its lowest note to the C above its highest. */
function keyRange(song: Song) {
  const lo = Math.min(...song.notes.map((n) => n.midi));
  const hi = Math.max(...song.notes.map((n) => n.midi));
  const first = Math.floor(lo / 12) * 12;
  const last = Math.max(first + 12, Math.ceil((hi + 1) / 12) * 12);
  const white: number[] = [];
  for (let m = first; m <= last; m++) if (!isBlackKey(m)) white.push(m);
  return { first, last, white };
}

type KeyState = { target: number[]; sounding: number[]; good: number[]; bad: number[] };
const EMPTY_KEYS: KeyState = { target: [], sounding: [], good: [], bad: [] };

/**
 * "Play a song" mode: notes fall toward the keyboard (like Synthesia).
 *  - play: the song waits at each note until the student presses the right key.
 *  - listen: the song plays by itself and the keys light up.
 */
/** `computerKeys`: play with the laptop keyboard (off when another piano on the page uses it). */
export function SongPlayer({ songs = SONGS, saveScores = true, computerKeys = true }: { songs?: Song[]; saveScores?: boolean; computerKeys?: boolean }) {
  const t = useT();
  const [songId, setSongId] = useState(songs[0].id);
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const [mode, setMode] = useState<Mode>("play");
  const [speed, setSpeed] = useState<number>(0.75);
  const [labels, setLabels] = useState<Labels>("letter");
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState({ hit: 0, wrong: 0 });
  const [keys, setKeys] = useState<KeyState>(EMPTY_KEYS);
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const range = useMemo(() => keyRange(song), [song]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Mutable game state read by the animation loop (no re-render per frame).
  const g = useRef({
    time: -LEAD_IN,
    playing: false,
    hit: new Set<number>(),
    nextSound: 0,
    wrong: 0,
    flash: new Map<number, { ok: boolean; until: number }>(),
    keySig: "",
  });
  const settings = useRef({ song, mode, speed, labels, range, saveScores });
  settings.current = { song, mode, speed, labels, range, saveScores };

  useEffect(() => {
    void loadAudio();
    return () => stopAllNotes();
  }, []);

  const reset = useCallback(() => {
    const s = g.current;
    s.time = -LEAD_IN;
    s.playing = false;
    s.hit = new Set();
    s.nextSound = 0;
    s.wrong = 0;
    s.flash.clear();
    setPlaying(false);
    setFinished(false);
    setSaved("idle");
    setScore({ hit: 0, wrong: 0 });
    stopAllNotes();
  }, []);

  // A new song (or a changed melody in the teacher's preview) or mode starts over.
  useEffect(() => reset(), [song, mode, reset]);

  const togglePlay = async () => {
    await unlockAudio();
    if (finished) reset();
    const next = !g.current.playing;
    g.current.playing = next;
    setPlaying(next);
    if (!next) stopAllNotes();
  };

  /** Called once when a song ends: in "play" mode the score goes to the student's practice history. */
  const onFinish = async () => {
    const s = g.current;
    const { song, mode, speed, saveScores } = settings.current;
    if (!saveScores || mode !== "play" || s.hit.size < song.notes.length) return;
    const score = Math.round((s.hit.size / (s.hit.size + s.wrong)) * 100);
    const detail: SongDetail = { songId: song.id, speed, notesTotal: song.notes.length, wrong: s.wrong };
    setSaved("saving");
    const r = await savePracticeResult({ kind: "song", title: t("Song: {0} (speed {1}%)", t(song.title), Math.round(speed * 100)), score, detail });
    setSaved(r.ok ? "saved" : "error");
    if (!r.ok) toast.error(r.error);
  };
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  /* ---------------- Key presses (screen, computer keyboard, MIDI) ---------------- */

  const judge = useCallback((midi: number) => {
    const s = g.current;
    const { song, mode } = settings.current;
    if (!s.playing || mode !== "play") return;
    const idx = song.notes.findIndex((n, i) => !s.hit.has(i) && n.midi === midi && n.start - s.time <= EARLY_WINDOW && n.start + n.beats > s.time - 0.25);
    const now = performance.now();
    if (idx >= 0) {
      s.hit.add(idx);
      s.flash.set(midi, { ok: true, until: now + 250 });
    } else {
      s.wrong++;
      s.flash.set(midi, { ok: false, until: now + 300 });
    }
    setScore({ hit: s.hit.size, wrong: s.wrong });
  }, []);

  const sources = useRef(new Map<string, number>());
  const press = useCallback(
    (source: string, midi: number, velocity = 0.85) => {
      const current = sources.current.get(source);
      if (current === midi) return;
      if (current !== undefined) noteOff(current);
      sources.current.set(source, midi);
      setPressed(new Set(sources.current.values()));
      noteOn(midi, velocity);
      judge(midi);
    },
    [judge],
  );
  const release = useCallback((source: string) => {
    const midi = sources.current.get(source);
    if (midi === undefined) return;
    sources.current.delete(source);
    setPressed(new Set(sources.current.values()));
    noteOff(midi);
  }, []);

  useEffect(() => {
    if (!computerKeys) return;
    const notTyping = (el: EventTarget | null) => !(el instanceof HTMLElement) || (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable);
    const keyToMidi = (k: string): number | null => {
      const base = settings.current.range.first;
      const w = WHITE_KEYS.indexOf(k);
      if (w >= 0) return base + WHITE_OFFSETS[w];
      if (k in BLACK_KEY_MAP) return base + BLACK_KEY_MAP[k];
      return null;
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !notTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === " ") {
        e.preventDefault();
        void togglePlayRef.current();
        return;
      }
      const m = keyToMidi(k);
      if (m === null) return;
      e.preventDefault();
      void unlockAudio();
      press(`kb:${k}`, m);
    };
    const up = (e: KeyboardEvent) => release(`kb:${e.key.toLowerCase()}`);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [press, release, computerKeys]);
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;

  const midi = useMidi(
    (n, v) => press(`midi:${n}`, n, 0.4 + v * 0.6),
    (n) => release(`midi:${n}`),
  );

  /* ---------------- Canvas size ---------------- */

  useLayoutEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const measure = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(box.clientWidth * dpr);
      canvas.height = Math.round(box.clientHeight * dpr);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  /* ---------------- Animation loop ---------------- */

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = g.current;
      const { song, mode, speed, labels, range } = settings.current;
      const beatsPerSec = (song.bpm / 60) * speed;
      const end = songLength(song);

      if (s.playing) {
        let next = s.time + dt * beatsPerSec;
        if (mode === "play") {
          // Wait at the first note that has not been played yet.
          const waiting = song.notes.find((n, i) => !s.hit.has(i) && n.start <= next);
          if (waiting) next = Math.max(s.time, waiting.start);
        } else {
          while (s.nextSound < song.notes.length && song.notes[s.nextSound].start <= next) {
            const n = song.notes[s.nextSound];
            if (n.start >= s.time) scheduleNote(n.midi, audioTime() + 0.01, (n.beats / beatsPerSec) * 0.92, 0.75);
            s.nextSound++;
          }
        }
        s.time = next;
        if (s.time > end + 1) {
          s.playing = false;
          setPlaying(false);
          setFinished(true);
          void onFinishRef.current();
        }
      }

      // Keys to light up on the keyboard.
      const target: number[] = [];
      const sounding: number[] = [];
      song.notes.forEach((n, i) => {
        if (mode === "play" && !s.hit.has(i) && n.start <= s.time + 0.001 && s.time >= 0) target.push(n.midi);
        if (mode === "listen" && n.start <= s.time && s.time < n.start + n.beats) sounding.push(n.midi);
      });
      const good: number[] = [];
      const bad: number[] = [];
      s.flash.forEach((f, m) => {
        if (f.until < now) s.flash.delete(m);
        else (f.ok ? good : bad).push(m);
      });
      const sig = `${target}|${sounding}|${good}|${bad}`;
      if (sig !== s.keySig) {
        s.keySig = sig;
        setKeys({ target, sounding, good, bad });
      }
      if (progressRef.current) progressRef.current.style.width = `${Math.max(0, Math.min(100, (s.time / end) * 100))}%`;

      draw(canvasRef.current, song, range.white, s.time, s.hit, mode, labels);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---------------- Keyboard layout ---------------- */

  const whiteCount = range.white.length;
  const wPct = 100 / whiteCount;
  const black: { midi: number; position: number }[] = [];
  range.white.forEach((m, i) => {
    if (m < range.last && isBlackKey(m + 1)) black.push({ midi: m + 1, position: i + 1 });
  });

  const targetSet = new Set(keys.target);
  const soundingSet = new Set(keys.sounding);
  const goodSet = new Set(keys.good);
  const badSet = new Set(keys.bad);
  const tone = (m: number, blackKey: boolean) => {
    if (badSet.has(m)) return "!bg-danger";
    if (goodSet.has(m)) return "!bg-success";
    if (targetSet.has(m)) return blackKey ? "!bg-amber-500" : "!bg-amber-200";
    if (soundingSet.has(m) || pressed.has(m)) return blackKey ? "!bg-primary" : "!bg-primary-soft";
    return "";
  };

  const handlers = (m: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      void unlockAudio();
      press(`p:${e.pointerId}`, m);
    },
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.buttons === 1 || e.pointerType === "touch") press(`p:${e.pointerId}`, m);
    },
    onPointerUp: (e: React.PointerEvent) => release(`p:${e.pointerId}`),
    onPointerCancel: (e: React.PointerEvent) => release(`p:${e.pointerId}`),
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") release(`p:${e.pointerId}`);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const total = song.notes.length;
  const accuracy = score.hit + score.wrong > 0 ? Math.round((score.hit / (score.hit + score.wrong)) * 100) : 0;

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-1 text-sm font-semibold">
          {t("Song")}
          <Select value={song.id} onChange={(e) => setSongId(e.target.value)}>
            {[
              { label: t("Songs from your teacher"), list: songs.filter((s) => s.custom) },
              { label: t("Practice songs"), list: songs.filter((s) => !s.custom && !s.origin) },
              { label: t("Indonesian folk songs"), list: songs.filter((s) => !s.custom && s.origin) },
            ]
              .filter((g) => g.list.length)
              .map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.list.map((s) => (
                    <option key={s.id} value={s.id}>
                      {"★".repeat(s.level)} {t(s.title)}
                      {s.origin ? ` (${s.origin})` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
          </Select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-card p-0.5" role="radiogroup" aria-label={t("Mode")}>
            {(
              [
                ["play", t("Play it")],
                ["listen", t("Listen")],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("h-9 rounded-md px-3 text-sm font-semibold transition-colors", mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {label}
              </button>
            ))}
          </div>
          <Select aria-label={t("Speed")} className="h-10 w-auto" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((v) => (
              <option key={v} value={v}>
                {t("Speed")} {Math.round(v * 100)}%
              </option>
            ))}
          </Select>
          <Select aria-label={t("Note names")} className="h-10 w-auto" value={labels} onChange={(e) => setLabels(e.target.value as Labels)}>
            <option value="letter">C D E</option>
            <option value="solfege">do re mi</option>
            <option value="none">{t("No names")}</option>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-neutral-900 shadow-inner">
        <div ref={boxRef} className="relative h-64 w-full sm:h-80">
          <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
          {!playing && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 p-4 text-center text-white">
              {finished ? (
                <div className="grid gap-2">
                  <p className="text-xl font-bold">{t("Song finished!")}</p>
                  {mode === "play" && (
                    <p className="text-sm">
                      {t("{0} of {1} notes correct · {2} wrong keys · accuracy {3}%", score.hit, total, score.wrong, accuracy)}
                    </p>
                  )}
                  {saved === "saving" && <p className="text-xs text-white/80">{t("Saving score…")}</p>}
                  {saved === "saved" && (
                    <p className="inline-flex items-center justify-center gap-1 text-xs text-white/80">
                      <Check className="size-3.5" /> {t("Score saved to your practice history.")}
                    </p>
                  )}
                  <Button onClick={togglePlay} className="mx-auto">
                    <RotateCcw /> {t("Play again")}
                  </Button>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Button size="lg" onClick={togglePlay} className="mx-auto">
                    {mode === "listen" ? <Headphones /> : <Play />} {g.current.time > -LEAD_IN ? t("Continue") : mode === "listen" ? t("Listen to the song") : t("Start")}
                  </Button>
                  <p className="max-w-sm text-xs text-white/80">
                    {mode === "play" ? t("The notes fall to the keyboard. Press the yellow key: the song waits until you press the right note.") : t("The song plays by itself. Watch which keys light up.")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="h-1 bg-white/10">
          <div ref={progressRef} className="h-full w-0 bg-primary" />
        </div>
        <div role="group" aria-label={t("Virtual piano")} className="relative h-32 w-full select-none p-1 pt-0 sm:h-40">
          <div className="relative flex h-full w-full">
            {range.white.map((m) => (
              <button
                key={m}
                type="button"
                tabIndex={-1}
                aria-label={midiToNote(m)}
                {...handlers(m)}
                className={cn(
                  "piano-key relative flex h-full flex-1 items-end justify-center rounded-b-md border border-neutral-300 bg-white pb-1.5 text-[0.6rem] font-bold text-neutral-500 transition-colors duration-75",
                  tone(m, false),
                )}
              >
                {labels !== "none" && <span>{labels === "solfege" ? solfegeOf(m, 60) : m % 12 === 0 ? midiToNote(m) : midiToNote(m).replace(/\d/, "")}</span>}
              </button>
            ))}
            {black.map(({ midi: m, position }) => (
              <button
                key={m}
                type="button"
                tabIndex={-1}
                aria-label={midiToNote(m)}
                {...handlers(m)}
                style={{ left: `calc(${position * wPct}% - ${wPct * 0.3}%)`, width: `${wPct * 0.6}%` }}
                className={cn("piano-key absolute top-0 z-10 h-[62%] rounded-b-md border border-black bg-neutral-800 transition-colors duration-75", tone(m, true))}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={togglePlay}>
            {playing ? <Pause /> : <Play />} {playing ? t("Pause") : t("Play")}
          </Button>
          <Button variant="outline" size="icon" aria-label={t("Start over")} onClick={reset}>
            <RotateCcw />
          </Button>
          {mode === "play" && (
            <span className="text-sm font-semibold text-muted-foreground">
              {t("Correct")}: {score.hit}/{total} · {t("Wrong")}: {score.wrong}
            </span>
          )}
        </div>
        {midi.status === "connected" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
            <Usb className="size-3.5" />
            {midi.device.length ? midi.device.join(", ") : t("MIDI active, plug in a keyboard")}
          </span>
        ) : midi.status === "pending" || midi.status === "meminta" ? (
          <Button variant="outline" size="sm" onClick={midi.connect} disabled={midi.status === "meminta"}>
            <Usb /> {t("Connect MIDI keyboard")}
          </Button>
        ) : null}
      </div>
      <p className={cn("hidden text-xs text-muted-foreground", computerKeys && "sm:block")}>
        {t("Computer keyboard: A S D F G H J K L for white keys, W E T Y U O P for black keys, Space to play/pause.")}
      </p>
    </div>
  );
}

/* ---------------- Drawing ---------------- */

function laneOf(midi: number, white: number[], w: number) {
  if (!isBlackKey(midi)) {
    const i = white.indexOf(midi);
    return { x: i * w, width: w };
  }
  const i = white.indexOf(midi - 1);
  return { x: (i + 1) * w - w * 0.3, width: w * 0.6 };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rr);
}

function draw(canvas: HTMLCanvasElement | null, song: Song, white: number[], time: number, hit: Set<number>, mode: Mode, labels: Labels) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const keyW = (W - 8) / white.length; // matches the keyboard's p-1 padding
  const ox = 4;
  const pxPerBeat = H / VISIBLE_BEATS;

  // Shaded lanes on every other white key, plus beat lines.
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  white.forEach((_, i) => {
    if (i % 2 === 0) ctx.fillRect(ox + i * keyW, 0, keyW, H);
  });
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let b = Math.ceil(time); b <= time + VISIBLE_BEATS; b++) {
    const y = H - (b - time) * pxPerBeat;
    ctx.globalAlpha = b % 4 === 0 ? 1 : 0.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  song.notes.forEach((n, i) => {
    const bottom = H - (n.start - time) * pxPerBeat;
    const top = bottom - n.beats * pxPerBeat;
    if (top > H || bottom < 0) return;
    const { x, width } = laneOf(n.midi, white, keyW);
    const done = mode === "play" ? hit.has(i) : n.start + n.beats <= time;
    const black = isBlackKey(n.midi);
    ctx.fillStyle = done ? (mode === "play" ? "rgba(34,197,94,0.55)" : "rgba(139,92,246,0.35)") : black ? "#4f46e5" : "#8b5cf6";
    roundRect(ctx, ox + x + 1.5, top + 1, width - 3, Math.max(4, bottom - top - 2), 5);
    ctx.fill();
    if (!done) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.stroke();
    }
    if (labels !== "none" && width >= 16 && bottom - top >= 16) {
      const name = labels === "solfege" ? solfegeOf(n.midi, 60) ?? midiToNote(n.midi).replace(/\d/, "") : midiToNote(n.midi).replace(/\d/, "");
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillText(name, ox + x + width / 2, Math.min(bottom, H) - 4);
    }
  });

  // Hit line.
  ctx.fillStyle = "rgba(250,204,21,0.8)";
  ctx.fillRect(0, H - 2, W, 2);
}
