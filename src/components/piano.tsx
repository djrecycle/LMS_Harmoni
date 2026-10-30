"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Keyboard, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KeySizeControl, useKeyScale } from "@/components/key-size-control";
import { unlockAudio, loadAudio, noteOn, noteOff, stopAllNotes } from "@/lib/audio";
import { isBlackKey, midiToNote } from "@/lib/music";
import { useMidi } from "@/lib/use-midi";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const MIN_KEY_WIDTH = 42; // px, comfortable for fingers on a phone

/** Computer keyboard mapping: the row "asdfghjkl;" = white keys, "wetyuop" = black keys (starting from C). */
const WHITE_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];
const BLACK_KEY_MAP: Record<string, number> = { w: 1, e: 3, t: 6, y: 8, u: 10, o: 13, p: 15 };
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];

type Props = {
  /** Called every time a key is pressed (on screen, computer keyboard, or MIDI). */
  onNotePress?: (midi: number) => void;
  onNoteRelease?: (midi: number) => void;
  /** Keys highlighted from outside (e.g. during a melody demo or feedback). */
  highlight?: number[];
  /** Keys colored "correct"/"incorrect" after grading. */
  correctKeys?: number[];
  wrongKeys?: number[];
  disabled?: boolean;
  sound?: boolean;
  formatName?: boolean;
  bolehMidi?: boolean;
  className?: string;
  /** Overrides the height of the keys (default h-44 sm:h-56). With `sizeControl`, sets `--kh` instead (the height at 100%). */
  keysClassName?: string;
  /** Shows − / + buttons to resize the keys (Virtual Piano). */
  sizeControl?: boolean;
};

