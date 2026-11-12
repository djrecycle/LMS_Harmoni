/** AI prompts for exams: the blueprint (kisi-kisi) from the chosen TP, then one question per blueprint row. */
import { ambilJson } from "./ai-json";
import { COGNITIVE_LEVELS, EXAM_SECTIONS, SECTION_META, type ExamComposition, type ExamInfo, type ExamSection } from "./exam";
import { notationError, type Notation } from "./notation";
import { formatAnswerKey, questionInputSchema, type AnswerKey, type QuestionInput } from "./questions";

export const EXAM_SYSTEM = `Anda adalah guru dan penyusun soal asesmen sumatif Kurikulum Merdeka yang berpengalaman di Indonesia.
Anda menulis kisi-kisi dan butir soal yang valid, jelas, sesuai jenjang siswa, dan berbahasa Indonesia baku.
Balas HANYA dengan JSON yang diminta, tanpa teks lain dan tanpa blok kode.`;

const identitas = (info: ExamInfo) =>
  [
    info.mata_pelajaran && `- Mata pelajaran: ${info.mata_pelajaran}`,
    info.kelas && `- Kelas: ${info.kelas}`,
    info.fase && `- Fase: ${info.fase}`,
    info.semester && `- Semester: ${info.semester}`,
    info.jenis_ujian && `- Jenis asesmen: ${info.jenis_ujian}`,
  ]
    .filter(Boolean)
    .join("\n");

/* ------------------------------------------------------------------ kisi-kisi */

export type KisiRow = { section: ExamSection; tp: string; materi: string; indikator: string; level: string };

const BENTUK_KISI: Record<ExamSection, string> = {
  pg: "pilihan ganda (satu jawaban benar)",
  pgk: "pilihan ganda kompleks (lebih dari satu jawaban benar)",
  jodoh: "menjodohkan (tabel Benar/Salah, Ya/Tidak, atau menjodohkan pernyataan dengan jawaban)",
  isian: "isian singkat (jawaban satu kata/frasa/angka)",
  uraian: "uraian/essai (jawaban berupa penjelasan)",
};

export function kisiPrompt(info: ExamInfo, tps: string[], c: ExamComposition, catatan: string): string {
  const rencana = EXAM_SECTIONS.filter((s) => c[s].count > 0)
    .map((s) => `- "${s}" = ${BENTUK_KISI[s]}: TEPAT ${c[s].count} baris`)
    .join("\n");
  return `Susun KISI-KISI soal ujian.

IDENTITAS
${identitas(info)}

TUJUAN PEMBELAJARAN (TP) YANG DIUJIKAN
${tps.map((tp, i) => `${i + 1}. ${tp}`).join("\n")}

KOMPOSISI SOAL (kode bentuk = jumlah baris yang WAJIB dibuat)
${rencana}
${catatan ? `\nCATATAN GURU\n${catatan}\n` : ""}
ATURAN
- Satu baris kisi-kisi = satu butir soal. Jumlah baris per bentuk HARUS persis seperti komposisi di atas.
- Sebarkan baris ke semua TP secara proporsional; jangan ada TP yang tidak terwakili bila jumlah soal mencukupi.
- "tp": salin PERSIS salah satu teks TP di atas (boleh tanpa nomor "TP x.").
- "materi": materi pokok yang diuji, singkat (2-6 kata), mis. "Pernapasan diafragma".
- "indikator": indikator soal yang terukur, diawali kata kerja operasional, mis. "Menjelaskan teknik bernapas saat bernyanyi".
- "level": level kognitif ${COGNITIVE_LEVELS.join("/")}. Utamakan C1-C3 sesuai jenjang, sertakan sebagian kecil C4 (HOTS). Untuk bentuk uraian gunakan C3-C5.
- Hindari indikator yang sama persis berulang; tiap baris menguji hal yang berbeda.
- Untuk bentuk "jodoh": variasikan modelnya. Kira-kira separuh baris berupa penilaian pernyataan Benar/Salah atau Ya/Tidak (indikator mis. "Menentukan benar atau salah pernyataan tentang ..."), sisanya menjodohkan pernyataan dengan jawaban (indikator mis. "Menjodohkan ... dengan ...").
- Urutkan baris: semua "pg", lalu "pgk", "jodoh", "isian", "uraian".

FORMAT JSON
{"baris": [{"bentuk": "pg", "tp": "...", "materi": "...", "indikator": "...", "level": "C2"}]}`;
}

