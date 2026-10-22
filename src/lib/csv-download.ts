/** Builds a CSV from rows (first row = header) and has the browser save it. Client-only. */
export function downloadCsv(filename: string, rows: string[][]) {
  const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = rows.map((row) => row.map(cell).join(",")).join("\r\n");
  // BOM so Excel opens the names with the right characters.
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** "Kelas 7A / Musik" -> "Kelas_7A_Musik", for file names. */
export const fileSafe = (s: string) => s.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "");
