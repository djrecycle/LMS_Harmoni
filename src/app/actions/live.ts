"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getOwnedClassroom, getOwnedMaterial, isUuid } from "@/lib/access";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { getCurrentUser, requireTeacher } from "@/lib/session";
import { today } from "@/lib/utils";
import { getT } from "@/i18n/server";

const S = schema;

/** Called every ~30 s by a signed-in student's visible tab, so the teacher's Live Class screen can show who is online. */
export async function presenceHeartbeat(path: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "student") return;
  const p = typeof path === "string" && path.startsWith("/") ? path.slice(0, 200) : null;
  const now = new Date();
  await db
    .insert(S.userPresence)
    .values({ userId: user.id, lastSeenAt: now, path: p })
    .onConflictDoUpdate({ target: S.userPresence.userId, set: { lastSeenAt: now, path: p } });
}

/** Record that a student opened (clicked) a lesson. The lesson page already checked access; this re-checks cheaply. */
export async function recordMaterialView(materialId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || user.role !== "student" || !isUuid(materialId)) return;
  const [access] = await db
    .select({ id: S.classroomMaterial.id })
    .from(S.classroomMaterial)
    .innerJoin(S.classroomMembership, eq(S.classroomMembership.classroomId, S.classroomMaterial.classroomId))
    .where(and(eq(S.classroomMaterial.materialId, materialId), eq(S.classroomMembership.studentId, user.id)))
    .limit(1);
  if (!access) return;
  const now = new Date();
  await db
    .insert(S.materialView)
    .values({ studentId: user.id, materialId, firstOpenedAt: now, lastOpenedAt: now })
    .onConflictDoUpdate({
      target: [S.materialView.studentId, S.materialView.materialId],
      set: { lastOpenedAt: now, openCount: sql`${S.materialView.openCount} + 1` },
    });
}

/** From the Live Class screen: share one of the teacher's lessons with the class, starting today. */
export async function shareMaterialNow(classroomId: string, materialId: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const [k, m] = await Promise.all([getOwnedClassroom(teacher.id, classroomId), getOwnedMaterial(teacher.id, materialId)]);
  if (!k || !m) return fail(t("Lesson not found."));
  const day = today();
  await db
    .insert(S.classroomMaterial)
    .values({ classroomId: k.id, materialId: m.id, date: day })
    .onConflictDoUpdate({ target: [S.classroomMaterial.materialId, S.classroomMaterial.classroomId], set: { date: day } });
  revalidatePath("/", "layout");
  return succeed(t("Lesson shared with the class. Students can open it now."));
}
