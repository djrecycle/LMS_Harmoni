/**
 * Guess a Modul Ajar template from a teacher's own .docx (port of `analisis_docx` in core/template_ajar.py):
 * order and titles of the sections, title kinds (induk/utama/tebal), numbering style of each level, bullet style,
 * activity titles, font and document title.
 */
import { attr, all, bodyBlocks, cellText, first, kids, openDocx, paragraphText, type XEl } from "./docx-xml";
import { BAGIAN_KOSONG, BENTUK_LABEL, BULLET, JENIS_BAWAAN, JUDUL_BAWAAN, PENOMORAN, REGISTRI, entri, templateBawaan, type BagianTemplate, type Template } from "./template";

/** Title keywords (lower case, without a number) -> section key. More specific ones first. */
const KATA_KUNCI: [string, RegExp][] = [
  ["desain", /^desain pembelajaran/],
  ["karakteristik", /karakteristik materi/],
  ["kesiapan", /kesiapan/],
  ["dimensi", /dimensi profil/],
  ["identitas", /^identitas\b/],
  ["cp", /capaian pembelajaran/],
  ["lintas", /lintas disiplin|interdisipliner/],
  ["tp", /^tujuan pembelajaran/],
  ["topik", /^topik/],
  ["kerangka", /^kerangka pembelajaran/],
  ["pedagogik", /praktik pedagogi|praktek pedagogi/],
  ["kemitraan", /^kemitraan/],
  ["lingkungan", /^lingkungan (belajar|pembelajaran)/],
  ["digital", /pemanfaatan digital/],
  ["langkah", /pengalaman belajar|langkah-?langkah pembelajaran/],
  ["asesmen", /^asesmen( pembelajaran| mendalam)?\s*$|^asesmen (pembelajaran|mendalam)/],
  ["rubrik", /rubrik/],
  ["tes", /lkpd|contoh tes|tes tertulis/],
  ["tindak_lanjut", /^tindak lanjut/],
  ["refleksi_pd", /refleksi (peserta didik|murid|siswa)/],
  ["refleksi_guru", /^refleksi guru/],
  ["sumber", /^sumber belajar/],
];
const POLA_KEGIATAN = /^kegiatan\s+(awal|pendahuluan|inti|penutup|akhir)\b/i;
const POLA_NOMOR_TEKS = /^\s*([IVX]{1,4}|[A-Z]|\d{1,2})[.)]\s+(?=\S)/;
const PECAHAN_KERANGKA = ["pedagogik", "kemitraan", "lingkungan", "digital"];
const FORMAT_KE_GAYA: Record<string, "romawi" | "huruf" | "angka"> = { upperRoman: "romawi", upperLetter: "huruf", decimal: "angka", lowerLetter: "huruf", lowerRoman: "romawi" };

const bagianDariJudul = (teks: string): string | null => {
  const rendah = teks.toLowerCase().trim();
  for (const [kunci, pola] of KATA_KUNCI) if (pola.test(rendah)) return kunci;
  return null;
};

/** numId -> { ilvl -> numFmt (or "bullet:<char>") } from numbering.xml. */
function petaPenomoran(numbering: XEl | null): Record<string, Record<number, string>> {
  if (!numbering) return {};
  const abstrak: Record<string, Record<number, string>> = {};
  for (const a of all(numbering, "w:abstractNum")) {
    const tingkat: Record<number, string> = {};
    for (const lv of kids(a, "w:lvl")) {
      const fmt = attr(first(lv, "w:numFmt"), "w:val");
      const teks = attr(first(lv, "w:lvlText"), "w:val");
      const il = Number(attr(lv, "w:ilvl") ?? 0);
      if (fmt) tingkat[il] = fmt === "bullet" ? `bullet:${teks ?? ""}` : fmt;
    }
    abstrak[attr(a, "w:abstractNumId") ?? ""] = tingkat;
  }
  const hasil: Record<string, Record<number, string>> = {};
  for (const n of all(numbering, "w:num")) {
    hasil[attr(n, "w:numId") ?? ""] = abstrak[attr(first(n, "w:abstractNumId"), "w:val") ?? ""] ?? {};
  }
  return hasil;
}

type StyleInfo = { name: string; bold: boolean | null };

function petaGaya(styles: XEl | null): Record<string, StyleInfo> {
  const out: Record<string, StyleInfo> = {};
  if (!styles) return out;
  for (const s of kids(styles, "w:style")) {
    const id = attr(s, "w:styleId");
    if (!id) continue;
    const b = first(kids(s, "w:rPr")[0] ?? s, "w:b");
    out[id] = { name: attr(first(s, "w:name"), "w:val") ?? id, bold: kids(s, "w:rPr")[0] && b ? boolOn(b) : null };
  }
  return out;
}

