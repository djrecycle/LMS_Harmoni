"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Plus, Trash, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { saveQuestion } from "@/app/actions/question";
import { MediaUploader } from "@/components/media-uploader";
import { Piano } from "@/components/piano";
import { TopicPicker } from "@/components/topic-picker";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { playSequence } from "@/lib/audio";
import type { TopicSuggestions } from "@/lib/form-data";
import { midiToNote, noteToMidi, parseNoteList, solfegeOf, solfegeVariants } from "@/lib/music";
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, SOUND_VOICES, type AnswerType, type AnswerKey, type QuestionSound, type QuestionType } from "@/lib/questions";
import { RhythmGlyphs, SoundPlayer } from "@/components/sound-player";
import { RhythmTapRecorder } from "@/components/rhythm-tap-recorder";
import { parseRhythm, rhythmToText, rhythmVariants } from "@/lib/rhythm";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type QuestionDraft = {
  id?: string;
  type: QuestionType;
  answerType: AnswerType;
  prompt: string;
  mediaKey: string | null;
  sound?: QuestionSound | null;
  options: string[] | null;
  answerKey: AnswerKey | null;
  explanation: string | null;
  topic: string | null;
  kelas?: string | null;
  semester?: number | null;
  points: number;
};

const AUDIO_ANSWER_TYPES: { grade: Exclude<AnswerType, "midi">; label: string }[] = [
  { grade: "multiple_choice", label: "Multiple choice" },
  { grade: "fill_in", label: "Fill in" },
  { grade: "true_false", label: "True / False" },
];

const QUESTION_TYPE_HINTS: Record<QuestionType, string> = {
  multiple_choice: "A text question with several choices, optional image.",
  fill_in: "The student types a short answer.",
  true_false: "A statement judged true or false.",
  audio: "Guess the note, interval, or tempo: upload a clip or let the app play it.",
  video: "A short video as the question material.",
  midi: "The student answers by pressing piano keys.",
};

const empty: QuestionDraft = {
  type: "multiple_choice",
  answerType: "multiple_choice",
  prompt: "",
  mediaKey: null,
  options: ["", "", "", ""],
  answerKey: { kind: "multiple_choice", correct: 0 },
  explanation: null,
  topic: null,
  points: 1,
};

/** Default answer type for a question type. */
const answerTypeFor = (t: QuestionType): AnswerType => (t === "audio" || t === "video" ? "multiple_choice" : t);

function defaultAnswerKey(b: AnswerType): AnswerKey {
  switch (b) {
    case "multiple_choice":
      return { kind: "multiple_choice", correct: 0 };
    case "fill_in":
      return { kind: "fill_in", answer: [] };
    case "true_false":
      return { kind: "true_false", correct: true };
    case "midi":
      return { kind: "midi", note: [], mode: "ordered", ignoreOctave: false, playExample: false };
  }
}

