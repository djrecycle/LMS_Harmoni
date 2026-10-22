"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Play, Square } from "lucide-react";
import { Piano } from "@/components/piano";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { audioTime, scheduleNote, unlockAudio } from "@/lib/audio";
import { isBlackKey, midiToNote } from "@/lib/music";
import { MELODY_NOTE_UNITS, MELODY_UNITS_PER_BAR, melodyNoteValue, type MelodyNote, type MelodyNoteValue } from "@/lib/music-blocks";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const DEMO_BPM = 96;
const VALUE_OPTIONS: MelodyNoteValue[] = ["whole", "half", "quarter", "eighth"];
const VALUE_LABEL: Record<MelodyNoteValue, string> = { whole: "Whole note", half: "Half note", quarter: "Quarter note", eighth: "Eighth note" };

/** Places a note, dropping any note it overlaps in time (the melody is monophonic). */
function placeNote(notes: MelodyNote[], note: MelodyNote): MelodyNote[] {
  const end = note.start + note.units;
  return [...notes.filter((n) => n.start + n.units <= note.start || n.start >= end), note].sort((a, b) => a.start - b.start);
}

/**
 * A step-sequencer "piano roll": pitch on the vertical axis, time on the horizontal axis in eighth-note units.
 * Each note has its own length (whole/half/quarter/eighth) and sits on a multiple of that length, so notes never
 * cross a beat or bar line. Clicking an empty cell writes a note of the chosen value there; clicking a note
 * selects it, and the selected note can be lengthened, shortened or deleted. Read-only when `onChange` is omitted.
 */
