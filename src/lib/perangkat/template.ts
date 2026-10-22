/**
 * Modul Ajar templates (port of core/template_ajar.py, without the Form A/B "observasi" section).
 *
 * A template decides (1) the layout of the Word document — which sections show, their order, titles,
 * numbering, font — and (2) style hints for the AI (a style sample and extra instructions).
 * The JSON the AI returns keeps one schema; a template only changes how it is presented and styled.
 *
 * The built-in template (id "bawaan") lives here in code and cannot be changed or deleted, only duplicated.
 * Teacher templates are stored in the `modul_template` table.
 */
import { isObj, type Obj } from "./util";

export const BAWAAN_ID = "bawaan";
export const BATAS_CONTOH = 9000; // characters of style sample placed in a prompt
export const BATAS_CONTOH_SIMPAN = 30000; // characters of style sample stored per template

export const FONT_PILIHAN = ["Times New Roman", "Arial", "Calibri", "Cambria", "Georgia", "Verdana"];
export const PENOMORAN = {
  huruf: "Huruf (A. B. C.)",
  angka: "Angka (1. 2. 3.)",
  romawi: "Romawi (I. II. III.)",
  tanpa: "Tanpa nomor",
} as const;
export const BULLET = {
  titik: "Titik (• dan o)",
  strip: "Strip (- dan –)",
  centang: "Centang (✔ dan o)",
  huruf: "Huruf (a. b. c.)",
  angka: "Angka (1. 2. 3.)",
  tanpa: "Tanpa tanda",
} as const;
export const JENIS_LABEL = {
  induk: "Judul induk (bernomor tingkat atas)",
  utama: "Judul bernomor",
  tebal: "Judul tebal tanpa nomor",
  pemisah: "Judul tengah (nomor mulai lagi)",
} as const;
/** Display form of a section (first choice = default). Other sections have no choice. */
export const BENTUK: Record<string, readonly string[]> = {
  dimensi: ["daftar", "centang"], // centang = 8 DPL checkboxes + a table for the chosen DPL
  tp: ["teks", "tabel"], // tabel = "CP Rujukan / Tujuan Pembelajaran" table
  asesmen: ["daftar", "tabel"], // tabel = "Apa yang akan diukur / Jenis / Teknik / Bentuk" table
};
export const BENTUK_LABEL: Record<string, string> = {
  daftar: "Daftar",
  teks: "Teks biasa",
  centang: "Kotak centang + tabel isian",
  tabel: "Tabel isian",
};
/** The eight Dimensi Profil Lulusan used for the checkbox list. */
export const DPL_STANDAR = ["Keimanan dan Ketakwaan terhadap Tuhan YME", "Kewargaan", "Penalaran Kritis", "Kreativitas", "Kolaborasi", "Kemandirian", "Kesehatan", "Komunikasi"];
export const IDENTITAS_BARIS_BAWAAN = ["Nama Sekolah", "Nama Penyusun", "Mata Pelajaran", "Fase / Kelas / Semester"];
export const UKURAN_MIN = 9;
export const UKURAN_MAKS = 16;

export type Penomoran = keyof typeof PENOMORAN;
export type BulletGaya = keyof typeof BULLET;
export type JenisJudul = keyof typeof JENIS_LABEL;

export type BagianTemplate = { kunci: string; judul: string; jenis: JenisJudul; aktif: boolean; bentuk: string };

export type Template = {
  id: string;
  nama: string;
  deskripsi: string;
  judul_dokumen: string;
  subjudul: string;
  judul_sampul: string;
  tampilkan_sampul: boolean;
  font: string;
  ukuran: number;
  penomoran: Penomoran;
  penomoran_utama: Penomoran;
  bullet: BulletGaya;
  kegiatan_bernomor: boolean;
  label_awal: string;
  label_inti: string;
  label_penutup: string;
  tanda_tangan: boolean;
  identitas_baris: string[];
  identitas_garis: boolean;
  bagian: BagianTemplate[];
  gaya_contoh: string;
  instruksi: string;
  bawaan: boolean;
};

