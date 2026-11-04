"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { platformSettingsSchema, savePlatformSettings } from "@/lib/platform";
import { requireAdmin } from "@/lib/session";
import { deleteFolder } from "@/lib/storage";
import { getT } from "@/i18n/server";

// Super Admin only. Server actions are public POST endpoints, so each one checks requireAdmin() itself.
// None of them can touch the Super Admin's own account: there is exactly one, and it can't be handed to anyone.

const S = schema;
const refresh = () => revalidatePath("/teacher/admin/teachers");

export async function savePlatform(data: unknown): Promise<ActionResult> {
  const t = await getT();
  const admin = await requireAdmin();
  const p = platformSettingsSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  await savePlatformSettings(p.data, admin.id);
  refresh();
  return succeed(t("Settings saved."));
}

/** The teacher `id` (never the Super Admin), or null. */
async function otherTeacher(id: string) {
  const [u] = await db
    .select({ id: S.user.id, name: S.user.name })
    .from(S.user)
    .where(and(eq(S.user.id, id), eq(S.user.role, "teacher"), eq(S.user.isAdmin, false)))
    .limit(1);
  return u ?? null;
}

const statusSchema = z.object({ id: z.string().min(1).max(100), status: z.enum(["active", "suspended"]) });

/** Approve a waiting teacher, suspend one, or let a suspended one back in. */
export async function setTeacherStatus(data: unknown): Promise<ActionResult> {
  const t = await getT();
  await requireAdmin();
  const p = statusSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const u = await otherTeacher(p.data.id);
  if (!u) return fail(t("Teacher not found."));
  await db.update(S.user).set({ teacherStatus: p.data.status, updatedAt: new Date() }).where(eq(S.user.id, u.id));
  // A suspended teacher is signed out everywhere right away.
  if (p.data.status === "suspended") await db.delete(S.session).where(eq(S.session.userId, u.id));
  refresh();
  return succeed(p.data.status === "active" ? t("{0} can now use the app.", u.name) : t("{0} is suspended.", u.name));
}

const quotaSchema = z.object({ id: z.string().min(1).max(100), quotaMb: z.number().int().min(10, "At least 10 MB").max(1_000_000).nullable() });

/** Upload space for one teacher; null = the platform default. */
export async function setTeacherQuota(data: unknown): Promise<ActionResult> {
  const t = await getT();
  await requireAdmin();
  const p = quotaSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const u = await otherTeacher(p.data.id);
  if (!u) return fail(t("Teacher not found."));
  await db.update(S.user).set({ storageQuotaMb: p.data.quotaMb, updatedAt: new Date() }).where(eq(S.user.id, u.id));
  refresh();
  return succeed(t("Upload space saved."));
}

/**
 * Delete a teacher with everything they made (classes, lessons, questions, quizzes, documents — the database
 * removes those with the account) and their uploaded files. Student accounts stay; they just lose those classes.
 */
export async function deleteTeacher(id: string): Promise<ActionResult> {
  const t = await getT();
  await requireAdmin();
  const u = await otherTeacher(id);
  if (!u) return fail(t("Teacher not found."));
  // Their test student for "Student view" belongs to them too.
  const demos = await db.select({ id: S.user.id }).from(S.user).where(eq(S.user.demoOwnerId, u.id));
  await db.delete(S.appSetting).where(eq(S.appSetting.key, `ai:teacher:${u.id}`));
  for (const d of demos) {
    await db.delete(S.user).where(eq(S.user.id, d.id));
    await deleteFolder(`recording/${d.id}/`);
  }
  await db.delete(S.user).where(eq(S.user.id, u.id));
  await deleteFolder(`media/${u.id}/`);
  refresh();
  return succeed(t("{0} and all their data were deleted.", u.name));
}
