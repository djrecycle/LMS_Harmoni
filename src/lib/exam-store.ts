/** Database access for exams. Every function takes the teacher id: a teacher only sees their own exams. */
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "./access";
import { EXAM_SECTIONS, type ExamSection } from "./exam";

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
    .where(and(eq(S.exam.id, examId), lt(S.exam.jobStartedAt, cutoff), inArray(S.exam.job, ["kisi", "soal"])));
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

/** Next free position in a section (rows are appended at the end). */
export async function nextPosition(examId: string): Promise<number> {
  const rows = await db.select({ position: S.examItem.position }).from(S.examItem).where(eq(S.examItem.examId, examId));
  return rows.reduce((m, r) => Math.max(m, r.position + 1), 0);
}
