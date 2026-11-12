/**
 * Word files of an exam:
 *  - the blueprint (kisi-kisi), laid out like the school's kisi-kisi file;
 *  - the question sheet in the CBT upload template (JENIS 1-5 tables, "v" on the key), so it can be uploaded as is.
 */
import { AlignmentType, BorderStyle, Document, ImageRun, Packer, PageOrientation, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, VerticalMergeType, WidthType } from "docx";
import { EXAM_SECTIONS, SECTION_META, letter, type ExamInfo, type ExamSection } from "./exam";
import type { AnswerKey } from "./questions";

const FONT = "Calibri";
const SIZE = 22; // half-points (11 pt)
const LINE = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;
const BORDERS = { top: LINE, bottom: LINE, left: LINE, right: LINE };
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE };

/** A4 landscape with the template's narrow margins. */
const PAGE = { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 680, right: 680, bottom: 680, left: 680 } };

/** An image to place under the question text. */
export type DocImage = { data: Buffer; type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number };

/** Type and pixel size of an image file Word can show (PNG, JPEG, GIF, BMP); null for anything else (e.g. WebP). */
export function imageInfo(data: Buffer): DocImage | null {
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) return { data, type: "png", width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  if (data.length > 10 && data.toString("ascii", 0, 3) === "GIF") return { data, type: "gif", width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
  if (data.length > 26 && data.toString("ascii", 0, 2) === "BM") return { data, type: "bmp", width: data.readInt32LE(18), height: Math.abs(data.readInt32LE(22)) };
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    // Walk the JPEG segments to the frame header (SOF0-SOF15, except DHT/JPG/DAC), which holds the size.
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      const len = data.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { data, type: "jpg", width: data.readUInt16BE(i + 7), height: data.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

/** The image scaled to fit `maxWidth` pixels (never enlarged). */
function imageParagraph(img: DocImage, maxWidth: number) {
  const scale = Math.min(1, maxWidth / Math.max(1, img.width));
  return new Paragraph({
    children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) } })],
    spacing: { before: 60 },
  });
}

export type DocQuestion = {
  image?: DocImage | null;
  prompt: string;
  options: string[] | null;
  matchRows: string[] | null;
  answerKey: AnswerKey | null;
};
export type DocItem = { section: ExamSection; tp: string; materi: string; indikator: string; level: string; question: DocQuestion | null };

/* ------------------------------------------------------------------ helpers */

/** Runs of a text, keeping its line breaks. */
function runs(text: string, opts: { bold?: boolean; size?: number } = {}): TextRun[] {
  return text.split("\n").map((line, i) => new TextRun({ text: line, font: FONT, size: opts.size ?? SIZE, bold: opts.bold, break: i > 0 ? 1 : undefined }));
}

const para = (text: string, opts: { bold?: boolean; center?: boolean; size?: number; after?: number } = {}) =>
  new Paragraph({ children: runs(text, opts), alignment: opts.center ? AlignmentType.CENTER : undefined, spacing: { after: opts.after ?? 60 } });