/** Parse the AI blueprint and keep exactly the planned number of rows per section (extra rows are dropped). */
export function parseKisi(text: string, c: ExamComposition, tps: string[]): KisiRow[] {
  const raw = ambilJson<{ baris?: unknown }>(text);
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.baris) ? raw.baris : [];
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const bySection = new Map<ExamSection, KisiRow[]>(EXAM_SECTIONS.map((s) => [s, []]));
  for (const r of list as Record<string, unknown>[]) {
    const section = EXAM_SECTIONS.find((s) => s === str(r?.bentuk).toLowerCase());
    if (!section) continue;
    const rows = bySection.get(section)!;
    if (rows.length >= c[section].count) continue;
    const level = str(r.level).toUpperCase();
    rows.push({
      section,
      tp: matchTp(str(r.tp), tps),
      materi: str(r.materi).slice(0, 300),
      indikator: str(r.indikator).slice(0, 600),
      level: COGNITIVE_LEVELS.includes(level) ? level : "",
    });
  }
  return EXAM_SECTIONS.flatMap((s) => bySection.get(s)!);
}

/** The chosen TP the AI meant (it may drop the "TP 1." prefix or shorten it); the AI text itself when none fits. */
function matchTp(tp: string, tps: string[]): string {
  if (!tp) return tps[0] ?? "";
  const norm = (s: string) => s.toLowerCase().replace(/^tp\s*[\d.]+\s*[-.:]?\s*/i, "").replace(/\s+/g, " ").trim();
  const n = norm(tp);
  return tps.find((x) => norm(x) === n) ?? tps.find((x) => norm(x).includes(n) || n.includes(norm(x))) ?? tp;
}

/* ------------------------------------------------------------------ questions */

export type SoalTarget = { no: number; section: ExamSection; tp: string; materi: string; indikator: string; level: string };

const ATURAN_BENTUK: Record<ExamSection, (c: ExamComposition) => string> = {
  pg: (c) => `PILIHAN GANDA: "opsi" berisi TEPAT ${c.pgOptions} pilihan, satu benar. "kunci" = indeks pilihan yang benar (0 = A). Pengecoh harus masuk akal dan sejenis. Sebarkan posisi kunci secara merata (A, B, C, D${c.pgOptions === 5 ? ", E" : ""}), jangan selalu di posisi yang sama.`,
  pgk: () => `PILIHAN GANDA KOMPLEKS: "opsi" berisi 4 pilihan berupa pernyataan, TEPAT 2 yang benar. "kunci" = array indeks pilihan yang benar, mis. [0, 2]. Kalimat pertanyaan menyiratkan jawaban lebih dari satu, mis. "... adalah .... (jawaban lebih dari satu)".`,
  jodoh: () => `MENJODOHKAN: pilih salah satu model sesuai indikator:
  (a) Benar/Salah: "kolom" = ["Benar", "Salah"], pertanyaan diakhiri "Tentukan Benar atau Salah pada setiap pernyataan berikut!";
  (b) Ya/Tidak: "kolom" = ["Ya", "Tidak"], pertanyaan diakhiri "Tentukan Ya atau Tidak pada setiap pernyataan berikut!";
  (c) menjodohkan: "kolom" berisi 4 jawaban, pertanyaan diakhiri "Jodohkan pernyataan berikut dengan jawaban yang tepat!".
  Ikuti indikator kisi-kisi: indikator "Menentukan benar atau salah ..." memakai model (a), "... ya atau tidak ..." model (b), "Menjodohkan ..." model (c).
  "baris" berisi TEPAT 4 pernyataan. "pasangan" = array indeks kolom yang cocok untuk tiap baris (panjang 4). Pada model (c) tiap jawaban dipakai satu kali. Pada model (a)/(b) campurkan jawaban benar dan salah.`,
  isian: () => `ISIAN SINGKAT: jawaban berupa satu kata/frasa/angka. "jawaban" = array jawaban yang diterima (variasi penulisan yang sah).`,
  uraian: () => `URAIAN: pertanyaan meminta penjelasan/analisis. "jawaban_model" = contoh jawaban lengkap beserta pedoman penskoran singkat.`,
};