/**
 * Sections of the Modul Ajar: [key, default title kind, default title, JSON key the AI may leave empty, on by default].
 * Kinds: induk = top-level numbered title; utama = numbered title; tebal = bold unnumbered title stuck to the section above;
 * pemisah = big centred title after which all numbering restarts.
 * A JSON key is only listed for sections that no other part of the app reads (Materi Guru reads TP/CP/topik/pertemuan
 * from the module), so it is safe not to generate it when the section is off. Several sections may share one JSON key
 * (kerangka and its pieces); a key is only emptied when ALL its sections are off.
 */
type RegistriRow = readonly [kunci: string, jenis: JenisJudul, judul: string, kunciJson: string | null, aktif: boolean];
export const REGISTRI: readonly RegistriRow[] = [
  ["identitas", "utama", "IDENTITAS MODUL", null, true],
  ["kesiapan", "utama", "IDENTIFIKASI KESIAPAN PESERTA DIDIK", "kesiapan", true],
  ["karakteristik", "utama", "KARAKTERISTIK MATERI PELAJARAN", null, true],
  ["dimensi", "utama", "DIMENSI PROFIL LULUSAN", "dimensi_profil_lulusan", true],
  ["desain", "pemisah", "DESAIN PEMBELAJARAN", null, true],
  ["cp", "utama", "CAPAIAN PEMBELAJARAN (CP)", null, true],
  ["lintas", "utama", "LINTAS DISIPLIN ILMU", "lintas_disiplin", true],
  ["tp", "utama", "TUJUAN PEMBELAJARAN", null, true],
  ["topik", "utama", "TOPIK PEMBELAJARAN KONTEKSTUAL", null, true],
  ["kerangka", "utama", "KERANGKA PEMBELAJARAN", "kerangka", true],
  // pieces of the kerangka (used by templates that show them as separate sections)
  ["pedagogik", "utama", "PRAKTIK PEDAGOGIK", "kerangka", false],
  ["kemitraan", "utama", "KEMITRAAN PEMBELAJARAN", "kerangka", false],
  ["lingkungan", "utama", "LINGKUNGAN BELAJAR", "kerangka", false],
  ["digital", "utama", "PEMANFAATAN DIGITAL", "kerangka", false],
  ["langkah", "utama", "LANGKAH-LANGKAH PEMBELAJARAN BERDIFERENSIASI", null, true],
  ["asesmen", "utama", "ASESMEN PEMBELAJARAN", "asesmen", true],
  ["rubrik", "tebal", "RUBRIK PENILAIAN PRODUK DAN KINERJA", "rubrik", true],
  ["tes", "tebal", "CONTOH TES TERTULIS", "tes", true],
  ["tindak_lanjut", "tebal", "TINDAK LANJUT", "tindak_lanjut", true],
  ["refleksi_pd", "tebal", "REFLEKSI PESERTA DIDIK", "refleksi_peserta_didik", true],
  ["refleksi_guru", "tebal", "REFLEKSI GURU", "refleksi_guru", true],
  ["sumber", "tebal", "SUMBER BELAJAR", null, true],
  // empty titles for groups/appendices used by other templates (e.g. "I. IDENTIFIKASI ...")
  ["judul1", "induk", "JUDUL TAMBAHAN 1", null, false],
  ["judul2", "induk", "JUDUL TAMBAHAN 2", null, false],
  ["judul3", "tebal", "JUDUL TAMBAHAN 3", null, false],
  ["judul4", "tebal", "JUDUL TAMBAHAN 4", null, false],
];

