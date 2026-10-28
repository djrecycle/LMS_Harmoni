/**
 * Client-side audio engine (Tone.js is lazy-loaded so other pages stay light).
 *  All functions are safe to call repeatedly; sound only becomes active after a user interaction (browser rule).
 */
import type * as ToneNS from "tone";
import { midiToFrequency } from "./music";
import type { RhythmVoice } from "./music-blocks";

type ToneModul = typeof ToneNS;

let tone: ToneModul | null = null;
let memuat: Promise<void> | null = null;
let piano: ToneNS.PolySynth | null = null;
let klikSynth: ToneNS.Synth | null = null;
let tepukSynth: ToneNS.NoiseSynth | null = null;
let kentonganSynth: ToneNS.MembraneSynth | null = null;
let tamborinSynth: ToneNS.MetalSynth | null = null;
let snareNoise: ToneNS.NoiseSynth | null = null;
let snareBody: ToneNS.MembraneSynth | null = null;
let tomSynth: ToneNS.MembraneSynth | null = null;
let kendangSynth: ToneNS.MembraneSynth | null = null;

/** Percussive timbre used for metronome/rhythm clicks. */
export type ClickVoice = "click" | "tepuk" | "kentongan" | "tamborin" | "drum" | "tom" | "kendang";

/** The percussion sounds a rhythm can be played with (labels are English source strings for t()). */
export const RHYTHM_VOICES: { id: RhythmVoice; label: string }[] = [
  { id: "drum", label: "Drum (snare)" },
  { id: "tom", label: "Tom drum" },
  { id: "kendang", label: "Kendang" },
  { id: "tepuk", label: "Hand clap" },
  { id: "kentongan", label: "Kentongan" },
  { id: "tamborin", label: "Tambourine" },
];

export function loadAudio(): Promise<void> {
  memuat ??= (async () => {
    const T = await import("tone");
    // Low latency: keys sound immediately (Tone's default delays by 100 ms).
    const ctx = new T.Context({ latencyHint: "interactive", lookAhead: 0 });
    T.setContext(ctx);
    tone = T;

    const filter = new T.Filter(4200, "lowpass").toDestination();
    const compressor = new T.Compressor(-18, 4).connect(filter);
    piano = new T.PolySynth(T.Synth, {
      oscillator: { type: "triangle8" },
      envelope: { attack: 0.004, decay: 0.45, sustain: 0.22, release: 1.1 },
      volume: -7,
    }).connect(compressor);
    piano.maxPolyphony = 16;

    klikSynth = new T.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
      volume: -12,
    }).toDestination();

    // "Tepuk tangan" (hand clap): filtered noise burst.
    tepukSynth = new T.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.09, sustain: 0 },
      volume: -8,
    }).connect(new T.Filter(1800, "bandpass").toDestination());

    // "Kentongan" (wood block / bamboo slit drum): short pitched tock.
    kentonganSynth = new T.MembraneSynth({
      pitchDecay: 0.008,
      octaves: 3,
      envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.05 },
      volume: -6,
    }).toDestination();

    // "Tamborin" (tambourine): bright metallic jingle.
    tamborinSynth = new T.MetalSynth({
      envelope: { attack: 0.001, decay: 0.18, release: 0.05 },
      harmonicity: 5.1,
      modulationIndex: 24,
      resonance: 3500,
      octaves: 1.2,
      volume: -20,
    }).toDestination();

    // "Drum": a snare drum, a noise rattle over a short drum-head thump.
    snareNoise = new T.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
      volume: -10,
    }).connect(new T.Filter(2600, "highpass").toDestination());
    snareBody = new T.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
      volume: -8,
    }).toDestination();

    // "Tom": a deep tom-tom.
    tomSynth = new T.MembraneSynth({
      pitchDecay: 0.06,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
      volume: -4,
    }).toDestination();

    // "Kendang": the Javanese hand drum, a round "dhung" with the pitch sliding down.
    kendangSynth = new T.MembraneSynth({
      pitchDecay: 0.12,
      octaves: 1.6,
      envelope: { attack: 0.002, decay: 0.28, sustain: 0, release: 0.08 },
      volume: -5,
    }).toDestination();
  })();
  return memuat;
}

/** Call inside the first click/touch handler to unlock browser audio. */
export async function unlockAudio() {
  await loadAudio();
  if (tone && tone.getContext().state !== "running") await tone.start();
}

