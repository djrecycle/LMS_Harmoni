/**
 * Music notation written as short text (by a teacher or the AI) that the app draws as a question image.
 * Safe for both server and client: parsing only, no drawing (see notation-render.ts for that).
 *
 * Staff notation ("not balok"), tokens separated by spaces:
 *   time=3/4  key=G  clef=bass      optional header (defaults: 4/4, C, treble)
 *   C4  F#4/8  Bb3/h.  E5/q..       pitch + octave, then /w /h /q /8 /16 (default q), dots for dotted
 *   C4+E4+G4/h                      chord
 *   R/q                             rest
 *   C4/q[A]                         label under the note (a letter to point at, or a lyric syllable); C4/q"A" also works
 *   |  ||                           bar line, final bar line
 *
 * Numbered notation ("not angka"):
 *   do=G  time=4/4                  optional header
 *   1 2 3 4 | 5 . 5 . ||            digits 1-7, 0 = rest, "." = hold one beat
 *   1'  5,                          ' = high octave (dot above), , = low octave (dot below); may repeat
 *   4#  7b                          raised / lowered note (slash through the digit)
 *   6_  6__                         one underline = half beat, two = quarter beat
 *   1[do]                           label / lyric under the note
 */

export const NOTATION_KINDS = ["staff", "angka"] as const;
export type NotationKind = (typeof NOTATION_KINDS)[number];
export type Notation = { kind: NotationKind; text: string };

export const NOTATION_LABELS: Record<NotationKind, string> = { staff: "Staff notation", angka: "Numbered notation" };

/** Split into tokens, keeping a label ([...] or "...", which may contain spaces) with its note. */
function tokens(text: string): string[] {
  return text.match(/[^\s"[]*(?:"[^"]*"|\[[^\]]*\])|\S+/g) ?? [];
}

/* ------------------------------------------------------------------ staff */

export type StaffNote = {
  /** VexFlow keys, e.g. "c/4", "f#/4"; one for a rest. */
  keys: string[];
  /** Accidental shown for each key ("#", "b", "n" or ""). */
  accidentals: string[];
  duration: "w" | "h" | "q" | "8" | "16";
  dots: number;
  rest: boolean;
  label: string;
};
export type StaffBar = { notes: StaffNote[]; final: boolean };
export type StaffScore = { clef: "treble" | "bass"; time: string; key: string; bars: StaffBar[] };