export const JENIS_BAWAAN = Object.fromEntries(REGISTRI.map(([k, jenis]) => [k, jenis])) as Record<string, JenisJudul>;
export const JUDUL_BAWAAN = Object.fromEntries(REGISTRI.map(([k, , judul]) => [k, judul])) as Record<string, string>;
export const AKTIF_BAWAAN = Object.fromEntries(REGISTRI.map(([k, , , , aktif]) => [k, aktif])) as Record<string, boolean>;
export const KUNCI_JSON = Object.fromEntries(REGISTRI.filter((r) => r[3]).map(([k, , , kj]) => [k, kj as string])) as Record<string, string>;
/** Sections that only print a title. */
export const BAGIAN_KOSONG = ["judul1", "judul2", "judul3", "judul4"];

const DESKRIPSI_BAWAAN =
  "Tampilan Modul Ajar bawaan aplikasi (Kurikulum Merdeka – Deep Learning) dengan seluruh bagian lengkap. Tidak bisa diubah; duplikat untuk memodifikasi.";

export function entri(kunci: string, judul: string, jenis: JenisJudul, aktif: boolean, bentuk = ""): BagianTemplate {
  const pilihan = BENTUK[kunci];
  if (pilihan && !pilihan.includes(bentuk)) bentuk = pilihan[0];
  return { kunci, judul, jenis, aktif, bentuk: pilihan ? bentuk : "" };
}

export function templateBawaan(): Template {
  return {
    id: BAWAAN_ID,
    nama: "Bawaan (Deep Learning)",
    deskripsi: DESKRIPSI_BAWAAN,
    judul_dokumen: "MODUL AJAR",
    subjudul: "KURIKULUM MERDEKA (Deep Learning)",
    judul_sampul: "MODUL AJAR DEEP LEARNING",
    tampilkan_sampul: true,
    font: "Times New Roman",
    ukuran: 11,
    penomoran: "huruf", // number style of "utama" titles
    penomoran_utama: "romawi", // number style of "induk" titles
    bullet: "titik",
    kegiatan_bernomor: false, // Kegiatan Awal/Inti/Penutup numbered like main titles
    label_awal: "KEGIATAN PENDAHULUAN",
    label_inti: "KEGIATAN INTI",
    label_penutup: "KEGIATAN PENUTUP",
    tanda_tangan: true,
    identitas_baris: [...IDENTITAS_BARIS_BAWAAN], // rows of the identity table on the cover
    identitas_garis: false, // identity table with borders
    bagian: REGISTRI.map(([k, jenis, judul, , aktif]) => entri(k, judul, jenis, aktif)),
    gaya_contoh: "", // empty = use the built-in style sample
    instruksi: "",
    bawaan: true,
  };
}

export const apakahBawaan = (tpl: Pick<Template, "id"> | null | undefined) => Boolean(tpl) && tpl!.id === BAWAAN_ID;

function bool(nilai: unknown, bawaan: boolean): boolean {
  if (typeof nilai === "boolean") return nilai;
  if (nilai === null || nilai === undefined) return bawaan;
  return ["1", "true", "on", "ya", "y"].includes(String(nilai).trim().toLowerCase());
}

const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/**
 * Complete and clean template data from any source (form, DB, old file) into the standard shape.
 * Missing sections are appended (on); unknown section keys are dropped.
 */
