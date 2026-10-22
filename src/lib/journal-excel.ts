/** Renders one class's teaching journal (Jurnal Mengajar) as a printable .xlsx, via ExcelJS. */
import ExcelJS from "exceljs";
import { formatDate } from "./utils";
import type { JournalExportRow } from "./journal-data";

const HEADERS = ["No", "Tanggal", "Jam", "Materi yang Diajarkan", "Kegiatan Pembelajaran", "Hadir", "Keterangan"];
const WIDTHS = [5, 12, 14, 30, 45, 10, 32];
const THIN = { style: "thin" as const };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function keteranganText(r: JournalExportRow): string {
  if (r.absen.length === 0) return "";
  return r.absen.map((a) => `${a.name} (${a.status}${a.keterangan ? `: ${a.keterangan}` : ""})`).join("; ");
}

export async function journalToExcel(classroomName: string, teacherName: string, rows: JournalExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = teacherName || "Harmoni";
  const cols = HEADERS.length;
  const ws = wb.addWorksheet("Jurnal Mengajar", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });

  const titleRow = (text: string, bold = true) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, cols);
    const cell = row.getCell(1);
    cell.font = { bold, size: bold ? 14 : 11 };
    cell.alignment = { horizontal: "center" };
  };

  titleRow("JURNAL MENGAJAR");
  titleRow(classroomName, false);
  if (teacherName) titleRow(`Guru: ${teacherName}`, false);
  ws.addRow([]);

  const headerRow = ws.addRow(HEADERS);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
    cell.border = BORDER;
    cell.alignment = { vertical: "middle" };
  });

  rows.forEach((r, i) => {
    const row = ws.addRow([i + 1, formatDate(r.tanggal), r.waktu || "", r.materi || "", r.kegiatan || "", `${r.hadir}/${r.total}`, keteranganText(r)]);
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => (cell.border = BORDER));
  });

  ws.columns = WIDTHS.map((width) => ({ width }));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
