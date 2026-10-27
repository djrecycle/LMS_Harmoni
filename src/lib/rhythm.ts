/**
 * Rhythm patterns written as counting syllables, the way they are taught in class:
 *   ta = quarter (1 beat), ti-ti = two eighths, ti = one eighth, ta-a = half (2), ta-a-a-a = whole (4),
 *   z = quarter rest, zi = eighth rest.
 *  Example: "ta ti-ti ta z". Used for rhythm listening questions (sound + answer choices).
 */
import { NOTE_GLYPH_BEATS, isRestGlyph } from "@/lib/music-blocks";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";

const TOKENS: Record<string, NoteGlyphKind[]> = {
  ta: ["quarter"],
  "ti-ti": ["eighth", "eighth"],
  titi: ["eighth", "eighth"],
  ti: ["eighth"],
  "ta-a": ["half"],
  "ta-a-a-a": ["whole"],
  z: ["rest-quarter"],
  zi: ["rest-eighth"],
};

/** "ta ti-ti ta z" -> glyph list. Null when a word is not a rhythm syllable or the pattern is empty/too long. */
export function parseRhythm(text: string): NoteGlyphKind[] | null {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const out: NoteGlyphKind[] = [];
  for (const w of words) {
    const g = TOKENS[w];
    if (!g) return null;
    out.push(...g);
  }
  if (rhythmBeats(out) > 16 || out.every(isRestGlyph)) return null;
  return out;
}

/** Glyph list -> canonical syllables. Two eighths that share one beat are written "ti-ti". */
export function rhythmToText(pattern: NoteGlyphKind[]): string {
  const words: string[] = [];
  let beat = 0;
  for (let i = 0; i < pattern.length; i++) {
    const g = pattern[i];
    if (g === "eighth" && pattern[i + 1] === "eighth" && beat % 1 === 0) {
      words.push("ti-ti");
      i++;
      beat += 1;
      continue;
    }
    words.push(g === "quarter" ? "ta" : g === "eighth" ? "ti" : g === "half" ? "ta-a" : g === "whole" ? "ta-a-a-a" : g === "rest-quarter" ? "z" : "zi");
    beat += NOTE_GLYPH_BEATS[g];
  }
  return words.join(" ");
}

export const rhythmBeats = (pattern: NoteGlyphKind[]) => pattern.reduce((a, g) => a + NOTE_GLYPH_BEATS[g], 0);

/** Start time (in beats) of every sounding note. */
export function rhythmOnsets(pattern: NoteGlyphKind[]): number[] {
  const out: number[] = [];
  let beat = 0;
  for (const g of pattern) {
    if (!isRestGlyph(g)) out.push(beat);
    beat += NOTE_GLYPH_BEATS[g];
  }
  return out;
}

/** Same rhythm? Compared by sound (onsets + length), so "ta-a" and "ta z" differ but spelling variants do not. */
export function sameRhythm(a: NoteGlyphKind[], b: NoteGlyphKind[]): boolean {
  const x = rhythmOnsets(a);
  const y = rhythmOnsets(b);
  return rhythmBeats(a) === rhythmBeats(b) && x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Split a pattern into beats (each beat = glyphs that fill it). Null when a note crosses a beat in a way we can't split. */
function toBeats(pattern: NoteGlyphKind[]): NoteGlyphKind[][] | null {
  const beats: NoteGlyphKind[][] = [];
  let cur: NoteGlyphKind[] = [];
  let fill = 0;
  for (const g of pattern) {
    const len = NOTE_GLYPH_BEATS[g];
    if (len >= 1 && fill !== 0) return null;
    if (len >= 1) {
      beats.push([g]);
      for (let i = 1; i < len; i++) beats.push([]); // held beats
      continue;
    }
    cur.push(g);
    fill += len;
    if (fill >= 1) {
      beats.push(cur);
      cur = [];
      fill = 0;
    }
  }
  return fill === 0 ? beats : null;
}

/**
 * Up to `count` different rhythms of the same length, made by changing one beat at a time
 *  (ta <-> ti-ti, ta -> z, ta-a -> ta ta). Used to build multiple-choice answers.
 */
export function rhythmVariants(pattern: NoteGlyphKind[], count: number): NoteGlyphKind[][] {
  const beats = toBeats(pattern);
  if (!beats) return [];
  const swaps: Record<string, NoteGlyphKind[][]> = {
    quarter: [["eighth", "eighth"], ["rest-quarter"]],
    "eighth,eighth": [["quarter"], ["rest-eighth", "eighth"]],
    "rest-quarter": [["quarter"]],
  };
  const out: NoteGlyphKind[][] = [];
  const add = (p: NoteGlyphKind[]) => {
    if (out.length < count && !sameRhythm(p, pattern) && !out.some((o) => sameRhythm(o, p)) && !p.every(isRestGlyph)) out.push(p);
  };
  // Try each beat position, spreading changes across the bar so the choices sound different.
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < beats.length; i++) {
      const key = beats[i].join(",");
      if (key === "half") {
        // ta-a -> ta ta (the half note spans this beat and the next, empty one)
        const p = [...beats.slice(0, i).flat(), "quarter", "quarter", ...beats.slice(i + 2).flat()] as NoteGlyphKind[];
        add(p);
        continue;
      }
      const options = swaps[key];
      if (!options) continue;
      const pick = options[round % options.length];
      add([...beats.slice(0, i).flat(), ...pick, ...beats.slice(i + 1).flat()]);
    }
  }
  return out;
}

