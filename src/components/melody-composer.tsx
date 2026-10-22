"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { savePracticeResult } from "@/app/actions/practice";
import { PRACTICE_NOT_LINKED } from "@/lib/practice";
import { PianoRoll } from "@/components/piano-roll";
import { StaffNotation } from "@/components/staff-notation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { gradeMelody, type MelodyDetail } from "@/lib/practice";
import { describeMelody, MELODY_UNITS_PER_BAR, type MelodyBlockData, type MelodyNote } from "@/lib/music-blocks";
import { cn } from "@/lib/utils";

const BAR_COUNTS = [1, 2, 4] as const;

/** Sorted copy of the notes, so two melodies can be compared regardless of the order they were written in. */
const sortNotes = (notes: MelodyNote[]) => [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi || a.units - b.units);

/**
 * Free-form melody-writing practice: an editable piano roll with a live staff-notation preview, used by
 * the interactive lessons. Optionally checks the student's melody against a fixed `target` (for a "rewrite this
 * melody" challenge) and scores it note by note; with `saveResult` the score is saved, linked to `materialId`.
 */
export function MelodyComposer({ target, className, saveResult = false, materialId }: { target?: MelodyBlockData; className?: string; saveResult?: boolean; materialId?: string }) {
  const [length, setLength] = useState(target?.length ?? 2 * MELODY_UNITS_PER_BAR);
  const [notes, setNotes] = useState<MelodyNote[]>([]);
  const [checked, setChecked] = useState(false);
  const [graded, setGraded] = useState<{ score: number; detail: MelodyDetail } | null>(null);

  async function check() {
    if (!target) return;
    const g = gradeMelody(target.notes, notes);
    setGraded(g);
    setChecked(true);
    if (!saveResult) return;
    const r = await savePracticeResult({ kind: "melody", title: `Tulis ulang melodi (${target.notes.length} nada)`, score: g.score, detail: g.detail, materialId });
    if (!r.ok) toast.error(r.error);
    else if (materialId && !r.data?.linked) toast.warning(PRACTICE_NOT_LINKED);
  }

  function resize(bars: number) {
    const next = bars * MELODY_UNITS_PER_BAR;
    setLength(next);
    setNotes((prev) => prev.filter((n) => n.start + n.units <= next));
    setChecked(false);
  }

  function reset() {
    setNotes([]);
    setChecked(false);
  }

  const match = target
    ? length === target.length &&
      JSON.stringify(sortNotes(notes)) === JSON.stringify(sortNotes(target.notes))
    : null;

  return (
    <div className={cn("grid gap-4", className)}>
      {!target && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-muted-foreground">
            Jumlah birama
            <Select className="mt-1 h-8 w-auto text-xs" value={String(length / MELODY_UNITS_PER_BAR)} onChange={(ev) => resize(Number(ev.target.value))}>
              {BAR_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </label>
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="size-3.5" /> Hapus semua
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-card p-3">
        <p className="mb-2 text-xs font-bold text-muted-foreground uppercase">Notasi baloknya</p>
        <StaffNotation length={length} notes={notes} />
      </div>

      <PianoRoll
        length={length}
        notes={notes}
        onChange={(next) => {
          setNotes(next);
          setChecked(false);
        }}
      />

      {target && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={check} disabled={notes.length === 0}>
            Periksa jawaban
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            <RotateCcw className="size-3.5" /> Ulangi
          </Button>
          {checked && graded && <span className="rounded-md bg-muted px-2 py-1 text-sm font-bold">Skor {graded.score}</span>}
          {checked && (
            <span className={cn("text-sm font-bold", match ? "text-success" : "text-danger")}>
              {match ? "Tepat! Melodimu sama persis." : "Belum sama persis — dengarkan contohnya lagi lalu coba sesuaikan."}
            </span>
          )}
          {checked && !match && <span className="text-xs text-muted-foreground">Contoh: {describeMelody(target)}</span>}
        </div>
      )}
    </div>
  );
}
