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
/**
 * Time signatures (sukat) of the rhythm and chord blocks. Beats are always counted in quarter notes:
 *  `bar` = quarter notes per bar; `click` = the metronome step (6/8 ticks every eighth note).
 */
export const METERS = {
  "2/4": { bar: 2, click: 1 },
  "3/4": { bar: 3, click: 1 },
  "4/4": { bar: 4, click: 1 },
  "6/8": { bar: 3, click: 0.5 },
} as const;
export type Meter = keyof typeof METERS;
export const isMeter = (v: unknown): v is Meter => typeof v === "string" && v in METERS;
/** Quarter notes per bar ("4/4" when missing). */
export const barBeats = (meter?: Meter) => METERS[meter ?? "4/4"].bar;

/** The percussion sounds a rhythm block can be played with (see RHYTHM_VOICES in src/lib/audio.ts). */
export const RHYTHM_VOICE_IDS = ["drum", "tom", "kendang", "tepuk", "kentongan", "tamborin"] as const;
export type RhythmVoice = (typeof RHYTHM_VOICE_IDS)[number];
export const isRhythmVoice = (v: unknown): v is RhythmVoice => typeof v === "string" && (RHYTHM_VOICE_IDS as readonly string[]).includes(v);

/**
 * `bpm`: the tempo the pattern is played at (80 when missing, as in older blocks). `meter`: 4/4 when missing.
 *  `voice`: the sound the teacher chose (drum when missing).
 */
export type RhythmBlockData = { pattern: NoteGlyphKind[]; bpm?: number; meter?: Meter; voice?: RhythmVoice };
/** `beats[i]`: how long chord i lasts (one 4/4 bar when missing). `bpm`: playback tempo (90 when missing). */
export type ChordsBlockData = { label?: string; items: string[]; beats?: number[]; bpm?: number; meter?: Meter };

export const RHYTHM_DEFAULT_BPM = 80;
export const CHORDS_DEFAULT_BPM = 90;
export const CHORD_LENGTHS = [1, 2, 3, 4] as const;
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

/** The basic note values (what the AI and the question types use). */
export const NOTE_GLYPH_KINDS = ["whole", "half", "quarter", "eighth", "rest-quarter", "rest-eighth"] as const satisfies readonly NoteGlyphKind[];
/** Every note value and rest a rhythm block can hold, including dotted notes and triplets. */
export const ALL_GLYPH_KINDS = [
  "whole",
  "dotted-half",
  "half",
  "dotted-quarter",
  "quarter",
  "dotted-eighth",
  "eighth",
  "sixteenth",
  "thirty-second",
  "triplet-quarter",
  "triplet-eighth",
  "triplet-sixteenth",
  "rest-whole",
  "rest-half",
  "rest-quarter",
  "rest-eighth",
  "rest-sixteenth",
  "rest-thirty-second",
  "rest-triplet-quarter",
  "rest-triplet-eighth",
  "rest-triplet-sixteenth",
] as const satisfies readonly NoteGlyphKind[];

/** Length of each note value / rest in beats (quarter note = 1). */
export const NOTE_GLYPH_BEATS: Record<NoteGlyphKind, number> = {
  whole: 4,
  "dotted-half": 3,
  half: 2,
  "dotted-quarter": 1.5,
  quarter: 1,
  "dotted-eighth": 0.75,
  eighth: 0.5,
  sixteenth: 0.25,
  "thirty-second": 0.125,
  // Triplets: three in the time of two.
  "triplet-quarter": 2 / 3,
  "triplet-eighth": 1 / 3,
  "triplet-sixteenth": 1 / 6,
  "rest-whole": 4,
  "rest-half": 2,
  "rest-quarter": 1,
  "rest-eighth": 0.5,
  "rest-sixteenth": 0.25,
  "rest-thirty-second": 0.125,
  "rest-triplet-quarter": 2 / 3,
  "rest-triplet-eighth": 1 / 3,
  "rest-triplet-sixteenth": 1 / 6,
};

