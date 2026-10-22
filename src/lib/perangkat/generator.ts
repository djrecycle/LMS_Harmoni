/**
 * Glue between prompts, the AI provider and ready-to-use results (port of core/generator.py, without the
 * Rencana Hasil Kerja generator and the Form A/B observation parts).
 */
import { AiError } from "../ai-error";
import { ambilJson } from "../ai-json";
import { arr, isObj, obj, objs, str, strs, type Obj } from "./util";
import { promptCpTpAtp, promptImporCpTpAtp, promptMateriGuru, promptMateriSiswa, promptModulAjar, type Konteks } from "./prompts";

export type DocKind = "cp_tp_atp" | "modul_ajar" | "materi_guru" | "materi_siswa";

export const JENIS: Record<DocKind, string> = {
  cp_tp_atp: "CP – TP – ATP",
  modul_ajar: "Modul Ajar",
  materi_guru: "Materi Lengkap (Guru)",
  materi_siswa: "Materi Pembelajaran (Siswa)",
};

/** Everything a generation run remembers about the request; stored as `teaching_doc.context`. */
export type PerangkatKonteks = Konteks & {
  nama_kepala?: string;
  nip_guru?: string;
  nip_kepala?: string;
  kota?: string;
  template_id?: string;
  template_nama?: string;
  bab_judul?: string;
  impor?: boolean;
};

/** Sends one prompt to the AI and returns its raw text. */
export type RunPrompt = (prompt: string) => Promise<string>;

/* ------------------------------------------------------------------ generation */
export async function buatCpTpAtp(run: RunPrompt, k: Konteks, cpResmi: string): Promise<Obj> {
  const data = ambilJson<unknown>(await run(promptCpTpAtp(k, cpResmi)));
  if (!isObj(data) || arr(data.cp_tp).length === 0) throw new AiError("Hasil CP–TP–ATP dari AI tidak lengkap.");
  return data;
}

/**
 * Tidy up the teacher's own CP-TP-ATP (uploaded file / pasted text) into the same JSON as `buatCpTpAtp`,
 * without the AI inventing new content, so it can be the reference for Modul Ajar and Materi.
 */
export async function imporCpTpAtp(run: RunPrompt, k: Konteks, teksSumber: string): Promise<Obj> {
  const data = ambilJson<unknown>(await run(promptImporCpTpAtp(k, teksSumber)));
  if (!isObj(data) || arr(data.cp_tp).length === 0) {
    throw new AiError("AI tidak berhasil mengenali struktur CP–TP–ATP dari berkas ini. Pastikan berkas benar-benar berisi CP-TP-ATP.");
  }
  return data;
}

/** Modul Ajar from the AI; `template` steers the writing style and the sections made. No template = the built-in one. */
export async function buatModulAjar(run: RunPrompt, k: PerangkatKonteks, template?: unknown): Promise<Obj> {
  const data = ambilJson<unknown>(await run(promptModulAjar(k, template)));
  if (!isObj(data) || arr(data.pertemuan).length === 0) throw new AiError("Hasil Modul Ajar dari AI tidak lengkap.");
  if (k.bab_nomor) paksaBab(data, k);
  return data;
}

/** The teacher's full material, built from an already generated Modul Ajar. */
export async function buatMateriGuru(run: RunPrompt, sumberModul: Obj, k: Konteks): Promise<Obj> {
  const data = ambilJson<unknown>(await run(promptMateriGuru(k, sumberModul)));
  if (!isObj(data) || arr(data.bagian).length === 0) throw new AiError("Hasil Materi Lengkap (Guru) dari AI tidak lengkap.");
  return data;
}

/** Simple bullet-point material for students, derived from the teacher's material so it never drifts from it. */
export async function buatMateriSiswa(run: RunPrompt, materiGuru: Obj, k: Konteks): Promise<Obj> {
  const data = ambilJson<unknown>(await run(promptMateriSiswa(k, materiGuru)));
  if (!isObj(data) || arr(data.bagian).length === 0) throw new AiError("Hasil Materi Pembelajaran (Siswa) dari AI tidak lengkap.");
  return data;
}

/* ------------------------------------------------------------------ TP / BAB / semester mapping */
const POLA_TP_NOMOR = /\bTP\s*0*([0-9]+)\b/i;
const POLA_UNIT_NOMOR = /\bUNIT\s*0*([0-9]+)\b/i;
const POLA_UNIT_PREFIX = /^\s*UNIT\s*[0-9]+\s*[:\-–—]?\s*/i;
const POLA_JUDUL_BAB = /^\s*BAB\s*[0-9]+\s*[:-]?\s*/i;
const POLA_SEMESTER_ANGKA = /([0-9]+)/;
const ROMAWI_SEMESTER: Record<number, string> = { 1: "I", 2: "II", 3: "III", 4: "IV" };

