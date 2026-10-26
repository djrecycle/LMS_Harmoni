"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowDown, ArrowUp, Circle, Copy, Delete, Download, Eraser, MousePointer2, Pause, Pencil, Piano as PianoIcon, Play, Redo2, Square, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Piano } from "@/components/piano";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { audioTime, loadAudio, scheduleNote, stopAllNotes, unlockAudio } from "@/lib/audio";
import { writeMidiFile } from "@/lib/midi-file";
import { isBlackKey, midiToNote } from "@/lib/music";
import { MAX_ROLL_BEATS, MAX_SONG_NOTES, type SongNote } from "@/lib/songs";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const LOW = 21; // A0
const HIGH = 108; // C8
const ROW_H = 14;
const KEYS_W = 52;
const RULER_H = 24;
const BAR = 4; // beats per bar (4/4)
const ZOOMS = [16, 24, 36, 48, 64, 88, 120];
const SNAPS = [
  [1, "1 beat"],
  [0.5, "1/2 beat"],
  [0.25, "1/4 beat"],
  [0.125, "1/8 beat"],
] as const;
const LENGTHS = [
  [4, "Whole (4 beats)"],
  [2, "Half (2 beats)"],
  [1, "Quarter (1 beat)"],
  [0.5, "Eighth (1/2 beat)"],
  [0.25, "Sixteenth (1/4 beat)"],
] as const;

type RollNote = SongNote & { id: number };
type Tool = "draw" | "select" | "erase";
type Drag =
  | {
      kind: "move";
      x0: number;
      y0: number;
      origin: RollNote[];
      grabbed: number;
      lastMidi: number;
      before: RollNote[];
    }
  | {
      kind: "resize";
      x0: number;
      origin: RollNote[];
      grabbed: number;
      before: RollNote[];
    }
  | { kind: "rect"; x0: number; y0: number; base: Set<number> }
  | { kind: "erase"; before: RollNote[] }
  | { kind: "tap"; x0: number; y0: number };

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const strip = (notes: RollNote[]): SongNote[] => notes.map(({ midi, start, beats }) => ({ midi, start, beats }));

function preview(midi: number) {
  void unlockAudio().then(() => scheduleNote(midi, audioTime() + 0.01, 0.3, 0.7));
}

/**
 * A DAW-style piano roll (like FL Studio's) for writing a song: time runs left to right, pitch bottom to top,
 * and notes may overlap freely (chords, held bass notes). Mouse: click to add, drag to move, drag the right edge to
 * lengthen, right-click to delete. Touch: tap to add, drag a note to move it, drag the grid to scroll.
 *  `initial` is read once; remount (change `key`) to load other notes. `onChange` gets every finished edit.
 */
