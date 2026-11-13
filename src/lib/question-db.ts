/** Turn a validated question input into the values stored in the database (shared by the question and exam actions). */
import { midiToNote, noteToMidi } from "./music";
import type { QuestionInput } from "./questions";

/** Normalize MIDI key notes to standard notation (e.g. Db4 -> C#4). */
export function normalize(v: QuestionInput): QuestionInput {
  if (v.sound?.kind === "notes") v = { ...v, sound: { ...v.sound, notes: v.sound.notes.map((n) => midiToNote(noteToMidi(n) ?? 60)) } };
  if (v.answerKey.kind === "midi") {
    return { ...v, answerKey: { ...v.answerKey, note: v.answerKey.note.map((n) => midiToNote(noteToMidi(n) ?? 60)) } };
  }
  if (v.answerKey.kind === "multiple_select") {
    return { ...v, answerKey: { ...v.answerKey, correct: [...new Set(v.answerKey.correct)].sort((x, y) => x - y) } };
  }
  if (v.answerKey.kind === "fill_in") {
    return { ...v, answerKey: { ...v.answerKey, answer: v.answerKey.answer.map((j) => j.trim()).filter(Boolean) } };
  }
  return v;
}

/** Choice images lined up with the choices (only for multiple choice / complex multiple choice); null when there are none. */
export function alignOptionImages(v: Pick<QuestionInput, "answerType" | "options" | "optionImages">): (string | null)[] | null {
  if (!(v.answerType === "multiple_choice" || v.answerType === "multiple_select") || !v.optionImages) return null;
  const images = (v.options ?? []).map((_, i) => v.optionImages?.[i] || null);
  return images.some(Boolean) ? images : null;
}

export function toDbValues(v: QuestionInput) {
  return {
    // Not sent = keep the saved choice images (e.g. AI-written questions, which have none yet).
    ...(v.optionImages !== undefined ? { optionImages: alignOptionImages(v) } : {}),
    type: v.type,
    answerType: v.answerType,
    prompt: v.prompt,
    mediaKey: v.mediaKey || null,
    sound: v.type === "audio" ? (v.sound ?? null) : null,
    options: v.answerType === "multiple_choice" || v.answerType === "multiple_select" || v.answerType === "matching" ? (v.options ?? []) : null,
    matchRows: v.answerType === "matching" ? (v.matchRows ?? []) : null,
    answerKey: v.answerKey,
    explanation: v.explanation || null,
    topic: v.topic || null,
    level: v.level || null,
    notation: v.notation ?? null,
    imageHint: v.imageHint || null,
    kelas: v.kelas || null,
    semester: v.semester ?? null,
    points: v.points,
  };
}
