/**
 * Canvas drawing for the "Play a song" piano mode (src/components/song-player.tsx):
 *  - falling notes onto the keyboard (like Synthesia), labelled with letters, solfège or notasi angka;
 *  - staff notation that scrolls to the left past a play line.
 */
import { angkaOf, isBlackKey, midiToNote, solfegeOf } from "@/lib/music";
import { detectDoMidi, type Song } from "@/lib/songs";

export type Mode = "play" | "listen";
export type Labels = "letter" | "solfege" | "angka" | "none";

/** Beats visible above the hit line in the falling view. */
export const VISIBLE_BEATS = 4;

/** What a note is called: text plus, for notasi angka, octave dots (+ above, - below). */
export function labelOf(midi: number, labels: Labels, doMidi: number): { text: string; dots: number } | null {
  if (labels === "none") return null;
  if (labels === "angka") {
    const a = angkaOf(midi, doMidi);
    return { text: a.digit, dots: a.octave };
  }
  const letter = midiToNote(midi).replace(/-?\d/, "");
  if (labels === "solfege") return { text: solfegeOf(midi, doMidi) ?? letter, dots: 0 };
  return { text: letter, dots: 0 };
}

/** Draws a label centred at x with its baseline at y; octave dots go above (or below) the text. */
function drawLabel(ctx: CanvasRenderingContext2D, label: { text: string; dots: number }, x: number, y: number, size: number) {
  ctx.fillText(label.text, x, y);
  const r = Math.max(1.3, size * 0.12);
  for (let i = 0; i < Math.abs(label.dots); i++) {
    const dy = label.dots > 0 ? y - size - 2 - i * (r * 2 + 1.5) : y + 2 + r + i * (r * 2 + 1.5);
    ctx.beginPath();
    ctx.arc(x, dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Per-note state used for colouring. */
export type NoteState = { done: (i: number) => boolean; target: (i: number) => boolean; missed: (i: number) => boolean; sounding: (i: number) => boolean };

function prepare(canvas: HTMLCanvasElement | null) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}

/* ------------------------------ falling notes ------------------------------ */

function laneOf(midi: number, white: number[], w: number) {
  if (!isBlackKey(midi)) {
    const i = white.indexOf(midi);
    return { x: i * w, width: w };
  }
  const i = white.indexOf(midi - 1);
  return { x: (i + 1) * w - w * 0.3, width: w * 0.6 };
}

export function drawFalling(canvas: HTMLCanvasElement | null, song: Song, white: number[], time: number, state: NoteState, mode: Mode, labels: Labels, doMidi: number) {
  const c = prepare(canvas);
  if (!c) return;
  const { ctx, W, H } = c;
  const keyW = (W - 8) / white.length; // matches the keyboard's p-1 padding
  const ox = 4;
  const pxPerBeat = H / VISIBLE_BEATS;

  // Shaded lanes on every other white key, plus beat lines.
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  white.forEach((_, i) => {
    if (i % 2 === 0) ctx.fillRect(ox + i * keyW, 0, keyW, H);
  });
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (let b = Math.ceil(time); b <= time + VISIBLE_BEATS; b++) {
    const y = H - (b - time) * pxPerBeat;
    ctx.globalAlpha = b % 4 === 0 ? 1 : 0.4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  song.notes.forEach((n, i) => {
    const bottom = H - (n.start - time) * pxPerBeat;
    const top = bottom - n.beats * pxPerBeat;
    if (top > H || bottom < 0) return;
    const { x, width } = laneOf(n.midi, white, keyW);
    const done = state.done(i);
    const missed = state.missed(i);
    const black = isBlackKey(n.midi);
    const sounding = state.sounding(i);
    ctx.fillStyle = missed
      ? "rgba(239,68,68,0.45)"
      : sounding
        ? "#c4b5fd"
        : done
          ? mode === "play"
            ? "rgba(34,197,94,0.55)"
            : "rgba(139,92,246,0.35)"
          : black
            ? "#4f46e5"
            : "#8b5cf6";
    ctx.beginPath();
    ctx.roundRect(ox + x + 1.5, top + 1, width - 3, Math.max(4, bottom - top - 2), Math.min(5, (width - 3) / 2));
    ctx.fill();
    if (!done && !missed) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.stroke();
    }
    const label = labelOf(n.midi, labels, doMidi);
    const room = label && label.dots < 0 ? 22 : 16;
    if (label && width >= 16 && bottom - top >= room) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      const baseline = Math.min(bottom, H) - 5 - (label.dots < 0 ? 4 * -label.dots : 0);
      drawLabel(ctx, label, ox + x + width / 2, baseline, 12);
    }
  });

  // Hit line.
  ctx.fillStyle = "rgba(250,204,21,0.8)";
  ctx.fillRect(0, H - 2, W, 2);
}

/* ------------------------------ scrolling staff ----------------------------- */

/* Key signatures: a key is its number of fifths (2 = D major, two sharps; -3 = E♭ major, three flats). */

const LETTERS = "CDEFGAB";
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B (letter indexes)
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F
/** Major keys offered in the player, in fifths. */
export const KEY_CHOICES = [0, 1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5];
const FIFTHS_OF_PC = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];
const tonicPc = (fifths: number) => (((fifths * 7) % 12) + 12) % 12;

