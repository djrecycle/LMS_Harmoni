"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Headphones, Minus, Pause, Play, Plus, RotateCcw, Timer, Usb } from "lucide-react";
import { toast } from "sonner";
import { savePracticeResult } from "@/app/actions/practice";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { KeySizeControl, useKeyScale } from "@/components/key-size-control";
import { drawFalling, drawStaff, KEY_CHOICES, keyName, labelOf, loadMusicFont, songKey, VISIBLE_BEATS, type Labels, type Mode, type NoteState } from "@/components/song-views";
import { loadAudio, noteOff, noteOn, scheduleClick, scheduleNote, stopAllNotes, unlockAudio, audioTime, audioLatency } from "@/lib/audio";
import { isBlackKey, midiToNote, NOTE_NAMES } from "@/lib/music";
import type { SongDetail } from "@/lib/practice";
import { SONGS, songLength, type Song } from "@/lib/songs";
import { useMidi } from "@/lib/use-midi";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type View = "falling" | "staff";

/** With several players on one page (lesson blocks), the laptop keyboard drives the one touched last. */
let activePlayer: object | null = null;

/** The song starts this many beats early so the first note falls in from the top. */
const LEAD_IN = VISIBLE_BEATS;
/** How early (in beats) a key press still counts for the next note. */
const EARLY_WINDOW = 0.5;
const MIN_BPM = 30;
const MAX_BPM = 240;
/** In "don't wait" play mode a note counts as missed this long (beats) after it should have been played. */
const MISS_AFTER = 0.75;

const WHITE_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'"];
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
const BLACK_KEY_MAP: Record<string, number> = { w: 1, e: 3, t: 6, y: 8, u: 10, o: 13, p: 15, "]": 18 };

/** Whole octaves around the song: from the C below its lowest note to the C above its highest. */
/** Keys shown under the song: the octaves its notes use, moved `shift` octaves left (-) or right (+). */
function keyRange(song: Song, shift = 0) {
  const lo = Math.min(...song.notes.map((n) => n.midi));
  const hi = Math.max(...song.notes.map((n) => n.midi));
  const first = Math.floor(lo / 12) * 12 + shift * 12;
  const last = Math.max(first + 12, Math.ceil((hi + 1) / 12) * 12 + shift * 12);
  const white: number[] = [];
  for (let m = first; m <= last; m++) if (!isBlackKey(m)) white.push(m);
  return { first, last, white };
}

type KeyState = { target: number[]; sounding: number[]; good: number[]; bad: number[] };
const EMPTY_KEYS: KeyState = { target: [], sounding: [], good: [], bad: [] };

/**
 * "Play a song" mode: notes fall toward the keyboard (like Synthesia), or scroll left on a staff.
 *  - play: by default the song waits at each note until the student presses the right key; with "wait" off it
 *    keeps the tempo and notes that pass unplayed count as missed.
 *  - listen: the song plays by itself and the keys light up.
 *  The tempo (BPM) sets how fast the song runs; the metronome ticks every beat, with a one-bar count-in.
 */
