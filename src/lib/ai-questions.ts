import { midiToNote, noteToMidi, normalizeSolfege, solfegeOf, solfegeVariants } from "./music";
import { parseRhythm, rhythmBeats, rhythmToText, sameRhythm } from "./rhythm";
import { questionInputSchema, type QuestionInput } from "./questions";

/** Question types the AI can write. listen_notes / listen_tempo are audio questions whose sound the app plays itself. */
export const AI_QUESTION_TYPES = ["multiple_choice", "true_false", "fill_in", "midi", "listen_notes", "listen_tempo", "listen_rhythm", "listen_solfege"] as const;
export type AiQuestionType = (typeof AI_QUESTION_TYPES)[number];

export type AiQuestionItem = {
  type: AiQuestionType;
  prompt: string;
  options: string[];
  indexCorrect: number;
  trueFalse: boolean;
  fillInAnswers: string[];
  noteMidi: string[];
  modeMidi: "ordered" | "chord";
  /** listen_*: how the student answers. Optional: only listening questions use the fields below. */
  listenAnswer?: "multiple_choice" | "true_false" | "fill_in";
  /** listen_notes: notes to play, together (harmonic) or one after another. */
  soundNotes?: string[];
  soundHarmonic?: boolean;
  /** listen_tempo: click track. */
  soundBpm?: number;
  soundBeats?: number;
  soundMeter?: number;
  /** listen_rhythm: the rhythm in syllables, e.g. "ta ti-ti ta z". */
  soundRhythm?: string;
  /** listen_solfege: the "do" note of the key, e.g. "C4". */
  soundDo?: string;
  explanation: string;
};

/** Convert one AI-generated question into a valid QuestionInput; null if it fails validation. */
export function toQuestionInput(a: AiQuestionItem, topic: string): QuestionInput | null {
  const base = { prompt: a.prompt, explanation: a.explanation || null, topic, points: 1, mediaKey: null };
  let candidate: unknown;
  /** Answer part shared by multiple choice / true-false / fill-in (also used by listening questions). */
  const answerPart = (kind: "multiple_choice" | "true_false" | "fill_in") => {
    if (kind === "multiple_choice") return { answerType: kind, options: a.options.map((o) => o.trim()).filter(Boolean), answerKey: { kind, correct: a.indexCorrect } };
    if (kind === "true_false") return { answerType: kind, options: null, answerKey: { kind, correct: a.trueFalse } };
    return { answerType: kind, options: null, answerKey: { kind, answer: a.fillInAnswers.map((j) => j.trim()).filter(Boolean) } };
  };
  switch (a.type) {
    case "multiple_choice":
    case "true_false":
    case "fill_in":
      candidate = { ...base, type: a.type, ...answerPart(a.type) };
      break;
    case "midi": {
      const note = a.noteMidi.map((n) => noteToMidi(n)).filter((n): n is number => n !== null).map(midiToNote);
      candidate = { ...base, type: "midi", answerType: "midi", options: null, answerKey: { kind: "midi", note, mode: a.modeMidi, ignoreOctave: false, playExample: false } };
      break;
    }
    case "listen_notes": {
      const raw = a.soundNotes ?? [];
      const notes = raw.map((n) => noteToMidi(n)).filter((n): n is number => n !== null).map(midiToNote);
      // A note the app cannot play would make the question unanswerable, so drop the whole question.
      if (notes.length !== raw.length) return null;
      candidate = { ...base, type: "audio", ...answerPart(a.listenAnswer ?? "multiple_choice"), sound: { kind: "notes", notes, harmonic: Boolean(a.soundHarmonic) } };
      break;
    }
    case "listen_tempo": {
      const sound = { kind: "tempo", bpm: Math.round(a.soundBpm ?? 0), beats: Math.round(a.soundBeats ?? 0) || 8, meter: Math.round(a.soundMeter ?? 0) || 4, voice: "click" };
      candidate = { ...base, type: "audio", ...answerPart(a.listenAnswer ?? "multiple_choice"), sound };
      break;
    }
    case "listen_rhythm": {
      // Rhythm choices are checked against the played rhythm: exactly the keyed choice must sound the same.
      const pattern = parseRhythm(a.soundRhythm ?? "");
      if (!pattern) return null;
      const options = a.options.map((o) => parseRhythm(o));
      if (options.length < 2 || options.some((o) => !o || rhythmBeats(o) !== rhythmBeats(pattern))) return null;
      const matching = options.map((o, i) => (sameRhythm(o!, pattern) ? i : -1)).filter((i) => i >= 0);
      if (matching.length !== 1 || matching[0] !== a.indexCorrect) return null;
      const bpm = Math.round(a.soundBpm ?? 0) || 80;
      candidate = {
        ...base,
        type: "audio",
        answerType: "multiple_choice",
        options: options.map((o) => rhythmToText(o!)),
        answerKey: { kind: "multiple_choice", correct: a.indexCorrect },
        sound: { kind: "rhythm", pattern, bpm, voice: "tepuk" },
      };
      break;
    }
    case "listen_solfege": {
      const raw = a.soundNotes ?? [];
      const midis = raw.map((n) => noteToMidi(n));
      const doMidi = noteToMidi(a.soundDo ?? "");
      if (raw.length === 0 || doMidi === null || midis.some((m) => m === null)) return null;
      const syllables = midis.map((m) => solfegeOf(m!, doMidi));
      if (syllables.some((x) => x === null)) return null;
      const solfege = syllables.join(" ");
      const sound = { kind: "notes", notes: midis.map((m) => midiToNote(m!)), harmonic: false, doNote: midiToNote(doMidi) };
      const kind = a.listenAnswer === "multiple_choice" ? "multiple_choice" : "fill_in";
      if (kind === "multiple_choice") {
        // Exactly the keyed choice must match the melody's solfège.
        const matching = a.options.map((o, i) => (normalizeSolfege(o) === solfege ? i : -1)).filter((i) => i >= 0);
        if (matching.length !== 1 || matching[0] !== a.indexCorrect) return null;
        candidate = { ...base, type: "audio", ...answerPart("multiple_choice"), sound };
      } else {
        // The fill-in key is computed from the notes, so it is always right.
        candidate = { ...base, type: "audio", answerType: "fill_in", options: null, answerKey: { kind: "fill_in", answer: solfegeVariants(solfege) }, sound };
      }
      break;
    }
  }
  const p = questionInputSchema.safeParse(candidate);
  return p.success ? p.data : null;
}

