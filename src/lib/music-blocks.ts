/**
 * Encodes/decodes the music-specific lesson blocks (audio/video clip, rhythm pattern, chords/notes
 * callout) as fenced code blocks with a reserved language tag and a JSON payload, e.g.:
 *
 *   ```media:audio
 *   {"key":"...","title":"Contoh lagu"}
 *   ```
 *
 * This is the single source of truth for that syntax, shared by the block editor (src/lib/block-editor.ts)
 * and the export IR (src/lib/markdown-ir.ts), so they never drift apart. Being a plain fenced code block,
 * it round-trips through any standard Markdown parser and degrades gracefully (shows as a code block)
 * anywhere that doesn't know about it.
 */
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";
import { midiToNote } from "@/lib/music";

export type MediaBlockData = { kind: "audio" | "video"; key: string; title?: string };
/** `bpm`: the tempo the pattern is played at (80 when missing, as in older blocks). */
export type RhythmBlockData = { pattern: NoteGlyphKind[]; bpm?: number };
/** `beats[i]`: how long chord i lasts (4 = one bar when missing). `bpm`: playback tempo (90 when missing). */
export type ChordsBlockData = { label?: string; items: string[]; beats?: number[]; bpm?: number };

export const RHYTHM_DEFAULT_BPM = 80;
export const CHORDS_DEFAULT_BPM = 90;
export const CHORD_LENGTHS = [1, 2, 4] as const;
/**
 * A monophonic melody on a grid of eighth-note units (one bar = 8 units). Each note has its own length and
 * starts on a multiple of its own length, so it never crosses a beat/bar boundary. Anything not covered by a
 * note is a rest.
 */
export type MelodyNoteValue = "whole" | "half" | "quarter" | "eighth";
export const MELODY_NOTE_UNITS: Record<MelodyNoteValue, number> = { whole: 8, half: 4, quarter: 2, eighth: 1 };
export const MELODY_UNITS_PER_BAR = 8;
export type MelodyNote = { start: number; midi: number; units: number };
export type MelodyBlockData = { length: number; notes: MelodyNote[] };
/**
 * A piano song written in the piano roll (the "Lagu Piano" block). `roll` uses the piano roll text format of
 *  src/lib/songs.ts ("C4@0:1 E4@1:0.5", beats); `doNote` is the key's "do" for notasi angka labels.
 *  It replaces the older Melody block: those are shown and edited as song blocks.
 */
export type SongBlockData = { title?: string; bpm: number; doNote?: string; roll: string };

/** The tempo the old Melody block played at. */
export const MELODY_BLOCK_BPM = 96;
/** An old Melody block as song notes (its unit is an eighth note = half a beat). */
export function melodyToSongNotes(data: MelodyBlockData) {
  return data.notes.map((n) => ({ midi: n.midi, start: n.start / 2, beats: n.units / 2 }));
}

export function melodyNoteValue(units: number): MelodyNoteValue {
  return units >= 8 ? "whole" : units >= 4 ? "half" : units >= 2 ? "quarter" : "eighth";
}

/** Converts the old fixed-grid format (one duration for every step, `null` = rest) into notes. */
export function melodyFromSteps(steps: (number | null)[], stepDuration: "quarter" | "eighth"): MelodyBlockData {
  const units = stepDuration === "quarter" ? 2 : 1;
  const notes: MelodyNote[] = [];
  steps.forEach((midi, i) => {
    if (midi !== null) notes.push({ start: i * units, midi, units });
  });
  const span = steps.length * units;
  return { length: Math.max(MELODY_UNITS_PER_BAR, Math.ceil(span / MELODY_UNITS_PER_BAR) * MELODY_UNITS_PER_BAR), notes };
}

/** Plain-text summary of a melody for document exports, e.g. "C4 (seperempat) · G4 (setengah)". */
export function describeMelody(data: MelodyBlockData): string {
  const names: Record<MelodyNoteValue, string> = { whole: "penuh", half: "setengah", quarter: "seperempat", eighth: "seperdelapan" };
  if (data.notes.length === 0) return "—";
  return [...data.notes]
    .sort((a, b) => a.start - b.start)
    .map((n) => `${midiToNote(n.midi)} (${names[melodyNoteValue(n.units)]})`)
    .join(" · ");
}

/** Plain-text summary of a song block for document exports, e.g. "90 BPM · 12 not: C4 E4 G4+C5 …". Chords are joined with "+". */
export function describeSong(bpm: number, notes: { midi: number; start: number }[]): string {
  if (notes.length === 0) return "—";
  const byStart = new Map<number, number[]>();
  for (const n of [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi)) byStart.set(n.start, [...(byStart.get(n.start) ?? []), n.midi]);
  const steps = [...byStart.values()].map((m) => m.map(midiToNote).join("+"));
  const shown = steps.slice(0, 48).join(" ");
  return `${bpm} BPM · ${notes.length} not: ${shown}${steps.length > 48 ? " …" : ""}`;
}

export const MUSIC_FENCE_LANGS = ["media:audio", "media:video", "music:rhythm", "music:chords", "music:melody", "music:song"] as const;
export type MusicFenceLang = (typeof MUSIC_FENCE_LANGS)[number];

