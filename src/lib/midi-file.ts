/**
 * Reads a Standard MIDI File (.mid) and turns it into a song melody in the "letters" format of src/lib/songs.ts.
 *  Runs in the browser (and on the server): no dependencies.
 */
import { midiToNote } from "./music";

export type MidiNote = {
  midi: number;
  start: number;
  beats: number;
  track: number;
};
export type MidiFile = { bpm: number; notes: MidiNote[]; trackNames: string[] };

export class MidiFileError extends Error {}

/** Parse the notes of every track (drum channel 10 skipped). Times are in beats (quarter notes). */
export function parseMidiFile(buf: ArrayBuffer): MidiFile {
  const d = new DataView(buf);
  let p = 0;
  const str = (n: number) => String.fromCharCode(...new Uint8Array(buf, p, n));
  if (buf.byteLength < 14 || str(4) !== "MThd") throw new MidiFileError("This is not a MIDI file.");
  const headerLen = d.getUint32(4);
  const trackCount = d.getUint16(10);
  const division = d.getUint16(12);
  if (division & 0x8000) throw new MidiFileError("This MIDI file uses SMPTE timing, which is not supported.");
  const ppq = division || 480;
  p = 8 + headerLen;

  let tempo: number | null = null; // microseconds per quarter note (first tempo wins)
  const notes: MidiNote[] = [];
  const trackNames: string[] = [];

  for (let tr = 0; tr < trackCount && p + 8 <= buf.byteLength; tr++) {
    if (str(4) !== "MTrk") throw new MidiFileError("The MIDI file is damaged.");
    const len = d.getUint32(p + 4);
    p += 8;
    const end = Math.min(buf.byteLength, p + len);
    let tick = 0;
    let status = 0;
    const open = new Map<string, { tick: number; midi: number }>();
    const readVar = () => {
      let v = 0;
      for (let i = 0; i < 4; i++) {
        const b = d.getUint8(p++);
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) break;
      }
      return v;
    };
    const close = (key: string, at: number) => {
      const o = open.get(key);
      if (!o) return;
      open.delete(key);
      if (at > o.tick)
        notes.push({
          midi: o.midi,
          start: o.tick / ppq,
          beats: (at - o.tick) / ppq,
          track: tr,
        });
    };

    while (p < end) {
      tick += readVar();
      let b = d.getUint8(p);
      if (b & 0x80) {
        status = b;
        p++;
      } else if (!status) throw new MidiFileError("The MIDI file is damaged.");
      b = status;
      if (b === 0xff) {
        const type = d.getUint8(p++);
        const l = readVar();
        if (type === 0x51 && l === 3 && tempo === null) tempo = (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2);
        if (type === 0x03) trackNames[tr] = str(l);
        p += l;
        status = 0;
      } else if (b === 0xf0 || b === 0xf7) {
        p += readVar();
        status = 0;
      } else {
        const kind = b & 0xf0;
        const ch = b & 0x0f;
        const a = d.getUint8(p++);
        const c = kind === 0xc0 || kind === 0xd0 ? 0 : d.getUint8(p++);
        if (ch === 9) continue; // drums
        const key = `${ch}:${a}`;
        if (kind === 0x90 && c > 0) {
          close(key, tick);
          open.set(key, { tick, midi: a });
        } else if (kind === 0x80 || (kind === 0x90 && c === 0)) close(key, tick);
      }
    }
    open.forEach((_, key) => close(key, tick));
    p = end;
  }

  if (!notes.length) throw new MidiFileError("No notes were found in this MIDI file.");
  notes.sort((x, y) => x.start - y.start || y.midi - x.midi);
  const bpm = Math.round(60_000_000 / (tempo ?? 500_000));
  return { bpm: Math.min(240, Math.max(30, bpm)), notes, trackNames };
}

const STEP = 0.25; // quantize to sixteenth notes
const q = (x: number) => Math.round(x / STEP) * STEP;
const fmt = (x: number) => String(Number(x.toFixed(2)));

type TimedNote = { midi: number; start: number; beats: number; track?: number };

/**
 * Notes -> "letters" melody text. `melodyOnly` keeps the highest note at each moment (the tune of a piano piece);
 *  otherwise notes that start together become chords ("C4+E4:1").
 */
export function midiToNotation(
  notes: TimedNote[],
  options: {
    melodyOnly?: boolean;
    track?: number;
    keepLeadingRest?: boolean;
  } = {},
): string {
  return notesToSequence(notes, { ...options, name: midiToNote, rest: "R" }) ?? "";
}