/** Default for the "Semester" field until a TP from a CP-TP-ATP is chosen. */
export const DEFAULT_SEMESTER = "I (Ganjil)";

const nomorTp = (teks: unknown): string | null => POLA_TP_NOMOR.exec(str(teks))?.[1] ?? null;

/** Semester number of a text like "SEMESTER 2" or "II (Genap)". */
export function nomorSemester(teks: unknown): number | null {
  const t = str(teks);
  const angka = POLA_SEMESTER_ANGKA.exec(t);
  if (angka) return Number(angka[1]);
  const atas = t.toUpperCase();
  if (/\bII\b/.test(atas)) return 2;
  if (/\bI\b/.test(atas)) return 1;
  return null;
}

/** Semester as 1 or 2 (for tagging questions), also reading "Ganjil"/"Genap"; null when unclear. */
export function semesterGanjilGenap(teks: unknown): 1 | 2 | null {
  const n = nomorSemester(teks);
  if (n === 1 || n === 2) return n;
  const atas = str(teks).toUpperCase();
  if (atas.includes("GANJIL")) return 1;
  if (atas.includes("GENAP")) return 2;
  return null;
}

const formatSemester = (nomor: number) => `${ROMAWI_SEMESTER[nomor] ?? String(nomor)} (${nomor % 2 === 1 ? "Ganjil" : "Genap"})`;

/** Number of a TP ("TP 12. ..." -> 12); TP without a number sort last. */
export const nomorTpUrut = (tp: string): number => {
  const n = nomorTp(tp);
  return n === null ? Number.MAX_SAFE_INTEGER : Number(n);
};

/** Flat list of distinct TP from a CP-TP-ATP result, to choose as the focus of a Modul Ajar. */
export function daftarTp(data: unknown): string[] {
  if (!isObj(data)) return [];
  // The same TP can be listed under more than one element of the CP; each TP is listed once.
  return [...new Set(objs(data.cp_tp).flatMap((item) => strs(item.tujuan_pembelajaran)))];
}

export type InfoTp = { semester: string; bab_nomor: string; bab_judul: string; alokasi: string };

/**
 * TP -> {semester, bab_nomor, bab_judul, alokasi} from the ATP of a CP-TP-ATP, matched by TP number.
 * BAB = UNIT of the ATP. Used to group the "choose TP" list by BAB and to prefill the context.
 */
export function infoTp(data: unknown): Record<string, InfoTp> {
  if (!isObj(data)) return {};
  const indeks: Record<string, InfoTp> = {};
  for (const semester of objs(data.atp)) {
    const angka = nomorSemester(semester.semester);
    for (const unit of objs(semester.unit)) {
      const namaUnit = str(unit.nama);
      const cocok = POLA_UNIT_NOMOR.exec(namaUnit);
      for (const baris of objs(unit.baris)) {
        const nomor = nomorTp(baris.tujuan);
        if (!nomor || nomor in indeks) continue;
        indeks[nomor] = {
          semester: angka ? formatSemester(angka) : "",
          bab_nomor: cocok ? cocok[1] : "",
          bab_judul: cocok ? namaUnit.replace(POLA_UNIT_PREFIX, "").trim() : "",
          alokasi: str(baris.alokasi),
        };
      }
    }
  }
  const hasil: Record<string, InfoTp> = {};
  for (const tp of daftarTp(data)) {
    const info = indeks[nomorTp(tp) ?? ""];
    if (info) hasil[tp] = info;
  }
  return hasil;
}

const POLA_TAHUN_AJARAN = /(\d{4})\s*[-/]\s*(\d{2,4})/;

