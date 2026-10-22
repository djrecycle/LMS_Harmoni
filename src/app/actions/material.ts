"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { isUuid, deleteMediaIfOrphaned, getOwnedClassroom, getOwnedMaterial, isValidMediaKey } from "@/lib/access";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { interactiveLessonSchema, isInteractiveLessonSlug } from "@/lib/interactive-lessons";
import { requireTeacher, requireStudent } from "@/lib/session";
import { today } from "@/lib/utils";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/", "layout");

const assignmentSchema = z.array(z.object({ classroomId: z.uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).max(50);

const materialSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(150),
    topic: z.string().trim().max(300).optional(),
    typeMedia: z.enum(["text", "image", "audio", "video", "interactive"]),
    mediaKey: z.string().trim().max(600).optional(),
    /** AI-generated interactive lesson, as a JSON string (see interactiveLessonSchema); mutually exclusive with mediaKey. */
    interactiveData: z.string().max(60_000).optional(),
    content: z.string().max(50_000).default(""),
  })
  .superRefine(async (v, ctx) => {
  const t = await getT();
    if (v.typeMedia === "interactive") {
      if (!v.mediaKey && !v.interactiveData) ctx.addIssue({ code: "custom", path: ["mediaKey"], message: t("Generate the interactive lesson with AI first.") });
      if (v.mediaKey && !isInteractiveLessonSlug(v.mediaKey)) ctx.addIssue({ code: "custom", path: ["mediaKey"], message: t("Choose a valid interactive lesson.") });
      if (v.interactiveData && !interactiveLessonSchema.safeParse(safeJsonParse(v.interactiveData)).success)
        ctx.addIssue({ code: "custom", path: ["mediaKey"], message: t("The interactive lesson is incomplete — it needs at least one part with a heading and text.") });
    } else if (!v.mediaKey) {
      ctx.addIssue({ code: "custom", path: ["mediaKey"], message: t("Upload {0} for this lesson", v.typeMedia) });
    }
    if (v.typeMedia === "text" && v.content.trim().length < 3) ctx.addIssue({ code: "custom", path: ["content"], message: t("The lesson content is empty") });
  });

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function saveMaterial(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = await materialSchema.safeParseAsync(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);

  let assignment: z.infer<typeof assignmentSchema> = [];
  try {
    assignment = assignmentSchema.parse(JSON.parse(String(fd.get("assignment") || "[]")));
  } catch {
    return fail(t("Invalid assignment schedule."));
  }
  const v = p.data;
  const interactiveData = v.typeMedia === "interactive" && v.interactiveData ? interactiveLessonSchema.parse(JSON.parse(v.interactiveData)) : null;
  const mediaKey = v.typeMedia === "text" || interactiveData ? null : v.mediaKey || null;
  // "interactive" stores a registry slug in mediaKey, not an uploaded file key — already checked by isInteractiveLessonSlug above.
  if (v.typeMedia !== "interactive" && !isValidMediaKey(mediaKey, teacher.id)) return fail(t("Invalid media file."));

  // Only classes owned by this teacher
  const classroomIds = [...new Set(assignment.map((x) => x.classroomId))];
  if (classroomIds.length) {
    const owned = await db.select({ id: S.classroom.id }).from(S.classroom).where(and(eq(S.classroom.teacherId, teacher.id), inArray(S.classroom.id, classroomIds)));
    if (owned.length !== classroomIds.length) return fail(t("Some classes are invalid."));
  }

  const previousId = String(fd.get("id") || "");
  let id = previousId;
  let previousMedia: string | null = null;
  if (previousId) {
    const m = await getOwnedMaterial(teacher.id, previousId);
    if (!m) return fail(t("Lesson not found."));
    previousMedia = m.mediaKey;
    await db
      .update(S.material)
      .set({ title: v.title, topic: v.topic || null, typeMedia: v.typeMedia, mediaKey, interactiveData, content: v.content, updatedAt: new Date() })
      .where(eq(S.material.id, m.id));
  } else {
    const [fresh] = await db
      .insert(S.material)
      .values({ teacherId: teacher.id, title: v.title, topic: v.topic || null, typeMedia: v.typeMedia, mediaKey, interactiveData, content: v.content })
      .returning({ id: S.material.id });
    id = fresh.id;
  }

  // Sync assignments: remove the revoked ones, upsert the rest (only classes owned by this teacher)
  const teacherOwned = await db.select({ id: S.classroom.id }).from(S.classroom).where(eq(S.classroom.teacherId, teacher.id));
  const ownedIds = teacherOwned.map((k) => k.id);
  if (ownedIds.length) {
    const current = await db.select().from(S.classroomMaterial).where(and(eq(S.classroomMaterial.materialId, id), inArray(S.classroomMaterial.classroomId, ownedIds)));
    const deleteIds = current.filter((l) => !classroomIds.includes(l.classroomId)).map((l) => l.id);
    if (deleteIds.length) await db.delete(S.classroomMaterial).where(inArray(S.classroomMaterial.id, deleteIds));
  }
  for (const t of assignment) {
    await db
      .insert(S.classroomMaterial)
      .values({ materialId: id, classroomId: t.classroomId, date: t.date })
      .onConflictDoUpdate({ target: [S.classroomMaterial.materialId, S.classroomMaterial.classroomId], set: { date: t.date } });
  }

  if (previousMedia && previousMedia !== mediaKey) await deleteMediaIfOrphaned(previousMedia);
  refresh();
  redirect("/teacher/materials?saved=1");
}

