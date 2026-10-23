import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { KaldikData } from "@/lib/calendar-data";
import type { DayOfWeek } from "@/lib/days";
import { docContext } from "@/lib/perangkat/store";
import { memberOf, membersOf } from "@/lib/members";

const S = schema;

export type JournalListItem = {
  id: string;
  classroomId: string;
  classroomName: string;
  tanggal: string;
  waktu: string | null;
  materi: string | null;
  hadir: number;
  total: number;
};

/** Recent journal/attendance entries across all of this teacher's classes, newest first. */
export async function listJournal(teacherId: string, limit = 100): Promise<JournalListItem[]> {
  const rows = await db
    .select({
      id: S.classSession.id,
      classroomId: S.classSession.classroomId,
      classroomName: S.classroom.name,
      tanggal: S.classSession.tanggal,
      waktu: S.classSession.waktu,
      materi: S.classSession.materi,
    })
    .from(S.classSession)
    .innerJoin(S.classroom, eq(S.classroom.id, S.classSession.classroomId))
    .where(eq(S.classSession.teacherId, teacherId))
    .orderBy(desc(S.classSession.tanggal), desc(S.classSession.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const attendance = await db
    .select({ classSessionId: S.attendanceRecord.classSessionId, status: S.attendanceRecord.status })
    .from(S.attendanceRecord)
    .where(inArray(S.attendanceRecord.classSessionId, ids));

  return rows.map((r) => {
    const a = attendance.filter((x) => x.classSessionId === r.id);
    return { ...r, hadir: a.filter((x) => x.status === "hadir").length, total: a.length };
  });
}

export type RosterMember = { id: string; name: string; username: string | null };

/** Current members of a class, for the attendance grid (name order). */
export async function classRoster(classroomId: string): Promise<RosterMember[]> {
  return db
    .select({ id: S.user.id, name: S.user.name, username: S.user.username })
    .from(S.classroomMembership)
    .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
    .where(memberOf(classroomId))
    .orderBy(S.user.name);
}

export type AttendanceStatus = "hadir" | "sakit" | "izin" | "alpa";
export type AttendanceMap = Record<string, { status: AttendanceStatus; keterangan: string }>;

/** Existing attendance rows for a session, keyed by studentId. */
export async function sessionAttendance(classSessionId: string): Promise<AttendanceMap> {
  const rows = await db
    .select({ studentId: S.attendanceRecord.studentId, status: S.attendanceRecord.status, keterangan: S.attendanceRecord.keterangan })
    .from(S.attendanceRecord)
    .where(eq(S.attendanceRecord.classSessionId, classSessionId));
  return Object.fromEntries(rows.map((r) => [r.studentId, { status: r.status, keterangan: r.keterangan ?? "" }]));
}

/** Is there already a journal entry for this class on this date (for the "new entry" form's default)? */
export async function findSessionByDate(teacherId: string, classroomId: string, tanggal: string) {
  const [row] = await db
    .select()
    .from(S.classSession)
    .where(and(eq(S.classSession.teacherId, teacherId), eq(S.classSession.classroomId, classroomId), eq(S.classSession.tanggal, tanggal)))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Auto-generate from schedule + academic calendar                     */
/* ------------------------------------------------------------------ */

export type GenerateScheduleRow = { classroomId: string; classroomName: string; hari: DayOfWeek; jamMulai: string; jamSelesai: string; mataPelajaran: string };

/** This teacher's schedule rows that are linked to a real classroom (only these can produce a journal entry), optionally narrowed to one class. */
export async function scheduleForGeneration(teacherId: string, classroomId?: string): Promise<GenerateScheduleRow[]> {
  const rows = await db
    .select({
      classroomId: S.teacherSchedule.classroomId,
      classroomName: S.classroom.name,
      hari: S.teacherSchedule.hari,
      jamMulai: S.teacherSchedule.jamMulai,
      jamSelesai: S.teacherSchedule.jamSelesai,
      mataPelajaran: S.teacherSchedule.mataPelajaran,
    })
    .from(S.teacherSchedule)
    .innerJoin(S.classroom, eq(S.classroom.id, S.teacherSchedule.classroomId))
    .where(
      classroomId
        ? and(eq(S.teacherSchedule.teacherId, teacherId), eq(S.teacherSchedule.classroomId, classroomId))
        : and(eq(S.teacherSchedule.teacherId, teacherId), isNotNull(S.teacherSchedule.classroomId)),
    );
  // The inner join on classroom guarantees classroomId is set here, even though the column itself is nullable.
  return rows.map((r) => ({ ...r, classroomId: r.classroomId! }));
}

/** How many of this teacher's schedule rows have no linked classroom (so they can't produce journal entries yet). */
export async function unlinkedScheduleCount(teacherId: string): Promise<number> {
  const rows = await db
    .select({ id: S.teacherSchedule.id })
    .from(S.teacherSchedule)
    .where(and(eq(S.teacherSchedule.teacherId, teacherId), isNull(S.teacherSchedule.classroomId)));
  return rows.length;
}

/** This teacher's academic-calendar data, for every upload that finished processing, for holiday/term lookups. */
export async function doneCalendarData(teacherId: string): Promise<KaldikData[]> {
  const rows = await db
    .select({ data: S.academicCalendar.data })
    .from(S.academicCalendar)
    .where(and(eq(S.academicCalendar.teacherId, teacherId), eq(S.academicCalendar.status, "done")));
  return rows.map((r) => r.data).filter((d): d is KaldikData => Boolean(d));
}

/** Existing session keys ("classroomId|tanggal") in a date range, to skip duplicates when generating. */
export async function existingSessionKeys(teacherId: string, start: string, end: string): Promise<Set<string>> {
  const rows = await db
    .select({ classroomId: S.classSession.classroomId, tanggal: S.classSession.tanggal })
    .from(S.classSession)
    .where(and(eq(S.classSession.teacherId, teacherId), gte(S.classSession.tanggal, start), lte(S.classSession.tanggal, end)));
  return new Set(rows.map((r) => `${r.classroomId}|${r.tanggal}`));
}

export type JournalExportRow = {
  tanggal: string;
  waktu: string | null;
  materi: string | null;
  kegiatan: string | null;
  kendala: string | null;
  catatan: string | null;
  hadir: number;
  total: number;
  /** Students not marked "hadir", for the printed report's "Keterangan" column. */
  absen: { name: string; status: AttendanceStatus; keterangan: string }[];
};

/** All journal entries for one class, oldest first, with attendance detail — for the printable per-class report. */
export async function journalForExport(teacherId: string, classroomId: string): Promise<JournalExportRow[]> {
  const sessions = await db
    .select({
      id: S.classSession.id,
      tanggal: S.classSession.tanggal,
      waktu: S.classSession.waktu,
      materi: S.classSession.materi,
      kegiatan: S.classSession.kegiatan,
      kendala: S.classSession.kendala,
      catatan: S.classSession.catatan,
    })
    .from(S.classSession)
    .where(and(eq(S.classSession.teacherId, teacherId), eq(S.classSession.classroomId, classroomId)))
    .orderBy(asc(S.classSession.tanggal), asc(S.classSession.createdAt));
  if (sessions.length === 0) return [];

  const ids = sessions.map((s) => s.id);
  const attendance = await db
    .select({ classSessionId: S.attendanceRecord.classSessionId, status: S.attendanceRecord.status, keterangan: S.attendanceRecord.keterangan, name: S.user.name })
    .from(S.attendanceRecord)
    .innerJoin(S.user, eq(S.user.id, S.attendanceRecord.studentId))
    .where(inArray(S.attendanceRecord.classSessionId, ids));

  return sessions.map((s) => {
    const a = attendance.filter((x) => x.classSessionId === s.id);
    const absen = a.filter((x) => x.status !== "hadir").map((x) => ({ name: x.name, status: x.status, keterangan: x.keterangan ?? "" }));
    return { ...s, hadir: a.filter((x) => x.status === "hadir").length, total: a.length, absen };
  });
}

export type ModulAjarOption = { id: string; title: string; kelas: string };

/** This teacher's finished Modul Ajar documents, for the journal entry's "Fill from Modul Ajar" picker. */
export async function listModulAjarOptions(teacherId: string): Promise<ModulAjarOption[]> {
  const rows = await db
    .select({ id: S.teachingDoc.id, title: S.teachingDoc.title, context: S.teachingDoc.context })
    .from(S.teachingDoc)
    .where(and(eq(S.teachingDoc.teacherId, teacherId), eq(S.teachingDoc.kind, "modul_ajar"), eq(S.teachingDoc.status, "done")))
    .orderBy(desc(S.teachingDoc.createdAt));
  return rows.map((r) => ({ id: r.id, title: r.title, kelas: docContext(r).kelas ?? "" }));
}
