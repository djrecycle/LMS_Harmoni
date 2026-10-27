/** Renders a lesson's parsed Markdown blocks (see markdown-ir.ts) into a PDF, using pdfkit directly (no headless browser needed). */
import PDFDocument from "pdfkit";
import type { Block, Run } from "./markdown-ir";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";
import { describeMelody, describeSong } from "@/lib/music-blocks";

const TEXT_COLOR = "#111111";
const LINK_COLOR = "#2563eb";
const RULE_COLOR = "#cccccc";
const REST_COLOR = "#dc2626";
const CALLOUT_FILL = "#eef2ff";

function fontFor(bold: boolean, italic: boolean) {
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

/** Writes inline runs on the current line (mixed bold/italic/links), wrapping normally at the page edge. */
function writeRuns(doc: PDFKit.PDFDocument, runs: Run[], opts: { size: number; bold?: boolean }) {
  const list = runs.length ? runs : [{ text: "" }];
  list.forEach((r, i) => {
    doc
      .font(fontFor(Boolean(opts.bold || r.bold), Boolean(r.italic)))
      .fontSize(opts.size)
      .fillColor(r.link ? LINK_COLOR : TEXT_COLOR)
      .text(r.text, { continued: i < list.length - 1, underline: Boolean(r.link), link: r.link });
  });
  doc.fillColor(TEXT_COLOR);
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function drawTable(doc: PDFKit.PDFDocument, header: string[], rows: string[][]) {
  const cols = Math.max(header.length, 1);
  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = usable / cols;
  const pad = 6;

  const row = (cells: string[], bold: boolean) => {
    const font = bold ? "Helvetica-Bold" : "Helvetica";
    const size = 10;
    doc.font(font).fontSize(size);
    const height = Math.max(...cells.map((c) => doc.heightOfString(c || " ", { width: colWidth - pad * 2 })), 12) + pad * 2;
    ensureSpace(doc, height);
    const y = doc.y;
    cells.forEach((c, i) => doc.text(c, left + i * colWidth + pad, y + pad, { width: colWidth - pad * 2 }));
    doc
      .rect(left, y, colWidth * cols, height)
      .strokeColor(RULE_COLOR)
      .lineWidth(0.5)
      .stroke();
    for (let i = 1; i < cols; i++)
      doc
        .moveTo(left + i * colWidth, y)
        .lineTo(left + i * colWidth, y + height)
        .strokeColor(RULE_COLOR)
        .stroke();
    doc.y = y + height;
  };

  row(header, true);
  for (const r of rows) row(r, false);
  doc.fillColor(TEXT_COLOR);
}

/** Mirrors the note/rest glyph drawn in src/components/lessons/note-glyph.tsx, as pdfkit vector shapes. */
function drawNoteGlyph(doc: PDFKit.PDFDocument, kind: NoteGlyphKind, x: number, y: number, scale: number) {
  const isRest = kind === "rest-quarter" || kind === "rest-eighth";
  const color = isRest ? REST_COLOR : TEXT_COLOR;

  doc.save();
  doc.translate(x, y).scale(scale);
  doc.strokeColor(color).fillColor(color).lineWidth(1.8);

  const ellipseGlyph = (cx: number, cy: number, rx: number, ry: number, deg: number, mode: "fill" | "stroke") => {
    doc.save();
    doc.rotate(deg, { origin: [cx, cy] });
    doc.ellipse(cx, cy, rx, ry);
    if (mode === "fill") doc.fill();
    else doc.stroke();
    doc.restore();
  };

  if (kind === "whole") {
    doc.lineWidth(2.2);
    ellipseGlyph(12, 20, 6.5, 4.4, -18, "stroke");
  } else if (kind === "half") {
    doc.lineWidth(2.2);
    ellipseGlyph(9, 24, 6, 4.2, -18, "stroke");
    doc.lineWidth(1.8).moveTo(14.5, 22).lineTo(14.5, 4).stroke();
  } else if (kind === "quarter") {
    ellipseGlyph(9, 24, 6, 4.2, -18, "fill");
    doc.moveTo(14.5, 22).lineTo(14.5, 4).stroke();
  } else if (kind === "eighth") {
    ellipseGlyph(9, 24, 6, 4.2, -18, "fill");
    doc.moveTo(14.5, 22).lineTo(14.5, 4).stroke();
    doc.path("M14.5 4c3 1 5 3 5 6.5").stroke();
  } else if (kind === "rest-quarter") {
    doc.path("M15 3c-3 3 3 6 0 9-3 3-4 4-1 6-3 0-5 2-3 5 1.5 2 3 3 2 6l-2 3").stroke();
  } else if (kind === "rest-eighth") {
    doc.circle(8, 24, 1.6).fill();
    doc.path("M8 24c2-6 8-8 8-15").stroke();
  }
  doc.restore();
  doc.fillColor(TEXT_COLOR).strokeColor(TEXT_COLOR);
}

/** A bordered callout box for a block of text lines (used by media/chords blocks). */
function drawCallout(doc: PDFKit.PDFDocument, lines: { text: string; bold?: boolean; italic?: boolean; color?: string }[]) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pad = 8;
  doc.font("Helvetica").fontSize(10.5);
  const height = lines.reduce((h, l) => h + doc.heightOfString(l.text, { width: width - pad * 2 }) + 2, 0) + pad * 2;
  ensureSpace(doc, height);
  const y = doc.y;
  doc.rect(left, y, width, height).fillAndStroke(CALLOUT_FILL, RULE_COLOR);
  let cy = y + pad;
  for (const l of lines) {
    doc
      .font(l.bold ? "Helvetica-Bold" : l.italic ? "Helvetica-Oblique" : "Helvetica")
      .fillColor(l.color ?? TEXT_COLOR)
      .text(l.text, left + pad, cy, { width: width - pad * 2 });
    cy = doc.y + 2;
  }
  doc.y = y + height;
  doc.fillColor(TEXT_COLOR);
}

export function markdownToPdf(title: string, blocks: Block[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 }, bufferPages: true, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).fillColor(TEXT_COLOR).text(title, { align: "center" });
    doc.moveDown(1.2);

    for (const b of blocks) {
      if (b.type === "heading") {
        doc.moveDown(0.4);
        writeRuns(doc, b.runs, { size: b.depth === 1 ? 15 : b.depth === 2 ? 13 : 12, bold: true });
        doc.moveDown(0.3);
      } else if (b.type === "paragraph") {
        writeRuns(doc, b.runs, { size: 11 });
        doc.moveDown(0.6);
      } else if (b.type === "list") {
        for (const [i, item] of b.items.entries()) {
          doc.font("Helvetica").fontSize(11).fillColor(TEXT_COLOR).text(b.ordered ? `${i + 1}.  ` : "•  ", { continued: true });
          writeRuns(doc, item, { size: 11 });
        }
        doc.moveDown(0.5);
      } else if (b.type === "table") {
        drawTable(doc, b.header, b.rows);
        doc.moveDown(0.6);
      } else if (b.type === "hr") {
        ensureSpace(doc, 16);
        const y = doc.y;
        doc
          .moveTo(doc.page.margins.left, y)
          .lineTo(doc.page.width - doc.page.margins.right, y)
          .strokeColor(RULE_COLOR)
          .stroke();
        doc.moveDown(0.6);
      } else if (b.type === "media") {
        const isLink = /^https:\/\//i.test(b.key);
        const label = b.kind === "audio" ? "Audio" : "Video";
        drawCallout(doc, [
          { text: b.title ? `${label}: ${b.title}` : label, bold: true },
          isLink ? { text: b.key, color: LINK_COLOR } : { text: "(buka di aplikasi untuk memutar)", italic: true },
        ]);
        doc.moveDown(0.6);
      } else if (b.type === "rhythm") {
        if (b.pattern.length === 0) continue;
        const boxW = 22;
        const boxH = (boxW * 32) / 24;
        const gap = 10;
        const rowStep = boxH + 8;
        const left = doc.page.margins.left;
        const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const perRow = Math.max(1, Math.floor((usable + gap) / (boxW + gap)));
        const rowCount = Math.ceil(b.pattern.length / perRow);
        ensureSpace(doc, rowCount * rowStep);
        let x = left;
        let col = 0;
        const y0 = doc.y;
        for (const kind of b.pattern) {
          if (col === perRow) {
            col = 0;
            x = left;
            doc.y += rowStep;
          }
          drawNoteGlyph(doc, kind, x, doc.y, boxW / 24);
          x += boxW + gap;
          col++;
        }
        doc.y = y0 + (rowCount - 1) * rowStep + rowStep;
        doc.moveDown(0.5);
      } else if (b.type === "chords") {
        drawCallout(doc, [{ text: `${b.label ?? "Chord / Not"}: ${b.items.join(", ") || "—"}`, bold: false }]);
        doc.moveDown(0.6);
      } else if (b.type === "melody") {
        const text = describeMelody(b);
        drawCallout(doc, [{ text: "Melodi", bold: true }, { text }]);
        doc.moveDown(0.6);
      } else if (b.type === "song") {
        drawCallout(doc, [{ text: b.title ? `Lagu: ${b.title}` : "Lagu piano", bold: true }, { text: describeSong(b.bpm, b.notes) }]);
        doc.moveDown(0.6);
      }
    }

    doc.end();
  });
}
