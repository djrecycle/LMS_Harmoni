"use client";

import { useEffect, useRef } from "react";
import { midiToVexKey } from "@/lib/music";
import { MELODY_UNITS_PER_BAR, type MelodyNote } from "@/lib/music-blocks";
import { cn } from "@/lib/utils";

/** VexFlow duration codes for a note (or rest) that lasts `units` eighth-note units. */
const NOTE_VEX: Record<number, string> = { 8: "w", 4: "h", 2: "q", 1: "8" };
const REST_VEX: Record<number, string> = { 8: "wr", 4: "hr", 2: "qr", 1: "8r" };
const SIZES = [8, 4, 2, 1];

/**
 * Renders a melody (see MelodyBlockData in music-blocks.ts) as real staff notation with VexFlow, grouped into
 * 4/4 bars of eight eighth-note units. Gaps between notes are filled with rests of the largest aligned value.
 * VexFlow is loaded lazily (client-only, no SSR).
 */
export function StaffNotation({ length, notes, className }: { length: number; notes: MelodyNote[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Clear synchronously up front (not just after the async import resolves) so a stale, already-
    // cancelled run can never leave its SVG behind alongside a newer one.
    if (containerRef.current) containerRef.current.innerHTML = "";
    void (async () => {
      const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, BarlineType } = await import("vexflow");
      // VexFlow fetches its music font (Bravura) from a CDN without waiting for it before drawing, so on a cold
      // cache the clef glyph can render blank while plain lines and digits still show.
      await document.fonts.ready;
      const el = containerRef.current;
      if (!el || cancelled) return;
      el.innerHTML = "";

      const perBar = MELODY_UNITS_PER_BAR;
      const barCount = Math.max(1, Math.ceil(length / perBar));
      const barWidth = 38 + 4 * 34;
      const firstBarExtra = 56; // room for the clef + time signature, only drawn on the first bar
      const totalWidth = 24 + firstBarExtra + barCount * barWidth;
      const renderer = new Renderer(el, Renderer.Backends.SVG);
      renderer.resize(totalWidth, 130);
      const context = renderer.getContext();

      const noteAt = (unit: number) => notes.find((n) => n.start === unit);
      const restCovering = (unit: number) => notes.every((n) => unit < n.start || unit >= n.start + n.units);

      let x = 8;
      for (let bi = 0; bi < barCount; bi++) {
        const width = bi === 0 ? barWidth + firstBarExtra : barWidth;
        const stave = new Stave(x, 8, width);
        // The previous bar already draws its closing barline; skip this bar's opening one so the boundary isn't doubled.
        if (bi > 0) stave.setBegBarType(BarlineType.NONE);
        if (bi === 0) stave.addClef("treble").addTimeSignature("4/4");
        stave.setContext(context).draw();

        const barStart = bi * perBar;
        const barEnd = barStart + perBar;
        const tickables = [];
        let pos = barStart;
        while (pos < barEnd) {
          const note = noteAt(pos);
          if (note) {
            const vex = new StaveNote({ keys: [midiToVexKey(note.midi)], duration: NOTE_VEX[note.units], autoStem: true });
            if (midiToVexKey(note.midi).includes("#")) vex.addModifier(new Accidental("#"), 0);
            tickables.push(vex);
            pos += note.units;
            continue;
          }
          // Rest until the next note (or the end of the bar), in the largest value that stays on the beat grid.
          let gapEnd = barEnd;
          for (let u = pos + 1; u < barEnd; u++) {
            if (!restCovering(u)) {
              gapEnd = u;
              break;
            }
          }
          const size = SIZES.find((s) => (pos - barStart) % s === 0 && pos + s <= gapEnd) ?? 1;
          tickables.push(new StaveNote({ keys: ["b/4"], duration: REST_VEX[size] }));
          pos += size;
        }

        const voice = new Voice({ numBeats: 4, beatValue: 4 });
        voice.setStrict(false);
        voice.addTickables(tickables);
        // Format to the stave's actual note area (post clef/time-signature), never a guessed width —
        // guessing caused the first bar's notes to overflow past the barline into the next bar (JIRA: "double" notes).
        const formatWidth = stave.getNoteEndX() - stave.getNoteStartX() - 10;
        new Formatter().joinVoices([voice]).format([voice], Math.max(20, formatWidth));
        voice.draw(context, stave);
        x += width;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [length, notes]);

  return (
    // contain:inline-size: scroll a long staff here instead of letting its width stretch the page on phones.
    <div className={cn("overflow-x-auto [contain:inline-size]", className)}>
      {/* Forced white, like paper sheet music: VexFlow draws notes in fixed black, so this stays readable in dark mode too. */}
      <div ref={containerRef} className="inline-block rounded-md bg-white p-2 [&_svg]:block [&_svg]:max-w-none" />
    </div>
  );
}
