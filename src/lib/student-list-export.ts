/** One class's student list (No, Nama, Username) as a printable .xlsx or PDF. */
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export type StudentListRow = { name: string; username: string | null; email: string | null };

const HEADERS = ["No", "Nama", "Username"];
const THIN = { style: "thin" as const };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/** Students who sign in by email have no username; show the email so the list still says how they log in. */
const loginOf = (s: StudentListRow) => s.username || s.email || "-";

export async function studentListToExcel(classroomName: string, teacherName: string, rows: StudentListRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = teacherName || "Harmoni";
  const ws = wb.addWorksheet("Daftar Siswa", { pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });

  const titleRow = (text: string, bold = true) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, HEADERS.length);
    const cell = row.getCell(1);
    cell.font = { bold, size: bold ? 14 : 11 };
    cell.alignment = { horizontal: "center" };
  };

  titleRow("DAFTAR SISWA");
  titleRow(classroomName, false);
  if (teacherName) titleRow(`Guru: ${teacherName}`, false);
  ws.addRow([]);

  const headerRow = ws.addRow(HEADERS);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    cell.border = BORDER;
  });

  rows.forEach((s, i) => {
    const row = ws.addRow([i + 1, s.name, loginOf(s)]);
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => (cell.border = BORDER));
  });

  ws.columns = [{ width: 6 }, { width: 40 }, { width: 32 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const PAGE_OPTS = { size: "A4" as const, margins: { top: 40, bottom: 40, left: 40, right: 40 }, bufferPages: true };
const FRACTIONS = [0.08, 0.52, 0.4];

export function studentListToPdf(classroomName: string, teacherName: string, rows: StudentListRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ ...PAGE_OPTS, info: { Title: `Daftar Siswa - ${classroomName}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const widths = FRACTIONS.map((f) => f * usable);

    function drawRow(cells: string[], opts: { header?: boolean } = {}) {
      const font = opts.header ? "Helvetica-Bold" : "Helvetica";
      const size = 10;
      const h = Math.max(...cells.map((c, i) => doc.font(font).fontSize(size).heightOfString(c, { width: widths[i] - 10 })), 12) + 10;
      // Never split a row across pages; repeat the header on each new page.
      if (!opts.header && doc.y + h > doc.page.height - doc.page.margins.bottom) {
        doc.addPage(PAGE_OPTS);
        drawRow(HEADERS, { header: true });
      }
      const y = doc.y;
      if (opts.header) doc.rect(left, y, usable, h).fill("#eeeeee");
      let x = left;
      cells.forEach((c, i) => {
        doc.font(font).fontSize(size).fillColor("#111111").text(c, x + 5, y + 5, { width: widths[i] - 10 });
        x += widths[i];
      });
      doc.rect(left, y, usable, h).strokeColor("#cccccc").lineWidth(0.5).stroke();
      x = left;
      for (const w of widths.slice(0, -1)) {
        x += w;
        doc.moveTo(x, y).lineTo(x, y + h).strokeColor("#cccccc").stroke();
      }
      doc.y = y + h;
    }

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#111111").text("DAFTAR SISWA", { align: "center" });
    doc.font("Helvetica").fontSize(11).text(classroomName, { align: "center" });
    if (teacherName) doc.text(`Guru: ${teacherName}`, { align: "center" });
    doc.text(`Jumlah siswa: ${rows.length}`, { align: "center" });
    doc.moveDown(1);

    drawRow(HEADERS, { header: true });
    rows.forEach((s, i) => drawRow([String(i + 1), s.name, loginOf(s)]));
    doc.end();
  });
}