const judulHuruf = (s: string) => s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** Context fields readable from a CP-TP-ATP result. Unreadable parts are skipped (they never overwrite existing input). */
export function konteksDariCp(data: unknown): Partial<Record<"mata_pelajaran" | "kelas" | "fase" | "tahun_ajaran" | "jumlah_tp", string>> {
  if (!isObj(data)) return {};
  const hasil: Partial<Record<"mata_pelajaran" | "kelas" | "fase" | "tahun_ajaran" | "jumlah_tp", string>> = {};
  const mapel = str(data.mata_pelajaran);
  if (mapel) hasil.mata_pelajaran = mapel === mapel.toUpperCase() ? judulHuruf(mapel) : mapel;
  const ident = obj(data.identitas);
  const kelas = str(ident.kelas_semester).split("/")[0].trim();
  if (kelas) hasil.kelas = kelas;
  const faseTahun = str(ident.fase_tahun_ajaran);
  const fase = faseTahun.split("/")[0].trim();
  if (fase && fase.length <= 3 && !POLA_TAHUN_AJARAN.test(fase)) hasil.fase = fase;
  const tahun = POLA_TAHUN_AJARAN.exec(faseTahun);
  if (tahun) hasil.tahun_ajaran = `${tahun[1]}/${tahun[2]}`;
  const jumlah = daftarTp(data).length;
  if (jumlah) hasil.jumlah_tp = String(jumlah);
  return hasil;
}

/** A saved CP-TP-ATP as far as the mapping helpers care. */
export type CpItem = { data: unknown };

/** Number + title of the UNIT in the ATP that holds a TP, matched by TP number. */
export function unitUntukTp(dataCp: unknown, tpText: string): { nomor: string; judul: string } | null {
  const nomor = nomorTp(tpText);
  if (!nomor || !isObj(dataCp)) return null;
  for (const semester of objs(dataCp.atp)) {
    for (const unit of objs(semester.unit)) {
      for (const baris of objs(unit.baris)) {
        if (nomorTp(baris.tujuan) !== nomor) continue;
        const namaUnit = str(unit.nama);
        const cocok = POLA_UNIT_NOMOR.exec(namaUnit);
        if (cocok) return { nomor: cocok[1], judul: namaUnit.replace(POLA_UNIT_PREFIX, "").trim() };
      }
    }
  }
  return null;
}

/** Search several saved CP-TP-ATP: an exact TP text match wins, then the TP number alone (numbering may overlap). */
function cari<T>(daftarCp: CpItem[], tpText: string, ambil: (data: unknown) => T | null): T | null {
  const tp = tpText.trim();
  if (!tp) return null;
  for (const item of daftarCp) {
    if (daftarTp(item.data).includes(tp)) {
      const r = ambil(item.data);
      if (r) return r;
    }
  }
  for (const item of daftarCp) {
    const r = ambil(item.data);
    if (r) return r;
  }
  return null;
}

export const cariBabUntukTp = (daftarCp: CpItem[], tpText: string) => cari(daftarCp, tpText, (d) => unitUntukTp(d, tpText));

/** Semester ("I (Ganjil)") for a TP text among saved CP-TP-ATP; falls back to the odd semester. */
export function cariSemesterUntukTp(daftarCp: CpItem[], tpText: string): string {
  return cari(daftarCp, tpText, (d) => infoTp(d)[tpText.trim()]?.semester || byNumber(d, tpText)) ?? DEFAULT_SEMESTER;
}

function byNumber(data: unknown, tpText: string): string | null {
  const nomor = nomorTp(tpText);
  if (!nomor) return null;
  for (const info of Object.entries(infoTp(data))) if (nomorTp(info[0]) === nomor && info[1].semester) return info[1].semester;
  return null;
}

/** Overwrite the BAB title with the UNIT title of the CP-TP-ATP; the AI's own title (topic of this TP) is kept as "materi_bab". */
function paksaBab(data: Obj, k: PerangkatKonteks) {
  const lama = str(data.judul_bab).replace(POLA_JUDUL_BAB, "").trim();
  if (lama) data.materi_bab = lama;
  const judulUnit = str(k.bab_judul);
  data.judul_bab = judulUnit ? `BAB ${k.bab_nomor} : ${judulUnit}` : `BAB ${k.bab_nomor}`;
}

/* ------------------------------------------------------------------ titles and file names */
/** Short title for one row of the saved library. */
export function judulPerangkat(jenis: DocKind, data: unknown, k: Konteks | PerangkatKonteks): string {
  const d = obj(data);
  if (jenis === "modul_ajar" && str(d.judul_bab)) {
    let judul = str(d.judul_bab);
    if (str(d.materi_bab)) judul += ` — ${str(d.materi_bab)}`;
    return judul;
  }
  if ((jenis === "materi_guru" || jenis === "materi_siswa") && str(d.judul)) return str(d.judul);
  const kelas = str((k as PerangkatKonteks).kelas);
  const judul = [JENIS[jenis], str(k.mata_pelajaran), kelas ? `Kelas ${kelas}` : ""].filter(Boolean).join(" ");
  return jenis === "cp_tp_atp" && (k as PerangkatKonteks).impor ? `${judul} (Diunggah)` : judul;
}

