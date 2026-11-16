/** Exams (Ujian): sections, composition & weights. Pure helpers, safe for both server and client code. */
import type { QuestionType } from "./questions";

/** The five question forms of an Indonesian school exam, in their usual order. */
export const EXAM_SECTIONS = ["pg", "pgk", "jodoh", "isian", "uraian"] as const;
export type ExamSection = (typeof EXAM_SECTIONS)[number];

type SectionMeta = {
  /** English UI label (translated with t()). */
  label: string;
  /** Indonesian name used in the generated documents. */
  nama: string;
  /** The bank question type that fills this section. */
  type: QuestionType;
  /** "JENIS" number in the CBT upload template. */
  jenis: number;
};

export const SECTION_META: Record<ExamSection, SectionMeta> = {
  pg: { label: "Multiple choice", nama: "Pilihan Ganda", type: "multiple_choice", jenis: 1 },
  pgk: { label: "Complex multiple choice", nama: "Pilihan Ganda Kompleks", type: "multiple_select", jenis: 2 },
  jodoh: { label: "Matching", nama: "Menjodohkan", type: "matching", jenis: 3 },
  isian: { label: "Short answer", nama: "Isian Singkat", type: "fill_in", jenis: 4 },
  uraian: { label: "Essay", nama: "Uraian / Essai", type: "essay", jenis: 5 },
};

export const sectionForType = (type: QuestionType): ExamSection | null => EXAM_SECTIONS.find((s) => SECTION_META[s].type === type) ?? null;

export type SectionPlan = { count: number; weight: number };
export type ExamComposition = Record<ExamSection, SectionPlan> & {
  /** Number of answer choices in a multiple-choice question (A-D or A-E). */
  pgOptions: 4 | 5;
};

/** Default plan: the school's usual PSAT weights (short answer and essay are kept, but empty). */
export const DEFAULT_COMPOSITION: ExamComposition = {
  pg: { count: 20, weight: 50 },
  pgk: { count: 4, weight: 25 },
  jodoh: { count: 16, weight: 25 },
  isian: { count: 0, weight: 0 },
  uraian: { count: 0, weight: 0 },
  pgOptions: 4,
};

export const totalCount = (c: ExamComposition) => EXAM_SECTIONS.reduce((n, s) => n + c[s].count, 0);
export const totalWeight = (c: ExamComposition) => EXAM_SECTIONS.reduce((n, s) => n + c[s].weight, 0);

/** Identity printed on the exam documents. All optional free text. */
export type ExamInfo = {
  jenis_ujian?: string;
  mata_pelajaran?: string;
  kelas?: string;
  fase?: string;
  semester?: string;
  tahun_ajaran?: string;
  nama_sekolah?: string;
  nama_guru?: string;
  alokasi_waktu?: string;
};

export const EXAM_TYPES = ["PSAT", "PSAS", "PTS", "Sumatif Akhir Semester", "Sumatif Akhir Tahun", "Ulangan Harian"];
export const COGNITIVE_LEVELS = ["C1", "C2", "C3", "C4", "C5", "C6"];

/**
 * Operational verbs (KKO, revised Bloom) per cognitive level, each verb in one level only.
 * The first one is used when switching to that level; the teacher can pick any other.
 */
export const LEVEL_VERBS: Record<string, string[]> = {
  C1: ["menyebutkan", "mengidentifikasi", "mengenali", "menunjukkan", "menjodohkan", "memasangkan", "menuliskan", "mendefinisikan", "menamai", "mendaftar", "menyatakan", "mengingat", "mencocokkan", "menandai", "mengutip", "mencatat", "menghafal", "mengenal", "menamakan", "melabeli"],
  C2: ["menjelaskan", "mendeskripsikan", "membedakan", "mengklasifikasikan", "mengelompokkan", "menggolongkan", "menguraikan", "menafsirkan", "menginterpretasikan", "mencontohkan", "merangkum", "meringkas", "menerangkan", "mengartikan", "memaparkan", "menceritakan", "memperkirakan", "memahami"],
  C3: ["menentukan", "menerapkan", "menggunakan", "mendemonstrasikan", "memainkan", "menyanyikan", "membaca", "menghitung", "melengkapi", "mengurutkan", "menyelesaikan", "mempraktikkan", "memperagakan", "menirukan", "menyesuaikan", "melaksanakan", "melakukan", "mengimplementasikan", "mengoperasikan"],
  C4: ["menganalisis", "membandingkan", "menelaah", "menghubungkan", "mengaitkan", "mengkategorikan", "mengorganisasikan", "menemukan", "mendeteksi", "menguji", "menyeleksi", "menelusuri", "memerinci", "mendiagnosis", "mengkorelasikan", "memecahkan", "menstrukturkan"],
  C5: ["menilai", "mengevaluasi", "menyimpulkan", "mengkritik", "mengkritisi", "mengapresiasi", "memutuskan", "mempertimbangkan", "membuktikan", "memilih", "merekomendasikan", "memprediksi", "membenarkan", "menyanggah", "mempertahankan", "mengukur", "memvalidasi"],
  C6: ["merancang", "menciptakan", "menyusun", "mengkreasikan", "mengarang", "membuat", "menggubah", "mengaransemen", "mengimprovisasi", "merencanakan", "mengembangkan", "merumuskan", "memodifikasi", "mengkombinasikan", "memadukan", "menggabungkan", "mendesain", "memproduksi", "mengomposisi"],
};
const ALL_VERBS = new Set(Object.values(LEVEL_VERBS).flat());

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Where the indicator's operational verb is (within its first few words), or null.
 * A first word shaped like a "me-…-kan" verb counts too, so verbs missing from the list still get swapped.
 */
