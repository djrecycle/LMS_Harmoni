"use client";

/**
 * Sheet music (VexFlow) for the chord and rhythm blocks: a sequence of events — a chord/note, or a rest — each a
 *  number of beats long, laid out in 4/4 bars. Notes that cross a bar line are split and tied; eighths are beamed;
 *  chord names sit above the notes. `cursorBeat` draws a moving play cursor over the score.
 *  `clef="percussion"` draws rhythms on a one-line percussion staff, `clef="rhythm"` on a five-line staff with a
 *  percussion clef (pitch does not matter in either: every note sits on the middle line).
 */
import { useEffect, useRef, useState } from "react";
import { midiToNote, midiToVexKey } from "@/lib/music";
import { barBeats, type Meter } from "@/lib/music-blocks";
import { cn } from "@/lib/utils";

export type ScoreEvent = { midis: number[] | null; beats: number; label?: string };

const EPS = 1e-6;
/** Note values VexFlow can draw: [beats, duration code, dotted]. */
const VALUES: [number, string, boolean][] = [
  [4, "w", false],
  [3, "h", true],
  [2, "h", false],
  [1.5, "q", true],
  [1, "q", false],
  [0.75, "8", true],
  [0.5, "8", false],
  [0.25, "16", false],
];

/** Splits an event at bar lines (`bar` quarter notes apart), then into drawable note values. */
function split(start: number, beats: number, bar: number): { start: number; value: (typeof VALUES)[number] }[] {
  const parts: { start: number; value: (typeof VALUES)[number] }[] = [];
  let pos = start;
  let left = beats;
  while (left > EPS) {
    const room = bar - (((pos % bar) + bar) % bar);
    let take = Math.min(left, room);
    while (take > EPS) {
      const v = VALUES.find(([b]) => b <= take + EPS) ?? VALUES[VALUES.length - 1];
      parts.push({ start: pos, value: v });
      pos += v[0];
      take -= v[0];
      left -= v[0];
    }
  }
  return parts;
}

export function totalBeats(events: ScoreEvent[]) {
  return events.reduce((s, e) => s + e.beats, 0);
}

