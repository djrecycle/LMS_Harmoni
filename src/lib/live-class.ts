import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { isOngoing, nowWib } from "@/lib/days";
import { getOwnedSchedule } from "@/lib/access";
import { today } from "@/lib/utils";

const S = schema;

/** Students send a heartbeat every 30 s while a tab is visible; anyone seen within this window counts as online. */
export const HEARTBEAT_MS = 30_000;
export const ONLINE_WINDOW_MS = 75_000;

export { nowWib, isOngoing };

export type LiveSchedule = { id: string; classroomId: string; classroomName: string; mataPelajaran: string; jamMulai: string; jamSelesai: string };

/** Today's timetable entries linked to a class: the ones running now, and the next one still to start. */
export async function todayLiveSchedules(teacherId: string): Promise<{ live: LiveSchedule[]; next: LiveSchedule | null }> {
  const now = nowWib();
  const rows = await db
    .select({
      id: S.teacherSchedule.id,
      hari: S.teacherSchedule.hari,
      jamMulai: S.teacherSchedule.jamMulai,
      jamSelesai: S.teacherSchedule.jamSelesai,
      mataPelajaran: S.teacherSchedule.mataPelajaran,
      classroomId: S.classroom.id,
      classroomName: S.classroom.name,
    })
    .from(S.teacherSchedule)
    .innerJoin(S.classroom, eq(S.classroom.id, S.teacherSchedule.classroomId))
    .where(and(eq(S.teacherSchedule.teacherId, teacherId), eq(S.teacherSchedule.hari, now.day)))
    .orderBy(asc(S.teacherSchedule.jamMulai));
  const strip = ({ hari: _, ...r }: (typeof rows)[number]): LiveSchedule => r;
  const next = rows.find((r) => r.jamMulai > now.time);
  return { live: rows.filter((r) => isOngoing(r, now)).map(strip), next: next ? strip(next) : null };
}

export type LiveCell = { openedAt: Date | null; openCount: number; completedAt: Date | null; completed: boolean };
export type LiveStudent = { id: string; name: string; online: boolean; lastSeenAt: Date | null; currentMaterialTitle: string | null; cells: Record<string, LiveCell> };
export type LiveMaterial = { id: string; title: string; typeMedia: string; date: string; today: boolean };

export type LiveClassData = {
  schedule: { id: string; mataPelajaran: string; jamMulai: string; jamSelesai: string; ongoing: boolean };
  classroom: { id: string; name: string };
  materials: LiveMaterial[];
  /** Materials of this teacher not yet shared with the class today, for the "share now" picker. */
  shareable: { id: string; title: string }[];
  students: LiveStudent[];
};

const MATERIAL_PATH = /^\/student\/materials\/([0-9a-f-]{36})/i;

/** Everything the Live Class screen shows for one timetable entry, or null when it isn't this teacher's or has no class. */
export async function liveClassData(teacherId: string, scheduleId: string): Promise<LiveClassData | null> {
  const sched = await getOwnedSchedule(teacherId, scheduleId);
  if (!sched?.classroomId) return null;
  const [classroom] = await db.select({ id: S.classroom.id, name: S.classroom.name }).from(S.classroom).where(eq(S.classroom.id, sched.classroomId)).limit(1);
  if (!classroom) return null;
  const day = today();

  const [members, assigned, own] = await Promise.all([
    db
      .select({ id: S.user.id, name: S.user.name, lastSeenAt: S.userPresence.lastSeenAt, path: S.userPresence.path })
      .from(S.classroomMembership)
      .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
      .leftJoin(S.userPresence, eq(S.userPresence.userId, S.user.id))
      .where(eq(S.classroomMembership.classroomId, classroom.id))
      .orderBy(asc(S.user.name)),
    db
      .select({ id: S.material.id, title: S.material.title, typeMedia: S.material.typeMedia, date: S.classroomMaterial.date })
      .from(S.classroomMaterial)
      .innerJoin(S.material, eq(S.material.id, S.classroomMaterial.materialId))
      .where(and(eq(S.classroomMaterial.classroomId, classroom.id), lte(S.classroomMaterial.date, day)))
      .orderBy(desc(S.classroomMaterial.date), desc(S.classroomMaterial.createdAt)),
    db.select({ id: S.material.id, title: S.material.title }).from(S.material).where(eq(S.material.teacherId, teacherId)).orderBy(desc(S.material.updatedAt)),
  ]);

  // Today's lessons; when nothing was shared today, the 5 most recent ones so the screen isn't empty.
  const todays = assigned.filter((m) => m.date === day);
  const materials: LiveMaterial[] = (todays.length ? todays : assigned.slice(0, 5)).map((m) => ({ ...m, today: m.date === day }));
  const todayIds = new Set(todays.map((m) => m.id));
  const shareable = own.filter((m) => !todayIds.has(m.id));

  const studentIds = members.map((m) => m.id);
  const materialIds = materials.map((m) => m.id);
  const [views, progress] =
    studentIds.length && materialIds.length
      ? await Promise.all([
          db
            .select({ studentId: S.materialView.studentId, materialId: S.materialView.materialId, lastOpenedAt: S.materialView.lastOpenedAt, firstOpenedAt: S.materialView.firstOpenedAt, openCount: S.materialView.openCount })
            .from(S.materialView)
            .where(and(inArray(S.materialView.studentId, studentIds), inArray(S.materialView.materialId, materialIds))),
          db
            .select({ studentId: S.materialProgress.studentId, materialId: S.materialProgress.materialId, completed: S.materialProgress.completed, completedAt: S.materialProgress.completedAt })
            .from(S.materialProgress)
            .where(and(inArray(S.materialProgress.studentId, studentIds), inArray(S.materialProgress.materialId, materialIds))),
        ])
      : [[], []];

  const key = (s: string, m: string) => `${s}:${m}`;
  const viewMap = new Map(views.map((v) => [key(v.studentId, v.materialId), v]));
  const progMap = new Map(progress.map((p) => [key(p.studentId, p.materialId), p]));
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  const titles = new Map(own.map((m) => [m.id, m.title]));

  const students: LiveStudent[] = members.map((m) => {
    const cells: Record<string, LiveCell> = {};
    for (const mat of materials) {
      const v = viewMap.get(key(m.id, mat.id));
      const p = progMap.get(key(m.id, mat.id));
      cells[mat.id] = { openedAt: v?.firstOpenedAt ?? null, openCount: v?.openCount ?? 0, completed: Boolean(p?.completed), completedAt: p?.completedAt ?? null };
      // A student who completed it before view tracking existed has still opened it.
      if (!cells[mat.id].openedAt && cells[mat.id].completed) cells[mat.id].openedAt = p?.completedAt ?? null;
    }
    const online = Boolean(m.lastSeenAt && m.lastSeenAt.getTime() >= cutoff);
    const current = online ? (m.path?.match(MATERIAL_PATH)?.[1] ?? null) : null;
    return { id: m.id, name: m.name, online, lastSeenAt: m.lastSeenAt, currentMaterialTitle: current ? (titles.get(current) ?? null) : null, cells };
  });
  // Online students first, then alphabetical.
  students.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

  return {
    schedule: { id: sched.id, mataPelajaran: sched.mataPelajaran, jamMulai: sched.jamMulai, jamSelesai: sched.jamSelesai, ongoing: isOngoing(sched) },
    classroom,
    materials,
    shareable,
    students,
  };
}
