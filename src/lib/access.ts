import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { deleteFile } from "./storage";

const S = schema;

export const isUuid = (s: unknown): s is string => z.uuid().safeParse(s).success;

/** The class owned by this teacher, or null. */
export async function getOwnedClassroom(teacherId: string, classroomId: string) {
  if (!isUuid(classroomId)) return null;
  const [k] = await db.select().from(S.classroom).where(and(eq(S.classroom.id, classroomId), eq(S.classroom.teacherId, teacherId))).limit(1);
  return k ?? null;
}

export async function getOwnedMaterial(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [m] = await db.select().from(S.material).where(and(eq(S.material.id, id), eq(S.material.teacherId, teacherId))).limit(1);
  return m ?? null;
}

export async function getOwnedPracticeMaterial(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [m] = await db.select().from(S.practiceMaterial).where(and(eq(S.practiceMaterial.id, id), eq(S.practiceMaterial.teacherId, teacherId))).limit(1);
  return m ?? null;
}

export async function getOwnedPianoSong(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [m] = await db.select().from(S.pianoSong).where(and(eq(S.pianoSong.id, id), eq(S.pianoSong.teacherId, teacherId))).limit(1);
  return m ?? null;
}

export async function getOwnedQuestion(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [m] = await db.select().from(S.question).where(and(eq(S.question.id, id), eq(S.question.teacherId, teacherId))).limit(1);
  return m ?? null;
}

export async function getOwnedQuiz(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [m] = await db.select().from(S.quiz).where(and(eq(S.quiz.id, id), eq(S.quiz.teacherId, teacherId))).limit(1);
  return m ?? null;
}

/** A teaching-journal / attendance entry (class_session) owned by this teacher. */
export async function getOwnedClassSession(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [m] = await db.select().from(S.classSession).where(and(eq(S.classSession.id, id), eq(S.classSession.teacherId, teacherId))).limit(1);
  return m ?? null;
}

/** A teacher's own Jadwal Guru row. */
export async function getOwnedSchedule(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [m] = await db.select().from(S.teacherSchedule).where(and(eq(S.teacherSchedule.id, id), eq(S.teacherSchedule.teacherId, teacherId))).limit(1);
  return m ?? null;
}

/** A teacher's own academic-calendar upload. */
export async function getOwnedCalendar(teacherId: string, id: string) {
  if (!isUuid(id)) return null;
  const [m] = await db.select().from(S.academicCalendar).where(and(eq(S.academicCalendar.id, id), eq(S.academicCalendar.teacherId, teacherId))).limit(1);
  return m ?? null;
}

/** Is this student a member of any class owned by the teacher? */
export async function isStudentInTeacherClass(teacherId: string, studentId: string) {
  const [r] = await db
    .select({ id: S.classroomMembership.id })
    .from(S.classroomMembership)
    .innerJoin(S.classroom, eq(S.classroom.id, S.classroomMembership.classroomId))
    .where(and(eq(S.classroom.teacherId, teacherId), eq(S.classroomMembership.studentId, studentId)))
    .limit(1);
  return Boolean(r);
}

export async function isStudentInClassroom(studentId: string, classroomId: string) {
  const [r] = await db
    .select({ id: S.classroomMembership.id })
    .from(S.classroomMembership)
    .where(and(eq(S.classroomMembership.studentId, studentId), eq(S.classroomMembership.classroomId, classroomId)))
    .limit(1);
  return Boolean(r);
}

/** Delete a media file from storage when no lesson/question/practice material uses it anymore. */
export async function deleteMediaIfOrphaned(key: string | null | undefined) {
  if (!key || !key.startsWith("media/")) return;
  const [m] = await db.select({ id: S.material.id }).from(S.material).where(eq(S.material.mediaKey, key)).limit(1);
  if (m) return;
  const [s] = await db.select({ id: S.question.id }).from(S.question).where(eq(S.question.mediaKey, key)).limit(1);
  if (s) return;
  const [p] = await db.select({ id: S.practiceMaterial.id }).from(S.practiceMaterial).where(eq(S.practiceMaterial.mediaKey, key)).limit(1);
  if (p) return;
  await deleteFile(key);
}

/** Make sure `key` (if any) belongs to this teacher's uploads or is an https link, so it cannot point to someone else's file. */
export function isValidMediaKey(key: string | null | undefined, teacherId: string) {
  if (!key) return true;
  if (/^https:\/\/\S+$/i.test(key)) return true;
  return key.startsWith(`media/${teacherId}/`);
}

export { or };
