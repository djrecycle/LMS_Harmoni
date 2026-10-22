/** Renders a lesson's parsed Markdown blocks (see markdown-ir.ts) into a .docx, using the `docx` package directly. */
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { Block, Run } from "./markdown-ir";
import type { NoteGlyphKind } from "@/components/lessons/note-glyph";
import { describeMelody } from "@/lib/music-blocks";

const FONT = "Calibri";
const BASE = 11;
const PAGE_WIDTH = 11906; // A4, twips
const MARGIN = 1134; // 2cm, twips
const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const RHYTHM_LABEL: Record<NoteGlyphKind, string> = {
  whole: "Not Penuh",
  half: "Not Setengah",
  quarter: "Not Seperempat",
  eighth: "Not Seperdelapan",
  "rest-quarter": "Istirahat 1/4",
  "rest-eighth": "Istirahat 1/8",
};

const CALLOUT_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
};

function runOrLink(r: Run, size: number, bold: boolean): TextRun | ExternalHyperlink {
  const run = new TextRun({
    text: r.text,
    bold: bold || r.bold,
    italics: r.italic,
    font: r.code ? "Consolas" : FONT,
    size: size * 2,
    color: r.link ? "2563EB" : undefined,
    underline: r.link ? {} : undefined,
  });
  return r.link ? new ExternalHyperlink({ link: r.link, children: [run] }) : run;
}

function inline(runs: Run[], size = BASE, bold = false): (TextRun | ExternalHyperlink)[] {
  return runs.length ? runs.map((r) => runOrLink(r, size, bold)) : [new TextRun({ text: "", size: size * 2, font: FONT })];
}

const HEADING_SIZE: Record<number, number> = { 1: 17, 2: 15, 3: 13 };

function cell(text: string, width: number, opts: { bold?: boolean; header?: boolean } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: opts.header ? { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: (BASE - 1) * 2, font: FONT })] })],
  });
}

export async function markdownToDocx(title: string, blocks: Block[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: title, bold: true, size: 30, font: FONT })] }),
  ];

  for (const b of blocks) {
    if (b.type === "heading") {
      children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: inline(b.runs, HEADING_SIZE[b.depth] ?? 12, true) }));
    } else if (b.type === "paragraph") {
      children.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 160 }, children: inline(b.runs) }));
    } else if (b.type === "list") {
      b.items.forEach((item, i) => {
        const bullet = b.ordered ? `${i + 1}.` : "•";
        children.push(
          new Paragraph({
            indent: { left: 420 },
            spacing: { after: 80 },
            children: [new TextRun({ text: `${bullet} `, font: FONT, size: BASE * 2 }), ...inline(item)],
          }),
        );
      });
    } else if (b.type === "table") {
      const cols = Math.max(b.header.length, 1);
      const width = Math.floor(TEXT_WIDTH / cols);
      const rows = [
        new TableRow({ tableHeader: true, children: b.header.map((h) => cell(h, width, { bold: true, header: true })) }),
        ...b.rows.map((r) => new TableRow({ children: r.map((c) => cell(c, width)) })),
      ];
      children.push(new Table({ rows, width: { size: TEXT_WIDTH, type: WidthType.DXA } }));
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
    } else if (b.type === "hr") {
      children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } }, spacing: { after: 160 } }));
    } else if (b.type === "media") {
      const isLink = /^https:\/\//i.test(b.key);
      const label = b.kind === "audio" ? "Audio" : "Video";
      const labelText = b.title ? `${label}: ${b.title}` : label;
      const detail = isLink
        ? new ExternalHyperlink({ link: b.key, children: [new TextRun({ text: b.key, font: FONT, size: BASE * 2, color: "2563EB", underline: {} })] })
        : new TextRun({ text: "(buka di aplikasi untuk memutar)", italics: true, font: FONT, size: BASE * 2 });
      children.push(
        new Paragraph({
          border: CALLOUT_BORDER,
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEF2FF" },
          spacing: { after: 160, before: 80 },
          children: [new TextRun({ text: labelText, bold: true, font: FONT, size: BASE * 2 }), new TextRun({ text: "", break: 1 }), detail],
        }),
      );
    } else if (b.type === "rhythm") {
      const text = b.pattern.length ? b.pattern.map((k) => RHYTHM_LABEL[k]).join(" · ") : "—";
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: "Pola irama: ", bold: true, font: FONT, size: BASE * 2 }), new TextRun({ text, font: FONT, size: BASE * 2 })],
        }),
      );
    } else if (b.type === "melody") {
      const text = describeMelody(b);
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: "Melodi: ", bold: true, font: FONT, size: BASE * 2 }), new TextRun({ text, font: FONT, size: BASE * 2 })],
        }),
      );
    } else if (b.type === "chords") {
      children.push(
        new Paragraph({
          border: CALLOUT_BORDER,
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEF2FF" },
          spacing: { after: 160, before: 80 },
          children: [
            new TextRun({ text: `${b.label ?? "Chord / Not"}: `, bold: true, font: FONT, size: BASE * 2 }),
            new TextRun({ text: b.items.join(", ") || "—", font: FONT, size: BASE * 2 }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: BASE * 2 } } } },
    sections: [{ properties: { page: { size: { width: PAGE_WIDTH, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children }],
  });
  return Packer.toBuffer(doc);
}
