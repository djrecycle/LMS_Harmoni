/**
 * Songs for the "Play a Song" piano mode (falling notes). Public-domain melodies, right hand only.
 *  Two ways to write a melody:
 *  - `melody`: letter names, "C4:1 E4:0.5 R:1" (note:beats; R = rest; beats default to 1).
 *  - `angka` + `doNote`: notasi angka as in Indonesian songbooks, "1 3 5 1' | 7. 2 - 0".
 *    1-7 = do-si, ' after = an octave up, . after = an octave down, 0 = rest,
 *    - = hold the previous note one more beat, :0.5 = length in beats, | bar lines are ignored.
 *  Chords in both: join notes with "+", e.g. "C4+E4+G4:2" or "1+3+5:2".
 *  - `roll` (written by the piano roll editor): every note has its own start, "C4@0:1 E4@0:2 G4@1.5:0.5"
 *    (note@start-beat:length-in-beats), so notes may overlap freely, as in a DAW.
 */
import { midiToNote, noteToMidi } from "./music";

export type SongNote = { midi: number; start: number; beats: number };
/** `origin`: the region of an Indonesian folk song (lagu daerah). */
export type Song = {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  bpm: number;
  origin?: string;
  notes: SongNote[];
  /** Added by a teacher (not built in). */ custom?: boolean;
  /** The key's "do" (for notasi angka and solfège labels, and the staff's key signature); unknown when missing. */ doMidi?: number;
};

type SongSource = { id: string; title: string; level: 1 | 2 | 3; bpm: number; origin?: string } & ({ melody: string } | { angka: string; doNote: string });

const SOURCES: SongSource[] = [
  {
    id: "c-major",
    title: "C Major Scale",
    level: 1,
    bpm: 90,
    melody: "C4 D4 E4 F4 G4 A4 B4 C5:2 B4 A4 G4 F4 E4 D4 C4:2",
  },
  {
    id: "twinkle",
    title: "Twinkle Twinkle Little Star",
    level: 1,
    bpm: 100,
    melody: `C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2
      G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2
      C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2`,
  },
  {
    id: "mary",
    title: "Mary Had a Little Lamb",
    level: 1,
    bpm: 110,
    melody: "E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4",
  },
  {
    id: "ode-to-joy",
    title: "Ode to Joy (Beethoven)",
    level: 2,
    bpm: 100,
    melody: `E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2
      E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2`,
  },
  {
    id: "happy-birthday",
    title: "Happy Birthday",
    level: 2,
    bpm: 100,
    melody: `G4:0.75 G4:0.25 A4 G4 C5 B4:2 G4:0.75 G4:0.25 A4 G4 D5 C5:2
      G4:0.75 G4:0.25 G5 E5 C5 B4 A4:2 F5:0.75 F5:0.25 E5 C5 D5 C5:3`,
  },
  {
    id: "jingle-bells",
    title: "Jingle Bells",
    level: 2,
    bpm: 120,
    melody: `E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4
      F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2
      E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4
      F4 F4 F4 F4 F4 E4 E4 E4:0.5 E4:0.5 G4 G4 F4 D4 C4:4`,
  },
  {
    id: "fur-elise",
    title: "Für Elise (Beethoven)",
    level: 3,
    bpm: 72,
    melody: `E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1
      R:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 R:0.5 E4:0.5 G#4:0.5 B4:0.5 C5:1
      R:0.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1
      R:0.5 C4:0.5 E4:0.5 A4:0.5 B4:1 R:0.5 E4:0.5 C5:0.5 B4:0.5 A4:2`,
  },
  // ---- Lagu daerah Indonesia ----
  {
    id: "gundul-pacul",
    title: "Gundul-Gundul Pacul",
    origin: "Jawa Tengah",
    level: 2,
    bpm: 100,
    doNote: "C4",
    angka: `1 3 1 3 | 4 5 5 - | 7 1':0.5 7:0.5 1':0.5 7:0.5 5 | - - 0 0 |
      1 3 1 3 | 4 5 5 - | 7 1':0.5 7:0.5 1':0.5 7:0.5 5 | - - 0 0 |
      1 3 5 4 | 4 5 4 - | 3 1 4 3 | 1 - 0 0 |
      1 3 5 4 | 4 5 4 - | 3 1 4 3 | 1 - - - |`,
  },
];

const SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];
export const MAX_SONG_NOTES = 2000;

export type SongFormat = "angka" | "letters" | "roll";
export const SONG_FORMATS = ["angka", "letters", "roll"] as const;
/** A melody that cannot be read: `token` is the part of the text that is wrong. */
export type SongParseResult = { ok: true; notes: SongNote[] } | { ok: false; error: "empty" | "token" | "do" | "range" | "too_long"; token?: string };

/**
 * Melody text -> notes (see the format at the top of this file). Chords: join notes with "+" ("C4+E4:2", "1+3+5").
 *  Never throws, so teacher input can be checked live.
 */