const NAMA_BERKAS: Record<DocKind, string> = { cp_tp_atp: "CP-TP-ATP", modul_ajar: "Modul_Ajar", materi_guru: "Materi_Lengkap_Guru", materi_siswa: "Materi_Siswa" };

const amanNama = (s: string) => s.replace(/[^\p{L}\p{N}_.\-]+/gu, "_").replace(/^_+|_+$/g, "");

export function namaBerkas(jenis: DocKind, k: Konteks): string {
  const potong = [NAMA_BERKAS[jenis], str(k.mata_pelajaran), str(k.kelas) ? `Kelas_${str(k.kelas)}` : "", str(k.tahun_ajaran)];
  const nama = amanNama(potong.filter((p) => p.trim()).join("_"));
  return `${nama || "Dokumen"}.docx`;
}

const BATAS_NAMA_BERKAS = 120;

/** Download name from the library title, so the file is easy to recognise. Falls back to `namaBerkas`. */
export function namaBerkasDariJudul(judul: string, jenis: DocKind, k: Konteks = {}): string {
  const dasar = amanNama(judul.trim());
  if (!dasar) return namaBerkas(jenis, k);
  return `${amanNama(dasar.slice(0, BATAS_NAMA_BERKAS)) || "Dokumen"}.docx`;
}

/* ------------------------------------------------------------------ on-screen summary */
export function ringkas(jenis: DocKind, dataIn: unknown, k: PerangkatKonteks = {}): string {
  const data = obj(dataIn);
  if (jenis === "materi_guru" || jenis === "materi_siswa") return ringkasMateri(jenis, data);

  if (jenis === "cp_tp_atp") {
    const baris = [`Mata pelajaran: ${str(data.mata_pelajaran)}`, ""];
    for (const item of objs(data.cp_tp)) {
      baris.push(`[${str(item.no)}] ${str(item.elemen)} — ${str(item.subelemen)}`);
      for (const tp of strs(item.tujuan_pembelajaran)) baris.push(`    ${tp}`);
      baris.push("");
    }
    for (const semester of objs(data.atp)) {
      baris.push(`${str(semester.semester)} — ${str(semester.keterangan)}`);
      for (const unit of objs(semester.unit)) {
        baris.push(`  ${str(unit.nama)}`);
        for (const b of objs(unit.baris)) baris.push(`    ${str(b.urutan)}. ${str(b.tujuan)} (${str(b.alokasi)})`);
      }
      baris.push(`  ${str(semester.total)}`, "");
    }
    return baris.join("\n");
  }

  // modul_ajar
  const baris: string[] = [];
  if (k.template_nama) baris.push(`Template: ${k.template_nama}`, "");
  baris.push(str(data.judul_bab));
  if (str(data.materi_bab)) baris.push(`Materi: ${str(data.materi_bab)}`);
  baris.push("");
  baris.push(...strs(data.tujuan_pembelajaran));
  baris.push("", `Topik: ${str(data.topik_kontekstual)}`, "");
  for (const temu of objs(data.pertemuan)) {
    baris.push(str(temu.judul));
    for (const [kunci, label] of [["pendahuluan", "Pendahuluan"], ["inti", "Inti"], ["penutup", "Penutup"]] as const) {
      const bagian = obj(temu[kunci]);
      baris.push(`  ${label} (${str(bagian.durasi)})`);
      for (const b of objs(bagian.butir)) baris.push(`    • ${str(b.nama)}: ${str(b.uraian).slice(0, 120)}`);
    }
    baris.push("");
  }
  baris.push(`Rubrik: ${arr(obj(data.rubrik).aspek).length} aspek`);
  const tes = obj(data.tes);
  baris.push(`Tes: ${arr(tes.pilihan_ganda).length} pilihan ganda, ${arr(tes.uraian).length} uraian`);
  return baris.join("\n");
}

/**
 * Turn a materi_guru/materi_siswa result into Markdown, in the same shape the AI Generator's "Create Lessons &
 * Summaries" produces (intro paragraph, "## " sections, an "Istilah Penting" table, a "Rangkuman" list) so a
 * Lesson looks the same in the library whether it came from here or from the AI Generator. The LKPD worksheet
 * is left out: its multiple-choice part belongs in the question bank (see importQuestionsToBank).
 */