export function isMusicFenceLang(lang: string | null | undefined): lang is MusicFenceLang {
  return Boolean(lang) && (MUSIC_FENCE_LANGS as readonly string[]).includes(lang as string);
}

export const NOTE_GLYPH_KINDS = ["whole", "half", "quarter", "eighth", "rest-quarter", "rest-eighth"] as const satisfies readonly NoteGlyphKind[];

/** Length of each note value / rest in beats (quarter note = 1). */
export const NOTE_GLYPH_BEATS: Record<NoteGlyphKind, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, "rest-quarter": 1, "rest-eighth": 0.5 };

export const isRestGlyph = (kind: NoteGlyphKind) => kind === "rest-quarter" || kind === "rest-eighth";

function fence(lang: MusicFenceLang, data: unknown): string {
  return "```" + lang + "\n" + JSON.stringify(data) + "\n```";
}

export const fenceMedia = (data: MediaBlockData) => fence(data.kind === "audio" ? "media:audio" : "media:video", data);
export const fenceRhythm = (data: RhythmBlockData) => fence("music:rhythm", data);
export const fenceChords = (data: ChordsBlockData) => fence("music:chords", data);
export const fenceMelody = (data: MelodyBlockData) => fence("music:melody", data);
export const fenceSong = (data: SongBlockData) => fence("music:song", data);

export type DecodedMusicBlock =
  | ({ lang: "media:audio" | "media:video" } & MediaBlockData)
  | ({ lang: "music:rhythm" } & RhythmBlockData)
  | ({ lang: "music:chords" } & ChordsBlockData)
  | ({ lang: "music:melody" } & MelodyBlockData)
  | ({ lang: "music:song" } & SongBlockData);

const tempo = (v: unknown) => (typeof v === "number" && v >= 30 && v <= 240 ? Math.round(v) : undefined);

/** Decodes a fenced block's language + raw body. Returns null for an unrecognized lang or malformed JSON — never throws. */
export function decodeFence(lang: string | null | undefined, raw: string): DecodedMusicBlock | null {
  if (!isMusicFenceLang(lang)) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;

  if (lang === "media:audio" || lang === "media:video") {
    if (typeof d.key !== "string" || !d.key) return null;
    return { lang, kind: lang === "media:audio" ? "audio" : "video", key: d.key, title: typeof d.title === "string" ? d.title : undefined };
  }
  if (lang === "music:rhythm") {
    if (!Array.isArray(d.pattern)) return null;
    const pattern = d.pattern.filter((p): p is NoteGlyphKind => NOTE_GLYPH_KINDS.includes(p));
    return { lang, pattern, bpm: tempo(d.bpm) };
  }
  if (lang === "music:chords") {
    if (!Array.isArray(d.items)) return null;
    // Lengths stay paired with their chords when empty items are dropped.
    const rawBeats = Array.isArray(d.beats) ? d.beats : [];
    const pairs = d.items.flatMap((item, i) => (typeof item === "string" && item.trim() ? [{ item, beats: rawBeats[i] }] : []));
    const beats = pairs.map((p) => (typeof p.beats === "number" && p.beats > 0 && p.beats <= 16 ? p.beats : 4));
    return { lang, label: typeof d.label === "string" ? d.label : undefined, items: pairs.map((p) => p.item), beats, bpm: tempo(d.bpm) };
  }
  if (lang === "music:song") {
    if (typeof d.roll !== "string") return null;
    const bpm = typeof d.bpm === "number" && d.bpm >= 30 && d.bpm <= 240 ? Math.round(d.bpm) : 90;
    return {
      lang,
      title: typeof d.title === "string" && d.title.trim() ? d.title : undefined,
      bpm,
      doNote: typeof d.doNote === "string" ? d.doNote : undefined,
      roll: d.roll,
    };
  }
  // music:melody — current format is { length, notes }; the older { steps, stepDuration } grid is still read.
  if (Array.isArray(d.notes)) {
    const length = typeof d.length === "number" && d.length >= MELODY_UNITS_PER_BAR ? Math.floor(d.length / MELODY_UNITS_PER_BAR) * MELODY_UNITS_PER_BAR : MELODY_UNITS_PER_BAR;
    const notes = d.notes.flatMap((n): MelodyNote[] => {
      if (!n || typeof n !== "object") return [];
      const { start, midi, units } = n as Record<string, unknown>;
      if (typeof start !== "number" || typeof midi !== "number" || typeof units !== "number") return [];
      const valid = Number.isInteger(start) && Number.isInteger(midi) && [1, 2, 4, 8].includes(units) && start % units === 0 && start + units <= length;
      return valid ? [{ start, midi, units }] : [];
    });
    return { lang, length, notes };
  }
  if (!Array.isArray(d.steps)) return null;
  const steps = d.steps.map((s): number | null => (typeof s === "number" && Number.isFinite(s) ? Math.round(s) : null));
  return { lang, ...melodyFromSteps(steps, d.stepDuration === "eighth" ? "eighth" : "quarter") };
}
