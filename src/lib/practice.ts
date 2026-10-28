import type { NoteGlyphKind } from "@/components/lessons/note-glyph";
import type { Meter, RhythmVoice } from "@/lib/music-blocks";

/**
 * Practice rhythm patterns. `onset` is in beats (1 = quarter note), counted from the start of the pattern;
 *  `length` in beats (4 per bar). `level`: 1 = one bar, 2 = two bars, 3 = four bars.
 *  Patterns written by a teacher (a rhythm block of a practice material) also carry their note values, tempo and material.
 */
export type RhythmPattern = {
  id: string;
  name: string;
  description: string;
  onset: number[];
  length: number;
  level?: 1 | 2 | 3;
  glyphs?: NoteGlyphKind[];
  bpm?: number;
  /** Time signature (4/4 when missing). */
  meter?: Meter;
  /** The sound the teacher chose for it. */
  voice?: RhythmVoice;
  materialId?: string;
};

export const RHYTHM_PATTERNS: RhythmPattern[] = [
  { id: "base", name: "Basic beats", description: "Ta – ta – ta – ta", onset: [0, 1, 2, 3], length: 4 },
  { id: "ta-ti-ti", name: "Ta – ti-ti – ta", description: "One beat split into two on beat 2", onset: [0, 1, 1.5, 2, 3], length: 4 },
  { id: "ta-ta-ti-ti", name: "Two beats then ti-ti", description: "Ta – ta – ti-ti – ta", onset: [0, 1, 2, 2.5, 3], length: 4 },
  { id: "sinkopasi", name: "Light syncopation", description: "Emphasis between the beats", onset: [0, 0.5, 1.5, 2, 3], length: 4 },
  { id: "two-bar", name: "Two bars", description: "A longer pattern for a challenge", onset: [0, 1, 1.5, 2, 3, 4, 4.5, 5, 6, 6.5, 7], length: 8, level: 2 },
  { id: "two-bar-long", name: "Two bars with a long note", description: "Ta – ti-ti – ta – ta | ta-a – ta – ta", onset: [0, 1, 1.5, 2, 3, 4, 6, 7], length: 8, level: 2 },
  { id: "two-bar-syncopation", name: "Two bars of syncopation", description: "Off-beat notes in the first bar, steady beats after", onset: [0, 0.5, 1.5, 2, 3, 4, 5, 5.5, 6], length: 8, level: 2 },
  { id: "four-bar", name: "Four bars", description: "A whole phrase: steady beats, ti-ti, then long notes", onset: [0, 1, 2, 3, 4, 5, 5.5, 6, 7, 8, 8.5, 9, 10, 12, 14], length: 16, level: 3 },
  { id: "four-bar-syncopation", name: "Four bars with syncopation", description: "A long, lively phrase with notes between the beats", onset: [0, 1, 1.5, 2, 3, 4, 4.5, 5.5, 6, 7, 8, 9, 9.5, 10, 10.5, 11, 12, 13, 14], length: 16, level: 3 },
  // "Bank Pola" from the Pola Irama Sederhana lesson (Kelas VII).
  { id: "pola-a", name: "Pola A — Tepuk Dasar", description: "tepuk – tepuk – diam – tepuk", onset: [0, 1, 3], length: 4 },
  { id: "pola-b", name: "Pola B — Langkah Ganda", description: "dua bunyi pendek lalu satu bunyi panjang", onset: [0, 0.5, 1, 2, 2.5, 3], length: 4 },
  { id: "pola-c", name: "Pola C — Irama Jaranan", description: "panjang · pendek-pendek · panjang · diam", onset: [0, 1, 1.5, 2], length: 4 },
  { id: "pola-d", name: "Pola D — Sinkop Sederhana", description: "mulai dari diam — jangan mendahului", onset: [1, 2, 2.5, 3], length: 4 },
];

export type BeatResult = { index: number; onset: number; diffMs: number | null; grade: number };

/**
 * Grade the student's taps. `expected` and `taps` are in seconds on the same clock.
 *  Each expected beat is matched to the nearest tap (used once) within the tolerance window.
 *  Score 0-100; extra taps reduce the score.
 */
export function gradeRhythm(expected: number[], tap: number[], secondsPerTap: number) {
  const tolerance = Math.max(0.2, 0.3 * secondsPerTap);
  const exact = 0.12; // a difference up to 120 ms counts as fully on time
  const used = new Set<number>();
  const detail: BeatResult[] = expected.map((h, i) => {
    let best = -1;
    let distance = Infinity;
    tap.forEach((t, j) => {
      if (used.has(j)) return;
      const d = Math.abs(t - h);
      if (d < distance) {
        distance = d;
        best = j;
      }
    });
    if (best === -1 || distance > tolerance) return { index: i, onset: h, diffMs: null, grade: 0 };
    used.add(best);
    const grade = distance <= exact ? 1 : Math.max(0, 1 - (distance - exact) / (tolerance - exact));
    return { index: i, onset: h, diffMs: Math.round((tap[best] - h) * 1000), grade };
  });
  const extra = tap.length - used.size;
  const raw = detail.reduce((a, d) => a + d.grade, 0) / Math.max(1, expected.length);
  const score = Math.round(Math.max(0, raw - (0.5 * extra) / Math.max(1, expected.length)) * 100);
  return { score, detail, extra };
}