function cell(text: string, width: number, opts: { bold?: boolean; center?: boolean; merge?: "restart" | "continue"; span?: number; shade?: boolean; borders?: boolean; image?: DocImage | null } = {}) {
  const children = [new Paragraph({ children: opts.merge === "continue" ? [] : runs(text, { bold: opts.bold }), alignment: opts.center ? AlignmentType.CENTER : undefined })];
  // A twip is 1/20 pt; at 96 dpi a pixel is 15 twips. Leave room for the cell margins.
  if (opts.image && opts.merge !== "continue") children.push(imageParagraph(opts.image, Math.floor(width / 15) - 14));
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    columnSpan: opts.span,
    verticalMerge: opts.merge === "restart" ? VerticalMergeType.RESTART : opts.merge === "continue" ? VerticalMergeType.CONTINUE : undefined,
    verticalAlign: VerticalAlign.TOP,
    borders: opts.borders === false ? NO_BORDERS : BORDERS,
    shading: opts.shade ? { fill: "D9E2F3" } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

function table(widths: number[], rows: TableRow[]) {
  return new Table({ rows, columnWidths: widths, width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, layout: TableLayoutType.FIXED });
}

const pack = (children: (Paragraph | Table)[]) =>
  Packer.toBuffer(new Document({ styles: { default: { document: { run: { font: FONT, size: SIZE } } } }, sections: [{ properties: { page: PAGE }, children }] }));

/** "Pilihan Ganda Kompleks (2 jawaban benar)", "Menjodohkan (Benar/Salah)"… as written in the school's kisi-kisi. */
export function bentukLabel(section: ExamSection, q: DocQuestion | null): string {
  const nama = SECTION_META[section].nama;
  if (section === "pgk" && q?.answerKey?.kind === "multiple_select") return `${nama} (${q.answerKey.correct.length} jawaban benar)`;
  if (section === "jodoh" && q?.options?.length === 2) {
    const cols = q.options.map((o) => o.trim().toLowerCase());
    if (cols[0] === "benar" && cols[1] === "salah") return `${nama} (Benar/Salah)`;
    if ((cols[0] === "ya" || cols[0] === "iya") && cols[1] === "tidak") return `${nama} (Ya/Tidak)`;
  }
  return nama;
}

/** Numbered items grouped by section, numbered 1..N across the whole exam. */
function numbered(items: DocItem[]) {
  let no = 0;
  return EXAM_SECTIONS.map((section) => ({ section, items: items.filter((i) => i.section === section).map((i) => ({ ...i, no: ++no })) })).filter((g) => g.items.length > 0);
}

/* ------------------------------------------------------------------ kisi-kisi */

export async function kisiDocx(title: string, info: ExamInfo, items: DocItem[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  children.push(para(`KISI-KISI SOAL ${(info.jenis_ujian || title).toUpperCase()}`, { bold: true, center: true, size: 28, after: 40 }));
  if (info.tahun_ajaran) children.push(para(`TAHUN PELAJARAN ${info.tahun_ajaran}`, { bold: true, center: true, size: 24, after: 200 }));

  const ident: [string, string][] = [
    ["Satuan Pendidikan", info.nama_sekolah ?? ""],
    ["Mata Pelajaran", info.mata_pelajaran ?? ""],
    ["Kelas / Semester", [info.kelas, info.semester].filter(Boolean).join(" / ")],
    ["Jumlah Soal", `${items.length} butir`],
    ["Alokasi Waktu", info.alokasi_waktu ?? ""],
  ];
  children.push(table([2800, 300, 8000], ident.filter(([, v]) => v).map(([k, v]) => new TableRow({ children: [cell(k, 2800, { borders: false }), cell(":", 300, { borders: false }), cell(v, 8000, { borders: false })] }))));
  children.push(para("", { after: 120 }));

  const W = [900, 3900, 2700, 4600, 1300, 2000];
  numbered(items).forEach((g, gi) => {
    const first = g.items[0].no;
    const last = g.items[g.items.length - 1].no;
    children.push(para(`${letter(gi)}. Soal ${SECTION_META[g.section].nama} (${first === last ? first : `${first}–${last}`})`, { bold: true, after: 80 }));
    const header = new TableRow({
      tableHeader: true,
      children: ["No Soal", "Tujuan Pembelajaran", "Materi Soal", "Indikator Soal", "Level Kognitif", "Bentuk Soal"].map((h, i) => cell(h, W[i], { bold: true, center: true, shade: true })),
    });
    const rows = g.items.map(
      (it) =>
        new TableRow({
          cantSplit: true,
          children: [
            cell(String(it.no), W[0], { center: true }),
            cell(it.tp, W[1]),
            cell(it.materi, W[2]),
            cell(it.indikator, W[3]),
            cell(it.level, W[4], { center: true }),
            cell(bentukLabel(it.section, it.question), W[5]),
          ],
        }),
    );
    children.push(table(W, [header, ...rows]));
    children.push(para("", { after: 160 }));
  });
  return pack(children);
}

/* ------------------------------------------------------------------ CBT upload template */

const v = (on: boolean) => (on ? "v" : "");

/** Choice tables (JENIS 1 and 2): one row per choice, NO/SOAL/JENIS merged down. PG always has 5 rows (A-E), unused ones blank. */
function choiceTable(items: { no: number; question: DocQuestion | null }[], jenis: 1 | 2): Table {
  const W = jenis === 1 ? [559, 6521, 998, 703, 5245, 1276] : [402, 7890, 664, 559, 5334, 729];
  const header = new TableRow({ tableHeader: true, children: ["NO", "SOAL", "JENIS", "OPSI", "JAWABAN", "KUNCI"].map((h, i) => cell(h, W[i], { bold: true, center: true })) });
  const rows: TableRow[] = [header];
  items.forEach((it, n) => {
    const q = it.question;
    const options = q?.options ?? [];
    const key = q?.answerKey;
    const isKey = (i: number) => (key?.kind === "multiple_choice" ? key.correct === i : key?.kind === "multiple_select" ? key.correct.includes(i) : false);
    const count = jenis === 1 ? Math.max(5, options.length) : Math.max(1, options.length);
    for (let i = 0; i < count; i++) {
      const merge = count > 1 ? (i === 0 ? "restart" : "continue") : undefined;
      rows.push(
        new TableRow({
          cantSplit: true,
          children: [
            cell(String(n + 1), W[0], { center: true, merge }),
            cell(q?.prompt ?? "", W[1], { merge, image: q?.image }),
            cell(String(jenis), W[2], { center: true, merge }),
            cell(i < options.length || jenis === 1 ? letter(i) : "", W[3], { center: true }),
            cell(options[i] ?? "", W[4]),
            cell(v(i < options.length && isKey(i)), W[5], { center: true }),
          ],
        }),
      );
    }
  });
  return table(W, rows);
}

/** Matching table (JENIS 3): rows (KODE 1..n, NAMA BARIS), columns (KODE A.., NAMA KOLOM), key (KODE BARIS, KODE KOLOM). */
function matchingTable(items: { no: number; question: DocQuestion | null }[]): Table {
  const W = [520, 4271, 728, 732, 3056, 732, 3095, 760, 1464];
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        cell("NO", W[0], { bold: true, center: true, merge: "restart" }),
        cell("SOAL", W[1], { bold: true, center: true, merge: "restart" }),
        cell("JENIS", W[2], { bold: true, center: true, merge: "restart" }),
        cell("BARIS", W[3] + W[4], { bold: true, center: true, span: 2 }),
        cell("KOLOM", W[5] + W[6], { bold: true, center: true, span: 2 }),
        cell("KUNCI", W[7] + W[8], { bold: true, center: true, span: 2 }),
      ],
    }),
    new TableRow({
      tableHeader: true,
      children: [
        cell("", W[0], { merge: "continue" }),
        cell("", W[1], { merge: "continue" }),
        cell("", W[2], { merge: "continue" }),
        ...["KODE", "NAMA BARIS", "KODE", "NAMA KOLOM", "KODE BARIS", "KODE KOLOM"].map((h, i) => cell(h, W[i + 3], { bold: true, center: true })),
      ],
    }),
  ];
  items.forEach((it, n) => {
    const q = it.question;
    const statements = q?.matchRows ?? [];
    const columns = q?.options ?? [];
    const pairs = q?.answerKey?.kind === "matching" ? q.answerKey.pairs : [];
    const count = Math.max(1, statements.length, columns.length);
    for (let i = 0; i < count; i++) {
      const merge = count > 1 ? (i === 0 ? "restart" : "continue") : undefined;
      const hasRow = i < statements.length;
      const col = pairs[i];
      rows.push(
        new TableRow({
          cantSplit: true,
          children: [
            cell(String(n + 1), W[0], { center: true, merge }),
            cell(q?.prompt ?? "", W[1], { merge, image: q?.image }),
            cell("3", W[2], { center: true, merge }),
            cell(hasRow ? String(i + 1) : "", W[3], { center: true }),
            cell(statements[i] ?? "", W[4]),
            cell(i < columns.length ? letter(i) : "", W[5], { center: true }),
            cell(columns[i] ?? "", W[6]),
            cell(hasRow ? String(i + 1) : "", W[7], { center: true }),
            cell(hasRow && col !== undefined && col >= 0 ? letter(col) : "", W[8], { center: true }),
          ],
        }),
      );
    }
  });
  return table(W, rows);
}

