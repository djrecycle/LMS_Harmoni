"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playChord, playClicks, playRhythm, playSequence } from "@/lib/audio";
import { noteToMidi } from "@/lib/music";
import { formatSound, type QuestionSound } from "@/lib/questions";
import { parseRhythm, rhythmBeats, rhythmOnsets, rhythmToText } from "@/lib/rhythm";
import { RhythmNotation, type NoteGlyphKind } from "@/components/lessons/note-glyph";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const NOTE_GAP = 0.75;
const CHORD_LENGTH = 1.8;
/** Reference chord (do-mi-sol) before a solfège melody, then a short silence. */
const REFERENCE_LENGTH = 1.2;
const REFERENCE_GAP = 1.8;

/**
 * Plays a question's generated sound (piano notes or a click track) in the browser.
 *  `reveal` shows what the sound is (notes / BPM): for the teacher only, never in the student's quiz.
 */
export function SoundPlayer({ sound, reveal = false, className }: { sound: QuestionSound; reveal?: boolean; className?: string }) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState<number | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  useEffect(() => () => cancel.current?.(), []);

  function stop() {
    cancel.current?.();
    cancel.current = null;
    setPlaying(false);
  }

  function play() {
    stop();
    setPlaying(true);
    const done = () => setPlaying(false);
    if (sound.kind === "tempo") {
      cancel.current = playClicks(sound.bpm, sound.beats, sound.meter, sound.voice, { onBeat: setBeat, onCompleted: done });
      return;
    }
    if (sound.kind === "rhythm") {
      cancel.current = playRhythm(rhythmOnsets(sound.pattern), rhythmBeats(sound.pattern), sound.bpm, sound.voice, { onCountIn: setBeat, onCompleted: done });
      return;
    }
    const midis = sound.notes.map((n) => noteToMidi(n)).filter((n): n is number => n !== null);
    const doMidi = sound.doNote ? noteToMidi(sound.doNote) : null;
    let stopMelody: (() => void) | null = null;
    const melody = () => {
      if (sound.harmonic) {
        playChord(midis, CHORD_LENGTH);
        const timer = setTimeout(done, CHORD_LENGTH * 1000);
        stopMelody = () => clearTimeout(timer);
      } else {
        stopMelody = playSequence(midis, { delay: NOTE_GAP, duration: NOTE_GAP * 0.85, onCompleted: done });
      }
    };
    if (doMidi === null) {
      melody();
      cancel.current = () => stopMelody?.();
      return;
    }
    playChord([doMidi, doMidi + 4, doMidi + 7], REFERENCE_LENGTH);
    const wait = setTimeout(melody, REFERENCE_GAP * 1000);
    cancel.current = () => {
      clearTimeout(wait);
      stopMelody?.();
    };
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 p-3", className)}>
      <Button type="button" variant={playing ? "outline" : "secondary"} onClick={playing ? stop : play}>
        {playing ? <Square /> : <Play />} {playing ? t("Stop") : t("Play the sound")}
      </Button>
      {sound.kind === "tempo" && (
        <div className="flex flex-wrap gap-1.5" aria-hidden>
          {Array.from({ length: sound.beats }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-3 rounded-full bg-border transition-colors",
                reveal && sound.meter > 1 && i % sound.meter === 0 && "size-3.5", // only the teacher sees the accents; students must hear them
                beat === i && "bg-primary",
              )}
            />
          ))}
        </div>
      )}
      {sound.kind === "rhythm" && (
        <div className="flex gap-1.5" aria-hidden title={t("Count-in")}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("grid size-6 place-items-center rounded-full bg-border text-xs font-bold transition-colors", beat === i && "bg-primary text-primary-foreground")}>
              {i + 1}
            </span>
          ))}
        </div>
      )}
      {!reveal && (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Volume2 className="size-4" />{" "}
          {sound.kind === "rhythm"
            ? t("Listen to the count of 4, then the rhythm. Play it again as often as you need.")
            : sound.kind === "notes" && sound.doNote
              ? t("First you hear the \"do\" chord as a reference, then the melody. Play it again as often as you need.")
              : t("You can play it again as often as you need.")}
        </span>
      )}
      {reveal && <span className="font-mono text-sm font-semibold">{formatSound(sound, t)}</span>}
    </div>
  );
}

/** A rhythm drawn as note symbols, with the syllables as the accessible name. */
export function RhythmGlyphs({ pattern, className }: { pattern: NoteGlyphKind[]; className?: string }) {
  return (
    <span role="img" aria-label={rhythmToText(pattern)} className={cn("inline-flex flex-wrap items-end gap-0.5", className)}>
      <RhythmNotation pattern={pattern} />
    </span>
  );
}

/** An answer choice: drawn as note symbols when the question is a rhythm question and the choice is a rhythm. */
export function ChoiceLabel({ text, sound }: { text: string; sound: QuestionSound | null | undefined }) {
  const pattern = sound?.kind === "rhythm" ? parseRhythm(text) : null;
  if (!pattern) return <>{text}</>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <RhythmGlyphs pattern={pattern} />
      <span className="font-mono text-xs text-muted-foreground">{text}</span>
    </span>
  );
}
