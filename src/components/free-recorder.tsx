"use client";

import { useEffect, useRef, useState } from "react";
import { SongPianoRoll } from "@/components/song-piano-roll";
import type { SongNote } from "@/lib/songs";
import { useT } from "@/i18n/client";

/** Students may record up to this many bars (4/4) in Free Play. */
export const FREE_MAX_BARS = 32;
const FREE_MAX_NOTES = 1000;
const STORAGE_KEY = "harmoni.freeRoll";

type Draft = { bpm: number; notes: SongNote[] };

function loadDraft(): Draft {
  try {
    const d = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Draft | null;
    if (d && Array.isArray(d.notes) && typeof d.bpm === "number") {
      const notes = d.notes.filter((n) => typeof n?.midi === "number" && typeof n.start === "number" && typeof n.beats === "number" && n.start < FREE_MAX_BARS * 4);
      return { bpm: Math.min(240, Math.max(30, Math.round(d.bpm))), notes: notes.slice(0, FREE_MAX_NOTES) };
    }
  } catch {
    /* storage blocked or bad data: start empty */
  }
  return { bpm: 90, notes: [] };
}

/**
 * Free Play with a piano roll: students record what they play (after a one-bar count-in, with the metronome),
 *  edit it, play it back and download it as MIDI. The take is kept in this browser only, so a refresh doesn't lose it.
 */
export function FreeRecorder({ fill = false }: { fill?: boolean }) {
  const t = useT();
  // The draft lives in localStorage, which the server can't read: the roll mounts after the first client render.
  const [draft, setDraft] = useState<Draft | null>(null);
  const notesRef = useRef<SongNote[]>([]);
  useEffect(() => {
    const d = loadDraft();
    notesRef.current = d.notes;
    setDraft(d);
  }, []);

  const save = (bpm: number, notes: SongNote[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bpm, notes }));
    } catch {
      /* ignore */
    }
  };

  if (!draft) return <div className={fill ? "flex-1" : "h-[26rem]"} aria-busy />;
  return (
    <SongPianoRoll
      initial={draft.notes}
      bpm={draft.bpm}
      onBpmChange={(bpm) => {
        setDraft((d) => (d ? { ...d, bpm } : d));
        save(bpm, notesRef.current);
      }}
      title={t("My recording")}
      onChange={(notes) => {
        notesRef.current = notes;
        save(draft.bpm, notes);
      }}
      maxBeats={FREE_MAX_BARS * 4}
      maxNotes={FREE_MAX_NOTES}
      hideFullscreen
      fill={fill}
      pianoSizeControl
      compact
    />
  );
}