/** Short answer / essay tables (JENIS 4 and 5): one row per question. */
function textTable(items: { no: number; question: DocQuestion | null }[], jenis: 4 | 5): Table {
  const W = [600, 6480, 900, 7321];
  const answer = (q: DocQuestion | null) => (q?.answerKey?.kind === "fill_in" ? (q.answerKey.answer[0] ?? "") : q?.answerKey?.kind === "essay" ? q.answerKey.answer : "");
  const list = items.length ? items : [{ no: 0, question: null }];
  return table(W, [
    new TableRow({ tableHeader: true, children: ["NO", "SOAL", "JENIS", "JAWABAN"].map((h, i) => cell(h, W[i], { bold: true, center: true })) }),
    ...list.map(
      (it, n) =>
        new TableRow({
          cantSplit: true,
          children: [cell(String(n + 1), W[0], { center: true }), cell(it.question?.prompt ?? "", W[1], { image: it.question?.image }), cell(String(jenis), W[2], { center: true }), cell(answer(it.question), W[3])],
        }),
    ),
  ]);
}

const PETUNJUK: Record<ExamSection, { judul: string; baris: string[] }> = {
  pg: {
    judul: "I. Soal Pilihan Ganda (satu jawaban benar)",
    baris: [
      "- Jenis Pilihan Ganda (PG 1) untuk pilihan ganda yang sudah ditentukan pilihan opsinya, misal 4 opsi (A,B,C,D) atau 5 opsi (A,B,C,D,E).",
      "- Kolom jenis harus diisi angka 1",
      "- Biarkan OPSI JAWABAN kosong jika ada opsi yang tidak digunakan.",
      "- NOMOR soal yang tidak digunakan bisa dihapus atau dibiarkan kosong.",
      "- Soal dan jawaban bisa disisipi gambar",
      "- KUNCI hanya diisi satu jawaban.",
      "- Beri tanda v pada opsi jawaban benar, (v huruf kecil atau V huruf besar).",
    ],
  },
  pgk: {
    judul: "II. Soal Pilihan Ganda Kompleks (beberapa jawaban benar)",
    baris: [
      "- Soal Pilihan Ganda Kompleks (PG 2) untuk soal yang opsi-jawabannya lebih banyak atau lebih sedikit dari PG 1",
      "- Kolom jenis harus diisi angka 2",
      "- Bisa digunakan untuk soal TRUE dan FALSE atau YES dan NO",
      "- Soal dan jawaban bisa disisipi gambar",
      "- KUNCI bisa diisi satu jawaban atau lebih",
      "- Opsi bisa ditambah atau dihapus sesuai kebutuhan jumlah opsi",
      "- Beri tanda v pada opsi jawaban benar, (v huruf kecil atau V huruf besar)",
    ],
  },
  jodoh: {
    judul: "III. Soal Menjodohkan",
    baris: [
      "- Digunakan untuk soal yang berbentuk tabel atau menjodohkan",
      "- Pilihan yang jumlahnya lebih banyak sebaiknya disimpan sebagai BARIS (seperti contoh soal nomor 4 dan 5)",
      "- Kolom jenis harus diisi angka 3",
      "- SOAL, NAMA BARIS dan NAMA KOLOM bisa disisipi gambar",
      "- KUNCI diisi jawaban yang cocok dari KODE BARIS dan KODE KOLOM",
      "- Jika jawaban lebih dari satu, pisahkan dengan koma",
    ],
  },
  isian: { judul: "IV. Soal Isian Singkat", baris: ["- Kolom jenis harus diisi angka 4", "- Soal bisa disisipi gambar"] },
  uraian: { judul: "V. Soal Uraian / Essai", baris: ["- Kolom jenis harus diisi angka 5", "- Soal bisa disisipi gambar"] },
};

