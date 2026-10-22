/** Reading and writing the "classes + students" bulk-upload spreadsheet (.xlsx only, via ExcelJS). */
import ExcelJS from "exceljs";
export { newInviteCode } from "./invite-code";

export type RosterRow = { row: number; className: string; name: string };

const HEADERS = ["Kelas", "Nama Siswa"] as const;

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in (v as Record<string, unknown>)) return String((v as { text: unknown }).text ?? "").trim();
  if (typeof v === "object" && "result" in (v as Record<string, unknown>)) return String((v as { result: unknown }).result ?? "").trim();
  return String(v).trim();
};

/** Parse the uploaded workbook into rows. The header row (and its exact wording) is not required, only the column order. */
export async function parseRosterWorkbook(data: Uint8Array): Promise<RosterRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as never);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: RosterRow[] = [];
  ws.eachRow((row, num) => {
    const cells = (row.values as unknown[]).slice(1).map(cellText);
    const [className, name] = cells;
    if (!className && !name) return; // blank row
    if (num === 1 && /^kelas$/i.test(className ?? "") && /nama/i.test(name ?? "")) return; // header row
    rows.push({ row: num, className: className ?? "", name: name ?? "" });
  });
  return rows;
}

/** The downloadable .xlsx template: header, instructions, and one example row. */
export async function buildRosterTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Siswa");
  ws.columns = [{ width: 22 }, { width: 28 }];
  const head = ws.addRow(HEADERS as unknown as string[]);
  head.font = { bold: true };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE9E3FF" } }));
  ws.addRow(["Kelas VII A", "Budi Santoso"]);
  ws.addRow(["Kelas VII A", "Sari Dewi"]);
  ws.addRow(["Kelas VII B", "Andi Wijaya"]);

  const info = wb.addWorksheet("Petunjuk");
  info.columns = [{ width: 90 }];
  const lines = [
    "Petunjuk pengisian:",
    "- Satu baris = satu siswa. Kelas yang belum ada akan dibuat otomatis; kelas yang sudah ada akan dipakai lagi (dicocokkan dari namanya).",
    "- Kelas: nama kelas persis seperti yang Anda mau, mis. \"Kelas VII A\".",
    "- Nama Siswa: nama lengkap siswa.",
    "- Username dan kata sandi dibuatkan otomatis setelah Anda unggah berkas ini; kata sandi awalnya sama untuk semua siswa di berkas ini, dan hasilnya ditampilkan setelah diunggah.",
    "- Ingin menentukan username/kata sandi sendiri untuk siswa tertentu? Gunakan \"Tambah siswa\" satu per satu di halaman kelas.",
    "- Maksimal 300 baris per unggahan.",
  ];
  lines.forEach((l) => info.addRow([l]));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