/** Ear-training notes: the C major scale (C4..C5). */
export const PRACTICE_NOTES = [60, 62, 64, 65, 67, 69, 71, 72];

export function randomMelody(length: number): number[] {
  const result: number[] = [];
  let last = -1;
  while (result.length < length) {
    const n = PRACTICE_NOTES[Math.floor(Math.random() * PRACTICE_NOTES.length)];
    if (n !== last || Math.random() < 0.15) {
      result.push(n);
      last = n;
    }
  }
  return result;
}

/** Label for each saved practice kind (used on the practice hub and the grade history). */
export const PRACTICE_KIND_LABEL = {
  note: "Pitch",
  rhythm: "Rhythm",
  interval: "Intervals",
  chord: "Chords",
  scale: "Scales",
  tempo: "Tempo",
  melody: "Melody",
  solfege: "Solfège",
  song: "Songs",
} as const;

export type PracticeKind = keyof typeof PRACTICE_KIND_LABEL;

/** Shown when a lesson practice score was saved but could not be linked to the lesson (it shows in the recap as practice outside the lesson). */
export const PRACTICE_NOT_LINKED = "Skor tersimpan, tetapi tercatat sebagai latihan di luar materi. Muat ulang halaman materi sebelum berlatih lagi.";

/* ------------------------------------------------------------------ */
/* Lesson practice details (stored in practice_result.detail)          */
/* ------------------------------------------------------------------ */

/** Rhythm: timing of each expected note in ms (null = missed) and taps that matched nothing. */
export type RhythmDetail = { patternId?: string; bpm?: number; diffs?: (number | null)[]; extra?: number };
/** Tempo: keep a steady beat after the metronome goes quiet. */
export type TempoDetail = { bpm: number; actualBpm: number | null; cv: number | null; diffs: (number | null)[]; extra: number };
/** Melody: rewrite a melody on the piano roll; each target note is right, wrong pitch, wrong rhythm or missing. */
export type MelodyDetail = { total: number; correct: number; wrongPitch: number; wrongRhythm: number; missing: number; extra: number };
/** Solfège: hear notes, answer with do-re-mi. `missed` counts the expected syllables answered wrongly. */
export type SolfegeDetail = { rounds: number; notesTotal: number; notesCorrect: number; missed: Record<string, number> };
/** Song (falling notes): every note must be played to finish, so the score comes from the wrong keys pressed. */
export type SongDetail = { songId: string; speed: number; notesTotal: number; wrong: number };

/**
 * Grade steady-tempo taps. `expected` are the beat times (s) the student should keep after the metronome stops,
 *  `taps` the student's taps (s). The score mixes being on the beat (60%) with keeping even spacing (40%).
 */
export function gradeTempo(expected: number[], taps: number[], secondsPerBeat: number, bpm: number): { score: number; detail: TempoDetail } {
  const onBeat = gradeRhythm(expected, taps, secondsPerBeat);
  const window = taps.filter((t) => t >= expected[0] - 0.45 * secondsPerBeat && t <= expected[expected.length - 1] + 0.45 * secondsPerBeat).sort((a, b) => a - b);
  const gaps = window.slice(1).map((t, i) => t - window[i]).filter((g) => g > 0.4 * secondsPerBeat && g < 1.8 * secondsPerBeat);
  let actualBpm: number | null = null;
  let cv: number | null = null;
  let stability = 0;
  if (gaps.length >= 3) {
    const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    actualBpm = Math.round(60 / mean);
    cv = Math.round((sd / mean) * 1000) / 1000;
    // Even spacing (cv 3% = full marks, 20% = none), minus drift away from the asked tempo.
    const evenness = Math.max(0, Math.min(1, 1 - (cv - 0.03) / 0.17));
    const drift = Math.min(1, Math.abs(actualBpm - bpm) / bpm / 0.15);
    stability = evenness * (1 - drift * 0.5);
  }
  const score = Math.round(onBeat.score * 0.6 + stability * 100 * 0.4);
  return { score, detail: { bpm, actualBpm, cv, diffs: onBeat.detail.map((d) => d.diffMs), extra: onBeat.extra } };
}

type GridNote = { start: number; midi: number; units: number };

/**
 * Compare a written melody with the target, note by note: right (same start, pitch and length), right rhythm but
 *  wrong pitch, right pitch but wrong rhythm, or missing; notes matching nothing are extra.
 */