export async function cbtDocx(items: DocItem[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    para("JENIS SOAL", { bold: true }),
    ...["1. Pilihan Ganda", "2. Pilihan Ganda Kompleks", "3. Menjodohkan", "4. Isian Singkat", "5. Isian Uraian / Paragraf / Essai"].map((x) => para(x, { after: 0 })),
    para(""),
    para("Petunjuk pengisian", { bold: true }),
    ...["- Jangan merubah/menghapus susunan kolom", "- Jangan merubah format tabel", "- Sesuaikan format baris atau kolom jika ingin menambah nomor soal"].map((x) => para(x, { after: 0 })),
    para("- Kolom JENIS wajib diisi sesuai jenis soal", { bold: true }),
    para(""),
  ];
  for (const section of EXAM_SECTIONS) {
    const list = items.filter((i) => i.section === section).map((i, n) => ({ no: n + 1, question: i.question }));
    const p = PETUNJUK[section];
    children.push(para(p.judul, { bold: true, after: 40 }));
    p.baris.forEach((b) => children.push(para(b, { after: 0 })));
    children.push(para("", { after: 60 }));
    if (section === "pg") children.push(choiceTable(list, 1));
    else if (section === "pgk") children.push(choiceTable(list, 2));
    else if (section === "jodoh") children.push(matchingTable(list));
    else children.push(textTable(list, section === "isian" ? 4 : 5));
    children.push(para("", { after: 200 }));
  }
  return pack(children);
}
