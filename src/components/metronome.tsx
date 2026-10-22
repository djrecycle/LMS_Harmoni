"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Play, Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startMetronome } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Metronome: set the tempo (30-240 BPM) and 2-6 beats per bar; the beat lights follow the sound. */
export function Metronome({ initialBpm = 80 }: { initialBpm?: number }) {
  const t = useT();
  const [bpm, setBpm] = useState(initialBpm);
  const [beat, setBeat] = useState(4);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState(-1);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);
  // When the beat count changes while running: restart the scheduler.
  useEffect(() => {
    if (!running) return;
    stop.current?.();
    stop.current = startMetronome(() => bpmRef.current, beat, setActive);
  }, [beat, running]);

  const toggle = () => {
    if (running) {
      stop.current?.();
      stop.current = null;
      setRunning(false);
      setActive(-1);
    } else setRunning(true);
  };
  const set = (n: number) => setBpm(Math.max(30, Math.min(240, n)));

  return (
    <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{t("Metronome")}</h3>
        <span className="text-xs text-muted-foreground">{bpm < 66 ? "Largo" : bpm < 108 ? "Andante" : bpm < 168 ? "Allegro" : "Presto"}</span>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" aria-label={t("Decrease tempo")} onClick={() => set(bpm - 1)}>
          <Minus />
        </Button>
        <div className="min-w-24 text-center">
          <p className="text-4xl leading-none font-extrabold tabular-nums">{bpm}</p>
          <p className="text-xs text-muted-foreground">BPM</p>
        </div>
        <Button variant="outline" size="icon" aria-label={t("Increase tempo")} onClick={() => set(bpm + 1)}>
          <Plus />
        </Button>
      </div>
      <input type="range" min={30} max={240} value={bpm} onChange={(e) => set(Number(e.target.value))} aria-label={t("Tempo")} className="w-full accent-[var(--primary)]" />
      <div className="flex items-center justify-center gap-2" aria-hidden>
        {Array.from({ length: beat }, (_, i) => (
          <span key={i} className={cn("size-5 rounded-full border-2 transition-all", active === i ? (i === 0 ? "scale-125 border-accent bg-accent" : "scale-125 border-primary bg-primary") : "border-input")} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          {t("Time signature")}
          <select value={beat} onChange={(e) => setBeat(Number(e.target.value))} className="h-9 rounded-lg border border-input bg-card px-2 text-sm" aria-label={t("Beats per bar")}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}/4
              </option>
            ))}
          </select>
        </label>
        <Button onClick={toggle} variant={running ? "danger" : "default"}>
          {running ? <Square /> : <Play />} {running ? t("Stop") : t("Start")}
        </Button>
      </div>
    </div>
  );
}