const CONTOH: Record<ExamSection, string> = {
  pg: `{"no": 1, "pertanyaan": "Dina sering kehabisan napas ketika menyanyi lagu \\"Tanah Airku\\". Ia menarik napas pendek dari dada.\\nHal yang sebaiknya Dina lakukan agar napasnya lebih panjang adalah ....", "opsi": ["menggunakan pernapasan dada", "menggunakan pernapasan perut (diafragma)", "menahan napas saat bernyanyi", "menarik napas lewat mulut saja"], "kunci": 1, "pembahasan": "..."}`,
  pgk: `{"no": 21, "pertanyaan": "Rina sedang berlatih vokal untuk lomba menyanyi solo. Agar penampilannya maksimal, hal-hal yang perlu diperhatikan oleh Rina adalah .... (jawaban lebih dari satu)", "opsi": ["menggunakan pernapasan diafragma", "menjaga artikulasi agar jelas", "menegangkan bahu agar suara kuat", "menahan napas saat bernyanyi"], "kunci": [0, 1], "pembahasan": "..."}`,
  jodoh: `{"no": 33, "pertanyaan": "Andi sering tidak tepat nada saat menyanyi dan suaranya turun-naik tidak stabil.\\nTentukan Benar atau Salah pada setiap pernyataan berikut!", "baris": ["Andi belum menguasai intonasi dengan baik", "Latihan pernapasan dapat membantu kestabilan suara", "Artikulasi yang baik otomatis membuat nada tepat", "Intonasi dapat dilatih dengan menyanyikan tangga nada"], "kolom": ["Benar", "Salah"], "pasangan": [0, 0, 1, 0], "pembahasan": "..."}`,
  isian: `{"no": 41, "pertanyaan": "Tanda birama 4/4 berarti setiap birama berisi ... ketukan.", "jawaban": ["4", "empat"], "pembahasan": "..."}`,
  uraian: `{"no": 45, "pertanyaan": "Jelaskan tiga hal yang perlu diperhatikan saat bernyanyi solo agar penampilan maksimal!", "jawaban_model": "...", "pembahasan": "..."}`,
};