function findVerb(words: string[]): { i: number; pre: string; word: string; post: string } | null {
  let first: { i: number; pre: string; word: string; post: string } | null = null;
  for (let i = 0, seen = 0; i < words.length && seen < 6; i++) {
    if (!words[i].trim()) continue;
    seen++;
    const m = /^([^\p{L}]*)(\p{L}+)(.*)$/u.exec(words[i]);
    if (!m) continue;
    const hit = { i, pre: m[1], word: m[2], post: m[3] };
    if (ALL_VERBS.has(m[2].toLowerCase())) return hit;
    if (seen === 1 && /^me\p{L}{3,}kan$/iu.test(m[2])) first = hit;
  }
  return first;
}

/** The indicator's operational verb in lower case, or "" when none is found. */
export function indicatorVerb(indikator: string): string {
  return findVerb(indikator.split(/(\s+)/))?.word.toLowerCase() ?? "";
}

/**
 * Put `verb` in the indicator: it replaces the current operational verb (keeping its capitalisation),
 * or starts the indicator when it has none.
 */
export function withVerb(indikator: string, verb: string): string {
  const words = indikator.split(/(\s+)/);
  const f = findVerb(words);
  if (f) {
    words[f.i] = f.pre + (f.word[0] === f.word[0].toUpperCase() ? capital(verb) : verb) + f.post;
    return words.join("");
  }
  const rest = indikator.trim();
  return rest ? `${capital(verb)} ${rest.charAt(0).toLowerCase()}${rest.slice(1)}` : `${capital(verb)} `;
}

/**
 * Fit an indicator to a new cognitive level by swapping its operational verb for the level's main verb.
 * Unchanged when the verb already belongs to that level, or when no known verb is found.
 */
export function indicatorForLevel(indikator: string, level: string): string {
  const verbs = LEVEL_VERBS[level];
  const verb = indicatorVerb(indikator);
  if (!verbs || !verb || verbs.includes(verb)) return indikator;
  return withVerb(indikator, verbs[0]);
}

/**
 * Points of one question in each section so that the sections add up to their weight:
 * a section of `n` questions worth `w`% gives each question w/n points. Sections without questions give nothing.
 */
export function pointsPerQuestion(c: ExamComposition, filled: Record<ExamSection, number>): Record<ExamSection, number> {
  const out = {} as Record<ExamSection, number>;
  for (const s of EXAM_SECTIONS) out[s] = filled[s] > 0 ? Math.round((c[s].weight / filled[s]) * 10000) / 10000 : 0;
  return out;
}

/** Letter of choice `i` (A, B, C…). */
export const letter = (i: number) => String.fromCharCode(65 + i);

/** Parse whatever is stored into a full composition (missing parts fall back to 0 / the defaults). */
export function readComposition(v: unknown): ExamComposition {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_COMPOSITION } as ExamComposition;
  for (const s of EXAM_SECTIONS) {
    const p = (o[s] && typeof o[s] === "object" ? o[s] : {}) as Record<string, unknown>;
    out[s] = { count: Math.max(0, Math.round(Number(p.count) || 0)), weight: Math.max(0, Number(p.weight) || 0) };
  }
  out.pgOptions = o.pgOptions === 5 ? 5 : 4;
  return out;
}