/** "D (2♯)", "B♭ (2♭)". */
export function keyName(fifths: number) {
  const tonic = spell(tonicPc(fifths) + 60, fifths);
  const name = LETTERS[tonic.letter] + (tonic.alter > 0 ? "♯" : tonic.alter < 0 ? "♭" : "");
  return fifths === 0 ? name : `${name} (${Math.abs(fifths)}${fifths > 0 ? "♯" : "♭"})`;
}

/** The key a song is written in: its "do" when known, otherwise the major key that fits the most notes. */
export function songKey(song: Song): number {
  const doMidi = song.doMidi ?? detectDoMidi(song.notes);
  return FIFTHS_OF_PC[((doMidi % 12) + 12) % 12];
}

/** How a key signature alters each letter (-1 flat, 0, 1 sharp). */
function keyAlters(fifths: number) {
  const alters = [0, 0, 0, 0, 0, 0, 0];
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach((l) => (alters[l] = 1));
  if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach((l) => (alters[l] = -1));
  return alters;
}

/** Spells a note in a key: the letter in the key if there is one, else a natural, else a sharp (flat in flat keys). */
function spell(midi: number, fifths: number) {
  const pc = ((midi % 12) + 12) % 12;
  const inKey = keyAlters(fifths);
  let pick: { letter: number; alter: number } | null = null;
  let rank = Infinity;
  for (let letter = 0; letter < 7; letter++) {
    for (const alter of [-1, 0, 1]) {
      if ((LETTER_PC[letter] + alter + 12) % 12 !== pc) continue;
      const r = alter === inKey[letter] ? 0 : alter === 0 ? 1 : (alter > 0) === (fifths >= 0) ? 2 : 3;
      if (r < rank) {
        rank = r;
        pick = { letter, alter };
      }
    }
  }
  const { letter, alter } = pick!;
  const octave = Math.floor((midi - alter) / 12) - 1;
  return { letter, alter, step: octave * 7 + letter };
}

type Accidental = "sharp" | "flat" | "natural" | null;
type Spelled = { step: number; acc: Accidental; name: string };

/**
 * Staff position, accidental and letter name of every note. With a key signature, accidentals follow the usual
 *  rules: only notes outside the key get one, and it lasts until the bar line. Without one (null), every sharp note
 *  shows its sharp, as before.
 */
const spellCache = new WeakMap<Song, Map<string, Spelled[]>>();
function spellSong(song: Song, fifths: number | null): Spelled[] {
  let byKey = spellCache.get(song);
  if (!byKey) spellCache.set(song, (byKey = new Map()));
  const cacheKey = String(fifths);
  const hit = byKey.get(cacheKey);
  if (hit) return hit;
  const sig = keyAlters(fifths ?? 0);
  let bar = -Infinity;
  let current = new Map<number, number>();
  const result = song.notes.map((n) => {
    const sp = spell(n.midi, fifths ?? 0);
    const name = LETTERS[sp.letter] + (sp.alter > 0 ? "#" : sp.alter < 0 ? "♭" : "");
    let acc: Accidental = null;
    if (fifths === null) acc = sp.alter > 0 ? "sharp" : sp.alter < 0 ? "flat" : null;
    else {
      const b = Math.floor(n.start / 4 + 1e-6);
      if (b !== bar) {
        bar = b;
        current = new Map();
      }
      const now = current.get(sp.step) ?? sig[sp.letter];
      if (now !== sp.alter) {
        acc = sp.alter > 0 ? "sharp" : sp.alter < 0 ? "flat" : "natural";
        current.set(sp.step, sp.alter);
      }
    }
    return { step: sp.step, acc, name };
  });
  byKey.set(cacheKey, result);
  return result;
}

