"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { isUuid, getOwnedClassroom } from "@/lib/access";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { rateLimit } from "@/lib/ratelimit";
import { requireTeacher, requireStudent } from "@/lib/session";
import { newInviteCode as newCode } from "@/lib/invite-code";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/", "layout");

const classroomSchema = z.object({
  name: z.string().trim().min(3, "Class name must be at least 3 characters").max(80),
  description: z.string().trim().max(300).optional(),
});

export async function createClassroom(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const teacher = await requireTeacher();
  const p = classroomSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  const [k] = await db
    .insert(S.classroom)
    .values({ name: p.data.name, description: p.data.description || null, teacherId: teacher.id, inviteCode: await newCode() })
    .returning({ id: S.classroom.id });
  refresh();
  redirect(`/teacher/classes/${k.id}`);
}

export async function editClassroom(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = classroomSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  const classroom = await getOwnedClassroom(teacher.id, String(fd.get("id")));
  if (!classroom) return fail(t("Class not found."));
  await db.update(S.classroom).set({ name: p.data.name, description: p.data.description || null }).where(eq(S.classroom.id, classroom.id));
  refresh();
  return succeed(t("Class updated."));
}

export async function deleteClassroom(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const classroom = await getOwnedClassroom(teacher.id, id);
  if (!classroom) return fail(t("Class not found."));
  await db.delete(S.classroom).where(eq(S.classroom.id, classroom.id));
  refresh();
  return succeed(t("Class deleted."));
}

export async function regenerateInviteCode(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const classroom = await getOwnedClassroom(teacher.id, id);
  if (!classroom) return fail(t("Class not found."));
  await db.update(S.classroom).set({ inviteCode: await newCode() }).where(eq(S.classroom.id, classroom.id));
  refresh();
  return succeed(t("New invite code created."));
}

/** id = "classId:studentId" */
export async function removeStudent(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const [classroomId, studentId] = id.split(":");
  const classroom = await getOwnedClassroom(teacher.id, classroomId);
  if (!classroom || !studentId) return fail(t("Data not found."));
  await db.delete(S.classroomMembership).where(and(eq(S.classroomMembership.classroomId, classroom.id), eq(S.classroomMembership.studentId, studentId)));
  refresh();
  return succeed(t("Student removed from the class."));
}

/* ----------------------------- Student ----------------------------- */

export async function joinClassroom(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const student = await requireStudent();
  // The test student stays in the one class Student view was opened for.
  if (student.studentView) return fail(t("This is not available in Student view."));
  const code = String(fd.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (code.length < 4) return { ok: false, error: t("Enter the class code from your teacher."), fieldErrors: { code: t("Enter the class code") } };

  const rate = rateLimit(`join:${student.id}`, 10, 10 * 60 * 1000);
  if (!rate.boleh) return fail(t("Too many attempts. Try again in a few minutes."));

  const [classroom] = await db.select().from(S.classroom).where(eq(S.classroom.inviteCode, code)).limit(1);
  if (!classroom) return { ok: false, error: t("Class code not found. Please check it again."), fieldErrors: { code: t("Code not found") } };

  await db.insert(S.classroomMembership).values({ classroomId: classroom.id, studentId: student.id }).onConflictDoNothing();
  refresh();
  return succeed(t("You joined the class {0}.", classroom.name));
}

export async function leaveClassroom(classroomId: string): Promise<ActionResult> {
  const t = await getT();
  const student = await requireStudent();
  if (!isUuid(classroomId)) return fail(t("Class not found."));
  await db.delete(S.classroomMembership).where(and(eq(S.classroomMembership.classroomId, classroomId), eq(S.classroomMembership.studentId, student.id)));
  refresh();
  return succeed(t("You left the class."));
}
