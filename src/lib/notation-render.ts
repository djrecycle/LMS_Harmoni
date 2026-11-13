/**
 * Draws notation (see notation.ts) on a canvas, in the browser only: staff notation with VexFlow, numbered
 * notation by hand. The canvas becomes the PNG image of a question, so it shows the same online, in Word and in CBT.
 */
import { parseAngka, parseStaff, type AngkaScore, type Notation, type StaffScore } from "./notation";

const SCALE = 2; // pixel density of the PNG
const MAX_WIDTH = 720;
const INK = "#000000";

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * SCALE);
  canvas.height = Math.ceil(height * SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff"; // paper: readable in dark mode and in Word
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

/* ------------------------------------------------------------------ dynamics (SMuFL glyphs of the Bravura font) */

/** SMuFL code points of the dynamic letters; a mark like "mf" is written letter by letter. */
const DYNAMIC_GLYPH: Record<string, string> = { p: "\uE520", m: "\uE521", f: "\uE522", r: "\uE523", s: "\uE524", z: "\uE525", n: "\uE526" };
const dynamicText = (mark: string) => [...mark].map((c) => DYNAMIC_GLYPH[c] ?? "").join("");

function drawDynamic(ctx: CanvasRenderingContext2D, mark: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = `${size}px Bravura`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(dynamicText(mark), x, y);
  const w = ctx.measureText(dynamicText(mark)).width;
  ctx.restore();
  return w;
}

/** A crescendo (<) or decrescendo (>) wedge from x1 to x2, centred on y. */
function drawHairpin(ctx: CanvasRenderingContext2D, kind: "<" | ">", x1: number, x2: number, y: number, open: number) {
  if (x2 - x1 < 8) return;
  const [narrow, wide] = kind === "<" ? [x1, x2] : [x2, x1];
  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(wide, y - open);
  ctx.lineTo(narrow, y);
  ctx.lineTo(wide, y + open);
  ctx.stroke();
  ctx.restore();
}

async function loadMusicFont() {
  const { VexFlow } = await import("vexflow");
  await VexFlow.loadFonts("Bravura", "Academico");
  await document.fonts.load("40px Bravura");
  await document.fonts.ready;
}

/** Dynamics / hairpins written on their own ("{f}", "{<}"): drawn large, without a staff (e.g. one answer choice). */
async function drawSymbols(symbols: string[]): Promise<HTMLCanvasElement> {
  await loadMusicFont();
  const SIZE = 80;
  const GAP = 28;
  const WEDGE = 140;
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `${SIZE}px Bravura`;
  const widths = symbols.map((m) => (m === "<" || m === ">" ? WEDGE : probe.measureText(dynamicText(m)).width));
  const width = Math.ceil(widths.reduce((a, b) => a + b, 0) + GAP * (symbols.length - 1) + 60);
  const height = 120;
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  let x = 30;
  symbols.forEach((m, i) => {
    if (m === "<" || m === ">") drawHairpin(ctx, m, x, x + WEDGE, height / 2, 22);
    else drawDynamic(ctx, m, x, height / 2 + SIZE * 0.22, SIZE);
    x += widths[i] + GAP;
  });
  return canvas;
}

/* ------------------------------------------------------------------ staff (VexFlow) */

async function drawStaff(score: StaffScore): Promise<HTMLCanvasElement> {
  if (score.bars.length === 0) return drawSymbols(score.symbols);
  const VF = await import("vexflow");
  const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Dot, Beam, BarlineType } = VF;
  await loadMusicFont();

  const [beats, beatValue] = score.time.split("/").map(Number);
  const hasLabels = score.bars.some((b) => b.notes.some((n) => n.label));
  const head = 70 + (score.key !== "C" ? 12 * 4 : 0); // clef + time/key signature room on the first bar of a row
  const barWidth = (n: number) => Math.max(90, 26 + n * 34);

  // Lay the bars out in rows no wider than MAX_WIDTH.
  const rows: { bars: StaffScore["bars"]; widths: number[] }[] = [];
  let row: (typeof rows)[number] = { bars: [], widths: [] };
  let used = 10;
  for (const bar of score.bars) {
    const w = barWidth(bar.notes.length) + (row.bars.length === 0 ? head : 0);
    if (row.bars.length && used + w > MAX_WIDTH) {
      rows.push(row);
      row = { bars: [], widths: [] };
      used = 10;
    }
    const width = barWidth(bar.notes.length) + (row.bars.length === 0 ? head : 0);
    row.bars.push(bar);
    row.widths.push(width);
    used += width;
  }
  rows.push(row);

  const hasDynamics = score.bars.some((b) => b.notes.some((n) => n.dynamic || n.hairpin));
  const DYN = hasDynamics ? 34 : 0; // room for the dynamics line under the stave
  const rowHeight = (hasLabels ? 140 : 115) + DYN;
  const width = Math.min(MAX_WIDTH, Math.max(...rows.map((r) => r.widths.reduce((a, b) => a + b, 0))) + 20);
  const height = rows.length * rowHeight + 10;
  const canvas = document.createElement("canvas");
  const renderer = new Renderer(canvas, Renderer.Backends.CANVAS);
  const context = renderer.getContext();
  (context as unknown as { resize: (w: number, h: number, dpr: number) => void }).resize(width, height, SCALE);
  context.setFillStyle("#ffffff");
  context.fillRect(0, 0, width, height);
  context.setFillStyle(INK);
  context.setStrokeStyle(INK);

  // One label line per row, under the stave and two ledger lines below it.
  const labelLine = (ri: number) => 10 + ri * rowHeight + 122 + DYN;
  // Dynamics sit on one line under the stave (below two ledger lines), above the labels.
  const dynamicLine = (ri: number) => 10 + ri * rowHeight + 122;
  const placed: { ri: number; x: number; right: number; dynamic: string; hairpin: string }[] = [];
  const rowEnd: number[] = [];
  rows.forEach((r, ri) => {
    let x = 10;
    r.bars.forEach((bar, bi) => {
      const stave = new Stave(x, 10 + ri * rowHeight, r.widths[bi]);
      if (bi === 0) {
        stave.addClef(score.clef);
        if (score.key !== "C") stave.addKeySignature(score.key);
        if (ri === 0 && score.showTime) stave.addTimeSignature(score.time);
      } else stave.setBegBarType(BarlineType.NONE);
      if (bar.final) stave.setEndBarType(BarlineType.END);
      stave.setContext(context).draw();

      const notes = bar.notes.map((n) => {
        const sn = new StaveNote({ keys: n.keys, duration: n.duration + (n.rest ? "r" : ""), clef: score.clef, autoStem: true });
        n.accidentals.forEach((a, i) => a && sn.addModifier(new Accidental(a), i));
        for (let d = 0; d < n.dots; d++) Dot.buildAndAttach([sn], { all: true });
        return sn;
      });
      const voice = new Voice({ numBeats: beats, beatValue });
      voice.setStrict(false);
      voice.addTickables(notes);
      const beams = Beam.generateBeams(notes.filter((n) => !n.isRest()));
      new Formatter().joinVoices([voice]).format([voice], Math.max(20, stave.getNoteEndX() - stave.getNoteStartX() - 10));
      voice.draw(context, stave);
      beams.forEach((b) => b.setContext(context).draw());
      // Labels on one line under the whole row (VexFlow annotations sit at a different height under each note).
      notes.forEach((sn, i) => {
        const box = sn.getBoundingBox();
        placed.push({ ri, x: sn.getAbsoluteX(), right: box.getX() + box.getW(), dynamic: bar.notes[i].dynamic, hairpin: bar.notes[i].hairpin });
      });
      notes.forEach((sn, i) => {
        const label = bar.notes[i].label;
        if (!label) return;
        const box = sn.getBoundingBox();
        const cx = box.getX() + box.getW() / 2;
        context.save();
        context.setFont("Arial", 14, "bold");
        context.fillText(label, cx - context.measureText(label).width / 2, labelLine(ri));
        context.restore();
      });
      x += r.widths[bi];
    });
    rowEnd[ri] = x;
  });

  if (hasDynamics) {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    const dynWidth: number[] = placed.map((p) => (p.dynamic ? drawDynamic(ctx, p.dynamic, p.x - 2, dynamicLine(p.ri), 34) : 0));
    // A hairpin runs from its note to the next note with a dynamic (stopping before it), a "!" note, or the last note.
    placed.forEach((p, i) => {
      if (p.hairpin !== "<" && p.hairpin !== ">") return;
      let j = i + 1;
      while (j < placed.length && !placed[j].dynamic && placed[j].hairpin !== "!") j++;
      const end = j < placed.length ? (placed[j].dynamic ? { ri: placed[j].ri, x: placed[j].x - 8 } : { ri: placed[j].ri, x: placed[j].right }) : { ri: placed[placed.length - 1].ri, x: placed[placed.length - 1].right };
      const y = dynamicLine(p.ri) - 9;
      const startX = p.x + (dynWidth[i] ? dynWidth[i] + 6 : 0);
      if (end.ri === p.ri) drawHairpin(ctx, p.hairpin, startX, end.x, y, 7);
      else {
        // Across rows: the wedge continues on the next row(s).
        drawHairpin(ctx, p.hairpin, startX, rowEnd[p.ri] - 6, y, 7);
        for (let ri = p.ri + 1; ri <= end.ri; ri++) drawHairpin(ctx, p.hairpin, 70, ri === end.ri ? end.x : rowEnd[ri] - 6, dynamicLine(ri) - 9, 7);
      }
    });
  }
  return canvas;
}