export type GlyphValue = "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "thirty-second";

/** The parts of a note value: a rest or not, the plain value, dotted, part of a triplet. */
export function parseGlyph(kind: NoteGlyphKind): { rest: boolean; value: GlyphValue; dotted: boolean; triplet: boolean } {
  const rest = kind.startsWith("rest-");
  const k = kind.replace(/^rest-/, "");
  return { rest, value: k.replace(/^(triplet|dotted)-/, "") as GlyphValue, dotted: k.startsWith("dotted-"), triplet: k.startsWith("triplet-") };
}

const VALUE_NAME: Record<GlyphValue, string> = { whole: "whole", half: "half", quarter: "quarter", eighth: "eighth", sixteenth: "sixteenth", "thirty-second": "32nd" };

/** English name for a note value ("Dotted quarter note", "Eighth-note triplet", "Sixteenth rest"); translate with t(). */
export function glyphLabel(kind: NoteGlyphKind): string {
  const { rest, value, dotted, triplet } = parseGlyph(kind);
  const name = VALUE_NAME[value];
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  if (triplet) return rest ? `${cap(name)}-note triplet rest` : `${cap(name)}-note triplet`;
  return `${dotted ? "Dotted " : ""}${dotted ? name : cap(name)} ${rest ? "rest" : "note"}`;
}

/**
 * Checks the triplets of a rhythm: each run of triplets of one value must come in whole groups of three, and a group
 *  must not cross a bar line (`bar` quarter notes). Returns what is wrong, or null.
 */
export function tripletProblem(pattern: NoteGlyphKind[], bar: number): "incomplete" | "crosses" | null {
  let pos = 0;
  for (let i = 0; i < pattern.length; ) {
    const { triplet, value } = parseGlyph(pattern[i]);
    if (!triplet) {
      pos += NOTE_GLYPH_BEATS[pattern[i]];
      i++;
      continue;
    }
    const group = pattern.slice(i, i + 3);
    if (group.length < 3 || group.some((g) => !parseGlyph(g).triplet || parseGlyph(g).value !== value)) return "incomplete";
    const len = group.reduce((s, g) => s + NOTE_GLYPH_BEATS[g], 0);
    const start = Math.round((pos % bar) * 96) / 96;
    if (start + len > bar + 1e-6) return "crosses";
    pos += len;
    i += 3;
  }
  return null;
}

/** How a note value is drawn on the staff: VexFlow duration code, dotted, part of a 3:2 triplet. */
export function glyphNotation(kind: NoteGlyphKind): { code: string; dotted: boolean; triplet: boolean } {
  const { value, dotted, triplet } = parseGlyph(kind);
  const code = { whole: "w", half: "h", quarter: "q", eighth: "8", sixteenth: "16", "thirty-second": "32" }[value];
  return { code, dotted, triplet };
}

export const isRestGlyph = (kind: NoteGlyphKind) => kind.startsWith("rest-");

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
    const pattern = d.pattern.filter((p): p is NoteGlyphKind => (ALL_GLYPH_KINDS as readonly string[]).includes(p));
    return { lang, pattern, bpm: tempo(d.bpm), meter: isMeter(d.meter) ? d.meter : undefined, voice: isRhythmVoice(d.voice) ? d.voice : undefined };
  }
  if (lang === "music:chords") {
    if (!Array.isArray(d.items)) return null;
    // Lengths stay paired with their chords when empty items are dropped.
    const rawBeats = Array.isArray(d.beats) ? d.beats : [];
    const pairs = d.items.flatMap((item, i) => (typeof item === "string" && item.trim() ? [{ item, beats: rawBeats[i] }] : []));
    const beats = pairs.map((p) => (typeof p.beats === "number" && p.beats > 0 && p.beats <= 16 ? p.beats : 4));
    return { lang, label: typeof d.label === "string" ? d.label : undefined, items: pairs.map((p) => p.item), beats, bpm: tempo(d.bpm), meter: isMeter(d.meter) ? d.meter : undefined };
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