export function SongPianoRoll({ initial, bpm, title, onChange }: { initial: SongNote[]; bpm: number; title: string; onChange: (notes: SongNote[]) => void }) {
  const t = useT();
  const nextId = useRef(1);
  const withIds = (list: SongNote[]) => list.map((n) => ({ ...n, id: nextId.current++ }));
  const [notes, setNotes] = useState<RollNote[]>(() => withIds(initial));
  const notesRef = useRef(notes);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tool, setTool] = useState<Tool>("draw");
  const [snap, setSnap] = useState(0.25);
  const [length, setLength] = useState(1);
  const [zoomIdx, setZoomIdx] = useState(3);
  const zoom = ZOOMS[zoomIdx];
  const [rect, setRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playFrom, setPlayFrom] = useState(0);
  // Touch piano: each key pressed is written at `writeAt`, which then moves on by the note length.
  const [pianoOn, setPianoOn] = useState(true);
  const [record, setRecord] = useState(true);
  const [writeAt, setWriteAtState] = useState(() => Math.ceil(initial.reduce((m, n) => Math.max(m, n.start + n.beats), 0)));
  const writeAtRef = useRef(writeAt);
  const held = useRef(0);
  const chordStart = useRef(0);
  const [, setHistoryVersion] = useState(0);
  const past = useRef<RollNote[][]>([]);
  const future = useRef<RollNote[][]>([]);
  const drag = useRef<Drag | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => void loadAudio(), []);

  const apply = (next: RollNote[]) => {
    notesRef.current = next;
    setNotes(next);
  };
  /** Saves `before` for undo and reports the current notes to the form. */
  const finish = (before: RollNote[]) => {
    past.current.push(before);
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    setHistoryVersion((x) => x + 1);
    onChange(strip(notesRef.current));
  };
  const commit = (next: RollNote[]) => {
    const before = notesRef.current;
    apply(next);
    finish(before);
  };
  const setWriteAt = (beat: number) => {
    const b = round3(Math.min(MAX_ROLL_BEATS, Math.max(0, beat)));
    writeAtRef.current = b;
    setWriteAtState(b);
  };

  /** Scrolls the roll so the given time and pitch are on screen. */
  const reveal = (beat: number, midi?: number) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const x = beat * zoom;
    const viewW = sc.clientWidth - KEYS_W;
    if (x < sc.scrollLeft || x > sc.scrollLeft + viewW - 60) sc.scrollLeft = Math.max(0, x - viewW / 3);
    if (midi === undefined) return;
    const y = (HIGH - midi) * ROW_H;
    const viewH = sc.clientHeight - RULER_H;
    if (y < sc.scrollTop || y > sc.scrollTop + viewH - ROW_H) sc.scrollTop = y - viewH / 2;
  };

  /** A key of the touch piano (or laptop keyboard / MIDI keyboard) was pressed: write it. Keys held together make a chord. */
  const onPianoPress = (midi: number) => {
    if (!record) return;
    let start: number;
    if (held.current > 0) start = chordStart.current;
    else {
      start = writeAtRef.current;
      chordStart.current = start;
      setWriteAt(start + length);
    }
    held.current++;
    if (notesRef.current.length >= MAX_SONG_NOTES || start + length > MAX_ROLL_BEATS) return;
    const note = { id: nextId.current++, midi, start, beats: length };
    commit([...notesRef.current, note]);
    setSelected(new Set([note.id]));
    reveal(start + length, midi);
  };
  const onPianoRelease = () => {
    held.current = Math.max(0, held.current - 1);
  };
  /** Moves the write position back one step and removes what was written there. */
  const stepBack = () => {
    const from = writeAtRef.current;
    const to = Math.max(0, from - length);
    const rest = notesRef.current.filter((n) => !(n.start >= to - 1e-6 && n.start < from - 1e-6));
    if (rest.length !== notesRef.current.length) commit(rest);
    setWriteAt(to);
    reveal(to);
  };

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(notesRef.current);
    apply(prev);
    setSelected(new Set());
    setHistoryVersion((x) => x + 1);
    onChange(strip(prev));
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(notesRef.current);
    apply(next);
    setSelected(new Set());
    setHistoryVersion((x) => x + 1);
    onChange(strip(next));
  };

  const songEnd = useMemo(() => notes.reduce((m, n) => Math.max(m, n.start + n.beats), 0), [notes]);
  const totalBeats = Math.min(MAX_ROLL_BEATS, Math.max(BAR * 8, Math.ceil((songEnd + BAR * 2) / BAR) * BAR));
  const gridW = totalBeats * zoom;
  const gridH = (HIGH - LOW + 1) * ROW_H;
  const rows = useMemo(() => Array.from({ length: HIGH - LOW + 1 }, (_, i) => HIGH - i), []);

  // Start scrolled to the notes (or middle C).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const list = notesRef.current;
    const center = list.length ? Math.round(list.reduce((s, n) => s + n.midi, 0) / list.length) : 66;
    el.scrollTop = (HIGH - center) * ROW_H - el.clientHeight / 2 + RULER_H;
  }, []);

  /* ---------------------------- pointer editing ---------------------------- */

  const pos = (e: { clientX: number; clientY: number }) => {
    const r = gridRef.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return {
      x,
      y,
      beat: Math.max(0, x / zoom),
      midi: Math.min(HIGH, Math.max(LOW, HIGH - Math.floor(y / ROW_H))),
    };
  };
  const noteAt = (beat: number, midi: number) => {
    const list = notesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (n.midi === midi && beat >= n.start && beat < n.start + n.beats) return n;
    }
    return undefined;
  };
  const onEdge = (n: RollNote, x: number) => (n.start + n.beats) * zoom - x <= Math.min(8, (n.beats * zoom) / 3);
  const snapDown = (beat: number) => Math.floor(beat / snap + 1e-9) * snap;

  const addNote = (beat: number, midi: number) => {
    if (notesRef.current.length >= MAX_SONG_NOTES) return null;
    const start = round3(Math.min(snapDown(beat), MAX_ROLL_BEATS - length));
    const note = { id: nextId.current++, midi, start, beats: length };
    apply([...notesRef.current, note]);
    setSelected(new Set([note.id]));
    preview(midi);
    return note;
  };

  const eraseAt = (beat: number, midi: number) => {
    const hit = noteAt(beat, midi);
    if (!hit) return;
    apply(notesRef.current.filter((n) => n.id !== hit.id));
    setSelected((s) => {
      const next = new Set(s);
      next.delete(hit.id);
      return next;
    });
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button === 1) return;
    scrollRef.current?.focus({ preventScroll: true });
    const p = pos(e);
    const hit = noteAt(p.beat, p.midi);
    const capture = () => gridRef.current?.setPointerCapture(e.pointerId);

    if (e.button === 2 || tool === "erase") {
      const before = notesRef.current;
      eraseAt(p.beat, p.midi);
      drag.current = { kind: "erase", before };
      if (hit || e.pointerType !== "touch") capture();
      return;
    }

    if (hit) {
      let sel = selected;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        sel = new Set(selected);
        if (sel.has(hit.id)) sel.delete(hit.id);
        else sel.add(hit.id);
      } else if (!sel.has(hit.id)) sel = new Set([hit.id]);
      setSelected(sel);
      if (!sel.has(hit.id)) return;
      const origin = notesRef.current.filter((n) => sel.has(n.id));
      const before = notesRef.current;
      if (onEdge(hit, p.x))
        drag.current = {
          kind: "resize",
          x0: p.x,
          origin,
          grabbed: hit.id,
          before,
        };
      else {
        drag.current = {
          kind: "move",
          x0: p.x,
          y0: p.y,
          origin,
          grabbed: hit.id,
          lastMidi: hit.midi,
          before,
        };
        preview(hit.midi);
      }
      capture();
      return;
    }

    // Empty grid. On touch, wait for the finger to lift so dragging can scroll the roll.
    if (e.pointerType === "touch") {
      if (tool === "draw") drag.current = { kind: "tap", x0: p.x, y0: p.y };
      else setSelected(new Set());
      return;
    }
    if (tool === "draw") {
      const before = notesRef.current;
      const note = addNote(p.beat, p.midi);
      if (note)
        drag.current = {
          kind: "move",
          x0: p.x,
          y0: p.y,
          origin: [note],
          grabbed: note.id,
          lastMidi: note.midi,
          before,
        };
    } else {
      const base = e.shiftKey || e.ctrlKey ? new Set(selected) : new Set<number>();
      setSelected(base);
      drag.current = { kind: "rect", x0: p.x, y0: p.y, base };
    }
    capture();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const p = pos(e);
    if (!d) {
      if (e.pointerType !== "mouse" || !gridRef.current) return;
      const hit = noteAt(p.beat, p.midi);
      gridRef.current.style.cursor = tool === "erase" ? "not-allowed" : hit ? (onEdge(hit, p.x) ? "ew-resize" : "grab") : tool === "draw" ? "crosshair" : "default";
      return;
    }
    if (d.kind === "tap") {
      if (Math.hypot(p.x - d.x0, p.y - d.y0) > 10) drag.current = null;
    } else if (d.kind === "erase") {
      eraseAt(p.beat, p.midi);
    } else if (d.kind === "rect") {
      const x = Math.min(d.x0, p.x);
      const y = Math.min(d.y0, p.y);
      const w = Math.abs(p.x - d.x0);
      const h = Math.abs(p.y - d.y0);
      setRect({ x, y, w, h });
      const b0 = x / zoom;
      const b1 = (x + w) / zoom;
      const sel = new Set(d.base);
      for (const n of notesRef.current) {
        const top = (HIGH - n.midi) * ROW_H;
        if (n.start < b1 && n.start + n.beats > b0 && top < y + h && top + ROW_H > y) sel.add(n.id);
      }
      setSelected(sel);
    } else if (d.kind === "move") {
      const minStart = Math.min(...d.origin.map((n) => n.start));
      const lo = Math.min(...d.origin.map((n) => n.midi));
      const hi = Math.max(...d.origin.map((n) => n.midi));
      const dBeat = Math.max(-minStart, Math.round((p.x - d.x0) / zoom / snap) * snap);
      const dPitch = Math.min(HIGH - hi, Math.max(LOW - lo, Math.round((d.y0 - p.y) / ROW_H)));
      const moved = new Map(
        d.origin.map((n) => [
          n.id,
          {
            ...n,
            start: round3(Math.min(n.start + dBeat, MAX_ROLL_BEATS - n.beats)),
            midi: n.midi + dPitch,
          },
        ]),
      );
      apply(notesRef.current.map((n) => moved.get(n.id) ?? n));
      const grabbedMidi = moved.get(d.grabbed)?.midi;
      if (grabbedMidi !== undefined && grabbedMidi !== d.lastMidi) {
        d.lastMidi = grabbedMidi;
        preview(grabbedMidi);
      }
    } else if (d.kind === "resize") {
      const dLen = Math.round((p.x - d.x0) / zoom / snap) * snap;
      const sized = new Map(
        d.origin.map((n) => [
          n.id,
          {
            ...n,
            beats: round3(Math.min(64, MAX_ROLL_BEATS - n.start, Math.max(Math.min(n.beats, snap), n.beats + dLen))),
          },
        ]),
      );
      apply(notesRef.current.map((n) => sized.get(n.id) ?? n));
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    setRect(null);
    if (!d) return;
    if (d.kind === "tap") {
      const p = pos(e);
      const before = notesRef.current;
      if (addNote(p.beat, p.midi)) finish(before);
    } else if (d.kind === "move" || d.kind === "resize" || d.kind === "erase") {
      if (notesRef.current !== d.before && JSON.stringify(notesRef.current) !== JSON.stringify(d.before)) finish(d.before);
      // The next note drawn gets the length the teacher just gave a note (as in FL Studio).
      if (d.kind === "resize") {
        const n = notesRef.current.find((x) => x.id === d.grabbed);
        if (n) setLength(n.beats);
      }
    }
  }

  function onPointerCancel() {
    const d = drag.current;
    drag.current = null;
    setRect(null);
    if (d && "before" in d && notesRef.current !== d.before) apply(d.before);
  }

  /* ------------------------------ edit commands ----------------------------- */

  const selectedNotes = notes.filter((n) => selected.has(n.id));

  const deleteSelected = () => {
    if (!selected.size) return;
    commit(notesRef.current.filter((n) => !selected.has(n.id)));
    setSelected(new Set());
  };
  const shiftSelected = (dPitch: number, dBeat: number) => {
    const sel = notesRef.current.filter((n) => selected.has(n.id));
    if (!sel.length) return;
    const lo = Math.min(...sel.map((n) => n.midi));
    const hi = Math.max(...sel.map((n) => n.midi));
    const minStart = Math.min(...sel.map((n) => n.start));
    if (lo + dPitch < LOW || hi + dPitch > HIGH || minStart + dBeat < 0) return;
    commit(notesRef.current.map((n) => (selected.has(n.id) ? { ...n, midi: n.midi + dPitch, start: round3(n.start + dBeat) } : n)));
    if (dPitch && sel.length === 1) preview(sel[0].midi + dPitch);
  };
  /** Copies the selected notes right after themselves (FL Studio's Ctrl+B). */
  const duplicateSelected = () => {
    const sel = notesRef.current.filter((n) => selected.has(n.id));
    if (!sel.length || notesRef.current.length + sel.length > MAX_SONG_NOTES) return;
    const s0 = Math.min(...sel.map((n) => n.start));
    const s1 = Math.max(...sel.map((n) => n.start + n.beats));
    const offset = Math.max(1, Math.ceil(s1 - s0 - 1e-9));
    if (s1 + offset > MAX_ROLL_BEATS) return;
    const copies = sel.map((n) => ({
      ...n,
      id: nextId.current++,
      start: round3(n.start + offset),
    }));
    commit([...notesRef.current, ...copies]);
    setSelected(new Set(copies.map((n) => n.id)));
  };
  const clearAll = () => {
    if (!notesRef.current.length) return;
    commit([]);
    setSelected(new Set());
  };

  function exportMidi() {
    const blob = new Blob([writeMidiFile(strip(notesRef.current), bpm)], {
      type: "audio/midi",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title.trim() || "lagu").replace(/[\\/:*?"<>|]+/g, "")}.mid`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* -------------------------------- playback -------------------------------- */

  const placePlayhead = useCallback(
    (beat: number, follow: boolean) => {
      const el = playheadRef.current;
      if (!el) return;
      const x = beat * zoom;
      el.style.transform = `translateX(${x}px)`;
      const sc = scrollRef.current;
      if (follow && sc && (x > sc.scrollLeft + sc.clientWidth - KEYS_W - 40 || x < sc.scrollLeft)) sc.scrollLeft = Math.max(0, x - 60);
    },
    [zoom],
  );

  const stop = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    stopAllNotes();
    setPlaying(false);
  }, []);
  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (!playing) placePlayhead(playFrom, false);
  }, [playing, playFrom, placePlayhead]);

  async function play() {
    stop();
    await unlockAudio();
    const spb = 60 / bpm;
    const from = playFrom;
    const list = notesRef.current.filter((n) => n.start >= from - 1e-6).sort((a, b) => a.start - b.start);
    if (!list.length) return;
    const end = Math.max(...list.map((n) => n.start + n.beats));
    const t0 = audioTime() + 0.1;
    let i = 0;
    setPlaying(true);
    const tick = () => {
      const now = audioTime();
      while (i < list.length && t0 + (list[i].start - from) * spb < now + 0.2) {
        const n = list[i++];
        scheduleNote(n.midi, Math.max(now, t0 + (n.start - from) * spb), n.beats * spb * 0.95, 0.8);
      }
      const beat = from + (now - t0) / spb;
      placePlayhead(Math.max(from, beat), true);
      if (beat > end + 0.25) return stop();
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }

  /* -------------------------------- keyboard -------------------------------- */

  function onKeyDown(e: ReactKeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const handled = () => {
      e.preventDefault();
      e.stopPropagation(); // keep Space etc. from also reaching other players on the page
    };
    if (mod && k === "z") (e.shiftKey ? redo() : undo(), handled());
    else if (mod && k === "y") (redo(), handled());
    else if (mod && k === "a") (setSelected(new Set(notesRef.current.map((n) => n.id))), handled());
    else if (mod && k === "b") (duplicateSelected(), handled());
    else if (k === "delete" || k === "backspace") (deleteSelected(), handled());
    else if (k === "escape") setSelected(new Set());
    else if (k === " ") (playing ? stop() : void play(), handled());
    else if (k === "arrowup" || k === "arrowdown") (shiftSelected((k === "arrowup" ? 1 : -1) * (e.shiftKey ? 12 : 1), 0), handled());
    else if ((k === "arrowleft" || k === "arrowright") && selected.size) (shiftSelected(0, (k === "arrowright" ? 1 : -1) * snap), handled());
  }

  /* --------------------------------- render --------------------------------- */

  const tools: [Tool, typeof Pencil, string][] = [
    ["draw", Pencil, t("Draw")],
    ["select", MousePointer2, t("Select")],
    ["erase", Eraser, t("Erase")],
  ];
  const bars = totalBeats / BAR;

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => (playing ? stop() : void play())} disabled={!notes.length}>
          {playing ? <Square /> : <Play />} {playing ? t("Stop") : playFrom > 0 ? t("Play from bar {0}", Math.floor(playFrom / BAR) + 1) : t("Play")}
        </Button>
        <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label={t("Tool")}>
          {tools.map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-semibold",
                tool === id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {t("Note length")}
          <Select className="h-8 w-auto text-xs" value={length} onChange={(x) => setLength(Number(x.target.value))}>
            {!LENGTHS.some(([v]) => v === length) && <option value={length}>{t("{0} beats", length)}</option>}
            {LENGTHS.map(([v, label]) => (
              <option key={v} value={v}>
                {t(label)}
              </option>
            ))}
          </Select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {t("Snap")}
          <Select className="h-8 w-auto text-xs" value={snap} onChange={(x) => setSnap(Number(x.target.value))}>
            {SNAPS.map(([v, label]) => (
              <option key={v} value={v}>
                {t(label)}
              </option>
            ))}
          </Select>
        </label>
        <div className="ml-auto inline-flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t("Undo")}
            title={`${t("Undo")} (Ctrl+Z)`}
            disabled={!past.current.length}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t("Redo")}
            title={`${t("Redo")} (Ctrl+Y)`}
            disabled={!future.current.length}
            onClick={redo}
          >
            <Redo2 />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t("Zoom out")}
            disabled={zoomIdx === 0}
            onClick={() => setZoomIdx((z) => z - 1)}
          >
            <ZoomOut />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t("Zoom in")}
            disabled={zoomIdx === ZOOMS.length - 1}
            onClick={() => setZoomIdx((z) => z + 1)}
          >
            <ZoomIn />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={t("Piano roll")}
        // contain:inline-size keeps the wide roll from stretching the page on phones; it scrolls here instead.
        className="h-[26rem] overflow-auto overscroll-contain rounded-xl border bg-neutral-900 outline-none select-none [contain:inline-size] focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${KEYS_W}px ${gridW}px`,
            gridTemplateRows: `${RULER_H}px ${gridH}px`,
          }}
        >
          <div className="sticky top-0 left-0 z-30 border-r border-b border-neutral-700 bg-neutral-800" />

          {/* Bar ruler: click to choose where playback starts. */}
          <div
            className="sticky top-0 z-20 cursor-pointer border-b border-neutral-700 bg-neutral-800"
            onPointerDown={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const x = Math.max(0, (e.clientX - r.left) / zoom);
              const beat = Math.floor(x);
              setPlayFrom(beat >= songEnd ? 0 : beat);
              setWriteAt(Math.floor(x / snap) * snap);
            }}
            title={t("Click to choose where playback starts and where the touch piano writes")}
          >
            {Array.from({ length: bars }, (_, b) => (
              <span
                key={b}
                className="absolute top-0 h-full border-l border-neutral-600 pl-1 text-[0.65rem] leading-6 font-bold text-neutral-400"
                style={{ left: b * BAR * zoom }}
              >
                {b + 1}
              </span>
            ))}
            <span
              className="absolute bottom-0 size-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-amber-400"
              style={{ left: playFrom * zoom }}
            />
            {pianoOn && record && (
              <span
                className="absolute top-0 size-0 -translate-x-1/2 border-x-[6px] border-b-[8px] border-x-transparent border-b-emerald-400"
                style={{ left: writeAt * zoom }}
              />
            )}
          </div>

          {/* Keyboard: press a key to hear it. */}
          <div className="sticky left-0 z-20 border-r border-neutral-700">
            {rows.map((midi) => {
              const black = isBlackKey(midi);
              return (
                <button
                  key={midi}
                  type="button"
                  tabIndex={-1}
                  onPointerDown={() => preview(midi)}
                  className={cn(
                    "flex w-full items-center justify-end pr-1 text-[0.6rem] leading-none font-bold",
                    black ? "bg-neutral-950 text-neutral-500 active:bg-primary" : "bg-neutral-100 text-neutral-600 active:bg-primary-soft",
                    midi % 12 === 0 ? "border-b border-neutral-500" : "border-b border-neutral-300/40",
                  )}
                  style={{ height: ROW_H }}
                  aria-label={midiToNote(midi)}
                >
                  {midi % 12 === 0 ? midiToNote(midi) : ""}
                </button>
              );
            })}
          </div>

          <div
            ref={gridRef}
            className="relative"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              backgroundImage: [
                "linear-gradient(to right, rgb(255 255 255 / 0.3) 1px, transparent 1px)",
                "linear-gradient(to right, rgb(255 255 255 / 0.12) 1px, transparent 1px)",
                "linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px)",
                "linear-gradient(to bottom, rgb(255 255 255 / 0.05) 1px, transparent 1px)",
              ].join(","),
              backgroundSize: `${zoom * BAR}px 100%, ${zoom}px 100%, ${Math.max(4, zoom * snap)}px 100%, 100% ${ROW_H}px`,
            }}
          >
            {rows.map((midi, i) =>
              isBlackKey(midi) || midi % 12 === 0 ? (
                <div
                  key={midi}
                  className={cn("pointer-events-none absolute inset-x-0", isBlackKey(midi) ? "bg-black/30" : "border-b border-white/15")}
                  style={{ top: i * ROW_H, height: ROW_H }}
                />
              ) : null,
            )}
            {notes.map((n) => {
              const on = selected.has(n.id);
              const w = Math.max(3, n.beats * zoom - 1);
              return (
                <div
                  key={n.id}
                  className={cn(
                    "absolute touch-none overflow-hidden rounded-[3px] border px-1 text-[0.6rem] leading-[12px] font-bold whitespace-nowrap",
                    on ? "border-white bg-amber-400 text-neutral-900" : "border-black/40 bg-primary text-primary-foreground",
                  )}
                  style={{
                    left: n.start * zoom,
                    top: (HIGH - n.midi) * ROW_H,
                    width: w,
                    height: ROW_H,
                  }}
                >
                  {w > 26 ? midiToNote(n.midi) : ""}
                  <span className="absolute inset-y-0 right-0 w-1.5 bg-black/20" />
                </div>
              );
            })}
            {rect && (
              <div
                className="pointer-events-none absolute border border-amber-300 bg-amber-300/15"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                }}
              />
            )}
            {pianoOn && record && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-emerald-400/80" style={{ left: writeAt * zoom }} />}
            <div
              ref={playheadRef}
              className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-amber-400"
              style={{ transform: `translateX(${playFrom * zoom}px)` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">
          {t("{0} notes · {1} bars", notes.length, Math.ceil(songEnd / BAR))}
          {selectedNotes.length > 0 && ` · ${t("{0} selected", selectedNotes.length)}`}
        </span>
        {selectedNotes.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => shiftSelected(1, 0)} title="↑">
              <ArrowUp /> {t("Semitone")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shiftSelected(-1, 0)} title="↓">
              <ArrowDown /> {t("Semitone")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shiftSelected(12, 0)} title="Shift+↑">
              <ArrowUp /> {t("Octave")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shiftSelected(-12, 0)} title="Shift+↓">
              <ArrowDown /> {t("Octave")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={duplicateSelected} title="Ctrl+B">
              <Copy /> {t("Duplicate")}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={deleteSelected} title="Delete">
              <Trash2 /> {t("Delete")}
            </Button>
          </span>
        )}
        <span className="ml-auto inline-flex gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={exportMidi} disabled={!notes.length}>
            <Download /> {t("Download MIDI")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearAll} disabled={!notes.length}>
            <Trash2 /> {t("Clear all")}
          </Button>
        </span>
      </div>

      <div className="grid gap-3 rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={pianoOn ? "secondary" : "outline"} aria-expanded={pianoOn} onClick={() => setPianoOn((x) => !x)}>
            <PianoIcon /> {pianoOn ? t("Hide touch piano") : t("Show touch piano")}
          </Button>
          {pianoOn && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={record}
                onClick={() => setRecord((x) => !x)}
                className={cn(record && "border-danger text-danger")}
              >
                <Circle className={cn(record && "fill-current")} /> {record ? t("Recording to the piano roll") : t("Not recording (play only)")}
              </Button>
              {record && (
                <>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("Writing at bar {0}, beat {1}", Math.floor(writeAt / BAR) + 1, Number(((writeAt % BAR) + 1).toFixed(3)))}
                  </span>
                  <span className="ml-auto inline-flex gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => (setWriteAt(writeAtRef.current + length), reveal(writeAtRef.current))}>
                      <Pause /> {t("Rest")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={writeAt <= 0} onClick={stepBack}>
                      <Delete /> {t("Step back")}
                    </Button>
                  </span>
                </>
              )}
            </>
          )}
        </div>
        {pianoOn && (
          <>
            {record && (
              <p className="text-xs text-muted-foreground">
                {t("Press the keys: each note is written at the green line with the chosen note length, then the line moves on. Hold keys together for a chord. Laptop keys A S D F… and a MIDI keyboard work too.")}
              </p>
            )}
            <Piano onNotePress={onPianoPress} onNoteRelease={onPianoRelease} />
          </>
        )}
      </div>
    </div>
  );
}