export function gradeMelody(target: GridNote[], written: GridNote[]): { score: number; detail: MelodyDetail } {
  const left = [...written];
  const take = (pred: (n: GridNote) => boolean) => {
    const i = left.findIndex(pred);
    return i < 0 ? null : left.splice(i, 1)[0];
  };
  let correct = 0;
  const rest: GridNote[] = [];
  for (const n of target) {
    if (take((w) => w.start === n.start && w.midi === n.midi && w.units === n.units)) correct++;
    else rest.push(n);
  }
  let wrongPitch = 0;
  let wrongRhythm = 0;
  let missing = 0;
  for (const n of rest) {
    if (take((w) => w.start === n.start && w.units === n.units)) wrongPitch++;
    else if (take((w) => w.midi === n.midi && Math.abs(w.start - n.start) <= 2)) wrongRhythm++;
    else missing++;
  }
  const extra = left.length;
  const total = target.length;
  // Half credit for a note that is only half right; extra notes cost half a note each.
  const raw = (correct + 0.5 * (wrongPitch + wrongRhythm) - 0.5 * extra) / Math.max(1, total);
  return { score: Math.round(Math.max(0, Math.min(1, raw)) * 100), detail: { total, correct, wrongPitch, wrongRhythm, missing, extra } };
}

/** Syllables offered in solfège practice, with their distance from "do" in semitones. */
export const SOLFEGE_STEPS: { syllable: string; semitones: number }[] = [
  { syllable: "do", semitones: 0 },
  { syllable: "re", semitones: 2 },
  { syllable: "mi", semitones: 4 },
  { syllable: "fa", semitones: 5 },
  { syllable: "sol", semitones: 7 },
  { syllable: "la", semitones: 9 },
  { syllable: "si", semitones: 11 },
  { syllable: "do'", semitones: 12 },
];

/** Ear-training intervals, by distance in semitones (half steps). */
export const INTERVALS: { semitones: number; name: string }[] = [
  { semitones: 1, name: "Minor 2nd" },
  { semitones: 2, name: "Major 2nd" },
  { semitones: 3, name: "Minor 3rd" },
  { semitones: 4, name: "Major 3rd" },
  { semitones: 5, name: "Perfect 4th" },
  { semitones: 6, name: "Tritone" },
  { semitones: 7, name: "Perfect 5th" },
  { semitones: 8, name: "Minor 6th" },
  { semitones: 9, name: "Major 6th" },
  { semitones: 10, name: "Minor 7th" },
  { semitones: 11, name: "Major 7th" },
  { semitones: 12, name: "Octave" },
];

/** Triads, as semitone distances from the root. */
export const CHORDS: { id: string; name: string; intervals: number[] }[] = [
  { id: "major", name: "Major", intervals: [0, 4, 7] },
  { id: "minor", name: "Minor", intervals: [0, 3, 7] },
  { id: "diminished", name: "Diminished", intervals: [0, 3, 6] },
  { id: "augmented", name: "Augmented", intervals: [0, 4, 8] },
];

/** Scales, as semitone distances from the root (one octave). */
export const SCALES: { id: string; name: string; intervals: number[] }[] = [
  { id: "major", name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11, 12] },
  { id: "minor", name: "Natural minor", intervals: [0, 2, 3, 5, 7, 8, 10, 12] },
  { id: "harmonic-minor", name: "Harmonic minor", intervals: [0, 2, 3, 5, 7, 8, 11, 12] },
  { id: "dorian", name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10, 12] },
  { id: "mixolydian", name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10, 12] },
  { id: "major-pentatonic", name: "Major pentatonic", intervals: [0, 2, 4, 7, 9, 12] },
  { id: "minor-pentatonic", name: "Minor pentatonic", intervals: [0, 3, 5, 7, 10, 12] },
];

export type EarMode = "interval" | "chord" | "scale";

export type EarQuestion = {
  /** Root note (MIDI). Interval: lower note. */
  root: number;
  /** Correct answer: the id of one of the choices. */
  answer: string;
  /** Interval only: play the two notes one after another instead of together. */
  melodic?: boolean;
};

/** Answer choices for each ear-training mode. */
export const EAR_CHOICES: Record<EarMode, { id: string; name: string }[]> = {
  interval: INTERVALS.map((i) => ({ id: String(i.semitones), name: i.name })),
  chord: CHORDS.map((c) => ({ id: c.id, name: c.name })),
  scale: SCALES.map((s) => ({ id: s.id, name: s.name })),
};

/** The notes (MIDI) that a question sounds, in order. */
export function earNotes(mode: EarMode, q: EarQuestion): number[] {
  if (mode === "interval") {
    const semitones = Number(q.answer);
    return [q.root, q.root + semitones];
  }
  const table = mode === "chord" ? CHORDS : SCALES;
  const item = table.find((x) => x.id === q.answer)!;
  return item.intervals.map((i) => q.root + i);
}

/** A random question. Roots stay within C4..G4 so every answer fits a comfortable range. */
export function randomEarQuestion(mode: EarMode, melodic = false): EarQuestion {
  const root = 60 + Math.floor(Math.random() * 8);
  const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  if (mode === "interval") return { root, answer: String(pick(INTERVALS).semitones), melodic };
  if (mode === "chord") return { root, answer: pick(CHORDS).id };
  return { root, answer: pick(SCALES).id };
}