export function Piano({
  onNotePress,
  onNoteRelease,
  highlight = [],
  correctKeys = [],
  wrongKeys = [],
  disabled,
  sound = true,
  formatName = true,
  bolehMidi = true,
  className,
  keysClassName,
  sizeControl = false,
}: Props) {
  const t = useT();
  const keyScale = useKeyScale();
  const storeRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [initialOctave, setInitialOctave] = useState(4);
  const [active, setActive] = useState<Set<number>>(new Set());
  const activeRef = useRef<Map<string, number>>(new Map()); // pointerId/source -> midi
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useLayoutEffect(() => {
    const el = storeRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    void loadAudio(); // download Tone.js in the background
    return () => stopAllNotes();
  }, []);

  // Number of white keys that fit: 7 to 15, starting from C.
  const whiteKeyCount = Math.max(7, Math.min(15, Math.floor(width / MIN_KEY_WIDTH) || 7));
  const midiInitial = (initialOctave + 1) * 12; // C{octave}

  // Build the key list: each white key is followed by the black key between it and the next (if any).
  const white: number[] = [];
  const black: { midi: number; position: number }[] = [];
  {
    let m = midiInitial;
    while (white.length < whiteKeyCount) {
      if (!isBlackKey(m)) {
        white.push(m);
        const berikut = m + 1;
        if (isBlackKey(berikut) && white.length < whiteKeyCount) black.push({ midi: berikut, position: white.length });
      }
      m++;
    }
  }

  const press = useCallback(
    (source: string, midi: number, velocity = 0.85) => {
      if (disabledRef.current) return;
      const current = activeRef.current.get(source);
      if (current === midi) return;
      if (current !== undefined) {
        noteOff(current);
        onNoteRelease?.(current);
      }
      activeRef.current.set(source, midi);
      setActive(new Set(activeRef.current.values()));
      if (sound) noteOn(midi, velocity);
      onNotePress?.(midi);
    },
    [sound, onNotePress, onNoteRelease],
  );

  const release = useCallback(
    (source: string) => {
      const midi = activeRef.current.get(source);
      if (midi === undefined) return;
      activeRef.current.delete(source);
      setActive(new Set(activeRef.current.values()));
      if (sound) noteOff(midi);
      onNoteRelease?.(midi);
    },
    [sound, onNoteRelease],
  );

  // Computer keyboard
  useEffect(() => {
    const bukanInput = (t: EventTarget | null) => !(t instanceof HTMLElement) || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable;
    const keyToMidi = (k: string): number | null => {
      const iP = WHITE_KEYS.indexOf(k);
      if (iP >= 0) return midiInitial + WHITE_OFFSETS[iP];
      if (k in BLACK_KEY_MAP) return midiInitial + BLACK_KEY_MAP[k];
      return null;
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !bukanInput(e.target)) return;
      const m = keyToMidi(e.key.toLowerCase());
      if (m !== null) {
        e.preventDefault();
        void unlockAudio();
        press(`kb:${e.key.toLowerCase()}`, m);
      }
    };
    const up = (e: KeyboardEvent) => release(`kb:${e.key.toLowerCase()}`);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [midiInitial, press, release]);

  const midi = useMidi(
    (n, k) => press(`midi:${n}`, n, 0.4 + k * 0.6),
    (n) => release(`midi:${n}`),
  );

  const highlightSet = new Set(highlight);
  const correctSet = new Set(correctKeys);
  const wrongSet = new Set(wrongKeys);
  const whiteKeyWidthPercent = 100 / whiteKeyCount;

  const handlerTuts = (m: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      void unlockAudio();
      press(`p:${e.pointerId}`, m);
    },
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.buttons === 1 || e.pointerType === "touch") press(`p:${e.pointerId}`, m); // slide a finger across keys (glissando)
    },
    onPointerUp: (e: React.PointerEvent) => release(`p:${e.pointerId}`),
    onPointerCancel: (e: React.PointerEvent) => release(`p:${e.pointerId}`),
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") release(`p:${e.pointerId}`);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const tone = (m: number, blackKey: boolean) => {
    if (correctSet.has(m)) return "!bg-success !text-white";
    if (wrongSet.has(m)) return "!bg-danger !text-white";
    if (active.has(m) || highlightSet.has(m)) return blackKey ? "!bg-primary" : "!bg-primary-soft !border-primary";
    return "";
  };

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-9" aria-label={t("Lower octave")} disabled={initialOctave <= 1} onClick={() => setInitialOctave((o) => o - 1)}>
            <ChevronLeft />
          </Button>
          <span className="min-w-20 text-center text-sm font-bold">{t("Octave C")}{initialOctave}</span>
          <Button variant="outline" size="icon" className="size-9" aria-label={t("Higher octave")} disabled={initialOctave >= 6} onClick={() => setInitialOctave((o) => o + 1)}>
            <ChevronRight />
          </Button>
          {sizeControl && (
            <span className="ml-2">
              <KeySizeControl />
            </span>
          )}
        </div>
        {bolehMidi && (
          <div className="flex items-center gap-2 text-xs">
            {midi.status === "connected" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 font-semibold text-success">
                <Usb className="size-3.5" />
                {midi.device.length ? midi.device.join(", ") : t("MIDI active, plug in a keyboard")}
              </span>
            ) : midi.status === "not-supported" ? (
              <span className="text-muted-foreground">{t("MIDI keyboards are not supported in this browser")}</span>
            ) : midi.status === "ditolak" ? (
              <span className="text-danger">{t("MIDI permission was denied. Change it in the site settings.")}</span>
            ) : (
              <Button variant="outline" size="sm" onClick={midi.connect} disabled={midi.status === "meminta"}>
                <Usb /> {t("Connect MIDI keyboard")}
              </Button>
            )}
          </div>
        )}
      </div>

      <div
        ref={storeRef}
        role="group"
        aria-label={t("Virtual piano")}
        style={sizeControl ? ({ "--ks": keyScale } as React.CSSProperties) : undefined}
        className={cn(
          "relative w-full select-none overflow-hidden rounded-xl bg-neutral-900 p-1.5 pt-3 shadow-inner",
          sizeControl ? cn("h-[calc(var(--kh)*var(--ks))]", keysClassName ?? "[--kh:11rem] sm:[--kh:14rem]") : cn("h-44 sm:h-56", keysClassName),
          disabled && "opacity-60",
        )}
      >
        <div className="relative flex h-full w-full">
          {white.map((m) => (
            <button
              key={m}
              type="button"
              tabIndex={-1}
              aria-label={midiToNote(m)}
              {...handlerTuts(m)}
              className={cn(
                "piano-key relative flex h-full flex-1 items-end justify-center rounded-b-lg border border-neutral-300 bg-white pb-2 text-[0.65rem] font-bold text-neutral-500 shadow-[inset_0_-6px_0_rgba(0,0,0,0.07)] transition-colors duration-75 active:translate-y-px",
                tone(m, false),
              )}
            >
              {formatName && <span>{m % 12 === 0 ? midiToNote(m) : midiToNote(m).replace(/\d/, "")}</span>}
            </button>
          ))}
          {black.map(({ midi: m, position }) => (
            <button
              key={m}
              type="button"
              tabIndex={-1}
              aria-label={midiToNote(m)}
              {...handlerTuts(m)}
              style={{ left: `calc(${position * whiteKeyWidthPercent}% - ${whiteKeyWidthPercent * 0.3}%)`, width: `${whiteKeyWidthPercent * 0.6}%` }}
              className={cn(
                "piano-key absolute top-0 z-10 h-[62%] rounded-b-md border border-black bg-neutral-800 shadow-md transition-colors duration-75 active:translate-y-px",
                tone(m, true),
              )}
            />
          ))}
        </div>
      </div>
      <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <Keyboard className="size-3.5" /> {t("You can also play with your computer keyboard:")} <kbd className="rounded bg-muted px-1.5 font-mono">A S D F G H J K L</kbd> {t("(white keys) and")}{" "}
        <kbd className="rounded bg-muted px-1.5 font-mono">W E T Y U O P</kbd> {t("(black keys).")}
      </p>
    </div>
  );
}