export function QuestionForm({
  question,
  topicSuggestions,
  target = "/teacher/question-bank",
  onSave,
}: {
  question?: QuestionDraft;
  topicSuggestions: TopicSuggestions;
  target?: string;
  /** When set, the form is used inside another flow (e.g. AI drafts): it does not save to the DB, it only returns the data. */
  onSave?: (data: QuestionDraft) => void;
}) {
  const t = useT();
  const router = useRouter();
  const initialState = question ?? empty;
  const [type, setType] = useState<QuestionType>(initialState.type);
  const [answerShape, setAnswerShape] = useState<AnswerType>(initialState.answerType);
  const [prompt, setPrompt] = useState(initialState.prompt);
  const [mediaKey, setMediaKey] = useState(initialState.mediaKey ?? "");
  const [sound, setSound] = useState<QuestionSound | null>(initialState.sound ?? null);
  const [options, setOptions] = useState<string[]>(initialState.options?.length ? initialState.options : ["", "", "", ""]);
  const [answerKey, setAnswerKey] = useState<AnswerKey>(initialState.answerKey ?? defaultAnswerKey(initialState.answerType));
  const [explanation, setExplanation] = useState(initialState.explanation ?? "");
  const [topic, setTopic] = useState(initialState.topic ?? "");
  const [points, setPoints] = useState(initialState.points);
  const [kelas, setKelas] = useState(initialState.kelas ?? "");
  const [semester, setSemester] = useState<string>(initialState.semester ? String(initialState.semester) : "");

  // Class suggestions: the usual SMP levels plus any class already used in the teacher's TP/lessons.
  const kelasOptions = [
    ...new Set(["VII", "VIII", "IX", ...topicSuggestions.groups.map((g) => g.kelas), ...topicSuggestions.materials.flatMap((m) => m.kelas)].filter(Boolean)),
  ];

  /** Picking a TP from Perangkat Ajar also fills the class and semester (only when they are still empty). */
  function changeTopic(v: string) {
    setTopic(v);
    const group = topicSuggestions.groups.find((g) => g.tp.includes(v));
    if (!group) return;
    if (!kelas && group.kelas) setKelas(group.kelas);
    if (!semester && (group.semesterNo === 1 || group.semesterNo === 2)) setSemester(String(group.semesterNo));
  }
  const [error, setError] = useState<Record<string, string>>({});
  const [errorUmum, setErrorUmum] = useState("");
  const [busy, start] = useTransition();

  function changeType(t: QuestionType) {
    setType(t);
    const b = answerTypeFor(t);
    setAnswerShape(b);
    setAnswerKey(defaultAnswerKey(b));
    setMediaKey("");
    setSound(null);
  }
  function changeAnswerShape(b: AnswerType) {
    setAnswerShape(b);
    setAnswerKey(defaultAnswerKey(b));
  }

  const kindMedia: "image" | "audio" | "video" = type === "audio" || type === "midi" ? "audio" : type === "video" ? "video" : "image";
  const mediaRequire = type === "audio" || type === "video";

  function send(e: React.FormEvent) {
    e.preventDefault();
    setError({});
    setErrorUmum("");
    const data = {
      type,
      answerType: answerShape,
      prompt,
      mediaKey: type === "audio" && sound ? null : mediaKey || null,
      sound: type === "audio" ? sound : null,
      options: answerShape === "multiple_choice" ? options.map((o) => o.trim()) : null,
      answerKey,
      explanation: explanation || null,
      topic: topic || null,
      kelas: kelas.trim() || null,
      semester: semester ? Number(semester) : null,
      points,
    };
    if (onSave) return onSave(data as QuestionDraft);
    start(async () => {
      const r = await saveQuestion(data, question?.id);
      if (!r.ok) {
        setError(r.fieldErrors ?? {});
        setErrorUmum(r.error ?? t("Could not save."));
        toast.error(r.error ?? t("Could not save."));
        return;
      }
      toast.success(r.message);
      router.push(target);
      router.refresh();
    });
  }

  return (
    <form onSubmit={send} className="grid gap-6">
      {/* 1. Type */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("Question types")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUESTION_TYPES.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => changeType(x)}
              aria-pressed={type === x}
              className={cn("rounded-xl border-2 p-3 text-left transition-colors", type === x ? "border-primary bg-primary-soft" : "hover:bg-muted")}
            >
              <span className="block text-sm font-bold">{t(QUESTION_TYPE_LABELS[x])}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t(QUESTION_TYPE_HINTS[x])}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* 2. Prompt & media     */}
      <Field label={t("Question")} htmlFor="prompt" error={error.prompt}>
        <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} required />
      </Field>

      {type === "audio" && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("Where the sound comes from")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                [false, t("Upload an audio file"), t("A recording of a song, instrument, or voice.")],
                [true, t("Played by the app"), t("Piano notes or a tempo click, no file needed. The AI can make these.")],
              ] as const
            ).map(([generated, title, hint]) => (
              <button
                key={String(generated)}
                type="button"
                onClick={() => setSound(generated ? (sound ?? { kind: "notes", notes: ["C4", "E4"], harmonic: false }) : null)}
                aria-pressed={Boolean(sound) === generated}
                className={cn("rounded-xl border-2 p-3 text-left", Boolean(sound) === generated ? "border-primary bg-primary-soft" : "hover:bg-muted")}
              >
                <span className="block text-sm font-bold">{title}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {type === "audio" && sound ? (
        <SoundEditor
          sound={sound}
          setSound={setSound}
          error={error.sound ?? error.mediaKey}
          onFillChoices={(choices, correct) => {
            setAnswerShape("multiple_choice");
            setOptions(choices);
            setAnswerKey({ kind: "multiple_choice", correct });
            toast.success(t("Answer choices filled in. Check them below."));
          }}
          onFillText={(answer) => {
            setAnswerShape("fill_in");
            setAnswerKey({ kind: "fill_in", answer: solfegeVariants(answer) });
            toast.success(t("Answer key filled in. Check it below."));
          }}
        />
      ) : (
        <div>
          <p className="mb-1.5 text-sm font-semibold">
            {type === "audio" ? t("Question audio clip") : type === "video" ? t("Question video") : type === "midi" ? t("Supporting audio (optional)") : t("Supporting image (optional)")}
            {mediaRequire && <span className="text-danger"> *</span>}
          </p>
          <MediaUploader key={kindMedia} name="mediaKey" kind={kindMedia} defaultValue={mediaKey} onChange={setMediaKey} />
          {error.mediaKey && <p className="mt-1 text-xs font-medium text-danger">{error.mediaKey}</p>}
        </div>
      )}

      {/* 3. Answer type (audio/video)    */}
      {(type === "audio" || type === "video") && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("The student answers with")}</legend>
          <div className="flex flex-wrap gap-2">
            {AUDIO_ANSWER_TYPES.map((b) => (
              <button
                key={b.grade}
                type="button"
                onClick={() => changeAnswerShape(b.grade)}
                aria-pressed={answerShape === b.grade}
                className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", answerShape === b.grade ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {t(b.label)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* 4. Answer key    */}
      <section className="rounded-xl border bg-muted/30 p-4">
        <h3 className="mb-3 text-sm font-bold">{t("Answer key")}</h3>

        {answerShape === "multiple_choice" && answerKey.kind === "multiple_choice" && (
          <div className="grid gap-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={answerKey.correct === i}
                  onChange={() => setAnswerKey({ kind: "multiple_choice", correct: i })}
                  aria-label={t("Make choice {0} the correct answer", i + 1)}
                  className="size-5 shrink-0 accent-[var(--success)]"
                />
                <Input value={o} onChange={(e) => setOptions((a) => a.map((x, j) => (j === i ? e.target.value : x)))} placeholder={t("Choice {0}", String.fromCharCode(65 + i))} aria-label={t("Choice {0}", i + 1)} />
                {options.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    aria-label={t("Remove choice")}
                    onClick={() => {
                      setOptions((a) => a.filter((_, j) => j !== i));
                      setAnswerKey((k) => (k.kind === "multiple_choice" ? { kind: "multiple_choice", correct: k.correct === i ? 0 : k.correct > i ? k.correct - 1 : k.correct } : k));
                    }}
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{t("Select the circle on the left to mark the correct answer.")}</p>
              {options.length < 6 && (
                <Button variant="ghost" size="sm" onClick={() => setOptions((a) => [...a, ""])}>
                  <Plus /> {t("Add choice")}
                </Button>
              )}
            </div>
            {(error.options || error.answerKey) && <p className="text-xs font-medium text-danger">{error.options ?? error.answerKey}</p>}
          </div>
        )}

        {answerShape === "true_false" && answerKey.kind === "true_false" && (
          <div className="flex gap-2">
            {[true, false].map((b) => (
              <button
                key={String(b)}
                type="button"
                onClick={() => setAnswerKey({ kind: "true_false", correct: b })}
                aria-pressed={answerKey.correct === b}
                className={cn("flex-1 rounded-xl border-2 py-3 text-sm font-bold", answerKey.correct === b ? "border-success bg-success-soft text-success" : "hover:bg-muted")}
              >
                {b ? t("Statement is TRUE") : t("Statement is FALSE")}
              </button>
            ))}
          </div>
        )}

        {answerShape === "fill_in" && answerKey.kind === "fill_in" && (
          <Field label={t("Accepted answers (one per line)")} htmlFor="answerKey-fillIn" hint={t("Capitalization and punctuation are ignored. Leave empty if you want to grade manually.")}>
            <Textarea id="answerKey-fillIn" rows={3} value={answerKey.answer.join("\n")} onChange={(e) => setAnswerKey({ kind: "fill_in", answer: e.target.value.split("\n") })} placeholder={t("piano\nacoustic piano")} />
          </Field>
        )}

        {answerShape === "midi" && answerKey.kind === "midi" && <MidiAnswerKey answerKey={answerKey} setAnswerKey={setAnswerKey} error={error.answerKey} />}
      </section>

      {/* 5. Other   */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("TP / Topic")} htmlFor="topic" hint={t("A learning objective (Tujuan Pembelajaran) from Perangkat Ajar, or your own topic. Used to group questions.")} className="sm:col-span-2">
          <TopicPicker id="topic" value={topic} onChange={changeTopic} suggestions={topicSuggestions} maxLength={300} />
        </Field>
        <Field label={t("Points")} htmlFor="points" error={error.points}>
          <Input id="points" type="number" min={1} max={100} value={points} onChange={(e) => setPoints(Math.max(1, Number(e.target.value) || 1))} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("Class level")} htmlFor="kelas" hint={t("Example: VII, VIII, IX")} error={error.kelas}>
          <Input id="kelas" list="kelas-options" value={kelas} onChange={(e) => setKelas(e.target.value)} maxLength={40} placeholder={t("Not set")} />
          <datalist id="kelas-options">
            {kelasOptions.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>
        <Field label={t("Semester")} htmlFor="semester" error={error.semester}>
          <Select id="semester" value={semester} onChange={(e) => setSemester(e.target.value)}>
            <option value="">{t("Not set")}</option>
            <option value="1">{t("Semester 1 (odd)")}</option>
            <option value="2">{t("Semester 2 (even)")}</option>
          </Select>
        </Field>
      </div>
      <Field label={t("Explanation (optional)")} htmlFor="explanation" hint={t("Shown to the student after answering")}>
        <Textarea id="explanation" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </Field>

      {errorUmum && <Alert kind="error">{errorUmum}</Alert>}
      <div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t("Saving…") : onSave ? t("Apply changes") : question?.id ? t("Save changes") : t("Save to question bank")}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function MidiAnswerKey({ answerKey, setAnswerKey, error }: { answerKey: Extract<AnswerKey, { kind: "midi" }>; setAnswerKey: (k: AnswerKey) => void; error?: string }) {
  const t = useT();
  const [text, setText] = useState(answerKey.note.join(" "));
  const [errorText, setErrorText] = useState(false);
  const cancel = useRef<(() => void) | null>(null);
  const [highlight, setHighlight] = useState<number[]>([]);

  const setNote = (note: string[]) => {
    setAnswerKey({ ...answerKey, note });
    setText(note.join(" "));
    setErrorText(false);
  };

  function listen() {
    cancel.current?.();
    const midis = answerKey.note.map((n) => noteToMidi(n)).filter((n): n is number => n !== null);
    cancel.current = playSequence(midis, { onNote: (m) => setHighlight(m === null ? [] : [m]) });
  }

  return (
    <div className="grid gap-4">
      <div>
        <p className="mb-1 text-sm font-semibold">{t("The correct notes")}</p>
        <p className="mb-2 text-xs text-muted-foreground">{t("Press the piano keys below to record notes, or type them directly (example: C4 E4 G4).")}</p>
        <div className="mb-3 flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border bg-card p-2">
          {answerKey.note.length === 0 && <span className="px-1 text-sm text-muted-foreground">{t("No notes yet")}</span>}
          {answerKey.note.map((n, i) => (
            <span key={i} className="rounded-md bg-primary-soft px-2.5 py-1 font-mono text-sm font-bold text-primary">
              {n}
            </span>
          ))}
        </div>
        <Piano
          bolehMidi
          highlight={highlight}
          onNotePress={(m) => {
            setNote([...answerKey.note, midiToNote(m)].slice(0, 32));
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={listen} disabled={!answerKey.note.length}>
            <Play /> {t("Listen")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNote(answerKey.note.slice(0, -1))} disabled={!answerKey.note.length}>
            <Undo2 /> {t("Delete last")}
          </Button>
          <Button variant="danger-soft" size="sm" onClick={() => setNote([])} disabled={!answerKey.note.length}>
            <Trash /> {t("Clear")}
          </Button>
        </div>
        <Field label={t("Or type the notes")} htmlFor="text-note" error={errorText ? t("Some notes are invalid. A correct example: C4 D#4 F4") : error} className="mt-3">
          <Input
            id="text-note"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const p = e.target.value.trim() === "" ? [] : parseNoteList(e.target.value);
              if (p) {
                setErrorText(false);
                setAnswerKey({ ...answerKey, note: p });
              } else setErrorText(true);
            }}
            className="font-mono"
            placeholder="C4 E4 G4"
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t("How to match")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["ordered", t("In order (melody)"), t("Notes must be played in order.")],
              ["chord", t("Together / any order (chord)"), t("All notes must be right; order does not matter.")],
            ] as const
          ).map(([value, title, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => setAnswerKey({ ...answerKey, mode: value })}
              aria-pressed={answerKey.mode === value}
              className={cn("rounded-xl border-2 p-3 text-left", answerKey.mode === value ? "border-primary bg-primary-soft" : "hover:bg-muted")}
            >
              <span className="block text-sm font-bold">{title}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={answerKey.ignoreOctave} onChange={(e) => setAnswerKey({ ...answerKey, ignoreOctave: e.target.checked })} />
        <span>
          <b>{t("Ignore octave")}</b>
          <span className="block text-xs text-muted-foreground">{t("C4 and C5 count as the same. Good for beginner students.")}</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={answerKey.playExample} onChange={(e) => setAnswerKey({ ...answerKey, playExample: e.target.checked })} />
        <span>
          <b>{t("Play the example notes to the student")}</b>
          <span className="block text-xs text-muted-foreground">{t("For \"listen then repeat\" practice. Note: the example notes are also sent to the student's device.")}</span>
        </span>
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const VOICE_LABELS: Record<(typeof SOUND_VOICES)[number], string> = { click: "Click", tepuk: "Hand clap", kentongan: "Kentongan", tamborin: "Tambourine" };

/** Edit a sound the app plays itself: piano notes (guess the note/interval/chord) or a click track (guess the tempo). */
const RHYTHM_PALETTE: { word: string; label: string }[] = [
  { word: "ta", label: "ta (1)" },
  { word: "ti-ti", label: "ti-ti (½ + ½)" },
  { word: "ta-a", label: "ta-a (2)" },
  { word: "ta-a-a-a", label: "ta-a-a-a (4)" },
  { word: "z", label: "z (rest 1)" },
];

function SoundEditor({
  sound,
  setSound,
  error,
  onFillChoices,
  onFillText,
}: {
  sound: QuestionSound;
  setSound: (s: QuestionSound) => void;
  error?: string;
  onFillChoices: (choices: string[], correct: number) => void;
  onFillText: (answer: string) => void;
}) {
  const t = useT();
  const [text, setText] = useState(sound.kind === "notes" ? sound.notes.join(" ") : "C4 E4");
  const [errorText, setErrorText] = useState(false);
  const [rhythmText, setRhythmText] = useState(sound.kind === "rhythm" ? rhythmToText(sound.pattern) : "ta ti-ti ta ta");
  const [doText, setDoText] = useState(sound.kind === "notes" ? (sound.doNote ?? "") : "");
  const [pianoTarget, setPianoTarget] = useState<"notes" | "do">("notes");

  function setNotes(notes: string[]) {
    if (sound.kind !== "notes") return;
    setSound({ ...sound, notes });
    setText(notes.join(" "));
    setErrorText(notes.length === 0);
  }

  /** A piano key appends a note (max 16), or sets the "do" note. */
  function pressNote(m: number) {
    if (sound.kind !== "notes") return;
    if (pianoTarget === "do") {
      setDoText(midiToNote(m));
      setSound({ ...sound, doNote: midiToNote(m) });
    } else if (sound.notes.length < 16) setNotes([...sound.notes, midiToNote(m)]);
  }

  function changeKind(kind: QuestionSound["kind"]) {
    if (kind === sound.kind) return;
    if (kind === "tempo") setSound({ kind: "tempo", bpm: 90, beats: 8, meter: 4, voice: "click" });
    else if (kind === "rhythm") setSound({ kind: "rhythm", pattern: parseRhythm(rhythmText) ?? ["quarter", "eighth", "eighth", "quarter", "quarter"], bpm: 80, voice: "tepuk" });
    else setSound({ kind: "notes", notes: parseNoteList(text) ?? ["C4", "E4"], harmonic: false, doNote: noteToMidi(doText) === null ? null : doText });
  }

  function changeRhythm(value: string) {
    setRhythmText(value);
    const p = parseRhythm(value);
    if (p && sound.kind === "rhythm") setSound({ ...sound, pattern: p });
  }

  /** Correct rhythm + up to 3 variations, in random order. */
  function fillRhythmChoices() {
    if (sound.kind !== "rhythm") return;
    const wrong = rhythmVariants(sound.pattern, 3);
    if (wrong.length === 0) return void toast.error(t("Could not make variations of this rhythm. Write the choices yourself."));
    const correct = Math.floor(Math.random() * (wrong.length + 1));
    const choices = wrong.map(rhythmToText);
    choices.splice(correct, 0, rhythmToText(sound.pattern));
    onFillChoices(choices, correct);
  }

  const doMidi = sound.kind === "notes" && sound.doNote ? noteToMidi(sound.doNote) : null;
  const solfege = sound.kind === "notes" && doMidi !== null ? sound.notes.map((n) => solfegeOf(noteToMidi(n) ?? 0, doMidi)) : null;
  const solfegeText = solfege && solfege.every(Boolean) ? solfege.join(" ") : null;

  return (
    <section className="grid gap-4 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["notes", t("Piano notes")],
            ["tempo", t("Tempo (beats)")],
            ["rhythm", t("Rhythm")],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => changeKind(kind)}
            aria-pressed={sound.kind === kind}
            className={cn("rounded-full border px-4 py-1.5 text-sm font-semibold", sound.kind === kind ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {label}
          </button>
        ))}
      </div>

      {sound.kind === "notes" && (
        <>
          <Field
            label={t("Notes to play")}
            htmlFor="sound-notes"
            hint={t("Letter + octave, separated by spaces (example: C4 E4 G4).")}
            error={errorText ? t("Some notes are invalid. A correct example: C4 D#4 F4") : undefined}
          >
            <Input
              id="sound-notes"
              value={text}
              className="font-mono"
              placeholder="C4 E4"
              onChange={(e) => {
                setText(e.target.value);
                const p = parseNoteList(e.target.value);
                if (p && p.length > 0 && p.length <= 16) {
                  setErrorText(false);
                  setSound({ ...sound, notes: p });
                } else setErrorText(true);
              }}
            />
          </Field>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{t("Piano keys fill in:")}</span>
              {(
                [
                  ["notes", t("Notes to play")],
                  ["do", t("\"Do\" note")],
                ] as const
              ).map(([target, label]) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setPianoTarget(target)}
                  aria-pressed={pianoTarget === target}
                  className={cn("rounded-full border px-3 py-1 text-xs font-semibold", pianoTarget === target ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {label}
                </button>
              ))}
            </div>
            <Piano highlight={pianoTarget === "do" && doMidi !== null ? [doMidi] : []} onNotePress={pressNote} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setNotes(sound.notes.slice(0, -1))} disabled={!sound.notes.length}>
                <Undo2 /> {t("Delete last")}
              </Button>
              <Button variant="danger-soft" size="sm" onClick={() => setNotes([])} disabled={!sound.notes.length}>
                <Trash /> {t("Clear")}
              </Button>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={sound.harmonic} onChange={(e) => setSound({ ...sound, harmonic: e.target.checked })} />
            <span>
              <b>{t("Play the notes together")}</b>
              <span className="block text-xs text-muted-foreground">{t("For chords and harmonic intervals. Unchecked: one note after another.")}</span>
            </span>
          </label>
          <Field label={t("\"Do\" note for solfège (optional)")} htmlFor="sound-do" hint={t("When set, the app first plays the do-mi-sol chord of this key as a reference. Example: C4 (C major), G3 (G major).")}>
            <Input
              id="sound-do"
              value={doText}
              className="max-w-40 font-mono"
              placeholder="C4"
              onChange={(e) => {
                setDoText(e.target.value);
                const m = e.target.value.trim() === "" ? null : noteToMidi(e.target.value);
                if (sound.kind === "notes") setSound({ ...sound, doNote: m === null ? null : midiToNote(m) });
              }}
            />
          </Field>
          {doMidi !== null && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {solfegeText ? (
                <>
                  <span>
                    {t("Solfège:")} <b className="font-mono">{solfegeText}</b>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => onFillText(solfegeText)}>
                    {t("Use as the fill-in answer")}
                  </Button>
                </>
              ) : (
                <span className="text-warning">{t("Some notes are outside the major scale of this \"do\", so they have no solfège syllable.")}</span>
              )}
            </div>
          )}
        </>
      )}

      {sound.kind === "rhythm" && (
        <>
          <Field
            label={t("Rhythm pattern")}
            htmlFor="sound-rhythm"
            hint={t("Write it with syllables: ta = 1 beat, ti-ti = two half beats, ta-a = 2 beats, ta-a-a-a = 4 beats, z = 1 beat rest. Example: ta ti-ti ta z")}
            error={parseRhythm(rhythmText) ? undefined : t("Use only ta, ti-ti, ti, ta-a, ta-a-a-a, z, zi (at most 16 beats).")}
          >
            <Input id="sound-rhythm" value={rhythmText} className="font-mono" onChange={(e) => changeRhythm(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {RHYTHM_PALETTE.map((p) => (
              <Button key={p.word} variant="outline" size="sm" onClick={() => changeRhythm(`${rhythmText.trim()} ${p.word}`.trim())}>
                + {t(p.label)}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => changeRhythm(rhythmText.trim().split(/\s+/).slice(0, -1).join(" "))} disabled={!rhythmText.trim()}>
              <Undo2 /> {t("Delete last")}
            </Button>
          </div>
          <RhythmTapRecorder
            bpm={sound.bpm}
            voice={sound.voice}
            onRecorded={(p) => {
              if (!p) return void toast.error(t("No usable taps were recorded. Try again."));
              changeRhythm(rhythmToText(p));
            }}
          />
          <RhythmGlyphs pattern={sound.pattern} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Tempo (BPM)")} htmlFor="sound-rbpm">
              <Input id="sound-rbpm" type="number" min={30} max={220} value={sound.bpm} onChange={(e) => setSound({ ...sound, bpm: Math.min(220, Number(e.target.value) || 0) })} onBlur={() => setSound({ ...sound, bpm: Math.max(30, Math.min(220, sound.bpm)) })} />
            </Field>
            <Field label={t("Sound")} htmlFor="sound-rvoice">
              <Select id="sound-rvoice" value={sound.voice} onChange={(e) => setSound({ ...sound, voice: e.target.value as (typeof SOUND_VOICES)[number] })}>
                {SOUND_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {t(VOICE_LABELS[v])}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={fillRhythmChoices}>
              {t("Make answer choices from this rhythm")}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">{t("Fills 4 choices (the correct rhythm + 3 similar ones). Students see the choices as note symbols.")}</p>
          </div>
        </>
      )}

      {sound.kind === "tempo" && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={t("Tempo (BPM)")} htmlFor="sound-bpm">
            <Input id="sound-bpm" type="number" min={30} max={220} value={sound.bpm} onChange={(e) => setSound({ ...sound, bpm: Math.min(220, Number(e.target.value) || 0) })} onBlur={() => setSound({ ...sound, bpm: Math.max(30, Math.min(220, sound.bpm)) })} />
          </Field>
          <Field label={t("Number of beats")} htmlFor="sound-beats">
            <Input id="sound-beats" type="number" min={2} max={32} value={sound.beats} onChange={(e) => setSound({ ...sound, beats: Math.min(32, Number(e.target.value) || 0) })} onBlur={() => setSound({ ...sound, beats: Math.max(2, Math.min(32, sound.beats)) })} />
          </Field>
          <Field label={t("Accent every")} htmlFor="sound-meter" hint={t("1 = no accent")}>
            <Input id="sound-meter" type="number" min={1} max={12} value={sound.meter} onChange={(e) => setSound({ ...sound, meter: Math.min(12, Number(e.target.value) || 0) })} onBlur={() => setSound({ ...sound, meter: Math.max(1, Math.min(12, sound.meter)) })} />
          </Field>
          <Field label={t("Sound")} htmlFor="sound-voice">
            <Select id="sound-voice" value={sound.voice} onChange={(e) => setSound({ ...sound, voice: e.target.value as (typeof SOUND_VOICES)[number] })}>
              {SOUND_VOICES.map((v) => (
                <option key={v} value={v}>
                  {t(VOICE_LABELS[v])}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <SoundPlayer sound={sound} reveal />
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </section>
  );
}
