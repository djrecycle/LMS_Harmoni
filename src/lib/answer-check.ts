import { noteToMidi } from "./music";
import type { AnswerType } from "./questions";

/** Check a student's answer has the right shape for the question, and normalize it for grading. */
export function clearAnswer(answerShape: AnswerType, answer: unknown, optionCount: number, rowCount: number): { ok: true; grade: unknown } | { ok: false } {
  const ints = (a: unknown): a is number[] => Array.isArray(a) && a.every((n) => typeof n === "number" && Number.isInteger(n));
  switch (answerShape) {
    case "multiple_select":
      return ints(answer) && answer.length <= optionCount && answer.every((n) => n >= 0 && n < optionCount) ? { ok: true, grade: [...new Set(answer)].sort((a, b) => a - b) } : { ok: false };
    case "matching":
      return ints(answer) && answer.length === rowCount && answer.every((n) => n >= -1 && n < optionCount) ? { ok: true, grade: answer } : { ok: false };
    case "essay":
      return typeof answer === "string" ? { ok: true, grade: answer.trim().slice(0, 5000) } : { ok: false };
    case "multiple_choice":
      return typeof answer === "number" && Number.isInteger(answer) && answer >= 0 && answer < optionCount ? { ok: true, grade: answer } : { ok: false };
    case "true_false":
      return typeof answer === "boolean" ? { ok: true, grade: answer } : { ok: false };
    case "fill_in":
      return typeof answer === "string" ? { ok: true, grade: answer.trim().slice(0, 500) } : { ok: false };
    case "midi":
      return Array.isArray(answer) && answer.length <= 64 && answer.every((n) => typeof n === "string" && noteToMidi(n) !== null)
        ? { ok: true, grade: answer }
        : { ok: false };
  }
}
