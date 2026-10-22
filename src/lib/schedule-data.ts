import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DayOfWeek } from "@/lib/days";

const S = schema;

export type ScheduleRow = {
  id: string;
  hari: DayOfWeek;
  jamMulai: string;
  jamSelesai: string;
  mataPelajaran: string;
  catatan: string | null;
  classroomId: string | null;
  /** The class label to display: the linked classroom's own name, or the free-text one entered by hand. */
  className: string;
};

/** This teacher's weekly timetable, earliest time first within each day. */
export async function listSchedule(teacherId: string): Promise<ScheduleRow[]> {
  const rows = await db
    .select({
      id: S.teacherSchedule.id,
      hari: S.teacherSchedule.hari,
      jamMulai: S.teacherSchedule.jamMulai,
      jamSelesai: S.teacherSchedule.jamSelesai,
      mataPelajaran: S.teacherSchedule.mataPelajaran,
      catatan: S.teacherSchedule.catatan,
      classroomId: S.teacherSchedule.classroomId,
      className: S.teacherSchedule.className,
      classroomName: S.classroom.name,
    })
    .from(S.teacherSchedule)
    .leftJoin(S.classroom, eq(S.classroom.id, S.teacherSchedule.classroomId))
    .where(eq(S.teacherSchedule.teacherId, teacherId))
    .orderBy(asc(S.teacherSchedule.jamMulai));

  return rows.map((r) => ({ ...r, className: r.classroomName ?? r.className ?? "-" }));
}
