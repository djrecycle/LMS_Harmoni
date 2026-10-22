/**
 * Word (.docx) building blocks (port of the helpers at the top of core/dokumen_ajar.py).
 * A `Writer` collects paragraphs and tables for one document; it carries the font size offset and the
 * bullet style that the original kept in context variables.
 */
import { AlignmentType, BorderStyle, Document, Packer, PageBreak, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } from "docx";
import type { BulletGaya } from "../template";

type Block = Paragraph | Table;
export type Align = "center" | "justify" | undefined;

/** Signature/identity values that go into a document (school, teacher, headmaster, city, class). */
export type Ident = {
  nama_sekolah?: string;
  nama_guru?: string;
  nama_kepala?: string;
  nip_guru?: string;
  nip_kepala?: string;
  kota?: string;
  kelas?: string;
  tanggal?: string;
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function tanggalHariIni(): string {
  const h = new Date();
  return `${h.getDate()} ${BULAN[h.getMonth()]} ${h.getFullYear()}`;
}

/** Text of a value: lists are joined by new lines, empty values become "". */
export function teks(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return "";
  if (Array.isArray(nilai)) return nilai.map(teks).join("\n");
  return String(nilai).trim();
}

export const cm = (v: number) => Math.round(v * 567); // 1 cm = 567 twips
const TEXT_WIDTH_CM = 17; // A4 with 2 cm margins

const hurufKecil = (n: number) => String.fromCharCode(97 + ((n - 1) % 26));
export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

export function romawi(n: number): string {
  let hasil = "";
  for (const [nilai, lambang] of [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]] as const) {
    while (n >= nilai) {
      hasil += lambang;
      n -= nilai;
    }
  }
  return hasil;
}

/** Title number number `urutan` (from 0) in a numbering style, with its dot and space. */
export function nomorJudul(gaya: string, urutan: number): string {
  if (gaya === "angka") return `${urutan + 1}. `;
  if (gaya === "romawi") return `${romawi(urutan + 1)}. `;
  if (gaya === "tanpa") return "";
  return `${String.fromCharCode(65 + (urutan % 26))}. `;
}

export function nip(nilai: unknown): string {
  const t = teks(nilai);
  if (!t) return "";
  return t.toUpperCase().startsWith("NIP") ? t : `NIP. ${t}`;
}

const GARIS = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;
const TANPA = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const BORDER_GARIS = { top: GARIS, bottom: GARIS, left: GARIS, right: GARIS, insideHorizontal: GARIS, insideVertical: GARIS };
const BORDER_TANPA = { top: TANPA, bottom: TANPA, left: TANPA, right: TANPA, insideHorizontal: TANPA, insideVertical: TANPA };

export class Writer {
  readonly children: Block[] = [];
  private n0 = 0;
  private n1 = 0;

  constructor(
    readonly font = "Times New Roman",
    readonly ukuran = 11,
    private bullet: BulletGaya = "titik",
  ) {}

  /** Font size difference from the 11 pt default. */
  get offset() {
    return this.ukuran - 11;
  }

  /** Runs for a text; new lines become line breaks. */
  runs(t: string, { bold = false, size = 11, color }: { bold?: boolean; size?: number; color?: string } = {}): TextRun[] {
    return t.split("\n").map((baris, i) => new TextRun({ text: baris, bold, size: (size + this.offset) * 2, color, break: i > 0 ? 1 : undefined }));
  }

  private paragraph(t: string, o: { bold?: boolean; size?: number; align?: Align; indent?: number; spasi?: number } = {}): Paragraph {
    const { bold = false, size = 11, align, indent = 0, spasi = 4 } = o;
    return new Paragraph({
      spacing: { after: spasi * 20 },
      indent: indent ? { left: cm(indent) } : undefined,
      alignment: align === "center" ? AlignmentType.CENTER : align === "justify" ? AlignmentType.JUSTIFIED : undefined,
      children: t ? this.runs(t, { bold, size }) : [],
    });
  }

  /** A paragraph. A non-list paragraph restarts the numbered-bullet counters. */
  p(t = "", o: { bold?: boolean; size?: number; align?: Align; indent?: number; spasi?: number; daftar?: boolean } = {}) {
    if (!o.daftar) this.n0 = this.n1 = 0;
    this.children.push(this.paragraph(t, o));
  }

