"use client";

import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Square } from "lucide-react";
import { MediaPlayer } from "@/components/media-player";
import { Piano } from "@/components/piano";
import { ChoiceLabel, SoundPlayer } from "@/components/sound-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { playSequence } from "@/lib/audio";
import { midiToNote, noteToMidi } from "@/lib/music";
import type { StudentAnswer, StudentQuestion } from "@/lib/questions";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export type FeedbackView = { correct: boolean | null; answerKey: string | null; explanation: string | null } | null;

/** Shows a question and its answer widget by type (multiple choice, fill-in, true/false, MIDI). */
export function QuestionWidget({
  question,
  value,
  onEdit,
  locked,
  feedback,
}: {
  question: StudentQuestion;
  value: StudentAnswer;
  onEdit: (v: StudentAnswer) => void;
  locked: boolean;
  feedback: FeedbackView;
}) {
  const t = useT();
  const kindMedia = question.type === "audio" || question.type === "midi" ? "audio" : question.type === "video" ? "video" : "image";

  return (
    <div className="grid gap-4">
      <p className="text-lg leading-relaxed font-semibold sm:text-xl">{question.prompt}</p>
      {question.mediaKey && <MediaPlayer kind={kindMedia} mediaKey={question.mediaKey} className="mx-auto max-w-xl" />}
      {question.sound && <SoundPlayer sound={question.sound} className="mx-auto w-full max-w-xl" />}

      {question.answerType === "multiple_choice" && (
        <div role="radiogroup" aria-label={t("Answer choices")} className="grid gap-2.5">
          {(question.options ?? []).map((o, i) => {
            const selected = value === i;
            const correctAnswerKey = feedback?.answerKey === o; // only filled when the answer is wrong
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => onEdit(i)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-3.5 text-left text-base transition-all active:scale-[0.99]",
                  !locked && (selected ? "border-primary bg-primary-soft" : "hover:border-primary/50 hover:bg-muted"),
                  locked && selected && feedback?.correct === true && "border-success bg-success-soft",
                  locked && selected && feedback?.correct === false && "border-danger bg-danger-soft",
                  locked && correctAnswerKey && "border-success bg-success-soft",
                  locked && !selected && !correctAnswerKey && "opacity-60",
                  locked && selected && !feedback && "border-primary bg-primary-soft",
                )}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold", selected ? "bg-primary text-primary-foreground" : "bg-muted")}>{String.fromCharCode(65 + i)}</span>
                <span className="min-w-0 break-words">
                  <ChoiceLabel text={o} sound={question.sound} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {question.answerType === "true_false" && (
        <div role="radiogroup" aria-label={t("True or false")} className="grid grid-cols-2 gap-3">
          {[true, false].map((b) => {
            const selected = value === b;
            return (
              <button
                key={String(b)}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => onEdit(b)}
                className={cn(
                  "rounded-xl border-2 py-5 text-lg font-extrabold transition-all active:scale-[0.98]",
                  !locked && (selected ? "border-primary bg-primary-soft" : "hover:bg-muted"),
                  locked && selected && feedback?.correct === true && "border-success bg-success-soft text-success",
                  locked && selected && feedback?.correct === false && "border-danger bg-danger-soft text-danger",
                  locked && selected && !feedback && "border-primary bg-primary-soft",
                  locked && !selected && "opacity-60",
                )}
              >
                {b ? t("Correct") : t("Incorrect")}
              </button>
            );
          })}
        </div>
      )}

      {question.answerType === "fill_in" && (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onEdit(e.target.value)}
          disabled={locked}
          placeholder={t("Type your answer here…")}
          maxLength={500}
          autoComplete="off"
          autoCapitalize="none"
          aria-label={t("Answer")}
          className={cn("h-14 text-base", locked && feedback?.correct === true && "border-success bg-success-soft", locked && feedback?.correct === false && "border-danger bg-danger-soft")}
        />
      )}

      {question.answerType === "midi" && <MidiAnswer question={question} value={Array.isArray(value) ? value : []} onEdit={onEdit} locked={locked} feedback={feedback} />}
    </div>
  );
}

function MidiAnswer({ question, value, onEdit, locked, feedback }: { question: StudentQuestion; value: string[]; onEdit: (v: StudentAnswer) => void; locked: boolean; feedback: FeedbackView }) {
  const t = useT();
  const [highlight, setHighlight] = useState<number[]>([]);
  const [memutar, setMemutar] = useState(false);
  const cancel = useRef<(() => void) | null>(null);
  const info = question.midi!;

  useEffect(() => () => cancel.current?.(), []);

  function playExample() {
    if (!info.example) return;
    cancel.current?.();
    setMemutar(true);
    cancel.current = playSequence(
      info.example.map((n) => noteToMidi(n)).filter((n): n is number => n !== null),
      { onNote: (m) => setHighlight(m === null ? [] : [m]), onCompleted: () => setMemutar(false) },
    );
  }
  function stop() {
    cancel.current?.();
    setMemutar(false);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {info.example && (
          <Button variant="secondary" onClick={memutar ? stop : playExample}>
            {memutar ? <Square /> : <Play />} {memutar ? t("Stop") : t("Listen to the example")}
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {info.mode === "chord" ? t("Press {0} notes (any order).", info.noteCount) : t("Play {0} notes in order.", info.noteCount)}
        </span>
      </div>

      <div
        aria-live="polite"
        className={cn(
          "flex min-h-14 flex-wrap items-center gap-1.5 rounded-xl border-2 border-dashed p-2.5",
          locked && feedback?.correct === true && "border-success bg-success-soft",
          locked && feedback?.correct === false && "border-danger bg-danger-soft",
        )}
      >
        {value.length === 0 && <span className="px-1 text-sm text-muted-foreground">{t("Your notes will appear here…")}</span>}
        {value.map((n, i) => (
          <span key={i} className="rounded-md bg-primary px-2.5 py-1 font-mono text-sm font-bold text-primary-foreground">
            {n}
          </span>
        ))}
      </div>

      <Piano
        disabled={locked}
        highlight={highlight}
        onNotePress={(m) => {
          if (locked) return;
          onEdit([...value, midiToNote(m)].slice(0, 64));
        }}
      />
      <div>
        <Button variant="outline" size="sm" disabled={locked || value.length === 0} onClick={() => onEdit([])}>
          <RotateCcw /> {t("Start over")}
        </Button>
      </div>
    </div>
  );
}
