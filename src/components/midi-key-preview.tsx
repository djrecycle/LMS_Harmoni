"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square } from "lucide-react";
import { Piano } from "@/components/piano";
import { Button } from "@/components/ui/button";
import { playChord, playSequence } from "@/lib/audio";
import { noteToMidi } from "@/lib/music";
import { useT } from "@/i18n/client";

/** Teacher preview of a MIDI question: the piano with the answer-key notes marked, plus a button to hear them. */
export function MidiKeyPreview({ notes, mode }: { notes: string[]; mode: "ordered" | "chord" }) {
  const t = useT();
  const midis = notes.map((n) => noteToMidi(n)).filter((n): n is number => n !== null);
  const [highlight, setHighlight] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const cancel = useRef<(() => void) | null>(null);

  useEffect(() => () => cancel.current?.(), []);

  function play() {
    cancel.current?.();
    if (mode === "chord") {
      playChord(midis);
      setHighlight(midis);
      setPlaying(true);
      const timer = setTimeout(() => {
        setHighlight([]);
        setPlaying(false);
      }, 1600);
      cancel.current = () => clearTimeout(timer);
      return;
    }
    setPlaying(true);
    cancel.current = playSequence(midis, {
      onNote: (m) => setHighlight(m === null ? [] : [m]),
      onCompleted: () => setPlaying(false),
    });
  }
  function stop() {
    cancel.current?.();
    setHighlight([]);
    setPlaying(false);
  }

  return (
    <div className="mt-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={playing ? stop : play} disabled={midis.length === 0}>
          {playing ? <Square /> : <Play />} {playing ? t("Stop") : t("Play the answer key")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("Green keys are the answer key.")}</span>
      </div>
      <Piano correctKeys={midis} highlight={highlight} bolehMidi={false} sizeControl={false} />
    </div>
  );
}
