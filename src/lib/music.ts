/** Note utilities. Used on the server (grading) and the client (piano). */

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const OFFSET: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" -> 60, "Db4" -> 61, "F#3" -> 54. Returns null if invalid. */
export function noteToMidi(note: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]?)(-?\d)$/.exec(note.trim());
  if (!m) return null;
  let n = OFFSET[m[1].toUpperCase()];
  if (m[2] === "#" || m[2] === "♯") n += 1;
  if (m[2] === "b" || m[2] === "♭") n -= 1;
  return (Number(m[3]) + 1) * 12 + n;
}

/** 60 -> "C4" (always uses sharps). */
export function midiToNote(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Split free text ("C4 E4, G4") into a list of valid notes. Returns null if any is invalid. */
export function parseNoteList(text: string): string[] | null {
  const part = text
    .split(/[\s,;-]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result: string[] = [];
  for (const b of part) {
    const m = noteToMidi(b);
    if (m === null) return null;
    result.push(midiToNote(m));
  }
  return result;
}

export function isBlackKey(midi: number) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

/** 61 -> "c#/4" (VexFlow's StaveNote key format: lowercase letter, accidental, "/", octave). */
export function midiToVexKey(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name[0].toLowerCase()}${name.slice(1)}/${octave}`;
}

const ANGKA_STEPS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Notasi angka of a note in the major key whose "do" is `doMidi`: the digit (1-7, "4#" for a raised note) and the
 *  octave relative to that do (1 = one dot above, -1 = one dot below).
 */
export function angkaOf(midi: number, doMidi: number): { digit: string; octave: number } {
  const d = midi - doMidi;
  const octave = Math.floor(d / 12);
  const step = d - octave * 12;
  const i = ANGKA_STEPS.indexOf(step);
  if (i >= 0) return { digit: String(i + 1), octave };
  return { digit: `${ANGKA_STEPS.indexOf(step - 1) + 1}#`, octave };
}

const SOLFEGE: Record<number, string> = { 0: "do", 2: "re", 4: "mi", 5: "fa", 7: "sol", 9: "la", 11: "si" };

/** Solfège syllable of a note in the major key whose "do" is `doMidi` (movable do). Null for notes outside the scale. */
export function solfegeOf(midi: number, doMidi: number): string | null {
  return SOLFEGE[(((midi - doMidi) % 12) + 12) % 12] ?? null;
}

/** Spelling variants of solfège used in schools ("sol"/"so", "si"/"ti"), all reduced to one form for comparing. */
export function normalizeSolfege(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === "so" ? "sol" : w === "ti" ? "si" : w))
    .join(" ");
}

/** Accepted spellings of a solfège answer ("sol"/"so", "si"/"ti") for fill-in keys. */
export function solfegeVariants(text: string): string[] {
  const words = normalizeSolfege(text).split(" ");
  const swap = (w: string, so: boolean, ti: boolean) => (w === "sol" && so ? "so" : w === "si" && ti ? "ti" : w);
  const all = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ].map(([so, ti]) => words.map((w) => swap(w, so, ti)).join(" "));
  return [...new Set(all)];
}

const CHORD_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "6": [0, 4, 7, 9],
};

/** The notes of a chord symbol ("C", "Am", "G7", "F#m", "Bb") or a note list ("C4", "C4 E4 G4"). Null when not recognised. */
export function chordMidis(item: string): number[] | null {
  // Chord symbols first: "G7" is the chord, not the note G in octave 7 (single notes are written C4, E4…).
  const m = /^([A-G])([#b♯♭]?)(maj7|maj|min|m7|m|7|dim|aug|sus2|sus4|6)?$/.exec(item.trim().replace(/\s+/g, ""));
  if (!m) {
    const list = parseNoteList(item);
    return list && list.length ? list.map((n) => noteToMidi(n)!) : null;
  }
  let root = noteToMidi(`${m[1]}${m[2]}4`);
  if (root === null) return null;
  if (root >= 67) root -= 12; // G and above start an octave lower, to stay around middle C
  return CHORD_INTERVALS[m[3] ?? ""].map((i) => root + i);
}
