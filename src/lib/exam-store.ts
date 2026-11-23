/** Database access for exams. Every function takes the teacher id: a teacher only sees their own exams. */
import { and, asc, count, desc, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "./access";
import { EXAM_SECTIONS, sectionForType, type ExamSection } from "./exam";

const S = schema;

/** An AI job running longer than this is treated as lost (the server probably restarted). */
export const EXAM_JOB_STALE_MINUTES = 20;

export async function getOwnedExam(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [e] = await db.select().from(S.exam).where(and(eq(S.exam.id, id), eq(S.exam.teacherId, teacherId))).limit(1);
  return e ?? null;
}

/** Clear a job that has been running too long, so the teacher can start again. */
export async function expireStaleExamJob(examId: string) {
  const cutoff = new Date(Date.now() - EXAM_JOB_STALE_MINUTES * 60_000);
  await db
    .update(S.exam)
    .set({ job: null, jobError: "The AI job was interrupted (the server may have restarted). Please try again." })
    .where(and(eq(S.exam.id, examId), lt(S.exam.jobStartedAt, cutoff), inArray(S.exam.job, ["kisi", "soal", "ulang", "gambar", "periksa", "latihan", "latihan-periksa", "latihan-gambar", "latihan-ulang"])));
}

const sectionOrder = (s: ExamSection) => EXAM_SECTIONS.indexOf(s);

/** Blueprint rows in exam order (by section, then position), each with its bank question when one is linked. */
export async function listExamItems(examId: string) {
  const rows = await db
    .select({ item: S.examItem, question: S.question })
    .from(S.examItem)
    .leftJoin(S.question, eq(S.question.id, S.examItem.questionId))
    .where(eq(S.examItem.examId, examId))
    .orderBy(asc(S.examItem.position));
  return rows.sort((a, b) => sectionOrder(a.item.section) - sectionOrder(b.item.section) || a.item.position - b.item.position);
}

export type ExamItemRow = Awaited<ReturnType<typeof listExamItems>>[number];

/**
 * The exam-form questions of a practice quiz (Latihan Ujian), grouped by section in exam order and numbered as the
 * practice page shows them, each with its blueprint row when known. `other` counts the questions of other forms (audio, MIDI…).
 */
export async function listPracticeRows(quizId: string) {
  const rows = await db
    .select({ link: { id: S.quizQuestion.id, kisiChanged: S.quizQuestion.kisiChanged }, question: S.question, item: S.examItem })
    .from(S.quizQuestion)
    .innerJoin(S.question, eq(S.question.id, S.quizQuestion.questionId))
    .leftJoin(S.examItem, eq(S.examItem.id, S.quizQuestion.examItemId))
    .where(eq(S.quizQuestion.quizId, quizId))
    .orderBy(asc(S.quizQuestion.position));
  let no = 0;
  const list = EXAM_SECTIONS.flatMap((section) => rows.filter((r) => sectionForType(r.question.type) === section).map((r) => ({ ...r, section, no: ++no })));
  return { rows: list, other: rows.length - list.length };
}

export type PracticeRow = Awaited<ReturnType<typeof listPracticeRows>>["rows"][number];

/** Next free position in a section (rows are appended at the end). */
export async function nextPosition(examId: string): Promise<number> {
  const rows = await db.select({ position: S.examItem.position }).from(S.examItem).where(eq(S.examItem.examId, examId));
  return rows.reduce((m, r) => Math.max(m, r.position + 1), 0);
}

/** The teacher's exams that have at least one blueprint row, newest first: offered as a source for an AI study summary. */
export async function listExamSources(teacherId: string) {
  const rows = await db
    .select({ id: S.exam.id, title: S.exam.title, info: S.exam.info, updatedAt: S.exam.updatedAt, items: count(S.examItem.id), questions: count(S.examItem.questionId) })
    .from(S.exam)
    .innerJoin(S.examItem, eq(S.examItem.examId, S.exam.id))
    .where(eq(S.exam.teacherId, teacherId))
    .groupBy(S.exam.id)
    .orderBy(desc(S.exam.updatedAt));
  return rows.map((r) => ({ id: r.id, title: r.title, jenis: r.info.jenis_ujian ?? "", kelas: r.info.kelas ?? "", items: r.items, questions: r.questions }));
}

export type ExamSource = Awaited<ReturnType<typeof listExamSources>>[number];