export function ScoreView({
  events,
  clef = "treble",
  meter = "4/4",
  cursorBeat = null,
  className,
}: {
  events: ScoreEvent[];
  clef?: "treble" | "percussion" | "rhythm";
  meter?: Meter;
  cursorBeat?: number | null;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const positions = useRef<{ beat: number; x: number }[]>([]);
  const [size, setSize] = useState({ top: 0, height: 0 });
  // Re-render only when the music changes.
  const key = JSON.stringify([events, clef, meter]);

  useEffect(() => {
    let cancelled = false;
    const el = boxRef.current;
    if (el) el.innerHTML = "";
    void (async () => {
      const VF = await import("vexflow");
      await document.fonts.ready;
      const box = boxRef.current;
      if (!box || cancelled) return;
      box.innerHTML = "";
      const drum = clef !== "treble";
      const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, ChordSymbol, Dot, Beam, StaveTie, Fraction } = VF;
      const BAR = barBeats(meter);
      const [num, den] = meter.split("/").map(Number);

      // Lay the events out in bars.
      type Part = { note: InstanceType<typeof StaveNote>; start: number; event: number; first: boolean; rest: boolean };
      const bars: Part[][] = [];
      let pos = 0;
      events.forEach((e, ei) => {
        split(pos, e.beats, BAR).forEach((p, pi) => {
          const rest = !e.midis || e.midis.length === 0;
          const sorted = rest ? [] : [...e.midis!].sort((a, b) => a - b);
          const keys = rest || drum ? ["b/4"] : sorted.map(midiToVexKey);
          const note = new StaveNote({ keys, duration: p.value[1] + (rest ? "r" : ""), clef: drum ? "percussion" : "treble", autoStem: !drum });
          if (drum && !rest) note.setStemDirection(1);
          if (p.value[2]) Dot.buildAndAttach([note], { all: true });
          if (!drum) sorted.forEach((m, k) => midiToNote(m).includes("#") && note.addModifier(new Accidental("#"), k));
          // Chord symbols line up above the staff, whatever the notes' height.
          if (pi === 0 && e.label) note.addModifier(new ChordSymbol().addText(e.label).setFont("Arial", 15, "bold").setVertical("top"));
          const bar = Math.floor(p.start / BAR + EPS);
          (bars[bar] ??= []).push({ note, start: p.start, event: ei, first: pi === 0, rest });
        });
        pos += e.beats;
      });
      // Close the last bar with rests, and always show at least one bar.
      const end = Math.max(BAR, Math.ceil(pos / BAR - EPS) * BAR);
      if (end > pos + EPS) {
        split(pos, end - pos, BAR).forEach((p) => {
          const note = new StaveNote({ keys: ["b/4"], duration: p.value[1] + "r", clef: drum ? "percussion" : "treble" });
          if (p.value[2]) Dot.buildAndAttach([note], { all: true });
          (bars[Math.floor(p.start / BAR + EPS)] ??= []).push({ note, start: p.start, event: -1, first: true, rest: true });
        });
      }

      const top = clef === "percussion" ? 10 : clef === "rhythm" ? 20 : 30;
      const height = clef === "percussion" ? 110 : clef === "rhythm" ? 130 : 160;
      const widths = bars.map((parts, i) => Math.max(110, 40 + parts.length * 34 + parts.reduce((s, p) => s + (p.first && events[p.event]?.label ? events[p.event].label!.length * 4 : 0), 0)) + (i === 0 ? 70 : 0));
      const renderer = new Renderer(box, Renderer.Backends.SVG);
      renderer.resize(16 + widths.reduce((a, b) => a + b, 0), height);
      const ctx = renderer.getContext();

      let x = 8;
      const all: Part[] = [];
      bars.forEach((parts, bi) => {
        const stave = new Stave(x, top, widths[bi], clef === "percussion" ? { numLines: 1 } : undefined);
        if (bi === 0) stave.addClef(drum ? "percussion" : "treble").addTimeSignature(meter);
        if (bi === bars.length - 1) stave.setEndBarType(3); // final double bar
        stave.setContext(ctx).draw();
        const notes = parts.map((p) => p.note);
        const voice = new Voice({ numBeats: num, beatValue: den }).setStrict(false);
        voice.addTickables(notes);
        new Formatter().joinVoices([voice]).format([voice], Math.max(20, stave.getNoteEndX() - stave.getNoteStartX() - 10));
        // 6/8 beams eighths in threes; the other meters per quarter note.
        const beams = Beam.generateBeams(notes.filter((n) => !n.isRest()), { ...(drum ? { stemDirection: 1 } : {}), ...(meter === "6/8" ? { groups: [new Fraction(3, 8)] } : {}) });
        voice.draw(ctx, stave);
        beams.forEach((b) => b.setContext(ctx).draw());
        // A one-line staff has no height for VexFlow's bar lines, so draw them across the line (doubled at the end).
        if (clef === "percussion") {
          const y = stave.getYForLine(0);
          const endX = x + widths[bi];
          ctx.fillRect(endX - 1, y - 12, 1.2, 24);
          if (bi === bars.length - 1) ctx.fillRect(endX - 5, y - 12, 1.2, 24);
        }
        all.push(...parts);
        x += widths[bi];
      });
      // Ties between the pieces of one note.
      for (let i = 1; i < all.length; i++) {
        const a = all[i - 1];
        const b = all[i];
        if (!b.first && !b.rest && a.event === b.event) {
          const idx = b.note.getKeys().map((_, k) => k);
          new StaveTie({ firstNote: a.note, lastNote: b.note, firstIndexes: idx, lastIndexes: idx }).setContext(ctx).draw();
        }
      }
      positions.current = [...all.map((p) => ({ beat: p.start, x: p.note.getAbsoluteX() + 6 })), { beat: end, x: x - 4 }];
      setSize({ top, height });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Cursor x: between the notes around the current beat.
  let cursorX: number | null = null;
  if (cursorBeat !== null && positions.current.length > 1) {
    const ps = positions.current;
    const b = Math.max(0, cursorBeat);
    let i = ps.findIndex((p, k) => k === ps.length - 1 || ps[k + 1].beat > b);
    i = Math.max(0, Math.min(ps.length - 2, i));
    const a = ps[i];
    const c = ps[i + 1];
    cursorX = a.x + ((c.x - a.x) * (b - a.beat)) / Math.max(EPS, c.beat - a.beat);
  }

  return (
    // contain:inline-size: a long score scrolls here instead of stretching the page on phones.
    <div className={cn("overflow-x-auto [contain:inline-size]", className)}>
      {/* White like paper: VexFlow draws in black, so it stays readable in dark mode too. */}
      <div className="relative inline-block rounded-md bg-white p-1">
        <div ref={boxRef} className="[&_svg]:block [&_svg]:max-w-none" />
        {cursorX !== null && size.height > 0 && (
          <div className="pointer-events-none absolute w-0.5 rounded bg-amber-500" style={{ left: cursorX + 4, top: size.top - 8, height: size.height - size.top - 10 }} />
        )}
      </div>
    </div>
  );
}