export function parseSongNotation(format: SongFormat, notation: string, doNote = "C4"): SongParseResult {
  if (format === "roll") return parseRoll(notation);
  const doMidi = noteToMidi(doNote);
  if (format === "angka" && doMidi === null) return { ok: false, error: "do", token: doNote };
  const notes: SongNote[] = [];
  let t = 0;
  let last: SongNote[] = [];
  for (const token of notation.split(/\s+/).filter((x) => x && x !== "|" && x !== "||")) {
    if (token === "-") {
      for (const n of last) n.beats += 1;
      t += 1;
      continue;
    }
    const [body, len, extra] = token.split(":");
    const beats = len === undefined ? 1 : Number(len);
    if (extra !== undefined || !body || !(beats > 0 && beats <= 32)) return { ok: false, error: "token", token };
    const rest = format === "angka" ? body === "0" : body.toUpperCase() === "R";
    last = [];
    if (!rest) {
      for (const part of body.split("+")) {
        let midi: number | null = null;
        if (format === "angka") {
          const m = /^([1-7])([',.]*)$/.exec(part);
          if (m) {
            let octave = 0;
            for (const c of m[2]) octave += c === "'" ? 1 : -1;
            midi = doMidi! + SCALE_STEPS[Number(m[1]) - 1] + octave * 12;
          }
        } else midi = noteToMidi(part);
        if (midi === null) return { ok: false, error: "token", token };
        if (midi < 21 || midi > 108) return { ok: false, error: "range", token };
        const n = { midi, start: t, beats };
        notes.push(n);
        last.push(n);
      }
    }
    t += beats;
    if (notes.length > MAX_SONG_NOTES) return { ok: false, error: "too_long" };
  }
  if (!notes.length) return { ok: false, error: "empty" };
  return { ok: true, notes };
}

const ROLL_TOKEN = /^([A-Ga-g][#b]?-?\d)@(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/;
/** The longest song the piano roll accepts, in beats. */
export const MAX_ROLL_BEATS = 4096;

function parseRoll(notation: string): SongParseResult {
  const notes: SongNote[] = [];
  for (const token of notation.split(/\s+/).filter((x) => x && x !== "|")) {
    const m = ROLL_TOKEN.exec(token);
    const midi = m ? noteToMidi(m[1]) : null;
    const start = m ? Number(m[2]) : NaN;
    const beats = m ? Number(m[3]) : NaN;
    if (midi === null || !(start >= 0 && start < MAX_ROLL_BEATS) || !(beats > 0 && beats <= 64)) return { ok: false, error: "token", token };
    if (midi < 21 || midi > 108) return { ok: false, error: "range", token };
    notes.push({ midi, start, beats });
    if (notes.length > MAX_SONG_NOTES) return { ok: false, error: "too_long" };
  }
  if (!notes.length) return { ok: false, error: "empty" };
  // The song player walks the notes in time order.
  notes.sort((a, b) => a.start - b.start || b.midi - a.midi);
  return { ok: true, notes };
}

const fmtBeat = (x: number) => String(Number(x.toFixed(3)));

/** Notes -> "roll" text (lossless). Eight notes per line keep it readable. */
export function notesToRoll(notes: SongNote[]): string {
  return [...notes]
    .sort((a, b) => a.start - b.start || b.midi - a.midi)
    .map((n) => `${midiToNote(n.midi)}@${fmtBeat(n.start)}:${fmtBeat(n.beats)}`)
    .reduce((acc, tok, i) => acc + (i === 0 ? "" : i % 8 === 0 ? "\n" : " ") + tok, "");
}

/** English message for a parse error (translate it with t(); `{0}` is the wrong token). */
export function songParseMessage(r: Extract<SongParseResult, { ok: false }>): [string, string] {
  const msg = {
    empty: "The melody has no notes yet.",
    token: "This part of the melody cannot be read: {0}",
    do: "The \"do\" note is not valid: {0}",
    range: "This note is outside the piano range: {0}",
    too_long: "The melody is too long (at most 2000 notes).",
  }[r.error];
  return [msg, r.token ?? ""];
}

function parseOrThrow(format: SongFormat, notation: string, doNote?: string) {
  const r = parseSongNotation(format, notation, doNote);
  if (!r.ok) throw new Error(`Invalid built-in song: ${r.error} ${r.token ?? ""}`);
  return r.notes;
}

export const SONGS: Song[] = SOURCES.map((src) => {
  const { id, title, level, bpm, origin } = src;
  const notes = "melody" in src ? parseOrThrow("letters", src.melody) : parseOrThrow("angka", src.angka, src.doNote);
  const doMidi = "angka" in src ? (noteToMidi(src.doNote) ?? undefined) : undefined;
  return { id, title, level, bpm, origin, notes, doMidi };
});

/** A teacher's saved song (from the database) as a playable Song. Null when its melody cannot be read. */
export function songFromRow(row: { id: string; title: string; origin: string; level: number; bpm: number; format: SongFormat; doNote: string; notation: string }): Song | null {
  const r = parseSongNotation(row.format, row.notation, row.doNote);
  if (!r.ok) return null;
  const level = Math.min(3, Math.max(1, row.level)) as 1 | 2 | 3;
  // Letters and piano roll songs may leave the key empty: it is then detected from the notes.
  const doMidi = row.doNote ? (noteToMidi(row.doNote) ?? undefined) : undefined;
  return { id: row.id, title: row.title, level, bpm: row.bpm, origin: row.origin || undefined, notes: r.notes, custom: true, doMidi };
}

/**
 * The "do" of the major key that fits a melody best (most beats in the scale; ending on do breaks ties).
 *  Returned as C4..G#4 or A3..B3, like the song form's key list.
 */
export function detectDoMidi(notes: SongNote[]): number {
  const last = notes.length ? notes[notes.length - 1].midi % 12 : 0;
  let best = 0;
  let bestScore = -Infinity;
  // Keys with fewer sharps/flats first, so they win a tie.
  for (const pc of [0, 7, 5, 2, 10, 9, 3, 4, 8, 11, 1, 6]) {
    const scale = new Set([0, 2, 4, 5, 7, 9, 11].map((d) => (pc + d) % 12));
    let score = notes.reduce((a, n) => a + (scale.has(n.midi % 12) ? n.beats : 0), 0);
    if (last === pc) score += 0.5;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = pc;
    }
  }
  return best >= 9 ? 48 + best : 60 + best;
}

export const songLength = (song: Song) => Math.max(...song.notes.map((n) => n.start + n.beats));