/** `computerKeys`: play with the laptop keyboard (off when another piano on the page uses it). */
export function SongPlayer({ songs = SONGS, saveScores = true, computerKeys = true, full = false }: { songs?: Song[]; saveScores?: boolean; computerKeys?: boolean; full?: boolean }) {
  const t = useT();
  const [songId, setSongId] = useState(songs[0].id);
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  const [mode, setMode] = useState<Mode>("play");
  const [tempo, setTempo] = useState(song.bpm);
  const [tempoText, setTempoText] = useState(String(song.bpm));
  const [metronome, setMetronome] = useState(true);
  const [wait, setWait] = useState(true);
  const [view, setView] = useState<View>("falling");
  const [labels, setLabels] = useState<Labels>("letter");
  // Key signature on the staff: "none", "auto" (the song's key) or a key in fifths.
  // Songs with a saved key start with its key signature.
  const [keySig, setKeySig] = useState<string>(song.doMidi !== undefined ? "auto" : "none");
  const autoKey = useMemo(() => songKey(song), [song]);
  const fifths = keySig === "none" ? null : keySig === "auto" ? autoKey : Number(keySig);
  const [doMidi, setDoMidi] = useState(song.doMidi ?? 60);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState({ hit: 0, wrong: 0, missed: 0 });
  const [keys, setKeys] = useState<KeyState>(EMPTY_KEYS);
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Octave shift of the keyboard (the song itself stays the same; notes off the keys are marked at the edge).
  const [octave, setOctave] = useState(0);
  useEffect(() => setOctave(0), [song]);
  const range = useMemo(() => keyRange(song, octave), [song, octave]);
  const canLower = range.first - 12 >= 12; // C0
  const canRaise = range.last + 12 <= 120; // C9

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
    missed: new Set<number>(),
    flash: new Map<number, { ok: boolean; until: number }>(),
    keySig: "",
  });
  const settings = useRef({ song, mode, tempo, metronome, wait, view, labels, doMidi, fifths, range, saveScores });
  settings.current = { song, mode, tempo, metronome, wait, view, labels, doMidi, fifths, range, saveScores };

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
    s.missed = new Set();
    s.flash.clear();
    setPlaying(false);
    setFinished(false);
    setSaved("idle");
    setScore({ hit: 0, wrong: 0, missed: 0 });
    stopAllNotes();
  }, []);

  // A new song (or a changed melody in the teacher's preview), mode or waiting rule starts over.
  useEffect(() => reset(), [song, mode, wait, reset]);
  // A new song brings its own tempo and key.
  useEffect(() => {
    setTempo(song.bpm);
    setTempoText(String(song.bpm));
    setDoMidi(song.doMidi ?? 60);
    setKeySig(song.doMidi !== undefined ? "auto" : "none");
  }, [song]);

  const changeTempo = (bpm: number) => {
    const b = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
    setTempo(b);
    setTempoText(String(b));
  };

  // The staff view uses the Bravura music font (bundled with VexFlow): load it when that view is first chosen.
  const [, setFontReady] = useState(false);
  useEffect(() => {
    if (view === "staff") loadMusicFont(() => setFontReady(true));
  }, [view]);

  const me = useRef({});
  useEffect(() => {
    activePlayer ??= me.current;
    const self = me.current;
    return () => {
      if (activePlayer === self) activePlayer = null;
    };
  }, []);

  const togglePlay = async () => {
    activePlayer = me.current;
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
    const { song, mode, tempo, saveScores } = settings.current;
    if (!saveScores || mode !== "play" || s.hit.size + s.missed.size < song.notes.length) return;
    const score = Math.round((s.hit.size / Math.max(1, s.hit.size + s.wrong + s.missed.size)) * 100);
    // `speed` = tempo played / the song's own tempo (the practice analysis reads it as a percentage).
    const detail: SongDetail = { songId: song.id, speed: Math.round((tempo / song.bpm) * 100) / 100, notesTotal: song.notes.length, wrong: s.wrong + s.missed.size };
    setSaved("saving");
    const r = await savePracticeResult({ kind: "song", title: t("Song: {0} ({1} BPM)", t(song.title), tempo), score, detail });
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
    const idx = song.notes.findIndex((n, i) => !s.hit.has(i) && !s.missed.has(i) && n.midi === midi && n.start - s.time <= EARLY_WINDOW && n.start + n.beats > s.time - 0.25);
    const now = performance.now();
    if (idx >= 0) {
      s.hit.add(idx);
      s.flash.set(midi, { ok: true, until: now + 250 });
    } else {
      s.wrong++;
      s.flash.set(midi, { ok: false, until: now + 300 });
    }
    setScore({ hit: s.hit.size, wrong: s.wrong, missed: s.missed.size });
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
      if (activePlayer !== me.current) return;
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
    const up = (e: KeyboardEvent) => {
      if (activePlayer === me.current) release(`kb:${e.key.toLowerCase()}`);
    };
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
      const { song, mode, tempo, metronome, wait, view, labels, doMidi, fifths, range } = settings.current;
      const beatsPerSec = tempo / 60;
      const end = songLength(song);

      if (s.playing) {
        let next = s.time + dt * beatsPerSec;
        if (mode === "play") {
          if (wait) {
            // Wait at the first note that has not been played yet.
            const waiting = song.notes.find((n, i) => !s.hit.has(i) && n.start <= next);
            if (waiting) next = Math.max(s.time, waiting.start);
          } else {
            // Keep the tempo: notes that pass unplayed are missed.
            let changed = false;
            song.notes.forEach((n, i) => {
              if (!s.hit.has(i) && !s.missed.has(i) && next > n.start + Math.min(n.beats, MISS_AFTER)) {
                s.missed.add(i);
                changed = true;
              }
            });
            if (changed) setScore({ hit: s.hit.size, wrong: s.wrong, missed: s.missed.size });
          }
        } else {
          while (s.nextSound < song.notes.length && song.notes[s.nextSound].start <= next) {
            const n = song.notes[s.nextSound];
            if (n.start >= s.time) scheduleNote(n.midi, audioTime() + 0.01, (n.beats / beatsPerSec) * 0.92, 0.75);
            s.nextSound++;
          }
        }
        // Metronome: a click on every beat the song passes (the lead-in gives a one-bar count-in).
        if (metronome) {
          for (let b = Math.floor(s.time) + 1; b <= next; b++) scheduleClick(audioTime() + 0.005, ((b % 4) + 4) % 4 === 0);
        }
        s.time = next;
        if (s.time > end + 1) {
          s.playing = false;
          setPlaying(false);
          setFinished(true);
          void onFinishRef.current();
        }
      }

      // What is drawn: in "listen" mode the picture runs behind by the audio output delay (large with Bluetooth
      // speakers), so a note reaches the play line and its key lights up exactly when it is heard.
      const shown = mode === "listen" ? s.time - Math.min(0.5, audioLatency()) * beatsPerSec : s.time;

      // Keys to light up on the keyboard.
      const target: number[] = [];
      const sounding: number[] = [];
      const isTarget = (i: number) => {
        const n = song.notes[i];
        return mode === "play" && !s.hit.has(i) && !s.missed.has(i) && n.start <= s.time + 0.001 && s.time >= 0 && (wait || s.time < n.start + n.beats);
      };
      song.notes.forEach((n, i) => {
        if (isTarget(i)) target.push(n.midi);
        if (mode === "listen" && n.start <= shown && shown < n.start + n.beats) sounding.push(n.midi);
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

      const state: NoteState = {
        done: (i) => (mode === "play" ? s.hit.has(i) : song.notes[i].start + song.notes[i].beats <= shown),
        target: isTarget,
        missed: (i) => s.missed.has(i),
        sounding: (i) => mode === "listen" && song.notes[i].start <= shown && shown < song.notes[i].start + song.notes[i].beats,
      };
      if (view === "staff") drawStaff(canvasRef.current, song, shown, state, mode, labels, doMidi, fifths);
      else drawFalling(canvasRef.current, song, range.white, shown, state, mode, labels, doMidi);
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
      activePlayer = me.current;
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

  const keyScale = useKeyScale();
  const total = song.notes.length;
  const tries = score.hit + score.wrong + score.missed;
  const accuracy = tries > 0 ? Math.round((score.hit / tries) * 100) : 0;

  return (
    <div className={cn("grid gap-3", full && "flex flex-1 flex-col")}>
      <div className="grid gap-2">
        {songs.length === 1 ? (
          song.title && <p className="text-sm font-semibold break-words">{song.title}</p>
        ) : (
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
        )}
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
          <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-0.5" role="group" aria-label={t("Tempo")}>
            <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("Slower")} disabled={tempo <= MIN_BPM} onClick={() => changeTempo(tempo - 5)}>
              <Minus />
            </Button>
            <label className="inline-flex items-center gap-1 text-sm font-semibold">
              <span className="sr-only sm:not-sr-only">{t("Tempo")}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={MIN_BPM}
                max={MAX_BPM}
                value={tempoText}
                onChange={(e) => {
                  setTempoText(e.target.value);
                  const n = Number(e.target.value);
                  if (n >= MIN_BPM && n <= MAX_BPM) setTempo(Math.round(n));
                }}
                onBlur={() => setTempoText(String(tempo))}
                className="h-8 w-16 px-2 text-center"
                aria-label={t("Tempo (BPM)")}
              />
              <span className="text-xs text-muted-foreground">BPM</span>
            </label>
            <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("Faster")} disabled={tempo >= MAX_BPM} onClick={() => changeTempo(tempo + 5)}>
              <Plus />
            </Button>
          </div>
          <Button type="button" variant={metronome ? "secondary" : "outline"} aria-pressed={metronome} onClick={() => setMetronome((x) => !x)}>
            <Timer /> {t("Metronome")}
          </Button>
          {mode === "play" && (
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={wait} onChange={(e) => setWait(e.target.checked)} className="size-4 accent-[var(--primary)]" />
              {t("Wait for the right note")}
            </label>
          )}
          <Select aria-label={t("Display")} className="h-10 w-auto" value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="falling">{t("Falling notes")}</option>
            <option value="staff">{t("Staff notation")}</option>
          </Select>
          {view === "staff" && (
            <Select aria-label={t("Key signature")} className="h-10 w-auto" value={keySig} onChange={(e) => setKeySig(e.target.value)}>
              <option value="none">{t("No key signature")}</option>
              <option value="auto">
                {t("Song's key")}: {keyName(autoKey)}
              </option>
              {KEY_CHOICES.map((k) => (
                <option key={k} value={k}>
                  {keyName(k)}
                </option>
              ))}
            </Select>
          )}
          <Select aria-label={t("Note names")} className="h-10 w-auto" value={labels} onChange={(e) => setLabels(e.target.value as Labels)}>
            <option value="letter">C D E</option>
            <option value="solfege">do re mi</option>
            <option value="angka">{t("1 2 3 (notasi angka)")}</option>
            <option value="none">{t("No names")}</option>
          </Select>
          {(labels === "angka" || labels === "solfege") && (
            <label className="inline-flex items-center gap-1.5 text-sm font-semibold">
              {t("do =")}
              <Select className="h-10 w-auto" value={doMidi} onChange={(e) => setDoMidi(Number(e.target.value))}>
                {NOTE_NAMES.map((name, pc) => (
                  // A, A# and B are taken from octave 3 (like the song form), the rest from octave 4.
                  <option key={name} value={pc >= 9 ? 48 + pc : 60 + pc}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={playing ? "outline" : "default"} onClick={togglePlay}>
            {playing ? <Pause /> : <Play />} {playing ? t("Pause") : t("Play")}
          </Button>
          <Button variant="outline" size="icon" aria-label={t("Start over")} onClick={reset}>
            <RotateCcw />
          </Button>
          <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-0.5" role="group" aria-label={t("Octave")}>
            <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("Lower octave")} disabled={!canLower} onClick={() => setOctave((o) => o - 1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-16 px-1 text-center text-sm font-semibold tabular-nums">
              {midiToNote(range.first)}–{midiToNote(range.last)}
            </span>
            <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={t("Higher octave")} disabled={!canRaise} onClick={() => setOctave((o) => o + 1)}>
              <ChevronRight />
            </Button>
          </div>
          <KeySizeControl />
          {midi.status === "connected" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
              <Usb className="size-3.5" />
              {midi.device.length ? midi.device.join(", ") : t("MIDI active, plug in a keyboard")}
            </span>
          ) : midi.status === "pending" || midi.status === "meminta" ? (
            <Button variant="outline" onClick={midi.connect} disabled={midi.status === "meminta"}>
              <Usb /> {t("Connect MIDI keyboard")}
            </Button>
          ) : null}
        </div>
        {mode === "play" && (
          // Score = correct notes out of all tries (wrong keys and missed notes count against it), as saved at the end.
          <div className="flex items-baseline gap-2 rounded-xl border bg-card px-4 py-1.5" aria-live="polite">
            <span className="text-sm font-semibold text-muted-foreground">{t("Score")}</span>
            <span className="text-3xl font-extrabold tabular-nums text-primary">{accuracy}</span>
          </div>
        )}
      </div>

      <div className={cn("overflow-hidden rounded-xl bg-neutral-900 shadow-inner", full && "flex flex-1 flex-col")}>
        <div ref={boxRef} className={cn("relative w-full", full ? "min-h-64 flex-1" : "h-64 sm:h-80")}>
          <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
          {!playing && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 p-4 text-center text-white">
              {finished ? (
                <div className="grid gap-2">
                  <p className="text-xl font-bold">{t("Song finished!")}</p>
                  {mode === "play" && (
                    <p className="text-sm">
                      {t("{0} of {1} notes correct · {2} wrong keys · accuracy {3}%", score.hit, total, score.wrong, accuracy)}
                      {score.missed > 0 && ` · ${t("{0} missed", score.missed)}`}
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
                    {mode === "listen"
                      ? t("The song plays by itself. Watch which keys light up.")
                      : view === "staff"
                        ? wait
                          ? t("The notes move to the orange line. Press the yellow key: the song waits until you press the right note.")
                          : t("The notes move to the orange line at the tempo. Press each key when its note reaches the line.")
                        : wait
                          ? t("The notes fall to the keyboard. Press the yellow key: the song waits until you press the right note.")
                          : t("The notes fall at the tempo. Press each key when its note reaches the keyboard.")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="h-1 bg-white/10">
          <div ref={progressRef} className="h-full w-0 bg-primary" />
        </div>
        <div
          role="group"
          aria-label={t("Virtual piano")}
          style={{ "--ks": keyScale } as React.CSSProperties}
          className={cn("relative h-[calc(var(--kh)*var(--ks))] w-full shrink-0 select-none p-1 pt-0", full ? "[--kh:9rem] sm:[--kh:12rem]" : "[--kh:8rem] sm:[--kh:10rem]")}
        >
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
                <KeyLabel midi={m} labels={labels} doMidi={doMidi} />
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

      <p className={cn("hidden text-xs text-muted-foreground", computerKeys && "sm:block")}>
        {t("Computer keyboard: A S D F G H J K L for white keys, W E T Y U O P for black keys, Space to play/pause.")}
      </p>
    </div>
  );
}

/** A key's name under the keyboard; notasi angka gets its octave dots (a dot above = one octave higher). */
function KeyLabel({ midi, labels, doMidi }: { midi: number; labels: Labels; doMidi: number }) {
  const label = labelOf(midi, labels, doMidi);
  if (!label) return null;
  // Letters also show the octave number on each C, as before.
  const text = labels === "letter" && midi % 12 === 0 ? midiToNote(midi) : label.text;
  const dots = (n: number) => (n > 0 ? <span className="flex justify-center gap-px">{Array.from({ length: n }, (_, i) => <span key={i} className="size-[3px] rounded-full bg-current" />)}</span> : null);
  return (
    <span className="flex flex-col items-center leading-none">
      {dots(label.dots)}
      <span className={cn(label.dots !== 0 && "my-px")}>{text}</span>
      {dots(-label.dots)}
    </span>
  );
}