/** Steps of the key signature's sharps and flats on the treble staff (the bass staff is two octaves lower). */
const SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34]; // F5 C5 G5 D5 A4 E5 B4
const FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31]; // B4 E5 A4 D5 G4 C5 F4

const TREBLE_BOTTOM = 30; // E4
const BASS_BOTTOM = 18; // G2

/** Bravura (the SMuFL music font bundled with VexFlow) once it is loaded; plain shapes are drawn until then. */
let musicFont: "loading" | "ready" | null = null;
export function loadMusicFont(onReady: () => void) {
  if (musicFont === "ready") return onReady();
  if (musicFont === "loading") return;
  musicFont = "loading";
  void import("vexflow")
    .then(() => document.fonts.load("32px Bravura"))
    .then(() => {
      musicFont = "ready";
      onReady();
    })
    .catch(() => (musicFont = null));
}

const EPS = 1e-6;
const flagsOf = (beats: number) => (beats < 0.5 - EPS ? 2 : beats < 1 - EPS ? 1 : 0);

/** Shortest gap between note starts (in beats), so the staff can be spread wide enough to read. */
const shortestCache = new WeakMap<Song, number>();
function shortestGap(song: Song) {
  let v = shortestCache.get(song);
  if (v === undefined) {
    v = 1;
    for (let i = 1; i < song.notes.length; i++) {
      const d = song.notes[i].start - song.notes[i - 1].start;
      if (d > EPS) v = Math.min(v, d);
    }
    v = Math.max(0.125, v);
    shortestCache.set(song, v);
  }
  return v;
}

/** Runs of eighths/sixteenths inside one beat, joined by beams instead of separate flags. */
const beamCache = new WeakMap<Song, number[][]>();
function beamGroups(song: Song): number[][] {
  let groups = beamCache.get(song);
  if (groups) return groups;
  groups = [];
  let cur: number[] = [];
  const close = () => {
    if (cur.length >= 2) groups!.push(cur);
    cur = [];
  };
  song.notes.forEach((n, i) => {
    if (!flagsOf(n.beats)) return close();
    const prev = cur.length ? song.notes[cur[cur.length - 1]] : null;
    const sameBeat = prev && Math.floor(prev.start + EPS) === Math.floor(n.start + EPS);
    const touching = prev && Math.abs(prev.start + prev.beats - n.start) < 1e-3;
    const sameSide = prev && (prev.midi >= 60) === (n.midi >= 60);
    if (!(sameBeat && touching && sameSide)) close();
    cur.push(i);
  });
  close();
  beamCache.set(song, groups);
  return groups;
}

const ACC_GLYPH = { sharp: "\uE262", flat: "\uE260", natural: "\uE261" };
const ACC_TEXT = { sharp: "♯", flat: "♭", natural: "♮" };

const GLYPH = { gClef: "", fClef: "", sharp: "", flag8Up: "", flag8Down: "", flag16Up: "", flag16Down: "" };

