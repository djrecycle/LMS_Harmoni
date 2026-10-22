import { z } from "zod";
import type { Translate } from "@/i18n";
import { NOTE_GLYPH_KINDS } from "./music-blocks";
import { midiToNote, noteToMidi } from "./music";
import { rhythmBeats, rhythmToText } from "./rhythm";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export const QUESTION_TYPES = ["multiple_choice", "fill_in", "true_false", "audio", "video", "midi"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export type AnswerType = "multiple_choice" | "fill_in" | "true_false" | "midi";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple Choice",
  fill_in: "Fill in",
  true_false: "True / False",
  audio: "Audio Question",
  video: "Video Question",
  midi: "MIDI Piano",
};

export type AnswerKey =
  | { kind: "multiple_choice"; correct: number }
  | { kind: "fill_in"; answer: string[] }
  | { kind: "true_false"; correct: boolean }
  | {
      kind: "midi";
      note: string[];
      /** order: notes must be pressed in order (melody). chord: any order. */
      mode: "ordered" | "chord";
      ignoreOctave: boolean;
      /** Play the key notes as a listening example (ear training: "listen then repeat"). */
      playExample: boolean;
    };

export type StudentAnswer = number | string | boolean | string[] | null;

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
    answerType: z.enum(["multiple_choice", "fill_in", "true_false", "midi"]),
    prompt: z.string().trim().min(3, "The question is too short").max(2000),
    mediaKey: z.string().trim().max(600).nullable().optional(),
    /** Generated sound (audio questions only); replaces the uploaded clip. */
    sound: questionSoundSchema.nullable().optional(),
    options: z.array(z.string().trim().min(1, "A choice cannot be empty").max(300)).max(6).nullable().optional(),
    answerKey: answerKeySchema,
    explanation: z.string().trim().max(2000).nullable().optional(),
    topic: z.string().trim().max(300).nullable().optional(),
    kelas: z.string().trim().max(40, "Too long").nullable().optional(),
    semester: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
    points: z.number().int().min(1).max(100).default(1),
  })
  .superRefine((v, ctx) => {
    const isu = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    // Consistency between question type <-> answer type
    if (v.type === "midi" && v.answerType !== "midi") isu("answerType", "A MIDI question must be answered with the piano");
    if (["multiple_choice", "fill_in", "true_false"].includes(v.type) && v.answerType !== v.type)
      isu("answerType", "The answer type does not match the question type");
    if ((v.type === "audio" || v.type === "video") && v.answerType === "midi")
      isu("answerType", "Choose multiple choice, fill-in, or true/false");
    if (v.type === "video" && !v.mediaKey) isu("mediaKey", "Upload a video for the video question");
    if (v.type === "audio" && !v.mediaKey && !v.sound) isu("mediaKey", "Upload an audio clip or make a sound for the audio question");
    if (v.sound && v.type !== "audio") isu("sound", "Only audio questions can have a generated sound");
    if (v.sound?.kind === "notes" && v.sound.notes.some((n) => noteToMidi(n) === null)) isu("sound", "Some notes are invalid (a correct example: C4 E4 G4)");
    if (v.sound?.kind === "notes" && v.sound.doNote && noteToMidi(v.sound.doNote) === null) isu("sound", "The \"do\" note is invalid (example: C4)");
    if (v.answerKey.kind !== v.answerType) isu("answerKey", "The answer key does not match the answer type");

    if (v.answerType === "multiple_choice" && v.answerKey.kind === "multiple_choice") {
      const options = v.options ?? [];
      if (options.length < 2) isu("options", "At least 2 answer choices");
      else if (v.answerKey.correct >= options.length) isu("answerKey", "Choose the correct answer");
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

/** Human-readable key text (for feedback and teacher review). */
export function formatAnswerKey(answerKey: AnswerKey, options?: string[] | null, t: Translate = (k) => k): string {
  switch (answerKey.kind) {
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

/** Human-readable student answer text. */
export function formatAnswer(answer: unknown, options?: string[] | null, t: Translate = (k) => k): string {
  if (answer === null || answer === undefined || answer === "") return t("(not answered)");
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