export function materiKeMarkdown(jenis: "materi_guru" | "materi_siswa", data: Obj): string {
  const guru = jenis === "materi_guru";
  const baris: string[] = [];
  if (str(data.pengantar)) baris.push(str(data.pengantar), "");

  for (const bagian of objs(data.bagian)) {
    if (str(bagian.judul)) baris.push(`## ${str(bagian.judul)}`, "");
    if (guru) {
      for (const p of strs(bagian.paragraf)) baris.push(p, "");
      for (const poin of strs(bagian.poin_penting)) baris.push(`- ${poin}`);
      if (strs(bagian.poin_penting).length) baris.push("");
    } else {
      for (const poin of strs(bagian.poin)) baris.push(`- ${poin}`);
      baris.push("");
    }
  }

  const istilah = objs(data.istilah_penting);
  if (istilah.length) {
    baris.push("## Istilah Penting", "", "| Istilah | Arti |", "| --- | --- |");
    for (const i of istilah) baris.push(`| ${str(i.istilah)} | ${str(i.arti)} |`);
    baris.push("");
  }

  const rangkuman = strs(data.rangkuman);
  if (rangkuman.length) {
    baris.push("## Rangkuman", "");
    for (const r of rangkuman) baris.push(`- ${r}`);
  }

  return baris.join("\n").trim();
}

export type PertemuanJurnal = { value: string; label: string; materi: string; kegiatan: string };

/**
 * Each "pertemuan" (meeting) of a Modul Ajar, reshaped for the teaching journal: a plain-text "materi
 * yang diajarkan" (the BAB and this meeting's topic) and a short "kegiatan pembelajaran" summary — one
 * compact line per pendahuluan/inti/penutup, activity names only (not the full step-by-step description) —
 * a teacher can drop straight into a journal entry, then adjust to what actually happened in class.
 */
export function pertemuanUntukJurnal(data: Obj): PertemuanJurnal[] {
  const bab = str(data.judul_bab);

  return objs(data.pertemuan).map((p, i) => {
    const topik = str(p.topik);
    const materi = [bab, topik].filter(Boolean).join(" — ") || `Pertemuan ${i + 1}`;

    const seksi = (label: string, kunci: string): string => {
      const s = obj(p[kunci]);
      const durasi = str(s.durasi);
      const nama = objs(s.butir)
        .map((b) => str(b.nama) || str(b.uraian))
        .filter(Boolean);
      if (!nama.length) return "";
      return `${label}${durasi ? ` (${durasi})` : ""}: ${nama.join(", ")}.`;
    };

    const kegiatan = [seksi("Pendahuluan", "pendahuluan"), seksi("Inti", "inti"), seksi("Penutup", "penutup")].filter(Boolean).join("\n");
    const label = str(p.judul) || `Pertemuan ${i + 1}`;
    return { value: String(i), label, materi, kegiatan };
  });
}

function ringkasMateri(jenis: "materi_guru" | "materi_siswa", data: Obj): string {
  const guru = jenis === "materi_guru";
  const baris = [str(data.judul), ""];
  if (str(data.pengantar)) baris.push(str(data.pengantar), "");
  for (const bagian of objs(data.bagian)) {
    baris.push(str(bagian.judul));
    if (guru) {
      for (const p of strs(bagian.paragraf)) baris.push(`  ${p.slice(0, 160)}`);
      for (const poin of strs(bagian.poin_penting)) baris.push(`  • ${poin}`);
    } else {
      for (const poin of strs(bagian.poin)) baris.push(`  • ${poin}`);
    }
    baris.push("");
  }
  const istilah = objs(data.istilah_penting);
  if (istilah.length) {
    baris.push("Istilah Penting:");
    for (const i of istilah) baris.push(`  • ${str(i.istilah)}: ${str(i.arti)}`);
    baris.push("");
  }
  const rangkuman = strs(data.rangkuman);
  if (rangkuman.length) {
    baris.push("Rangkuman:");
    for (const r of rangkuman) baris.push(`  • ${r}`);
    baris.push("");
  }
  const lkpd = obj(data.lkpd);
  if (Object.keys(lkpd).length) {
    baris.push(`LKPD: ${str(lkpd.judul)}`);
    baris.push(`  ${arr(lkpd.pilihan_ganda).length} soal pilihan ganda, ${arr(lkpd.uraian).length} soal uraian (HOTS, ${guru ? "dengan" : "tanpa"} kunci jawaban)`);
  }
  return baris.join("\n");
}
