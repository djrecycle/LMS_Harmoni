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