/** `fifths`: the key signature to write (null = none, every sharp written on its note). */
export function drawStaff(
  canvas: HTMLCanvasElement | null,
  song: Song,
  time: number,
  state: NoteState,
  mode: Mode,
  labels: Labels,
  doMidi: number,
  fifths: number | null = null,
) {
  const c = prepare(canvas);
  if (!c) return;
  const { ctx, W, H } = c;
  const font = musicFont === "ready";

  // Paper.
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, W, H);

  // One staff or two (grand staff), chosen from the song's range.
  const lo = Math.min(...song.notes.map((n) => n.midi));
  const hi = Math.max(...song.notes.map((n) => n.midi));
  const useTreble = hi >= 60 || lo >= 57;
  const useBass = lo < 57;
  const staves: { clef: "treble" | "bass"; bottom: number }[] = [];
  if (useTreble) staves.push({ clef: "treble", bottom: TREBLE_BOTTOM });
  if (useBass) staves.push({ clef: "bass", bottom: BASS_BOTTOM });
  const spaces = staves.length === 2 ? 22 : 14; // staff height plus room for ledger lines and labels
  const sp = Math.max(7, Math.min(16, H / spaces)); // staff space in px
  const half = sp / 2;
  const totalH = staves.length === 2 ? 8 * sp + 6 * sp : 4 * sp;
  const top = (H - totalH) / 2;
  // y of each staff's bottom line.
  const bottomY = staves.map((_, i) => top + 4 * sp + i * 10 * sp);
  const staffOf = (midi: number) => (staves.length === 1 ? 0 : midi >= 60 ? 0 : 1);
  const yOf = (step: number, si: number) => bottomY[si] - (step - staves[si].bottom) * half;

  const spelled = spellSong(song, fifths);
  const sigCount = Math.abs(fifths ?? 0);
  const sigX = sp * 3.9;
  const sigStep = sp * 1.05;
  const clefW = sp * 4 + (sigCount ? sigCount * sigStep + sp * 0.4 : 0);
  const hitX = Math.max(clefW + sp * 3, W * 0.22);
  // Wide enough that the shortest notes (with a sharp in front) never touch each other.
  const pxPerBeat = Math.max(sp * 4.5, Math.min(sp * 9, W / 9), (sp * 3.4) / shortestGap(song));

  // Staff lines.
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  staves.forEach((_, si) => {
    for (let l = 0; l < 5; l++) {
      const y = Math.round(bottomY[si] - l * sp) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  });
  const staffTop = bottomY[0] - 4 * sp;
  const staffBottom = bottomY[staves.length - 1];

  // Bar lines every 4 beats, and faint beat ticks. A bar line sits a little before its downbeat,
  // so it never cuts through the first note's head or sharp.
  const barGap = sp * 2.4;
  for (let b = Math.ceil(time - hitX / pxPerBeat); b <= time + (W - hitX + barGap) / pxPerBeat; b++) {
    const beatX = Math.round(hitX + (b - time) * pxPerBeat) + 0.5;
    const x = b % 4 === 0 ? Math.round(beatX - barGap) + 0.5 : beatX;
    if (x < clefW) continue;
    if (b % 4 === 0) {
      ctx.strokeStyle = "#1f2937";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, staffTop);
      ctx.lineTo(x, staffBottom);
      ctx.stroke();
      if (b >= 0) {
        ctx.fillStyle = "#9ca3af";
        ctx.font = `${Math.round(sp * 0.9)}px system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.fillText(String(b / 4 + 1), x + 3, staffTop - sp * 0.6);
      }
    } else {
      ctx.fillStyle = "rgba(31,41,55,0.12)";
      ctx.fillRect(x, staffTop - sp * 0.4, 1, sp * 0.4);
    }
  }

  // Listen mode: the note being heard is bright violet, notes already heard turn pale.
  const ink = (i: number) =>
    state.missed(i)
      ? "#dc2626"
      : state.sounding(i)
        ? "#7c3aed"
        : state.done(i)
          ? mode === "play"
            ? "#16a34a"
            : "#a5a3c9"
          : state.target(i)
            ? "#d97706"
            : "#111827";

  const headW = sp * 1.3;
  const stemLen = sp * 3.3;
  const xOf = (i: number) => hitX + (song.notes[i].start - time) * pxPerBeat;
  const yOfNote = (i: number) => {
    const m = song.notes[i].midi;
    const si = staffOf(m);
    return yOf(spelled[i].step, si);
  };

  // Beam geometry for visible groups: stem direction and a gently sloped beam line.
  type Beam = { group: number[]; up: boolean; y0: number; slope: number; x0: number };
  const beamOf = new Map<number, Beam>();
  const beams: Beam[] = [];
  for (const group of beamGroups(song)) {
    const first = group[0];
    const last = group[group.length - 1];
    const x0 = xOf(first);
    const x1 = xOf(last);
    if (x1 + headW < clefW || x0 - headW > W + sp * 3) continue;
    const si = staffOf(song.notes[first].midi);
    const middle = staves[si].bottom + 4;
    const avg = group.reduce((a, i) => a + spelled[i].step, 0) / group.length;
    const up = avg < middle;
    const ys = group.map(yOfNote);
    const span = Math.max(1, x1 - x0);
    const rise = Math.max(-sp * 0.75, Math.min(sp * 0.75, (ys[ys.length - 1] - ys[0]) / 2));
    const slope = rise / span;
    // Shift the line so every stem is at least stemLen long.
    let y0 = up ? Infinity : -Infinity;
    group.forEach((i, k) => {
      const atX = ys[k] + (up ? -stemLen : stemLen) - slope * (xOf(i) - x0);
      y0 = up ? Math.min(y0, atX) : Math.max(y0, atX);
    });
    const beam = { group, up, y0, slope, x0 };
    beams.push(beam);
    group.forEach((i) => beamOf.set(i, beam));
  }
  const stemX = (hx: number, up: boolean) => (up ? hx + headW / 2 - 0.6 : hx - headW / 2 + 0.6);
  const beamY = (b: Beam, sx: number) => b.y0 + b.slope * (sx - stemX(b.x0, b.up));

  song.notes.forEach((n, i) => {
    const x = xOf(i);
    const len = n.beats * pxPerBeat;
    if (x + len < clefW || x > W + sp * 3) return;
    const si = staffOf(n.midi);
    const { step, acc } = spelled[i];
    const y = yOf(step, si);
    const color = ink(i);
    const hx = x; // head centre on the note's start: it is played when it reaches the play line
    const dotted = [0.75, 1.5, 3].some((v) => Math.abs(n.beats - v) < 1e-3);

    // Duration bar: shows how long to hold the note. It starts after the head (and dot) and stops
    // short of the next note's sharp, so it never runs into other symbols.
    const barStart = hx + headW * (dotted ? 1.15 : 0.75);
    const barEnd = x + len - sp * 2.7;
    if (barEnd - barStart > sp * 0.6) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      ctx.roundRect(barStart, y - sp * 0.22, barEnd - barStart, sp * 0.44, sp * 0.22);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Ledger lines.
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 1;
    const bottomStep = staves[si].bottom;
    const ledger = (s: number) => {
      const ly = Math.round(yOf(s, si)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(hx - headW * 0.85, ly);
      ctx.lineTo(hx + headW * 0.85, ly);
      ctx.stroke();
    };
    for (let s = bottomStep - 2; s >= step; s -= 2) ledger(s);
    for (let s = bottomStep + 10; s <= step; s += 2) ledger(s);

    // Head: hollow for half and whole notes.
    const hollow = n.beats >= 2 - 1e-6;
    ctx.save();
    ctx.translate(hx, y);
    ctx.rotate(-0.35);
    ctx.beginPath();
    ctx.ellipse(0, 0, headW / 2, sp * 0.42, 0, 0, Math.PI * 2);
    if (hollow) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.4, sp * 0.16);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();

    // Lowest point of a stem, flag or beam hanging under the note, so its name can sit below it.
    let reach = y;
    // Stem and flags (no stem on a whole note); stems go down from the middle line up.
    if (n.beats < 4 - 1e-6) {
      const beam = beamOf.get(i);
      const up = beam ? beam.up : step < bottomStep + 4;
      const sx = stemX(hx, up);
      const ey = beam ? beamY(beam, sx) : up ? y - stemLen : y + stemLen;
      if (!up) {
        // A beamed group's names share one line, under the lowest end of the beam.
        const ends = beam ? [beam.group[0], beam.group[beam.group.length - 1]].map((j) => beamY(beam, stemX(xOf(j), false))) : [ey];
        reach = Math.max(...ends);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, sp * 0.1);
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx, ey);
      ctx.stroke();
      const flags = beam ? 0 : flagsOf(n.beats);
      if (flags) {
        if (font) {
          ctx.fillStyle = color;
          ctx.font = `${sp * 4}px Bravura`;
          ctx.textAlign = "left";
          ctx.fillText(flags === 2 ? (up ? GLYPH.flag16Up : GLYPH.flag16Down) : up ? GLYPH.flag8Up : GLYPH.flag8Down, sx - 0.6, ey);
        } else {
          for (let f = 0; f < flags; f++) {
            const fy = ey + (up ? 1 : -1) * f * sp * 0.8;
            ctx.beginPath();
            ctx.moveTo(sx, fy);
            ctx.lineTo(sx + sp * 0.9, fy + (up ? 1 : -1) * sp * 1.4);
            ctx.stroke();
          }
        }
      }
    }

    // Augmentation dot for dotted values (1.5, 3, 0.75 beats).
    if (dotted) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(hx + headW * 0.85, step % 2 === bottomStep % 2 ? y - half : y, sp * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sharp, flat or natural sign.
    if (acc) {
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      if (font) {
        ctx.font = `${sp * 4}px Bravura`;
        ctx.fillText(ACC_GLYPH[acc], hx - headW / 2 - sp * 0.75, y);
      } else {
        ctx.font = `bold ${sp * 1.5}px system-ui, sans-serif`;
        ctx.fillText(ACC_TEXT[acc], hx - headW / 2 - sp * 0.75, y + sp * 0.5);
      }
    }

    // Name under the staff note (letter names follow the key's spelling, e.g. B♭ in F major).
    const base = labelOf(n.midi, labels, doMidi);
    const label = base && labels === "letter" ? { ...base, text: spelled[i].name } : base;
    if (label) {
      const size = Math.max(10, Math.round(sp * 0.95));
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      // Below the note's staff, or below the note itself when it hangs under the staff on ledger lines.
      // Also below a stem or beam that points down past the staff.
      const baseline = Math.max(bottomY[si] + sp * 2.4, y + sp * 1.9, reach + sp * 1.6) + (label.dots > 0 ? 4 * label.dots : 0);
      drawLabel(ctx, label, hx, Math.min(H - 3 - (label.dots < 0 ? 5 * -label.dots : 0), baseline), size);
    }
  });

  // Beams: a full first beam across the group, second beams between sixteenths (or a short stub).
  const thick = sp * 0.48;
  for (const b of beams) {
    const sxs = b.group.map((i) => stemX(xOf(i), b.up));
    const bar = (xa: number, xb: number, level: number, color: string) => {
      const off = (b.up ? 1 : -1) * level * sp * 0.75;
      const ya = beamY(b, xa) + off;
      const yb = beamY(b, xb) + off;
      const t = b.up ? thick : -thick;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(xa, ya);
      ctx.lineTo(xb, yb);
      ctx.lineTo(xb, yb + t);
      ctx.lineTo(xa, ya + t);
      ctx.closePath();
      ctx.fill();
    };
    b.group.forEach((i, k) => {
      const color = ink(i);
      const next = b.group[k + 1];
      if (next !== undefined) bar(sxs[k] - 0.6, sxs[k + 1] + 0.6, 0, color);
      if (flagsOf(song.notes[i].beats) < 2) return;
      if (next !== undefined && flagsOf(song.notes[next].beats) >= 2) bar(sxs[k] - 0.6, sxs[k + 1] + 0.6, 1, color);
      else {
        const prev = b.group[k - 1];
        const prevSixteenth = prev !== undefined && flagsOf(song.notes[prev].beats) >= 2;
        if (!prevSixteenth) {
          const toLeft = next === undefined;
          bar(toLeft ? sxs[k] - sp : sxs[k], toLeft ? sxs[k] : sxs[k] + sp, 1, color);
        }
      }
    });
  }

  // Clef panel on the left (notes slide under it).
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(0, 0, clefW, H);
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 1;
  staves.forEach((st, si) => {
    for (let l = 0; l < 5; l++) {
      const y = Math.round(bottomY[si] - l * sp) + 0.5;
      ctx.beginPath();
      ctx.moveTo(sp * 0.4, y);
      ctx.lineTo(clefW, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#111827";
    if (font) {
      ctx.font = `${sp * 4}px Bravura`;
      ctx.textAlign = "left";
      // SMuFL clefs sit on their line: G clef on the 2nd line, F clef on the 4th.
      ctx.fillText(st.clef === "treble" ? GLYPH.gClef : GLYPH.fClef, sp * 0.9, bottomY[si] - (st.clef === "treble" ? sp : 3 * sp));
    } else {
      ctx.font = `bold ${sp * 1.6}px system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(st.clef === "treble" ? "G" : "F", sp, bottomY[si] - sp * 1.5);
    }
    // Key signature after the clef.
    if (sigCount) {
      const steps = (fifths! > 0 ? SHARP_STEPS : FLAT_STEPS).slice(0, sigCount);
      const acc = fifths! > 0 ? "sharp" : "flat";
      ctx.textAlign = "center";
      steps.forEach((s, j) => {
        const ky = yOf(st.clef === "treble" ? s : s - 14, si);
        const kx = sigX + j * sigStep + sigStep / 2;
        if (font) {
          ctx.font = `${sp * 4}px Bravura`;
          ctx.fillText(ACC_GLYPH[acc], kx, ky);
        } else {
          ctx.font = `bold ${sp * 1.5}px system-ui, sans-serif`;
          ctx.fillText(ACC_TEXT[acc], kx, ky + sp * 0.5);
        }
      });
    }
  });
  // Opening bar line joining the staves.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sp * 0.4, staffTop);
  ctx.lineTo(sp * 0.4, staffBottom);
  ctx.stroke();

  // Play line: notes are played when their head reaches it.
  ctx.fillStyle = "rgba(217,119,6,0.85)";
  ctx.fillRect(hitX - 1, staffTop - sp * 1.5, 2.5, staffBottom - staffTop + sp * 3);
}
