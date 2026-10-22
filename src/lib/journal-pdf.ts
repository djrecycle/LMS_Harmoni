/** Renders one class's teaching journal (Jurnal Mengajar) as a printable table PDF, using pdfkit directly. */
import PDFDocument from "pdfkit";
import { formatDate } from "./utils";
import type { JournalExportRow } from "./journal-data";

const TEXT_COLOR = "#111111";
const RULE_COLOR = "#cccccc";
const HEADER_BG = "#eeeeee";

const PAGE_OPTS = {
  size: "A4" as const,
  layout: "landscape" as const,
  margins: { top: 40, bottom: 40, left: 32, right: 32 },
  bufferPages: true,
};

const HEADERS = ["No", "Tanggal", "Jam", "Materi yang Diajarkan", "Kegiatan Pembelajaran", "Hadir", "Keterangan"];

/** Column widths as fractions of the usable page width; must sum to 1. */
const FRACTIONS = [0.035, 0.09, 0.09, 0.22, 0.32, 0.065, 0.18];

function keteranganText(r: JournalExportRow): string {
  if (r.absen.length === 0) return "-";
  return r.absen.map((a) => `${a.name} (${a.status}${a.keterangan ? `: ${a.keterangan}` : ""})`).join("; ");
}

export function journalToPdf(classroomName: string, teacherName: string, rows: JournalExportRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ ...PAGE_OPTS, info: { Title: `Jurnal Mengajar - ${classroomName}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const widths = FRACTIONS.map((f) => f * usable);

    function cellHeight(text: string, width: number, size: number) {
      return doc.font("Helvetica").fontSize(size).heightOfString(text || "-", { width: width - 8 });
    }

    function drawRow(cells: string[], opts: { bold?: boolean; bg?: string; header?: boolean } = {}) {
      const size = opts.bold ? 9 : 8;
      const h = Math.max(...cells.map((c, i) => cellHeight(c, widths[i], size)), 12) + 8;
      // A page break must never split a row, and a fresh page needs its header repeated (skip that check for the header row itself).
      if (!opts.header && doc.y + h > doc.page.height - doc.page.margins.bottom) {
        doc.addPage(PAGE_OPTS);
        drawHeaderRow();
      }
      const y = doc.y;
      if (opts.bg) doc.rect(left, y, usable, h).fill(opts.bg);
      let x = left;
      cells.forEach((c, i) => {
        doc
          .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(size)
          .fillColor(TEXT_COLOR)
          .text(c || "-", x + 4, y + 4, { width: widths[i] - 8 });
        x += widths[i];
      });
      doc.rect(left, y, usable, h).strokeColor(RULE_COLOR).lineWidth(0.5).stroke();
      x = left;
      for (const w of widths.slice(0, -1)) {
        x += w;
        doc.moveTo(x, y).lineTo(x, y + h).strokeColor(RULE_COLOR).stroke();
      }
      doc.y = y + h;
    }

    function drawHeaderRow() {
      drawRow(HEADERS, { bold: true, bg: HEADER_BG, header: true });
    }

    doc.font("Helvetica-Bold").fontSize(16).fillColor(TEXT_COLOR).text("JURNAL MENGAJAR", { align: "center" });
    doc.font("Helvetica").fontSize(11).text(classroomName, { align: "center" });
    if (teacherName) doc.text(`Guru: ${teacherName}`, { align: "center" });
    doc.moveDown(1);

    drawHeaderRow();
    rows.forEach((r, i) => {
      drawRow([String(i + 1), formatDate(r.tanggal), r.waktu || "-", r.materi || "-", r.kegiatan || "-", `${r.hadir}/${r.total}`, keteranganText(r)]);
    });

    doc.end();
  });
}
