import fsp from "node:fs/promises";
import path from "node:path";
import { and, count, countDistinct, desc, eq, inArray, like } from "drizzle-orm";
import { db, schema } from "@/db";
import { getPlatformSettings, type PlatformSettings } from "@/lib/platform";
import { usedBytes, usesS3 } from "@/lib/storage";

const S = schema;

export type TeacherRow = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  status: "pending" | "active" | "suspended";
  createdAt: string;
  classes: number;
  students: number;
  lessons: number;
  documents: number;
  /** Bytes used by the teacher's uploads. */
  usedBytes: number;
  /** Their own quota in MB, or null for the platform default (always null for the Super Admin: no limit). */
  quotaMb: number | null;
  /** They saved their own AI key (the Super Admin uses the server's settings). */
  aiReady: boolean;
};

export type AdminOverview = {
  settings: PlatformSettings;
  teachers: TeacherRow[];
  /** Teacher accounts that count against the limit (everyone but the Super Admin). */
  teacherCount: number;
  totalUsedBytes: number;
  /** Free / total space on the server's upload disk (local storage only). */
  disk: { free: number; total: number } | null;
};

const byTeacher = (rows: { id: string; n: number }[]) => new Map(rows.map((r) => [r.id, Number(r.n)]));

export async function adminOverview(): Promise<AdminOverview> {
  const [settings, users] = await Promise.all([
    getPlatformSettings(),
    db
      .select({ id: S.user.id, name: S.user.name, email: S.user.email, isAdmin: S.user.isAdmin, status: S.user.teacherStatus, quota: S.user.storageQuotaMb, createdAt: S.user.createdAt })
      .from(S.user)
      .where(eq(S.user.role, "teacher"))
      .orderBy(desc(S.user.isAdmin), desc(S.user.createdAt)),
  ]);
  const ids = users.map((u) => u.id);
  if (!ids.length) return { settings, teachers: [], teacherCount: 0, totalUsedBytes: 0, disk: await diskSpace() };

  const [classes, students, lessons, docs, aiRows, used] = await Promise.all([
    db.select({ id: S.classroom.teacherId, n: count() }).from(S.classroom).where(inArray(S.classroom.teacherId, ids)).groupBy(S.classroom.teacherId),
    db
      .select({ id: S.classroom.teacherId, n: countDistinct(S.classroomMembership.studentId) })
      .from(S.classroomMembership)
      .innerJoin(S.classroom, eq(S.classroom.id, S.classroomMembership.classroomId))
      .where(and(inArray(S.classroom.teacherId, ids), eq(S.classroomMembership.isDemo, false)))
      .groupBy(S.classroom.teacherId),
    db.select({ id: S.material.teacherId, n: count() }).from(S.material).where(inArray(S.material.teacherId, ids)).groupBy(S.material.teacherId),
    db.select({ id: S.teachingDoc.teacherId, n: count() }).from(S.teachingDoc).where(inArray(S.teachingDoc.teacherId, ids)).groupBy(S.teachingDoc.teacherId),
    db.select({ key: S.appSetting.key, value: S.appSetting.value }).from(S.appSetting).where(like(S.appSetting.key, "ai:teacher:%")),
    Promise.all(ids.map(async (id) => [id, await usedBytes(`media/${id}/`).catch(() => 0)] as const)),
  ]);
  const cMap = byTeacher(classes);
  const sMap = byTeacher(students);
  const lMap = byTeacher(lessons);
  const dMap = byTeacher(docs);
  const usedMap = new Map(used);
  const aiReady = new Set(aiRows.filter((r) => r.value && (r.value.anthropicKeyEnc || r.value.geminiKeyEnc)).map((r) => r.key.slice("ai:teacher:".length)));

  const teachers: TeacherRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: u.isAdmin,
    status: u.isAdmin ? "active" : u.status,
    createdAt: u.createdAt.toISOString(),
    classes: cMap.get(u.id) ?? 0,
    students: sMap.get(u.id) ?? 0,
    lessons: lMap.get(u.id) ?? 0,
    documents: dMap.get(u.id) ?? 0,
    usedBytes: usedMap.get(u.id) ?? 0,
    quotaMb: u.isAdmin ? null : u.quota,
    aiReady: u.isAdmin || aiReady.has(u.id),
  }));
  return {
    settings,
    teachers,
    teacherCount: teachers.filter((x) => !x.isAdmin).length,
    totalUsedBytes: teachers.reduce((sum, x) => sum + x.usedBytes, 0),
    disk: await diskSpace(),
  };
}

async function diskSpace(): Promise<AdminOverview["disk"]> {
  if (usesS3()) return null;
  try {
    const root = process.env.UPLOAD_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads");
    await fsp.mkdir(root, { recursive: true });
    const s = await fsp.statfs(root);
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return null;
  }
}
