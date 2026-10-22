"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { deleteMediaIfOrphaned, getOwnedPracticeMaterial, isValidMediaKey } from "@/lib/access";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/", "layout");

const practiceMaterialSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(150),
    description: z.string().trim().max(200).default(""),
    typeMedia: z.enum(["text", "image", "audio", "video"]),
    mediaKey: z.string().trim().max(600).optional(),
    content: z.string().max(50_000).default(""),
  })
  .superRefine(async (v, ctx) => {
    const t = await getT();
    if (v.typeMedia !== "text" && !v.mediaKey) ctx.addIssue({ code: "custom", path: ["mediaKey"], message: t("Upload {0} for this practice material", v.typeMedia) });
    if (v.typeMedia === "text" && v.content.trim().length < 3) ctx.addIssue({ code: "custom", path: ["content"], message: t("The practice material is empty") });
  });

const classroomIdsSchema = z.array(z.uuid()).max(50);

export async function savePracticeMaterial(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = await practiceMaterialSchema.safeParseAsync(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);

  let classroomIds: string[] = [];
  try {
    classroomIds = [...new Set(classroomIdsSchema.parse(JSON.parse(String(fd.get("classroomIds") || "[]"))))];
  } catch {
    return fail(t("Some classes are invalid."));
  }
  const v = p.data;
  const mediaKey = v.typeMedia === "text" ? null : v.mediaKey || null;
  if (!isValidMediaKey(mediaKey, teacher.id)) return fail(t("Invalid media file."));

  // Only classes owned by this teacher.
  const owned = await db.select({ id: S.classroom.id }).from(S.classroom).where(eq(S.classroom.teacherId, teacher.id));
  const ownedIds = owned.map((k) => k.id);
  if (classroomIds.some((id) => !ownedIds.includes(id))) return fail(t("Some classes are invalid."));

  const values = { title: v.title, description: v.description, typeMedia: v.typeMedia, mediaKey, content: v.content };
  const previousId = String(fd.get("id") || "");
  let id = previousId;
  let previousMedia: string | null = null;
  if (previousId) {
    const m = await getOwnedPracticeMaterial(teacher.id, previousId);
    if (!m) return fail(t("Practice material not found."));
    previousMedia = m.mediaKey;
    await db.update(S.practiceMaterial).set({ ...values, updatedAt: new Date() }).where(eq(S.practiceMaterial.id, m.id));
  } else {
    const [fresh] = await db.insert(S.practiceMaterial).values({ teacherId: teacher.id, ...values }).returning({ id: S.practiceMaterial.id });
    id = fresh.id;
  }

  // Sync the classes: drop the unticked ones, add the new ones.
  const current = await db.select().from(S.classroomPracticeMaterial).where(eq(S.classroomPracticeMaterial.practiceMaterialId, id));
  const removed = current.filter((c) => !classroomIds.includes(c.classroomId)).map((c) => c.id);
  if (removed.length) await db.delete(S.classroomPracticeMaterial).where(inArray(S.classroomPracticeMaterial.id, removed));
  const added = classroomIds.filter((cid) => !current.some((c) => c.classroomId === cid));
  if (added.length) await db.insert(S.classroomPracticeMaterial).values(added.map((classroomId) => ({ practiceMaterialId: id, classroomId }))).onConflictDoNothing();

  if (previousMedia && previousMedia !== mediaKey) await deleteMediaIfOrphaned(previousMedia);
  refresh();
  redirect("/teacher/practice-materials?saved=1");
}

export async function deletePracticeMaterial(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const m = await getOwnedPracticeMaterial(teacher.id, id);
  if (!m) return fail(t("Practice material not found."));
  await db.delete(S.practiceMaterial).where(and(eq(S.practiceMaterial.id, m.id), eq(S.practiceMaterial.teacherId, teacher.id)));
  await deleteMediaIfOrphaned(m.mediaKey);
  refresh();
  return succeed(t("Practice material deleted."));
}
