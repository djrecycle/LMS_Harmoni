import { z } from "zod";
import type { Translate } from "@/i18n";
import { NOTE_GLYPH_KINDS } from "./music-blocks";
import { midiToNote, noteToMidi } from "./music";
import { rhythmBeats, rhythmToText } from "./rhythm";
import { NOTATION_KINDS, notationError } from "./notation";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const QUESTION_TYPES = ["multiple_choice", "multiple_select", "matching", "fill_in", "essay", "true_false", "audio", "video", "midi"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const ANSWER_TYPES = ["multiple_choice", "fill_in", "true_false", "midi", "multiple_select", "matching", "essay"] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];
/** Question types whose answer type is always the type itself. */
const SELF_ANSWERED: QuestionType[] = ["multiple_choice", "fill_in", "true_false", "multiple_select", "matching", "essay"];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple Choice",
  multiple_select: "Complex Multiple Choice",
  matching: "Matching",
  fill_in: "Fill in",
  essay: "Essay",
  true_false: "True / False",
  audio: "Audio Question",
  video: "Video Question",
  midi: "MIDI Piano",
};

export type AnswerKey =
  | { kind: "multiple_choice"; correct: number }
  | { kind: "fill_in"; answer: string[] }
  | { kind: "true_false"; correct: boolean }
  /** Complex multiple choice: every correct choice must be ticked. */
  | { kind: "multiple_select"; correct: number[] }
  /** Matching: for each row (statement), the index of its matching column (option). */
  | { kind: "matching"; pairs: number[] }
  /** Essay: always graded by the teacher; `answer` is the model answer / scoring guide. */
  | { kind: "essay"; answer: string }
  | {
      kind: "midi";
      note: string[];
      /** order: notes must be pressed in order (melody). chord: any order. */
      mode: "ordered" | "chord";
      ignoreOctave: boolean;
      /** Play the key notes as a listening example (ear training: "listen then repeat"). */
      playExample: boolean;
    };

/** number[]: ticked choices (multiple_select) or the chosen column per row, -1 = none (matching). */
export type StudentAnswer = number | string | boolean | string[] | number[] | null;

/** Percussion voices the browser can play for a tempo question (same as the metronome). */
export const SOUND_VOICES = ["click", "tepuk", "kentongan", "tamborin"] as const;
export type SoundVoice = (typeof SOUND_VOICES)[number];

/**
 * A question sound made in the browser instead of an uploaded file (so the AI can write it).
 *  notes: piano notes, one after another or together (guess the note / interval / chord, solfège).
 *         `doNote` (optional) first plays the do-mi-sol chord of that key as a reference.
 *  tempo: a click track (guess the tempo or the meter).
 *  rhythm: a rhythm pattern tapped after a one-bar count-in (guess the rhythm).
 */
export type QuestionSound =
  | { kind: "notes"; notes: string[]; harmonic: boolean; doNote?: string | null }
  | { kind: "tempo"; bpm: number; beats: number; meter: number; voice: SoundVoice }
  | { kind: "rhythm"; pattern: NoteGlyphKind[]; bpm: number; voice: SoundVoice };

/* ------------------------------------------------------------------ */
/* Teacher input validation                                            */
/* ------------------------------------------------------------------ */

const answerKeySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("multiple_choice"), correct: z.number().int().min(0) }),
  z.object({ kind: z.literal("fill_in"), answer: z.array(z.string().trim().min(1)).max(20) }),
  z.object({ kind: z.literal("true_false"), correct: z.boolean() }),
  z.object({ kind: z.literal("multiple_select"), correct: z.array(z.number().int().min(0)).max(10) }),
  z.object({ kind: z.literal("matching"), pairs: z.array(z.number().int().min(-1)).max(12) }),
  z.object({ kind: z.literal("essay"), answer: z.string().trim().max(3000) }),
  z.object({
    kind: z.literal("midi"),
    note: z.array(z.string()).min(1, "Enter at least one note").max(32),
    mode: z.enum(["ordered", "chord"]),
    ignoreOctave: z.boolean(),
    playExample: z.boolean(),
  }),
]);