export const isAudioReady = () => Boolean(tone && tone.getContext().state === "running");

export function audioTime(): number {
  return tone ? tone.getContext().currentTime : 0;
}

export function noteOn(midi: number, velocity = 0.85) {
  if (!piano || !tone) {
    void unlockAudio().then(() => piano?.triggerAttack(midiToFrequency(midi), tone!.now(), velocity));
    return;
  }
  if (tone.getContext().state !== "running") void tone.start();
  piano.triggerAttack(midiToFrequency(midi), tone.now(), velocity);
}

export function noteOff(midi: number) {
  if (!piano || !tone) return;
  piano.triggerRelease(midiToFrequency(midi), tone.now());
}

export function stopAllNotes() {
  piano?.releaseAll();
}

/** Play one note at a specific audio time (seconds, AudioContext clock). */
export function scheduleNote(midi: number, time: number, duration = 0.35, velocity = 0.8) {
  piano?.triggerAttackRelease(midiToFrequency(midi), duration, time, velocity);
}

const lastClickTime: Record<ClickVoice, number> = { click: 0, tepuk: 0, kentongan: 0, tamborin: 0, drum: 0, tom: 0, kendang: 0 };

export function scheduleClick(time: number, accent = false, voice: ClickVoice = "click") {
  // Each voice is a mono synth, which throws when a start time is not after its previous one (e.g. a restarted metronome).
  time = Math.max(time, lastClickTime[voice] + 0.001);
  lastClickTime[voice] = time;
  if (voice === "tepuk") {
    tepukSynth?.triggerAttackRelease(0.09, time, accent ? 1 : 0.7);
  } else if (voice === "kentongan") {
    kentonganSynth?.triggerAttackRelease(accent ? "G4" : "D4", 0.09, time, accent ? 1 : 0.75);
  } else if (voice === "drum") {
    const v = accent ? 1 : 0.7;
    snareNoise?.triggerAttackRelease(0.14, time, v);
    snareBody?.triggerAttackRelease(accent ? "E3" : "D3", 0.1, time, v);
  } else if (voice === "tom") {
    tomSynth?.triggerAttackRelease(accent ? "C2" : "G1", 0.3, time, accent ? 1 : 0.75);
  } else if (voice === "kendang") {
    kendangSynth?.triggerAttackRelease(accent ? "A2" : "D3", 0.25, time, accent ? 1 : 0.8);
  } else if (voice === "tamborin") {
    tamborinSynth?.triggerAttackRelease(accent ? "C6" : "A5", 0.12, time, accent ? 1 : 0.7);
  } else {
    klikSynth?.triggerAttackRelease(accent ? 1600 : 1000, 0.03, time);
  }
}

/** Play several notes together (a chord or a harmonic interval), starting now. */
export function playChord(midis: number[], duration = 1.6, velocity = 0.7) {
  void unlockAudio().then(() => {
    if (!tone) return;
    const start = tone.getContext().currentTime + 0.05;
    midis.forEach((m) => scheduleNote(m, start, duration, velocity));
  });
}

/**
 * Play a sequence of notes (melody) right now. `onNote` is called exactly when each note sounds (to highlight keys).
 *  Returns a cancel function.
 */
export function playSequence(
  midis: number[],
  options: { delay?: number; duration?: number; onNote?: (midi: number | null, index: number) => void; onCompleted?: () => void } = {},
) {
  const { delay = 0.5, duration = 0.42 } = options;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancel = false;
  void unlockAudio().then(() => {
    if (cancel || !tone) return;
    const start = tone.getContext().currentTime + 0.08;
    midis.forEach((m, i) => {
      scheduleNote(m, start + i * delay, duration);
      timers.push(setTimeout(() => !cancel && options.onNote?.(m, i), 80 + i * delay * 1000));
      timers.push(setTimeout(() => !cancel && options.onNote?.(null, i), 80 + (i * delay + duration) * 1000));
    });
    timers.push(setTimeout(() => !cancel && options.onCompleted?.(), 80 + midis.length * delay * 1000 + 100));
  });
  return () => {
    cancel = true;
    timers.forEach(clearTimeout);
    options.onNote?.(null, -1);
  };
}