export function normalisasi(data: unknown): Template {
  const dasar = templateBawaan();
  const d: Obj = isObj(data) ? data : {};
  const hasil = templateBawaan();

  hasil.id = text(d.id).trim(); // no id = a new template, not the built-in one
  for (const kunci of ["nama", "deskripsi", "judul_dokumen", "subjudul", "judul_sampul", "gaya_contoh", "instruksi", "label_awal", "label_inti", "label_penutup"] as const) {
    if (d[kunci] !== undefined && d[kunci] !== null) {
      hasil[kunci] = kunci === "gaya_contoh" ? text(d[kunci]).replace(/\r\n/g, "\n").trim() : text(d[kunci]).trim();
    }
  }
  hasil.tampilkan_sampul = bool(d.tampilkan_sampul, dasar.tampilkan_sampul);
  hasil.tanda_tangan = bool(d.tanda_tangan, dasar.tanda_tangan);
  hasil.kegiatan_bernomor = bool(d.kegiatan_bernomor, dasar.kegiatan_bernomor);
  hasil.identitas_garis = bool(d.identitas_garis, dasar.identitas_garis);

  let barisIdent: unknown = d.identitas_baris;
  if (typeof barisIdent === "string") barisIdent = barisIdent.split(/\r?\n/);
  const baris = (Array.isArray(barisIdent) ? barisIdent : []).map((b) => text(b).trim()).filter(Boolean);
  hasil.identitas_baris = baris.length ? baris : [...IDENTITAS_BARIS_BAWAAN];
  for (const kunci of ["label_awal", "label_inti", "label_penutup"] as const) hasil[kunci] = hasil[kunci] || dasar[kunci];

  hasil.font = text(d.font).trim() || dasar.font;
  let ukuran = Math.trunc(Number(d.ukuran ?? dasar.ukuran));
  if (!Number.isFinite(ukuran)) ukuran = dasar.ukuran;
  hasil.ukuran = Math.max(UKURAN_MIN, Math.min(UKURAN_MAKS, ukuran));
  const penomoran = text(d.penomoran).trim();
  hasil.penomoran = penomoran in PENOMORAN ? (penomoran as Penomoran) : dasar.penomoran;
  const penomoranUtama = text(d.penomoran_utama).trim();
  hasil.penomoran_utama = penomoranUtama in PENOMORAN ? (penomoranUtama as Penomoran) : dasar.penomoran_utama;
  const bullet = text(d.bullet).trim();
  hasil.bullet = bullet in BULLET ? (bullet as BulletGaya) : dasar.bullet;

  const bagian: BagianTemplate[] = [];
  const terlihat = new Set<string>();
  for (const item of Array.isArray(d.bagian) ? d.bagian : []) {
    if (!isObj(item)) continue;
    const kunci = text(item.kunci);
    if (!(kunci in JENIS_BAWAAN) || terlihat.has(kunci)) continue;
    terlihat.add(kunci);
    const jenis = text(item.jenis);
    bagian.push(
      entri(kunci, text(item.judul).trim() || JUDUL_BAWAAN[kunci], jenis in JENIS_LABEL ? (jenis as JenisJudul) : JENIS_BAWAAN[kunci], bool(item.aktif, AKTIF_BAWAAN[kunci]), text(item.bentuk)),
    );
  }
  for (const [kunci, jenis, judul, , aktif] of REGISTRI) if (!terlihat.has(kunci)) bagian.push(entri(kunci, judul, jenis, aktif));
  hasil.bagian = bagian;

  hasil.nama = hasil.nama || "Template tanpa nama";
  hasil.bawaan = hasil.id === BAWAAN_ID;
  return hasil;
}

export const bagianAktif = (tpl: Template, kunci: string) => tpl.bagian.some((b) => b.kunci === kunci && b.aktif);

/** Display form of an ACTIVE section ("" when off or when there is no choice). */
export function bentukBagian(tpl: Template, kunci: string): string {
  for (const b of tpl.bagian) if (b.kunci === kunci && b.aktif) return b.bentuk;
  return "";
}

/** JSON keys the AI does not need to produce because their sections are switched off. */
export function kunciJsonNonaktif(tpl: Template): string[] {
  const aktif = new Set(tpl.bagian.filter((b) => b.aktif && KUNCI_JSON[b.kunci]).map((b) => KUNCI_JSON[b.kunci]));
  const hasil: string[] = [];
  for (const b of tpl.bagian) {
    const kj = KUNCI_JSON[b.kunci];
    if (kj && !b.aktif && !aktif.has(kj) && !hasil.includes(kj)) hasil.push(kj);
  }
  return hasil;
}

/** One-line summary for lists: number of sections and font. */
export function ringkasan(tpl: Template): string {
  const aktif = tpl.bagian.filter((b) => b.aktif).length;
  return `${aktif}/${tpl.bagian.length} bagian · ${tpl.font} ${tpl.ukuran} pt`;
}