/** How the AI writes notation, shared by question writing and the image review. */
const ATURAN_GAMBAR = `GAMBAR (field "gambar", opsional)
Tambahkan gambar HANYA bila soal memang membutuhkan atau jauh lebih baik dengan gambar: membaca not balok (nama nada pada garis paranada, nilai not/tanda istirahat, tanda birama, pola irama, melodi, akor, tanda kunci, tanda kres/mol) atau membaca not angka (nada, ketukan, oktaf, pola irama). Soal konsep, istilah, sejarah, fungsi, atau sikap TIDAK diberi gambar.
- Not balok: {"jenis": "not_balok", "notasi": "..."}
  Format: token dipisah spasi. Header opsional: time=3/4 key=G clef=bass (bawaan 4/4, C, treble).
  Nada = huruf + oktaf (C4 = do tengah, F#4, Bb3) lalu /w /h /q /8 /16 (w=4 ketuk, h=2, q=1, 8=1/2, 16=1/4); titik di akhir = not bertitik (G4/h.).
  Akor: C4+E4+G4/h. Tanda istirahat: R/q. Label di bawah not: C4/q[A] (pakai kurung siku, JANGAN tanda kutip). Garis birama: | ; akhir lagu: ||.
  Contoh: "time=4/4 | C4/q D4/q E4/q F4/q | G4/h R/h ||"
- Not angka: {"jenis": "not_angka", "notasi": "..."}
  Format: header opsional do=G time=4/4. Angka 1-7, 0 = tanda diam, . = tahan satu ketuk.
  Oktaf tinggi 1' , oktaf rendah 5, ; nada naik 4# , turun 7b ; setengah ketuk 6_ , seperempat ketuk 6__ ; label 1[A] (hanya pada angka, bukan pada titik). Garis birama | dan ||.
  Contoh: "do=C time=4/4 | 1 2 3 4 | 5 . 5 . | 6_ 6_ 5 0 5 | 1' . . . ||"
- Gambar lain yang tidak bisa ditulis sebagai notasi (foto alat musik, sikap tubuh, dsb.): {"jenis": "foto", "deskripsi": "gambar yang perlu disiapkan guru"}. Gunakan sangat jarang: guru harus mengunggahnya sendiri.
JANGAN PERNAH menulis kode notasi (seperti 1_, 5', 6__, C4/q, R/h) di pertanyaan, pilihan, atau pernyataan: siswa tidak mengenal kode itu. Bila pilihan jawabannya berupa notasi, gambar semua pilihan dalam satu notasi dengan label A, B, C, D di bawahnya, lalu pilihan jawaban berisi huruf label itu.
Bila memakai gambar: pertanyaan merujuk gambar ("Perhatikan notasi berikut!") dan TIDAK menulis ulang notasinya di teks. Untuk menunjuk not tertentu beri label huruf di bawahnya (C4/q[A], 5[B]) dan pilihan jawaban merujuk label itu. Hitung ketukan setiap birama dengan teliti dan pastikan kunci jawaban benar menurut notasi yang digambar.`;

export function soalPrompt(info: ExamInfo, c: ExamComposition, section: ExamSection, targets: SoalTarget[], catatan: string, gambar = true): string {
  return `Tulis butir soal ujian berbentuk ${SECTION_META[section].nama.toUpperCase()} sesuai kisi-kisi berikut. Satu baris kisi-kisi = satu soal.

IDENTITAS
${identitas(info)}

KISI-KISI
${targets.map((t) => `No ${t.no} | TP: ${t.tp} | Materi: ${t.materi} | Indikator: ${t.indikator} | Level: ${t.level || "-"}`).join("\n")}
${catatan ? `\nCATATAN GURU\n${catatan}\n` : ""}
ATURAN UMUM
- Soal harus mengukur indikator dan sesuai level kognitifnya. Level C3 ke atas memakai stimulus/kasus (cerita singkat tokoh siswa, situasi latihan musik, dsb.).
- Bahasa jelas, sesuai usia siswa, tidak ambigu, tanpa petunjuk jawaban. Pertanyaan pilihan diakhiri "....".
- Jangan gunakan pilihan "semua benar"/"semua salah". Jangan memakai gambar/audio (soal harus bisa dipahami dari teks).
- Panjang dan gaya semua pilihan jawaban setara; kunci jawaban tidak boleh selalu pilihan yang paling panjang atau paling rinci.
- "pembahasan": penjelasan singkat mengapa jawabannya benar. Rujuk pilihan dengan hurufnya (A, B, C, …) atau isinya, BUKAN nomor indeks seperti (0) atau (1), dan tanpa kode notasi.
- ${ATURAN_BENTUK[section](c)}
${gambar ? `\n${ATURAN_GAMBAR}\nContoh soal bergambar: {"no": 5, "pertanyaan": "Perhatikan notasi berikut!\\nNilai ketukan not yang diberi label A adalah ....", "gambar": {"jenis": "not_balok", "notasi": "time=4/4 | C4/h[A] E4/q G4/q ||"}, "opsi": ["1 ketukan", "2 ketukan", "3 ketukan", "4 ketukan"], "kunci": 1, "pembahasan": "..."}\n` : "- Jangan memakai gambar. Jangan menulis kode notasi (seperti 1_, C4/q) di teks soal maupun pilihan."}
FORMAT JSON (field "no" sama dengan nomor kisi-kisi)
{"soal": [${CONTOH[section]}]}`;
}