export function PianoRoll({
  length,
  notes,
  onChange,
  lowMidi = 60, // C4
  highMidi = 72, // C5
  className,
}: {
  length: number;
  notes: MelodyNote[];
  onChange?: (notes: MelodyNote[]) => void;
  lowMidi?: number;
  highMidi?: number;
  className?: string;
}) {
  const t = useT();
  const editable = Boolean(onChange);
  const [value, setValue] = useState<MelodyNoteValue>("quarter");
  const [activeUnit, setActiveUnit] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [open, setOpen] = useState(true);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => setCursor((c) => Math.min(c, Math.max(0, length - 1))), [length]);

  const units = MELODY_NOTE_UNITS[value];
  const pitches: number[] = [];
  for (let m = highMidi; m >= lowMidi; m--) pitches.push(m);

  const noteIndexAt = (midi: number, unit: number) => notes.findIndex((n) => n.midi === midi && unit >= n.start && unit < n.start + n.units);
  const selectedNote = selected !== null ? notes[selected] : undefined;

  /** Writes a note of the current value at the aligned slot containing `unit`, if it fits in the melody. */
  const writeAt = (unit: number, midi: number, len: number) => {
    if (!onChange) return null;
    const start = Math.floor(unit / len) * len;
    if (start + len > length) return null;
    const next = placeNote(notes, { start, midi, units: len });
    onChange(next);
    return { start, next };
  };

  const clickCell = (midi: number, unit: number) => {
    setCursor(unit);
    const idx = noteIndexAt(midi, unit);
    if (idx >= 0) {
      setSelected(selected === idx ? null : idx);
      return;
    }
    if (!onChange) return;
    writeAt(unit, midi, units);
    setSelected(null);
  };

  /** Writes the note the on-screen/MIDI/computer-keyboard piano just played at the write cursor, then advances it. */
  const writeFromPiano = (midi: number) => {
    if (!onChange || length === 0) return;
    const written = writeAt(cursor, midi, units);
    if (!written) return;
    setSelected(null);
    setCursor(Math.min(length - 1, written.start + units));
  };

  /** Lengthens (×2) or shortens (÷2) the selected note, keeping its start on the new value's grid. */
  const resizeSelected = (factor: 2 | 0.5) => {
    if (!onChange || !selectedNote) return;
    const newUnits = selectedNote.units * factor;
    if (newUnits < 1 || newUnits > MELODY_UNITS_PER_BAR) return;
    const start = Math.floor(selectedNote.start / newUnits) * newUnits;
    if (start + newUnits > length) return;
    const rest = notes.filter((_, i) => i !== selected);
    const next = placeNote(rest, { start, midi: selectedNote.midi, units: newUnits });
    onChange(next);
    setSelected(next.findIndex((n) => n.start === start && n.midi === selectedNote.midi));
  };

  const deleteSelected = () => {
    if (!onChange || selected === null) return;
    onChange(notes.filter((_, i) => i !== selected));
    setSelected(null);
  };

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setActiveUnit(null);
  }, []);

  const play = useCallback(async () => {
    stop();
    await unlockAudio();
    const unitSeconds = 60 / DEMO_BPM / 2; // one eighth-note unit
    const start = audioTime() + 0.08;
    notes.forEach((n) => scheduleNote(n.midi, start + n.start * unitSeconds, n.units * unitSeconds * 0.9));
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let u = 0; u < length; u++) {
      timers.push(setTimeout(() => !cancelled && setActiveUnit(u), (u * unitSeconds + 0.08) * 1000));
    }
    timers.push(setTimeout(() => !cancelled && setActiveUnit(null), (length * unitSeconds + 0.08) * 1000));
    stopRef.current = () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [notes, length, stop]);

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => (activeUnit === null ? play() : stop())}>
          {activeUnit === null ? <Play className="size-3.5" /> : <Square className="size-3.5" />}
          {activeUnit === null ? t("Listen") : t("Stop")}
        </Button>
        {editable && open && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            {t("Note value")}
            <Select className="h-8 w-auto text-xs" value={value} onChange={(ev) => setValue(ev.target.value as MelodyNoteValue)}>
              {VALUE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {t(VALUE_LABEL[v])}
                </option>
              ))}
            </Select>
          </label>
        )}
        <Button type="button" size="sm" variant="ghost" className="ml-auto" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {open ? t("Minimize piano roll") : t("Expand piano roll")}
        </Button>
      </div>

      {open && editable && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("Previous step")} disabled={cursor <= 0} onClick={() => setCursor((c) => Math.max(0, c - 1))}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <span>
            {t("Writing at step")} {cursor + 1}/{length}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6"
            aria-label={t("Next step")}
            disabled={cursor >= length - 1}
            onClick={() => setCursor((c) => Math.min(length - 1, c + 1))}
          >
            <ChevronRight className="size-3.5" />
          </Button>
          {selectedNote && (
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <span className="text-foreground">
                {midiToNote(selectedNote.midi)} · {t(VALUE_LABEL[melodyNoteValue(selectedNote.units)])}
              </span>
              <Button type="button" size="sm" variant="outline" disabled={selectedNote.units >= MELODY_UNITS_PER_BAR} onClick={() => resizeSelected(2)}>
                {t("Extend note")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={selectedNote.units <= 1} onClick={() => resizeSelected(0.5)}>
                {t("Shorten note")}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={deleteSelected}>
                {t("Delete note")}
              </Button>
            </span>
          )}
        </div>
      )}

      {open && (
        // contain:inline-size — the grid is wider than a phone; without it that width leaks up through every
        // parent grid and stretches the whole page sideways instead of scrolling here.
        <div className="overflow-x-auto rounded-xl border bg-neutral-900 p-1.5 [contain:inline-size]">
          <div className="inline-grid" style={{ gridTemplateColumns: `3rem repeat(${length}, minmax(1.25rem, 1fr))` }}>
            {pitches.map((midi) => {
              const black = isBlackKey(midi);
              return (
                <div key={midi} className="contents">
                  <div
                    className={cn(
                      "sticky left-0 z-10 flex items-center justify-end border-b border-neutral-800 px-2 py-1 text-[0.65rem] font-bold",
                      black ? "bg-neutral-800 text-neutral-400" : "bg-neutral-900 text-neutral-200",
                    )}
                  >
                    {midiToNote(midi)}
                  </div>
                  {Array.from({ length }, (_, unit) => {
                    const idx = noteIndexAt(midi, unit);
                    const note = idx >= 0 ? notes[idx] : undefined;
                    const isHead = note?.start === unit;
                    return (
                      <button
                        key={unit}
                        type="button"
                        disabled={!editable}
                        aria-label={`${midiToNote(midi)} · ${t("step")} ${unit + 1}`}
                        onClick={() => clickCell(midi, unit)}
                        className={cn(
                          "h-7 border-b border-neutral-800 transition-colors",
                          unit % MELODY_UNITS_PER_BAR === 0 ? "border-l border-l-neutral-500" : unit % 2 === 0 ? "border-l border-l-neutral-700" : "border-l border-l-neutral-800/60",
                          black ? "bg-neutral-800/60" : "bg-neutral-900",
                          note && (isHead ? "!bg-primary" : "!bg-primary/60"),
                          note && idx === selected && "ring-2 ring-inset ring-white",
                          editable && cursor === unit && "ring-1 ring-inset ring-primary/70",
                          activeUnit === unit && !note && "bg-neutral-700",
                          editable && !note && "hover:bg-neutral-700/80",
                        )}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editable && length > 0 && <Piano onNotePress={writeFromPiano} formatName={false} className="pt-1" />}
    </div>
  );
}