export const questionSoundSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("notes"),
    notes: z.array(z.string()).min(1, "Enter at least one note").max(16),
    harmonic: z.boolean(),
    doNote: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("tempo"),
    bpm: z.number().int().min(30, "Tempo must be 30-220 BPM").max(220, "Tempo must be 30-220 BPM"),
    beats: z.number().int().min(2).max(32),
    meter: z.number().int().min(1).max(12),
    voice: z.enum(SOUND_VOICES),
  }),
  z.object({
    kind: z.literal("rhythm"),
    pattern: z
      .array(z.enum(NOTE_GLYPH_KINDS))
      .min(1, "Enter a rhythm pattern")
      .refine((p) => rhythmBeats(p) <= 16 && Number.isInteger(rhythmBeats(p)), "The rhythm must fill whole beats (at most 16)"),
    bpm: z.number().int().min(30, "Tempo must be 30-220 BPM").max(220, "Tempo must be 30-220 BPM"),
    voice: z.enum(SOUND_VOICES),
  }),
]);

export const questionInputSchema = z
  .object({
    type: z.enum(QUESTION_TYPES),
    answerType: z.enum(ANSWER_TYPES),
    prompt: z.string().trim().min(3, "The question is too short").max(2000),
    mediaKey: z.string().trim().max(600).nullable().optional(),
    /** Generated sound (audio questions only); replaces the uploaded clip. */
    sound: questionSoundSchema.nullable().optional(),
    options: z.array(z.string().trim().min(1, "A choice cannot be empty").max(300)).max(8).nullable().optional(),
    /** Statements of a matching question. */
    matchRows: z.array(z.string().trim().min(1, "A statement cannot be empty").max(500)).max(12).nullable().optional(),
    answerKey: answerKeySchema,
    explanation: z.string().trim().max(2000).nullable().optional(),
    topic: z.string().trim().max(300).nullable().optional(),
    level: z.string().trim().max(10).nullable().optional(),
    /** Music notation the question image is drawn from. */
    notation: z.object({ kind: z.enum(NOTATION_KINDS), text: z.string().trim().min(1).max(2000) }).nullable().optional(),
    /** A picture the teacher still has to add (described by the AI). */
    imageHint: z.string().trim().max(300).nullable().optional(),
    kelas: z.string().trim().max(40, "Too long").nullable().optional(),
    semester: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
    points: z.number().int().min(1).max(100).default(1),
  })
  .superRefine((v, ctx) => {
    const isu = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    // Consistency between question type <-> answer type
    if (v.type === "midi" && v.answerType !== "midi") isu("answerType", "A MIDI question must be answered with the piano");
    if (SELF_ANSWERED.includes(v.type) && v.answerType !== v.type)
      isu("answerType", "The answer type does not match the question type");
    if ((v.type === "audio" || v.type === "video") && v.answerType === "midi")
      isu("answerType", "Choose multiple choice, fill-in, or true/false");
    if ((v.type === "audio" || v.type === "video") && !["multiple_choice", "fill_in", "true_false"].includes(v.answerType))
      isu("answerType", "Choose multiple choice, fill-in, or true/false");
    if (v.type === "video" && !v.mediaKey) isu("mediaKey", "Upload a video for the video question");
    if (v.type === "audio" && !v.mediaKey && !v.sound) isu("mediaKey", "Upload an audio clip or make a sound for the audio question");
    if (v.sound && v.type !== "audio") isu("sound", "Only audio questions can have a generated sound");
    if (v.sound?.kind === "notes" && v.sound.notes.some((n) => noteToMidi(n) === null)) isu("sound", "Some notes are invalid (a correct example: C4 E4 G4)");
    if (v.sound?.kind === "notes" && v.sound.doNote && noteToMidi(v.sound.doNote) === null) isu("sound", "The \"do\" note is invalid (example: C4)");
    if (v.answerKey.kind !== v.answerType) isu("answerKey", "The answer key does not match the answer type");
    if (v.notation) {
      if (notationError(v.notation)) isu("notation", "The notation cannot be drawn. Check it in the preview.");
    }

    if (v.answerType === "multiple_choice" && v.answerKey.kind === "multiple_choice") {
      const options = v.options ?? [];
      if (options.length < 2) isu("options", "At least 2 answer choices");
      else if (v.answerKey.correct >= options.length) isu("answerKey", "Choose the correct answer");
    }
    if (v.answerKey.kind === "multiple_select") {
      const options = v.options ?? [];
      const correct = v.answerKey.correct;
      if (options.length < 2) isu("options", "At least 2 answer choices");
      else if (correct.length === 0) isu("answerKey", "Tick at least one correct answer");
      else if (correct.some((i) => i >= options.length) || new Set(correct).size !== correct.length) isu("answerKey", "Choose the correct answer");
    }
    if (v.answerKey.kind === "matching") {
      const rows = v.matchRows ?? [];
      const columns = v.options ?? [];
      if (rows.length < 1) isu("matchRows", "Add at least one statement");
      else if (columns.length < 2) isu("options", "At least 2 answer choices");
      else if (v.answerKey.pairs.length !== rows.length || v.answerKey.pairs.some((i) => i < 0 || i >= columns.length)) isu("answerKey", "Choose the matching answer for every statement");
    }
    if (v.answerKey.kind === "midi") {
      if (v.answerKey.note.some((n) => noteToMidi(n) === null)) isu("answerKey", "Some notes are invalid (a correct example: C4 E4 G4)");
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;

/* ------------------------------------------------------------------ */
/* Grading                                                             */
/* ------------------------------------------------------------------ */

function normalizeText(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function noteNumbers(list: string[], ignoreOctave: boolean): number[] {
  return list
    .map((n) => noteToMidi(n))
    .filter((n): n is number => n !== null)
    .map((n) => (ignoreOctave ? n % 12 : n));
}

export type GradeResult = { correct: boolean | null; score: number | null };

/**
 * Grade one answer. `correct: null` means it cannot be graded automatically (waiting for the teacher).
 *  An empty answer / wrong shape counts as wrong.
 */
export function gradeAnswer(answerKey: AnswerKey, answer: unknown, points: number): GradeResult {
  const result = (correct: boolean): GradeResult => ({ correct, score: correct ? points : 0 });
  /** Partial credit: a share (0-1) of the points; only a full share counts as correct. */
  const partial = (share: number): GradeResult => {
    const f = Math.max(0, Math.min(1, share));
    return { correct: f >= 1, score: Math.round(points * f * 10000) / 10000 };
  };
  const numbers = (a: unknown): number[] | null => (Array.isArray(a) && a.every((n) => typeof n === "number" && Number.isInteger(n)) ? (a as number[]) : null);

  switch (answerKey.kind) {
    case "multiple_choice":
      return result(typeof answer === "number" && answer === answerKey.correct);

    case "true_false":
      return result(typeof answer === "boolean" && answer === answerKey.correct);

    case "fill_in": {
      if (answerKey.answer.length === 0) return { correct: null, score: null };
      if (typeof answer !== "string") return result(false);
      const j = normalizeText(answer);
      return result(j.length > 0 && answerKey.answer.some((k) => normalizeText(k) === j));
    }

    case "multiple_select": {
      // Each correct tick earns a share, each wrong tick takes one back (so ticking everything earns nothing).
      const ticked = numbers(answer);
      const key = new Set(answerKey.correct);
      if (!ticked || ticked.length === 0 || key.size === 0) return result(false);
      const picked = new Set(ticked);
      let hits = 0;
      let wrong = 0;
      for (const i of picked) (key.has(i) ? hits++ : wrong++);
      return partial((hits - wrong) / key.size);
    }

    case "matching": {
      // Each row matched correctly earns its share.
      const chosen = numbers(answer);
      const rows = answerKey.pairs.length;
      if (!chosen || rows === 0) return result(false);
      return partial(answerKey.pairs.filter((col, i) => chosen[i] === col).length / rows);
    }

    case "essay":
      return { correct: null, score: null };

    case "midi": {
      if (!Array.isArray(answer) || answer.some((n) => typeof n !== "string")) return result(false);
      const target = noteNumbers(answerKey.note, answerKey.ignoreOctave);
      const played = noteNumbers(answer as string[], answerKey.ignoreOctave);
      if (played.length === 0) return result(false);
      if (answerKey.mode === "chord") {
        const a = [...new Set(target)].sort((x, y) => x - y);
        const b = [...new Set(played)].sort((x, y) => x - y);
        return result(a.length === b.length && a.every((v, i) => v === b[i]));
      }
      return result(target.length === played.length && target.every((v, i) => v === played[i]));
    }
  }
}

/** Human-readable key text (for feedback and teacher review). `rows` are the statements of a matching question. */
export function formatAnswerKey(answerKey: AnswerKey, options?: string[] | null, t: Translate = (k) => k, rows?: string[] | null): string {
  const choice = (i: number) => options?.[i] ?? t("Choice {0}", i + 1);
  switch (answerKey.kind) {
    case "multiple_select":
      return [...answerKey.correct].sort((a, b) => a - b).map((i) => `${String.fromCharCode(65 + i)}. ${choice(i)}`).join("; ");
    case "matching":
      return answerKey.pairs.map((col, i) => `${rows?.[i] ?? i + 1} → ${choice(col)}`).join("; ");
    case "essay":
      return answerKey.answer || t("(graded by teacher)");
    case "multiple_choice":
      return options?.[answerKey.correct] ?? t("Choice {0}", answerKey.correct + 1);
    case "true_false":
      return answerKey.correct ? t("True") : t("False");
    case "fill_in":
      return answerKey.answer.length ? answerKey.answer.join(" / ") : t("(graded by teacher)");
    case "midi":
      return answerKey.note.map((n) => midiToNote(noteToMidi(n) ?? 0)).join(answerKey.mode === "chord" ? " + " : " → ");
  }
}

/** Short teacher-facing description of a generated sound, e.g. "C4 → E4" or "92 BPM · 8 beats · accent every 4". */
export function formatSound(sound: QuestionSound, t: Translate): string {
  if (sound.kind === "notes") return `${sound.doNote ? `do = ${sound.doNote} · ` : ""}${sound.notes.join(sound.harmonic ? " + " : " → ")}`;
  if (sound.kind === "rhythm") return `${rhythmToText(sound.pattern)} · ${sound.bpm} BPM`;
  return t("{0} BPM · {1} beats · accent every {2}", sound.bpm, sound.beats, sound.meter);
}

/** Human-readable student answer text. `q` tells number lists apart (ticked choices vs. matched columns). */
export function formatAnswer(answer: unknown, options?: string[] | null, t: Translate = (k) => k, q?: { answerType: AnswerType; matchRows?: string[] | null }): string {
  if (answer === null || answer === undefined || answer === "") return t("(not answered)");
  if (Array.isArray(answer) && answer.every((n) => typeof n === "number")) {
    const nums = answer as number[];
    const choice = (i: number) => options?.[i] ?? t("Choice {0}", i + 1);
    if (q?.answerType === "matching") {
      if (nums.every((n) => n < 0)) return t("(not answered)");
      return nums.map((col, i) => `${q.matchRows?.[i] ?? i + 1} → ${col >= 0 ? choice(col) : "-"}`).join("; ");
    }
    if (nums.length === 0) return t("(not answered)");
    return [...nums].sort((a, b) => a - b).map((i) => `${String.fromCharCode(65 + i)}. ${choice(i)}`).join("; ");
  }
  if (typeof answer === "number") return options?.[answer] ?? t("Choice {0}", answer + 1);
  if (typeof answer === "boolean") return answer ? t("True") : t("False");
  if (Array.isArray(answer)) return answer.length ? answer.join(" → ") : t("(not answered)");
  return String(answer);
}

/* ------------------------------------------------------------------ */
/* Student-safe version (without the key)                              */
/* ------------------------------------------------------------------ */

export type StudentQuestion = {
  id: string;
  type: QuestionType;
  answerType: AnswerType;
  prompt: string;
  mediaKey: string | null;
  options: string[] | null;
  /** Statements of a matching question. */
  matchRows: string[] | null;
  points: number;
  /** Only for MIDI questions. Example notes are only sent when the teacher enables "play example". */
  midi?: { noteCount: number; mode: "ordered" | "chord"; example: string[] | null };
  /** Generated sound to play (audio questions without an uploaded clip). */
  sound: QuestionSound | null;
};

type QuestionRow = {
  id: string;
  type: QuestionType;
  answerType: AnswerType;
  prompt: string;
  mediaKey: string | null;
  options: string[] | null;
  matchRows?: string[] | null;
  points: number;
  answerKey: AnswerKey | null;
  sound: QuestionSound | null;
};

export function toStudentQuestion(s: QuestionRow): StudentQuestion {
  const base: StudentQuestion = {
    id: s.id,
    type: s.type,
    answerType: s.answerType,
    prompt: s.prompt,
    mediaKey: s.mediaKey,
    options: s.options,
    matchRows: s.matchRows ?? null,
    points: s.points,
    sound: s.sound ?? null,
  };
  if (s.answerKey?.kind === "midi") {
    base.midi = {
      noteCount: s.answerKey.note.length,
      mode: s.answerKey.mode,
      example: s.answerKey.playExample ? s.answerKey.note : null,
    };
  }
  return base;
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

export type MediaKind = "image" | "audio" | "video";

export function mediaKindFromName(name: string): MediaKind | null {
  const clean = name.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(clean)) return "image";
  if (/\.(mp3|wav|ogg|oga|m4a|aac|flac|weba)$/.test(clean)) return "audio";
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(clean)) return "video";
  if (/(youtube\.com|youtu\.be|vimeo\.com)/.test(clean)) return "video";
  return null;
}

export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return /^https?:\/\//i.test(key) ? key : `/api/files/${key}`;
}