/**
 * Tapped onsets (in beats from the first downbeat) -> glyph list, snapped to half beats.
 *  A note on the beat lasts until the next tap (ta / ta-a / ta-a-a-a), an off-beat note is "ti"; gaps become rests.
 *  The last note ends at the end of its beat. Null when nothing usable was tapped or it is longer than 16 beats.
 */
export function rhythmFromTaps(onsets: number[]): NoteGlyphKind[] | null {
  const grid = [...new Set(onsets.filter((b) => b > -0.25).map((b) => Math.max(0, Math.round(b * 2) / 2)))].sort((a, b) => a - b);
  if (grid.length === 0) return null;
  const end = Math.floor(grid[grid.length - 1]) + 1;
  if (end > 16) return null;

  const out: NoteGlyphKind[] = [];
  const rests = (from: number, to: number) => {
    let pos = from;
    if (pos % 1 !== 0 && pos < to) {
      out.push("rest-eighth");
      pos += 0.5;
    }
    for (; pos + 1 <= to; pos++) out.push("rest-quarter");
    if (pos < to) out.push("rest-eighth");
  };
  rests(0, grid[0]);
  grid.forEach((at, i) => {
    const next = grid[i + 1] ?? end;
    const gap = next - at;
    const g: NoteGlyphKind = at % 1 !== 0 || gap < 1 ? "eighth" : gap >= 4 ? "whole" : gap >= 2 ? "half" : "quarter";
    out.push(g);
    rests(at + NOTE_GLYPH_BEATS[g], next);
  });
  return out;
}

const NOTE_FITS: [number, NoteGlyphKind][] = [
  [4, "whole"],
  [2, "half"],
  [1, "quarter"],
  [0.5, "eighth"],
];

/** Fills `beats` (a multiple of 0.5) with rests, a quarter rest only where it starts on a beat. */
function rests(from: number, beats: number): NoteGlyphKind[] {
  const out: NoteGlyphKind[] = [];
  let pos = from;
  let left = beats;
  while (left > 1e-6) {
    const quarter = left >= 1 - 1e-6 && Math.abs(pos - Math.round(pos)) < 1e-6;
    out.push(quarter ? "rest-quarter" : "rest-eighth");
    pos += quarter ? 1 : 0.5;
    left -= quarter ? 1 : 0.5;
  }
  return out;
}

/**
 * Tapped onsets (in beats from the first beat) -> a rhythm pattern. Taps snap to eighth notes; each note lasts until
 *  the next tap (the longest note value that fits, then rests), and the pattern is filled to whole bars of 4/4.
 */
export function onsetsToPattern(onsets: number[]): NoteGlyphKind[] {
  const snapped = [...new Set(onsets.map((o) => Math.round(o * 2) / 2).filter((o) => o >= 0))].sort((a, b) => a - b);
  if (!snapped.length) return [];
  const end = Math.max(4, Math.ceil((snapped[snapped.length - 1] + 0.5) / 4) * 4);
  const out: NoteGlyphKind[] = [];
  let pos = 0;
  snapped.forEach((o, i) => {
    out.push(...rests(pos, o - pos));
    const room = (snapped[i + 1] ?? end) - o;
    // A note never crosses a beat it does not start on (keeps the pattern readable).
    const fit = NOTE_FITS.find(([b, kind]) => b <= room + 1e-6 && (b < 1 || Math.abs(o - Math.round(o)) < 1e-6) && (kind !== "half" || o % 2 === 0) && (kind !== "whole" || o % 4 === 0)) ?? [0.5, "eighth" as const];
    out.push(fit[1]);
    out.push(...rests(o + fit[0], room - fit[0]));
    pos = o + room;
  });
  return out;
}