/** A w:b / w:i style toggle: on unless w:val is 0/false/off. */
const boolOn = (el: XEl) => !["0", "false", "off"].includes((attr(el, "w:val") ?? "true").toLowerCase());

function fontDokumen(styles: XEl | null): { font: string; ukuran: number } {
  if (!styles) return { font: "", ukuran: 0 };
  const defaults = first(styles, "w:docDefaults");
  const blok = defaults ?? styles;
  const font = attr(first(blok, "w:rFonts"), "w:ascii") ?? "";
  const sz = attr(first(blok, "w:sz"), "w:val");
  return { font, ukuran: sz ? Math.floor(Number(sz) / 2) : 0 };
}

type Entri = { judul: string; jenis: "induk" | "utama" | "tebal" | "pemisah"; gaya: "romawi" | "huruf" | "angka" | null; kunci: string | null };

export type AnalisisTemplate = { template: Template; teks: string; laporan: string[] };

/** Read a Modul Ajar / RPM .docx and guess its template. `template` can be given to `normalisasi`; `laporan` tells the user what was found. */
export async function analisisDocx(data: Buffer | Uint8Array | ArrayBuffer): Promise<AnalisisTemplate> {
  const { document, numbering, styles } = await openDocx(data);
  const petaNum = petaPenomoran(numbering);
  const gayaDok = petaGaya(styles);
  const { font, ukuran } = fontDokumen(styles);

  const blocks = bodyBlocks(document);
  const paragraf = blocks.filter((b) => b.tagName === "w:p");

  const styleOf = (par: XEl): StyleInfo => gayaDok[attr(first(kids(par, "w:pPr")[0] ?? par, "w:pStyle"), "w:val") ?? ""] ?? { name: "normal", bold: null };
  const isHeading = (par: XEl) => styleOf(par).name.toLowerCase().startsWith("heading");
  const isCenter = (par: XEl) => attr(first(kids(par, "w:pPr")[0] ?? par, "w:jc"), "w:val") === "center";

  function formatNum(par: XEl): { fmt: string | undefined; il: number } {
    const numPr = first(kids(par, "w:pPr")[0] ?? par, "w:numPr");
    const numId = numPr ? attr(first(numPr, "w:numId"), "w:val") : null;
    if (!numPr || numId === null) return { fmt: undefined, il: 0 };
    const il = Number(attr(first(numPr, "w:ilvl"), "w:val") ?? 0);
    return { fmt: petaNum[numId]?.[il], il };
  }

  /** All text runs of the paragraph are bold (directly, or through the paragraph style). */
  function tebal(par: XEl): boolean {
    const runs = kids(par, "w:r").filter((r) => all(r, "w:t").some((t) => (t.textContent ?? "").trim()));
    if (!runs.length) return false;
    const gaya = styleOf(par).bold === true;
    return runs.every((r) => {
      const b = kids(r, "w:rPr")[0] ? first(kids(r, "w:rPr")[0], "w:b") : null;
      return b ? boolOn(b) : gaya;
    });
  }

  const entriList: Entri[] = [];
  const suaraBullet: Record<string, number> = {};
  const vote = (k: string) => (suaraBullet[k] = (suaraBullet[k] ?? 0) + 1);
  const kegiatan: Record<string, string> = {};
  let kegiatanNomor = false;
  let gayaInduk: "romawi" | "huruf" | "angka" | null = null;
  let gayaUtama: "romawi" | "huruf" | "angka" | null = null;
  const teksPenuh: string[] = [];

  for (const par of paragraf) {
    const teks = paragraphText(par).trim();
    if (!teks) continue;
    teksPenuh.push(teks);
    const { fmt, il } = formatNum(par);
    const cocokTeks = POLA_NOMOR_TEKS.exec(teks);
    const bersih = teks.replace(POLA_NOMOR_TEKS, "").trim();
    let gayaTeks: "romawi" | "huruf" | "angka" | null = null;
    if (cocokTeks) {
      const n = cocokTeks[1];
      gayaTeks = /^[IVX]{2,4}$/.test(n) ? "romawi" : /^\d+$/.test(n) ? "angka" : "huruf";
    }
    const judulStyle = isHeading(par);
    const pendek = bersih.length <= 90 && !/[.!?]\s+\S/.test(bersih); // not a sentence/note

    // list items (not titles): letters/numbers/bullets on inner levels, or not bold
    const judulBernomor = Boolean(fmt) && il === 0 && (fmt === "upperRoman" || fmt === "upperLetter");
    if (fmt && !(judulBernomor || tebal(par) || judulStyle)) {
      if (fmt.startsWith("bullet:")) {
        const tanda = fmt.slice(7).trim();
        vote(tanda === "✔" || tanda === "✓" ? "centang" : tanda === "-" || tanda === "–" ? "strip" : "titik");
      } else if (il >= 1 && (fmt === "lowerLetter" || fmt === "decimal")) {
        vote(fmt === "lowerLetter" ? "huruf" : "angka");
      }
      continue;
    }
    if (!fmt && !tebal(par) && !judulStyle) {
      const m = /^([•●▪✔o\-–])\s+\S/.exec(teks);
      if (m) vote(m[1] === "✔" ? "centang" : "-–".includes(m[1]) ? "strip" : "titik");
      continue;
    }

    // title candidate: automatically/textually numbered, or short bold capitals
    if (POLA_KEGIATAN.test(bersih)) {
      const label = bersih.split(/[:(]/, 1)[0].trim();
      const k = /^kegiatan\s+(awal|pendahuluan)/i.test(bersih) ? "awal" : /^kegiatan\s+(penutup|akhir)/i.test(bersih) ? "penutup" : "inti";
      kegiatan[k] ??= label;
      kegiatanNomor = kegiatanNomor || Boolean(fmt && !fmt.startsWith("bullet:")) || Boolean(cocokTeks);
      continue;
    }
    if (!pendek) continue;

    let gaya: "romawi" | "huruf" | "angka" | null;
    let jenis: Entri["jenis"];
    if (fmt && !fmt.startsWith("bullet:")) {
      gaya = FORMAT_KE_GAYA[fmt] ?? null;
      jenis = fmt === "upperRoman" && il === 0 ? "induk" : "utama";
      if (il > 0 && (fmt === "decimal" || fmt === "lowerLetter" || fmt === "lowerRoman")) continue; // deep numbered sub-items, not sections
    } else if (gayaTeks) {
      gaya = gayaTeks;
      jenis = gaya === "romawi" ? "induk" : "utama";
    } else if (tebal(par) || judulStyle || (fmt && fmt.startsWith("bullet:"))) {
      gaya = null;
      jenis = isCenter(par) ? "pemisah" : "tebal";
    } else continue;

    if ((jenis === "tebal" || jenis === "pemisah") && !(bagianDariJudul(bersih) || (bersih.endsWith(":") && bersih.split(/\s+/).length <= 3))) continue;
    entriList.push({ judul: bersih.replace(/:$/, "").trim(), jenis, gaya, kunci: bagianDariJudul(bersih) });
    if (jenis === "induk") gayaInduk ??= gaya;
    else if (jenis === "utama") gayaUtama ??= gaya;
  }

  // ---- build the section list
  const bagian: BagianTemplate[] = [];
  const terpakai = new Set<string>();
  const umum = BAGIAN_KOSONG[Symbol.iterator]();
  const adaKerangka = entriList.some((e) => e.kunci === "kerangka");
  for (const e of entriList) {
    let kunci = e.kunci;
    if (kunci && PECAHAN_KERANGKA.includes(kunci) && adaKerangka) continue; // sub-title inside Kerangka, not a section of its own
    if (kunci === null) {
      if (e.jenis === "utama") continue; // numbered title without a counterpart (e.g. KKTP): no data for it
      const next = umum.next();
      if (next.done) continue;
      kunci = next.value;
    } else if (terpakai.has(kunci)) continue;
    terpakai.add(kunci);
    bagian.push(entri(kunci, e.judul, e.jenis, true));
  }
  for (const [k, jn, j] of REGISTRI) if (!terpakai.has(k) && !BAGIAN_KOSONG.includes(k)) bagian.push(entri(k, j, jn, false)); // sections missing from the file: switched off
  for (const k of BAGIAN_KOSONG) if (!terpakai.has(k)) bagian.push(entri(k, JUDUL_BAWAAN[k], JENIS_BAWAAN[k], false));

  // ---- fill-in tables and checkboxes
  const bentukTerdeteksi: Record<string, string> = {};
  let identBaris: string[] = [];
  let identGaris = false;
  let tabelPertama = true;
  for (const el of blocks.filter((b) => b.tagName === "w:tbl")) {
    const rows = kids(el, "w:tr");
    if (!rows.length) continue;
    const cellsOf = (tr: XEl) => kids(tr, "w:tc");
    const awal = (cellText(cellsOf(rows[0])[0] ?? el) || "").trim().toLowerCase();
    const kolom = kids(first(el, "w:tblGrid") ?? el, "w:gridCol").length;
    if (tabelPertama && kolom === 3 && rows.length >= 3 && rows.every((r) => cellText(cellsOf(r)[1] ?? el).trim() === ":") && /sekolah|guru|penyusun|mata pelajaran|nama/.test(awal)) {
      identBaris = rows.map((r) => cellText(cellsOf(r)[0] ?? el).trim()).filter(Boolean);
      const tblStyle = gayaDok[attr(first(el, "w:tblStyle"), "w:val") ?? ""]?.name.toLowerCase() ?? "";
      identGaris = all(el, "w:tblBorders").length > 0 || tblStyle.includes("grid");
    } else if (awal.startsWith("cp rujukan")) bentukTerdeteksi.tp = "tabel";
    else if (awal.startsWith("dpl")) bentukTerdeteksi.dimensi = "centang";
    else if (awal.startsWith("apa yang akan diukur")) bentukTerdeteksi.asesmen = "tabel";
    tabelPertama = false;
  }
  if (teksPenuh.some((t) => t.startsWith("□") || t.startsWith("☐"))) bentukTerdeteksi.dimensi = "centang";
  for (const b of bagian) if (b.aktif && b.kunci in bentukTerdeteksi) b.bentuk = bentukTerdeteksi[b.kunci];

  // ---- document title, font, bullet
  const tengahTebal = (par: XEl) => isCenter(par) && Boolean(paragraphText(par).trim()) && (tebal(par) || isHeading(par));
  let judulDok = "";
  let subjudul = "";
  let judulSampul = "";
  const tengah = paragraf.slice(0, 8).filter(tengahTebal).map((p) => paragraphText(p).trim());
  if (tengah.length) {
    judulDok = tengah[0];
    if (tengah.length > 1 && tengah[1].length <= 60 && !tengah[1].toLowerCase().startsWith("mata pelajaran")) subjudul = tengah[1];
  }
  tengah.forEach((t, i) => {
    if (t.toLowerCase().startsWith("mata pelajaran") && i >= 1 && tengah[i - 1] !== judulDok && tengah[i - 1] !== subjudul) judulSampul = tengah[i - 1];
  });

  const bullet = Object.keys(suaraBullet).sort((a, b) => suaraBullet[b] - suaraBullet[a])[0] ?? "titik";
  const tpl = templateBawaan();
  Object.assign(tpl, {
    bagian,
    bullet: bullet as Template["bullet"],
    penomoran: gayaUtama ?? "huruf",
    penomoran_utama: gayaInduk ?? "romawi",
    judul_dokumen: judulDok || tpl.judul_dokumen,
    subjudul,
    judul_sampul: judulSampul,
    kegiatan_bernomor: kegiatanNomor,
  });
  if (identBaris.length) Object.assign(tpl, { identitas_baris: identBaris, identitas_garis: identGaris });
  if (kegiatan.awal) tpl.label_awal = kegiatan.awal;
  if (kegiatan.inti) tpl.label_inti = kegiatan.inti;
  if (kegiatan.penutup) tpl.label_penutup = kegiatan.penutup;
  if (font) tpl.font = font;
  if (ukuran) tpl.ukuran = ukuran;

  const laporan = [
    `Font ${tpl.font} ${tpl.ukuran} pt; judul dokumen “${tpl.judul_dokumen}”.`,
    `Judul induk bernomor ${PENOMORAN[tpl.penomoran_utama]}, judul bagian bernomor ${PENOMORAN[tpl.penomoran]}, butir daftar bergaya ${BULLET[tpl.bullet]}.`,
    `${bagian.filter((b) => b.aktif).length} bagian ditemukan: ${bagian.filter((b) => b.aktif).map((b) => b.judul).join("; ")}`,
  ];
  if (identBaris.length) laporan.push(`Tabel identitas di atas: ${identBaris.join(", ")}${identGaris ? " (berbingkai)." : "."}`);
  const namaBentuk: Record<string, string> = { dimensi: "Dimensi Profil Lulusan", tp: "Tujuan Pembelajaran", asesmen: "Asesmen" };
  if (Object.keys(bentukTerdeteksi).length) {
    laporan.push("Tabel isian/kotak centang: " + Object.entries(bentukTerdeteksi).map(([k, v]) => `${namaBentuk[k]} (${BENTUK_LABEL[v].toLowerCase()})`).join("; ") + ".");
  }
  if (kegiatanNomor) laporan.push("Kegiatan awal/inti/penutup diberi nomor: " + (["awal", "inti", "penutup"] as const).map((k) => kegiatan[k] ?? "?").join(", ") + ".");
  return { template: tpl, teks: teksPenuh.join("\n"), laporan };
}
