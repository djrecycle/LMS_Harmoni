"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getOwnedClassroom } from "@/lib/access";
import { getRealUser, STUDENT_VIEW_COOKIE } from "@/lib/session";
import { deleteFile } from "@/lib/storage";
import { getT } from "@/i18n/server";

const S = schema;

/** The signed-in teacher (the real account, also while Student view is on). */
async function realTeacher() {
  const u = await getRealUser();
  if (!u) redirect("/login");
  if (u.role !== "teacher") redirect("/student");
  return u;
}

/** The teacher's test student, created on first use. It has no password, so nobody can log in with it. */
async function ensureDemoStudent(teacher: { id: string; name: string }) {
  const [found] = await db.select({ id: S.user.id }).from(S.user).where(eq(S.user.demoOwnerId, teacher.id)).limit(1);
  if (found) return found.id;
  const t = await getT();
  const id = randomUUID();
  await db.insert(S.user).values({ id, name: t("Test student"), email: `demo-${teacher.id}@demo.harmoni.invalid`, emailVerified: true, role: "student", demoOwnerId: teacher.id });
  return id;
}

async function setCookie(demoId: string) {
  (await cookies()).set(STUDENT_VIEW_COOKIE, demoId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 8 });
}

/** Open Student view for one class: the test student becomes a (hidden) member of that class only. */
export async function enterStudentView(classroomId: string) {
  const teacher = await realTeacher();
  const classroom = await getOwnedClassroom(teacher.id, classroomId);
  if (!classroom) redirect("/teacher/classes");
  const demoId = await ensureDemoStudent(teacher);
  await db.delete(S.classroomMembership).where(eq(S.classroomMembership.studentId, demoId));
  await db.insert(S.classroomMembership).values({ classroomId: classroom.id, studentId: demoId, isDemo: true });
  await setCookie(demoId);
  revalidatePath("/", "layout");
  redirect("/student");
}

/** Back to the teacher account, on the class the test student was in. */
export async function exitStudentView() {
  const teacher = await realTeacher();
  (await cookies()).delete(STUDENT_VIEW_COOKIE);
  const [demo] = await db
    .select({ classroomId: S.classroomMembership.classroomId })
    .from(S.classroomMembership)
    .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
    .where(eq(S.user.demoOwnerId, teacher.id))
    .limit(1);
  revalidatePath("/", "layout");
  redirect(demo ? `/teacher/classes/${demo.classroomId}` : "/teacher");
}

/** Erase everything the test student did (quiz attempts, practice scores, recordings, progress) and start fresh in the same class. */
export async function resetStudentView() {
  const teacher = await realTeacher();
  const [demo] = await db.select({ id: S.user.id }).from(S.user).where(eq(S.user.demoOwnerId, teacher.id)).limit(1);
  if (!demo) redirect("/teacher");
  const [membership] = await db.select({ classroomId: S.classroomMembership.classroomId }).from(S.classroomMembership).where(eq(S.classroomMembership.studentId, demo.id)).limit(1);
  const recordings = await db.select({ fileKey: S.recording.fileKey }).from(S.recording).where(eq(S.recording.studentId, demo.id));
  await db.delete(S.user).where(and(eq(S.user.id, demo.id), eq(S.user.demoOwnerId, teacher.id))); // cascades to all of its data
  await Promise.all(recordings.map((r) => deleteFile(r.fileKey).catch(() => undefined)));
  if (!membership) {
    (await cookies()).delete(STUDENT_VIEW_COOKIE);
    redirect("/teacher");
  }
  const fresh = await ensureDemoStudent(teacher);
  await db.insert(S.classroomMembership).values({ classroomId: membership.classroomId, studentId: fresh, isDemo: true });
  await setCookie(fresh);
  revalidatePath("/", "layout");
  redirect("/student?reset=1");
}