/** Turn one AI question into a validated bank question for its blueprint row; null when it does not validate. */
/** The image the AI asked for: notation the app can draw, or a picture the teacher has to add. Invalid notation gives "invalid". */
export function readGambar(raw: unknown): { notation: Notation | null; imageHint: string | null } | "invalid" {
  const g = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  const jenis = typeof g?.jenis === "string" ? g.jenis.toLowerCase() : "";
  if (jenis === "not_balok" || jenis === "not_angka") {
    const notation: Notation = { kind: jenis === "not_balok" ? "staff" : "angka", text: typeof g?.notasi === "string" ? g.notasi.trim().slice(0, 2000) : "" };
    return notation.text && !notationError(notation) ? { notation, imageHint: null } : "invalid";
  }
  if (jenis === "foto" && typeof g?.deskripsi === "string" && g.deskripsi.trim()) return { notation: null, imageHint: g.deskripsi.trim().slice(0, 300) };
  return { notation: null, imageHint: null };
}

export function toExamQuestion(raw: Record<string, unknown>, section: ExamSection, t: SoalTarget, meta: { kelas: string | null; semester: 1 | 2 | null; pgOptions: number }): QuestionInput | null {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  // A question written around a picture that cannot be drawn makes no sense: drop it (the row stays empty, to retry).
  const gambar = readGambar(raw.gambar);
  if (gambar === "invalid") return null;
  const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  /** A 0-based index, which the AI sometimes writes as a letter ("B"). */
  const idx = (v: unknown) => (typeof v === "string" && /^[A-Ha-h]$/.test(v.trim()) ? v.trim().toUpperCase().charCodeAt(0) - 65 : Number(v));
  const ints = (v: unknown) => (Array.isArray(v) ? v.map(idx).filter((n) => Number.isInteger(n)) : []);
  const base = {
    prompt: str(raw.pertanyaan),
    explanation: str(raw.pembahasan) || null,
    topic: t.tp.slice(0, 300) || null,
    level: t.level || null,
    kelas: meta.kelas,
    semester: meta.semester,
    points: 1,
    mediaKey: null,
    notation: gambar.notation,
    imageHint: gambar.imageHint,
  };
  let candidate: unknown;
  switch (section) {
    case "pg": {
      const options = strs(raw.opsi).slice(0, meta.pgOptions);
      candidate = { ...base, type: "multiple_choice", answerType: "multiple_choice", options, answerKey: { kind: "multiple_choice", correct: idx(raw.kunci) } };
      break;
    }
    case "pgk": {
      const options = strs(raw.opsi).slice(0, 8);
      const correct = [...new Set(ints(Array.isArray(raw.kunci) ? raw.kunci : [raw.kunci]))];
      candidate = { ...base, type: "multiple_select", answerType: "multiple_select", options, answerKey: { kind: "multiple_select", correct } };
      break;
    }
    case "jodoh": {
      const rows = strs(raw.baris).slice(0, 12);
      const shuffled = shuffleColumns(strs(raw.kolom).slice(0, 8), ints(raw.pasangan).slice(0, rows.length));
      candidate = { ...base, type: "matching", answerType: "matching", options: shuffled.columns, matchRows: rows, answerKey: { kind: "matching", pairs: shuffled.pairs } };
      break;
    }
    case "isian":
      candidate = { ...base, type: "fill_in", answerType: "fill_in", options: null, answerKey: { kind: "fill_in", answer: strs(raw.jawaban).slice(0, 20) } };
      break;
    case "uraian":
      candidate = { ...base, type: "essay", answerType: "essay", options: null, answerKey: { kind: "essay", answer: str(raw.jawaban_model).slice(0, 3000) } };
      break;
  }
  const p = questionInputSchema.safeParse(candidate);
  return p.success ? p.data : null;
}

/**
 * One-to-one matching: the AI tends to list the answers in the same order as the statements (key 1-A, 2-B, 3-C…),
 * which gives the answer away. Shuffle the columns into an order that is not the plain one and remap the key.
 * Benar/Salah and Ya/Tidak columns (fewer columns than rows) keep their order.
 */
