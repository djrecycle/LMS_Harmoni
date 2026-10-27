/**
 * Canvas drawing for the "Play a song" piano mode (src/components/song-player.tsx):
 *  - falling notes onto the keyboard (like Synthesia), labelled with letters, solfège or notasi angka;
 *  - staff notation that scrolls to the left past a play line.
 */
import { angkaOf, isBlackKey, midiToNote, solfegeOf } from "@/lib/music";
import type { Song } from "@/lib/songs";

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
export type NoteState = { done: (i: number) => boolean; target: (i: number) => boolean; missed: (i: number) => boolean };

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
    ctx.fillStyle = missed ? "rgba(239,68,68,0.45)" : done ? (mode === "play" ? "rgba(34,197,94,0.55)" : "rgba(139,92,246,0.35)") : black ? "#4f46e5" : "#8b5cf6";
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

const LETTER_STEP: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
/** Diatonic step number (C4 = 28) and whether the note is sharp (notes are spelled with sharps). */
function diatonic(midi: number) {
  const name = midiToNote(midi);
  const octave = Math.floor(midi / 12) - 1;
  return { step: octave * 7 + LETTER_STEP[name[0]], sharp: name[1] === "#" };
}

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

const GLYPH = { gClef: "", fClef: "", sharp: "", flag8Up: "", flag8Down: "", flag16Up: "", flag16Down: "" };

export function drawStaff(canvas: HTMLCanvasElement | null, song: Song, time: number, state: NoteState, mode: Mode, labels: Labels, doMidi: number) {
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

  const clefW = sp * 4;
  const hitX = Math.max(clefW + sp * 3, W * 0.22);
  const pxPerBeat = Math.max(sp * 4.5, Math.min(sp * 9, W / 9));

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

  // Bar lines every 4 beats, and faint beat ticks.
  for (let b = Math.ceil(time - hitX / pxPerBeat); b <= time + (W - hitX) / pxPerBeat; b++) {
    const x = Math.round(hitX + (b - time) * pxPerBeat) + 0.5;
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

  const ink = (i: number) => (state.missed(i) ? "#dc2626" : state.done(i) ? (mode === "play" ? "#16a34a" : "#7c3aed") : state.target(i) ? "#d97706" : "#111827");

  song.notes.forEach((n, i) => {
    const x = hitX + (n.start - time) * pxPerBeat;
    const len = n.beats * pxPerBeat;
    if (x + len < clefW || x > W + sp * 2) return;
    const si = staffOf(n.midi);
    const { step, sharp } = diatonic(n.midi);
    const y = yOf(step, si);
    const color = ink(i);
    const headW = sp * 1.3;
    const hx = x + headW / 2; // head centre, its left edge on the note's start

    // Duration bar: shows how long to hold the note.
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.roundRect(x, y - sp * 0.35, Math.max(headW, len - 3), sp * 0.7, sp * 0.35);
    ctx.fill();
    ctx.globalAlpha = 1;

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

    // Stem and flags (no stem on a whole note); stems go down from the middle line up.
    if (n.beats < 4 - 1e-6) {
      const up = step < bottomStep + 4;
      const sx = up ? hx + headW / 2 - 0.6 : hx - headW / 2 + 0.6;
      const ey = up ? y - sp * 3.3 : y + sp * 3.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.2, sp * 0.1);
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx, ey);
      ctx.stroke();
      const flags = n.beats < 0.5 - 1e-6 ? 2 : n.beats < 1 - 1e-6 ? 1 : 0;
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
    if ([0.75, 1.5, 3].some((v) => Math.abs(n.beats - v) < 1e-3)) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(hx + headW * 0.85, step % 2 === bottomStep % 2 ? y - half : y, sp * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sharp sign.
    if (sharp) {
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      if (font) {
        ctx.font = `${sp * 4}px Bravura`;
        ctx.fillText(GLYPH.sharp, x - sp * 0.7, y);
      } else {
        ctx.font = `bold ${sp * 1.5}px system-ui, sans-serif`;
        ctx.fillText("♯", x - sp * 0.7, y + sp * 0.5);
      }
    }

    // Name under the staff note.
    const label = labelOf(n.midi, labels, doMidi);
    if (label) {
      const size = Math.max(10, Math.round(sp * 0.95));
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      // Below the note's staff, or below the note itself when it hangs under the staff on ledger lines.
      const baseline = Math.max(bottomY[si] + sp * 2.4, y + sp * 1.9) + (label.dots > 0 ? 4 * label.dots : 0);
      drawLabel(ctx, label, hx, Math.min(H - 3 - (label.dots < 0 ? 5 * -label.dots : 0), baseline), size);
    }
  });

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