/** Estimated delay (seconds) between a sound being scheduled and actually being heard. Used to grade taps. */
export function audioLatency(): number {
  if (!tone) return 0;
  const raw = tone.getContext().rawContext as unknown as { baseLatency?: number; outputLatency?: number };
  return (raw.baseLatency ?? 0) + (raw.outputLatency ?? 0);
}

/** Metronome with look-ahead scheduling (accurate even when the UI is busy). Returns a stop function. */
export function startMetronome(takeBpm: () => number, tapPerBar: number, onTap?: (to: number) => void, takeVoice: () => ClickVoice = () => "click") {
  let stop = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  void unlockAudio().then(() => {
    if (stop) return;
    let berikut = audioTime() + 0.1;
    let to = 0;
    timer = setInterval(() => {
      while (berikut < audioTime() + 0.15) {
        const idx = to;
        scheduleClick(berikut, idx % tapPerBar === 0, takeVoice());
        setTimeout(() => !stop && onTap?.(idx % tapPerBar), Math.max(0, (berikut - audioTime()) * 1000));
        berikut += 60 / Math.max(30, takeBpm());
        to++;
      }
    }, 25);
  });
  return () => {
    stop = true;
    if (timer) clearInterval(timer);
    onTap?.(-1);
  };
}

/** One percussion hit, `beat` beats after the start. */
export type BeatEvent = { beat: number; accent: boolean; voice: ClickVoice };

/**
 * Play percussion hits on a beat grid at `bpm` (look-ahead scheduling, like the metronome, so it stays steady
 *  and can be stopped mid-way). `onBeat` gets the event index when it sounds (null at the end).
 *  The sequence lasts `totalBeats` beats. Returns a cancel function.
 */
export function playBeats(
  events: BeatEvent[],
  bpm: number,
  totalBeats: number,
  options: { onBeat?: (index: number | null) => void; onCompleted?: () => void } = {},
) {
  let cancel = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];
  void unlockAudio().then(() => {
    if (cancel) return;
    const gap = 60 / Math.max(30, bpm);
    const start = audioTime() + 0.1;
    let next = 0;
    timer = setInterval(() => {
      while (next < events.length && start + events[next].beat * gap < audioTime() + 0.15) {
        const idx = next;
        const e = events[idx];
        const time = start + e.beat * gap;
        scheduleClick(time, e.accent, e.voice);
        timers.push(setTimeout(() => !cancel && options.onBeat?.(idx), Math.max(0, (time - audioTime()) * 1000)));
        next++;
      }
      if (next >= events.length) {
        if (timer) clearInterval(timer);
        timer = null;
        const end = start + totalBeats * gap;
        timers.push(
          setTimeout(() => {
            if (cancel) return;
            options.onBeat?.(null);
            options.onCompleted?.();
          }, Math.max(0, (end - audioTime()) * 1000)),
        );
      }
    }, 25);
  });
  return () => {
    cancel = true;
    if (timer) clearInterval(timer);
    timers.forEach(clearTimeout);
    options.onBeat?.(null);
  };
}

/** Play a fixed number of clicks at a tempo (tempo questions), accenting the first beat of every `meter` beats. */
export function playClicks(
  bpm: number,
  beats: number,
  meter: number,
  voice: ClickVoice = "click",
  options: { onBeat?: (index: number | null) => void; onCompleted?: () => void } = {},
) {
  const events = Array.from({ length: beats }, (_, i) => ({ beat: i, accent: meter > 1 && i % meter === 0, voice }));
  return playBeats(events, bpm, beats, options);
}

/**
 * Play a rhythm (onsets in beats) after a one-bar count-in of 4 soft clicks (rhythm questions).
 *  `onBeat` gets the index of the count-in click (0-3) while counting in, then null.
 */
export function playRhythm(
  onsets: number[],
  totalBeats: number,
  bpm: number,
  voice: ClickVoice,
  options: { onCountIn?: (index: number | null) => void; onCompleted?: () => void } = {},
) {
  const COUNT_IN = 4;
  const events: BeatEvent[] = [
    ...Array.from({ length: COUNT_IN }, (_, i) => ({ beat: i, accent: i === 0, voice: "click" as const })),
    ...onsets.map((o) => ({ beat: COUNT_IN + o, accent: true, voice })),
  ];
  return playBeats(events, bpm, COUNT_IN + totalBeats, {
    onBeat: (i) => options.onCountIn?.(i !== null && i < COUNT_IN ? i : null),
    onCompleted: options.onCompleted,
  });
}