export function shuffleColumns(columns: string[], pairs: number[], random: () => number = Math.random): { columns: string[]; pairs: number[] } {
  const n = columns.length;
  const oneToOne = n >= 3 && pairs.length === n && new Set(pairs).size === n && pairs.every((p) => p >= 0 && p < n);
  if (!oneToOne) return { columns, pairs };
  let order = columns.map((_, i) => i);
  for (let tries = 0; tries < 20; tries++) {
    order = order.map((v) => ({ v, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.v);
    // Avoid the plain order and keys that are mostly still 1-A, 2-B…
    const fixed = pairs.filter((p, i) => order.indexOf(p) === i).length;
    if (fixed <= 1) break;
  }
  return { columns: order.map((i) => columns[i]), pairs: pairs.map((p) => order.indexOf(p)) };
}

/** The questions of one AI reply, by blueprint number. */
export function parseSoal(text: string): Map<number, Record<string, unknown>> {
  const raw = ambilJson<{ soal?: unknown }>(text);
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.soal) ? raw.soal : [];
  const out = new Map<number, Record<string, unknown>>();
  for (const r of list as Record<string, unknown>[]) {
    const no = Number(r?.no);
    if (Number.isInteger(no) && !out.has(no)) out.set(no, r);
  }
  return out;
}

/* ------------------------------------------------------------------ image review of existing questions */

export type ReviewTarget = { no: number; type: string; prompt: string; options: string[] | null; matchRows: string[] | null; answerKey: AnswerKey | null };

/** Ask which existing questions should get an image, and to draw it; the meaning and the key must stay the same. */
export function gambarPrompt(info: ExamInfo, targets: ReviewTarget[]): string {
  const list = targets
    .map((q) => {
      const key = q.answerKey ? formatAnswerKey(q.answerKey, q.options, (k) => k, q.matchRows) : "-";
      const opsi = q.options?.length ? `\n   Pilihan: ${q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join(" | ")}` : "";
      const baris = q.matchRows?.length ? `\n   Pernyataan: ${q.matchRows.map((r, i) => `${i + 1}. ${r}`).join(" | ")}` : "";
      return `No ${q.no} [${q.type}]: ${q.prompt}${opsi}${baris}\n   Kunci: ${key}`;
    })
    .join("\n");
  return `Periksa soal-soal ujian berikut dan tentukan soal mana yang cocok diberi gambar.

IDENTITAS
${identitas(info)}

SOAL
${list}

${ATURAN_GAMBAR}

ATURAN TAMBAHAN
- Kebanyakan soal TIDAK perlu gambar. Pilih hanya yang benar-benar terbantu oleh gambar.
- Untuk soal yang diberi gambar, boleh menulis ulang "pertanyaan" agar merujuk gambar, tetapi makna dan kunci TIDAK boleh berubah, dan gambar harus sesuai dengan kunci yang sudah ada. "pertanyaan" baru WAJIB tetap memuat kalimat tanya lengkap (mis. "Perhatikan notasi berikut!\\nNotasi yang bernilai satu ketukan adalah ...."), bukan hanya "Perhatikan notasi berikut!".
- Soal yang pilihannya berisi kode notasi (mis. "1_", "1 .") WAJIB diberi gambar: gambar setiap pilihan dengan label A, B, C, … (urutan sama), lalu kirim "opsi" baru berisi teks pengganti dengan JUMLAH dan URUTAN yang sama (mis. ["A", "B", "C", "D"]) sehingga kunci tetap benar. Selain kasus ini jangan kirim "opsi".
- Kirim juga "pembahasan" baru bila pembahasan lama tidak lagi cocok dengan gambar/pilihan baru (rujuk label huruf, tanpa kode notasi).
- Jangan sertakan soal yang tidak perlu gambar.

FORMAT JSON
{"soal": [{"no": 3, "pertanyaan": "Perhatikan notasi berikut!\\n...", "gambar": {"jenis": "not_balok", "notasi": "time=4/4 | C4/q D4/q E4/q F4/q ||"}, "opsi": ["A", "B", "C", "D"]}]}`;
}