  pageBreak() {
    this.children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  private tandaButir(tingkat: number): string {
    if (tingkat === 0) {
      this.n0 += 1;
      this.n1 = 0;
    } else this.n1 += 1;
    const n = tingkat === 0 ? this.n0 : this.n1;
    switch (this.bullet) {
      case "strip":
        return tingkat === 0 ? "-" : "–";
      case "centang":
        return tingkat === 0 ? "✔" : "o";
      case "angka":
        return tingkat === 0 ? `${n}.` : `${hurufKecil(n)}.`;
      case "huruf":
        return tingkat === 0 ? `${hurufKecil(n)}.` : `${n}.`;
      case "tanpa":
        return "";
      default:
        return tingkat === 0 ? "•" : "o";
    }
  }

  butir(t: string, tingkat = 0) {
    const tanda = this.tandaButir(tingkat);
    this.p(tanda ? `${tanda} ${t}` : t, { indent: 0.6 + 0.6 * tingkat, align: "justify", spasi: 2, daftar: true });
  }

  butirNama(nama: string, uraian: string, tingkat = 0) {
    this.butir(nama && uraian ? `${nama}: ${uraian}` : nama || uraian, tingkat);
  }

  /** A line with a large box symbol then a name (RPM style checkbox). */
  kotakCentang(nama: string, dipilih: boolean) {
    this.children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: dipilih ? "☑ " : "□ ", size: (16 + this.offset) * 2 }),
          new TextRun({ text: nama, size: (12 + this.offset) * 2, bold: dipilih }),
        ],
      }),
    );
  }

  private cell(t: string, lebarCm: number | undefined, o: { bold?: boolean; size?: number; center?: boolean; spasi?: number } = {}): TableCell {
    return new TableCell({
      width: lebarCm ? { size: cm(lebarCm), type: WidthType.DXA } : undefined,
      children: [
        new Paragraph({
          alignment: o.center ? AlignmentType.CENTER : undefined,
          spacing: o.spasi !== undefined ? { after: o.spasi * 20 } : undefined,
          children: this.runs(t, { bold: o.bold, size: o.size ?? 10 }),
        }),
      ],
    });
  }

  private table(rows: TableRow[], lebar: number[], garis: boolean, center: boolean) {
    this.children.push(
      new Table({
        rows,
        columnWidths: lebar.map(cm),
        width: { size: cm(lebar.reduce((a, b) => a + b, 0)), type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        alignment: center ? AlignmentType.CENTER : undefined,
        borders: garis ? BORDER_GARIS : BORDER_TANPA,
      }),
    );
  }

  /** Grid table with a bold centred header row. Widths (cm) are scaled down when wider than the page. */
  tabel(kepala: string[], baris: unknown[][], lebarIn?: number[]) {
    let lebar = lebarIn && lebarIn.length === kepala.length ? lebarIn : kepala.map(() => TEXT_WIDTH_CM / kepala.length);
    const total = lebar.reduce((a, b) => a + b, 0);
    if (total > TEXT_WIDTH_CM) lebar = lebar.map((l) => (l * TEXT_WIDTH_CM) / total);
    const rows = [
      new TableRow({ tableHeader: true, children: kepala.map((h, i) => this.cell(h, lebar[i], { bold: true, center: true })) }),
      ...baris.map((isi) => new TableRow({ children: kepala.map((_, i) => this.cell(teks(isi[i]), lebar[i])) })),
    ];
    this.table(rows, lebar, true, true);
  }

  /** Label : value table used for identity blocks. */
  tabelIdentitas(pasangan: [string, unknown][], garis = false) {
    const lebar = [5.2, 0.6, 10.2];
    const rows = pasangan.map(
      ([label, nilai]) =>
        new TableRow({
          children: [this.cell(label, lebar[0], { size: 11, spasi: 1 }), this.cell(":", lebar[1], { size: 11, spasi: 1 }), this.cell(teks(nilai), lebar[2], { size: 11, spasi: 1 })],
        }),
    );
    if (rows.length) this.table(rows, lebar, garis, false);
  }

  /** "Mengetahui" block: headmaster on the left, teacher on the right. */
  blokTtd(ident: Ident, jabatanGuru = "Guru Mata Pelajaran") {
    const kota = teks(ident.kota) || "……………";
    const tanggal = teks(ident.tanggal) || tanggalHariIni();
    this.p();
    const kiriKanan: [string, string][] = [
      ["Mengetahui,", `${kota}, ${tanggal}`],
      [`Kepala ${teks(ident.nama_sekolah)}`.trim(), jabatanGuru],
      ["", ""],
      ["", ""],
      [teks(ident.nama_kepala).toUpperCase(), teks(ident.nama_guru).toUpperCase()],
      [nip(ident.nip_kepala), nip(ident.nip_guru)],
    ];
    const lebar = [8, 8];
    const rows = kiriKanan.map(
      ([kiri, kanan], i) => new TableRow({ children: [this.cell(kiri, 8, { bold: i === 4, size: 11, spasi: 2 }), this.cell(kanan, 8, { bold: i === 4, size: 11, spasi: 2 })] }),
    );
    this.table(rows, lebar, false, false);
  }

  async toBuffer(): Promise<Buffer> {
    const doc = new Document({
      styles: { default: { document: { run: { font: this.font, size: this.ukuran * 2 } } } },
      sections: [
        {
          properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: cm(2), bottom: cm(2), left: cm(2), right: cm(2) } } },
          children: this.children,
        },
      ],
    });
    return Packer.toBuffer(doc);
  }
}