/** Notes -> notasi angka with `doMidi` as "do". Null when a note is outside the major scale (e.g. F# with do = C). */
export function notesToAngka(notes: TimedNote[], doMidi: number, options: { melodyOnly?: boolean; keepLeadingRest?: boolean } = {}): string | null {
  const name = (midi: number) => {
    const d = midi - doMidi;
    const octave = Math.floor(d / 12);
    const degree = SCALE_STEPS.indexOf(d - octave * 12);
    if (degree < 0) return null;
    return `${degree + 1}${octave > 0 ? "'".repeat(octave) : ".".repeat(-octave)}`;
  };
  return notesToSequence(notes, { ...options, name, rest: "0" });
}

const SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11];

/** The shared writer of the two formats above: one token per start time, quantized to sixteenth notes. */
function notesToSequence(
  notes: TimedNote[],
  {
    melodyOnly = true,
    track,
    name,
    rest,
    keepLeadingRest = false,
  }: {
    melodyOnly?: boolean;
    track?: number;
    name: (midi: number) => string | null;
    rest: string;
    keepLeadingRest?: boolean;
  },
): string | null {
  const list = notes.filter((n) => track === undefined || n.track === track);
  // Group by quantized start time.
  const groups = new Map<number, TimedNote[]>();
  for (const n of list) {
    const s = q(n.start);
    const g = groups.get(s) ?? [];
    g.push(n);
    groups.set(s, g);
  }
  const starts = [...groups.keys()].sort((a, b) => a - b);
  if (!starts.length) return "";
  const tokens: string[] = [];
  let t = keepLeadingRest || starts[0] < 1 ? 0 : starts[0]; // keep a short pickup, drop long silence at the start
  for (const [i, s] of starts.entries()) {
    const g = groups.get(s)!;
    const chosen = melodyOnly ? [g.reduce((a, b) => (b.midi > a.midi ? b : a))] : [...new Map(g.map((n) => [n.midi, n])).values()].sort((a, b) => a.midi - b.midi);
    const next = starts[i + 1] ?? Infinity;
    const len = Math.max(STEP, Math.min(q(Math.max(...chosen.map((n) => n.beats))) || STEP, next - s));
    for (let gap = s - t; gap > 0; gap -= 32) tokens.push(`${rest}:${fmt(Math.min(32, gap))}`);
    const names = chosen.map((n) => name(n.midi));
    if (names.some((x) => x === null)) return null;
    tokens.push(`${names.join("+")}${len === 1 ? "" : `:${fmt(len)}`}`);
    t = s + len;
  }
  // A line break every 16 tokens keeps the text readable.
  return tokens.reduce((acc, tok, i) => acc + (i === 0 ? "" : i % 16 === 0 ? "\n" : " ") + tok, "");
}

/** Notes -> a Standard MIDI File (format 0, one piano track), for opening the song in FL Studio or another DAW. */
export function writeMidiFile(notes: TimedNote[], bpm: number): Uint8Array<ArrayBuffer> {
  const PPQ = 480;
  const events: { tick: number; on: boolean; midi: number }[] = [];
  for (const n of notes) {
    const start = Math.round(n.start * PPQ);
    events.push(
      { tick: start, on: true, midi: n.midi },
      {
        tick: start + Math.max(1, Math.round(n.beats * PPQ)),
        on: false,
        midi: n.midi,
      },
    );
  }
  // Note-offs first at the same tick, so a repeated note is not cut short.
  events.sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on));
  const body: number[] = [];
  const varLen = (v: number) => {
    const bytes = [v & 0x7f];
    while ((v >>= 7)) bytes.unshift((v & 0x7f) | 0x80);
    body.push(...bytes);
  };
  const tempo = Math.round(60_000_000 / bpm);
  body.push(0, 0xff, 0x51, 3, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);
  body.push(0, 0xff, 0x58, 4, 4, 2, 24, 8); // 4/4
  body.push(0, 0xc0, 0); // acoustic grand piano
  let last = 0;
  for (const e of events) {
    varLen(e.tick - last);
    last = e.tick;
    body.push(e.on ? 0x90 : 0x80, e.midi, e.on ? 90 : 0);
  }
  body.push(0, 0xff, 0x2f, 0);
  const u32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, PPQ >> 8, PPQ & 0xff];
  return new Uint8Array([...header, 0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body]);
}