const setKelasSchema = z.object({ id: z.uuid(), kelas: z.string().trim().max(40, "Too long") });

/** Set or correct which grade level (7/8/9) a lesson is for — separate from which classroom(s) it's assigned to. */
export async function setMaterialKelas(data: unknown): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = setKelasSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const m = await getOwnedMaterial(teacher.id, p.data.id);
  if (!m) return fail(t("Lesson not found."));
  await db.update(S.material).set({ kelas: p.data.kelas || null, updatedAt: new Date() }).where(eq(S.material.id, m.id));
  refresh();
  return succeed(t("Class saved."));
}

export async function deleteMaterial(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const m = await getOwnedMaterial(teacher.id, id);
  if (!m) return fail(t("Lesson not found."));
  await db.delete(S.material).where(eq(S.material.id, m.id));
  await deleteMediaIfOrphaned(m.mediaKey);
  refresh();
  return succeed(t("Lesson deleted."));
}

/** Remove a lesson from one class (id = "materialId:classId"). */
export async function revokeMaterialFromClassroom(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const [materialId, classroomId] = id.split(":");
  const [m, k] = await Promise.all([getOwnedMaterial(teacher.id, materialId), getOwnedClassroom(teacher.id, classroomId)]);
  if (!m || !k) return fail(t("Data not found."));
  await db.delete(S.classroomMaterial).where(and(eq(S.classroomMaterial.materialId, m.id), eq(S.classroomMaterial.classroomId, k.id)));
  refresh();
  return succeed(t("Lesson removed from the class."));
}

/* ----------------------------- Student ----------------------------- */

/** Mark a lesson completed or not. Only for lessons already published in the student's class. */
export async function markMaterialCompleted(materialId: string, completed: boolean): Promise<ActionResult> {
  const t = await getT();
  const student = await requireStudent();
  if (!isUuid(materialId)) return fail(t("Lesson not found."));
  const [access] = await db
    .select({ id: S.classroomMaterial.id })
    .from(S.classroomMaterial)
    .innerJoin(S.classroomMembership, eq(S.classroomMembership.classroomId, S.classroomMaterial.classroomId))
    .where(and(eq(S.classroomMaterial.materialId, materialId), eq(S.classroomMembership.studentId, student.id)))
    .limit(1);
  const [published] = await db
    .select({ date: S.classroomMaterial.date })
    .from(S.classroomMaterial)
    .innerJoin(S.classroomMembership, eq(S.classroomMembership.classroomId, S.classroomMaterial.classroomId))
    .where(and(eq(S.classroomMaterial.materialId, materialId), eq(S.classroomMembership.studentId, student.id)))
    .orderBy(S.classroomMaterial.date)
    .limit(1);
  if (!access || !published || published.date > today()) return fail(t("This lesson is not available to you yet."));

  await db
    .insert(S.materialProgress)
    .values({ studentId: student.id, materialId, completed, completedAt: completed ? new Date() : null })
    .onConflictDoUpdate({
      target: [S.materialProgress.studentId, S.materialProgress.materialId],
      set: { completed, completedAt: completed ? new Date() : null, updatedAt: new Date() },
    });
  refresh();
  return succeed(completed ? t("Lesson marked as completed. Great job!") : t("Completion mark removed."));
}