/* ------------------------------------------------------------------ numbered notation (hand drawn) */

const CELL = 30; // width of one digit
const BAR_GAP = 18;

function drawAngka(score: AngkaScore): HTMLCanvasElement {
  const hasLabels = score.tokens.some((t) => t.kind === "note" && t.label);
  const header = score.doKey || score.time ? 30 : 6;
  const rowHeight = hasLabels ? 92 : 72;
  const widthOf = (t: AngkaScore["tokens"][number]) => (t.kind === "bar" ? BAR_GAP : CELL);

  // Break into rows at bar lines so a bar is never split.
  const rows: AngkaScore["tokens"][] = [[]];
  let used = 12;
  let barStart = 0;
  for (const tok of score.tokens) {
    const current = rows[rows.length - 1];
    // A bar line opening a row is not written in not angka.
    if (tok.kind === "bar" && !tok.final && current.length === 0) continue;
    current.push(tok);
    used += widthOf(tok);
    if (tok.kind === "bar") barStart = current.length;
    if (used > MAX_WIDTH - 20 && barStart > 0 && barStart < current.length) {
      rows.push(current.splice(barStart).filter((t, i) => !(i === 0 && t.kind === "bar" && !t.final)));
      used = 12 + rows[rows.length - 1].reduce((n, t) => n + widthOf(t), 0);
      barStart = 0;
    }
  }
  const width = Math.min(MAX_WIDTH, Math.max(...rows.map((r) => r.reduce((n, t) => n + widthOf(t), 24))));
  const height = header + rows.length * rowHeight;
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.textAlign = "center";

  if (header > 6) {
    ctx.font = "bold 15px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText([score.doKey && `do = ${score.doKey}`, score.time].filter(Boolean).join("    "), 12, 20);
    ctx.textAlign = "center";
  }

  rows.forEach((tokensInRow, ri) => {
    const base = header + ri * rowHeight + 40; // digit baseline
    let x = 12;
    // Underline spans: consecutive notes with underlines share one line per level.
    // A note right after another underlined note (no bar or hold between them) joins its line.
    const spans: { level: number; from: number; to: number; cellEnd: number }[] = [];
    tokensInRow.forEach((t) => {
      const w = widthOf(t);
      if (t.kind === "bar") {
        ctx.beginPath();
        ctx.lineWidth = 1.6;
        ctx.moveTo(x + w / 2, base - 26);
        ctx.lineTo(x + w / 2, base + 10);
        ctx.stroke();
        if (t.final) {
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x + w / 2 + 5, base - 26);
          ctx.lineTo(x + w / 2 + 5, base + 10);
          ctx.stroke();
          ctx.lineWidth = 1.6;
        }
      } else if (t.kind === "hold") {
        ctx.beginPath();
        ctx.arc(x + w / 2, base - 8, 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const cx = x + w / 2;
        ctx.font = "bold 24px Arial, sans-serif";
        ctx.fillText(String(t.digit), cx, base);
        if (t.accidental) {
          // Raised: slash rising to the right; lowered: falling to the right (the usual not angka marks).
          ctx.beginPath();
          if (t.accidental === "#") {
            ctx.moveTo(cx - 8, base + 2);
            ctx.lineTo(cx + 8, base - 20);
          } else {
            ctx.moveTo(cx - 8, base - 20);
            ctx.lineTo(cx + 8, base + 2);
          }
          ctx.stroke();
        }
        for (let o = 0; o < Math.abs(t.octave); o++) {
          ctx.beginPath();
          const y = t.octave > 0 ? base - 26 - o * 6 : base + 7 + t.under * 4 + 4 + o * 6;
          ctx.arc(cx, y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let level = 0; level < t.under; level++) {
          const last = spans.findLast((s) => s.level === level);
          if (last && last.cellEnd === x) {
            last.to = x + w - 3;
            last.cellEnd = x + w;
          } else spans.push({ level, from: x + 3, to: x + w - 3, cellEnd: x + w });
        }
        if (t.label) {
          ctx.font = "14px Arial, sans-serif";
          ctx.fillText(t.label, cx, base + 34);
        }
      }
      x += w;
    });
    for (const s of spans) {
      ctx.beginPath();
      ctx.moveTo(s.from, base + 5 + s.level * 4);
      ctx.lineTo(s.to, base + 5 + s.level * 4);
      ctx.stroke();
    }
  });
  return canvas;
}

/** Notation text that cannot be read: `message` is an English key, `arg` fills its {0}. */
export class NotationError extends Error {
  constructor(
    message: string,
    readonly arg?: string,
  ) {
    super(message);
  }
}

/** Draw notation; throws a NotationError with the reason when the text cannot be read. */
export async function renderNotation(n: Notation): Promise<HTMLCanvasElement> {
  if (n.kind === "staff") {
    const p = parseStaff(n.text);
    if (!p.ok) throw new NotationError(p.error, p.arg);
    return drawStaff(p.score);
  }
  const p = parseAngka(n.text);
  if (!p.ok) throw new Error(p.error);
  return drawAngka(p.score);
}

/** The notation as a PNG file, ready to upload as the question image. */
export async function notationPng(n: Notation): Promise<File> {
  const canvas = await renderNotation(n);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("Could not make the image");
  return new File([blob], `notasi-${n.kind}.png`, { type: "image/png" });
}

/** Upload a file as the teacher's media; returns its storage key. */
export async function uploadMedia(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const json = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
  if (!res.ok || !json.key) throw new Error(json.error ?? "Upload failed");
  return json.key;
}