const KEYS = ["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Am", "Em", "Bm", "F#m", "C#m", "Dm", "Gm", "Cm", "Fm"];
const NOTE_RE = /^([A-Ga-g])(#|b|n)?([1-7])$/;
// Labels are written [A]: square brackets need no escaping inside the AI's JSON (double quotes broke it).
const STAFF_TOKEN_RE = /^([^/"[]+)(?:\/(w|h|q|8|16)(\.{0,2}))?(?:"([^"]*)"|\[([^\]]*)\])?$/;

export function parseStaff(text: string): { ok: true; score: StaffScore } | { ok: false; error: string; arg?: string } {
  const score: StaffScore = { clef: "treble", time: "4/4", key: "C", bars: [] };
  let bar: StaffNote[] = [];
  const close = (final: boolean) => {
    if (bar.length) score.bars.push({ notes: bar, final });
    else if (final && score.bars.length) score.bars[score.bars.length - 1].final = true;
    bar = [];
  };
  for (const tok of tokens(text)) {
    if (tok === "|") close(false);
    else if (tok === "||") close(true);
    else if (/^time=\d{1,2}\/(2|4|8|16)$/.test(tok)) score.time = tok.slice(5);
    else if (/^key=/.test(tok)) {
      const k = tok.slice(4);
      if (!KEYS.includes(k)) return { ok: false, error: "Unknown key \"{0}\"", arg: k };
      score.key = k;
    } else if (tok === "clef=treble" || tok === "clef=bass") score.clef = tok.slice(5) as "treble" | "bass";
    else {
      const m = STAFF_TOKEN_RE.exec(tok);
      if (!m) return { ok: false, error: "Cannot read \"{0}\"", arg: tok };
      const [, body, duration = "q", dots = "", quoted, bracketed] = m;
      const label = quoted ?? bracketed ?? "";
      const note: StaffNote = { keys: [], accidentals: [], duration: duration as StaffNote["duration"], dots: dots.length, rest: false, label };
      if (body === "R" || body === "r") {
        note.rest = true;
        note.keys = [score.clef === "bass" ? "d/3" : "b/4"];
        note.accidentals = [""];
      } else {
        for (const p of body.split("+")) {
          const n = NOTE_RE.exec(p);
          if (!n) return { ok: false, error: "Cannot read the note \"{0}\"", arg: p };
          const acc = n[2] ?? "";
          note.keys.push(`${n[1].toLowerCase()}${acc === "n" ? "" : acc}/${n[3]}`);
          note.accidentals.push(acc);
        }
      }
      bar.push(note);
    }
  }
  close(false);
  if (score.bars.length === 0) return { ok: false, error: "No notes" };
  if (score.bars.reduce((n, b) => n + b.notes.length, 0) > 64) return { ok: false, error: "Too many notes (at most 64)" };
  return { ok: true, score };
}

/* ------------------------------------------------------------------ numbered */

export type AngkaToken =
  | { kind: "note"; digit: number; octave: number; accidental: "" | "#" | "b"; under: number; label: string }
  | { kind: "hold" }
  | { kind: "bar"; final: boolean };
export type AngkaScore = { doKey: string; time: string; tokens: AngkaToken[] };

const ANGKA_RE = /^([0-7])(#|b)?('+|,+)?(_{0,2})(?:"([^"]*)"|\[([^\]]*)\])?$/;

export function parseAngka(text: string): { ok: true; score: AngkaScore } | { ok: false; error: string; arg?: string } {
  const score: AngkaScore = { doKey: "", time: "", tokens: [] };
  for (const tok of tokens(text)) {
    if (tok === "|" || tok === "||") score.tokens.push({ kind: "bar", final: tok === "||" });
    else if (/^\.(?:"[^"]*"|\[[^\]]*\])?$/.test(tok)) {
      // A label on a hold ("1 .[A]" = the two-beat note A) belongs under the note it extends.
      const label = tok.slice(2, -1);
      const prev = score.tokens.findLast((t) => t.kind !== "hold");
      if (label && prev?.kind === "note" && !prev.label) prev.label = label;
      score.tokens.push({ kind: "hold" });
    }
    else if (/^do=[A-G](#|b)?$/i.test(tok)) score.doKey = tok[3].toUpperCase() + tok.slice(4).toLowerCase();
    else if (/^time=\d{1,2}\/(2|4|8|16)$/.test(tok)) score.time = tok.slice(5);
    else {
      const m = ANGKA_RE.exec(tok);
      if (!m) return { ok: false, error: "Cannot read \"{0}\"", arg: tok };
      const marks = m[3] ?? "";
      score.tokens.push({ kind: "note", digit: Number(m[1]), accidental: (m[2] ?? "") as "" | "#" | "b", octave: marks.startsWith("'") ? marks.length : -marks.length, under: m[4].length, label: m[5] ?? m[6] ?? "" });
    }
  }
  if (!score.tokens.some((t) => t.kind === "note")) return { ok: false, error: "No notes" };
  if (score.tokens.length > 120) return { ok: false, error: "Too long (at most 120 symbols)" };
  return { ok: true, score };
}

/** Why notation cannot be drawn (an English message key with an optional {0} argument), or null when it is fine. */
export function notationError(n: Notation): { error: string; arg?: string } | null {
  const r = n.kind === "staff" ? parseStaff(n.text) : parseAngka(n.text);
  return r.ok ? null : { error: r.error, arg: r.arg };
}

export const NOTATION_EXAMPLE: Record<NotationKind, string> = {
  staff: "time=4/4 | C4/q D4/q E4/q F4/q | G4/h G4/h | A4/8 A4/8 G4/q R/q G4/q | C5/w ||",
  angka: "do=C time=4/4 | 1 2 3 4 | 5 . 5 . | 6_ 6_ 5 0 5 | 1' . . . ||",
};
