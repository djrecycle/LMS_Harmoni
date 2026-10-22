"use server";

import { and, eq, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/access";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { requireStudent } from "@/lib/session";
import { deleteFile } from "@/lib/storage";
import { today } from "@/lib/utils";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/", "layout");

const resultSchema = z.object({
  kind: z.enum(["note", "rhythm", "interval", "chord", "scale", "tempo", "melody", "solfege"]),
  title: z.string().trim().min(2).max(120),
  score: z.number().int().min(0).max(100),
  detail: z.record(z.string(), z.unknown()).optional(),
  /** The lesson the practice was done in (only kept when the lesson is published in one of the student's classes). */
  materialId: z.string().uuid().optional(),
});

/** Save the pitch/rhythm practice score of the signed-in student. */
export async function savePracticeResult(data: unknown): Promise<ActionResult<{ linked: boolean }>> {
  const t = await getT();
  const student = await requireStudent();
  const p = resultSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const { materialId, ...result } = p.data;
  let lesson: string | null = null;
  if (materialId) {
    const [m] = await db
      .select({ id: S.classroomMaterial.materialId })
      .from(S.classroomMaterial)
      .innerJoin(S.classroomMembership, eq(S.classroomMembership.classroomId, S.classroomMaterial.classroomId))
      .where(and(eq(S.classroomMaterial.materialId, materialId), eq(S.classroomMembership.studentId, student.id), lte(S.classroomMaterial.date, today())))
      .limit(1);
    lesson = m?.id ?? null;
    if (!lesson) console.warn(`[practice] lesson ${materialId} is not published in a class of student ${student.id}; score saved without it`);
  }
  await db.insert(S.practiceResult).values({ studentId: student.id, ...result, detail: result.detail ?? null, materialId: lesson });
  refresh();
  return succeed(t("Practice score saved."), { linked: Boolean(lesson) });
}

const recordingSchema = z.object({
  fileKey: z.string().min(5).max(300),
  title: z.string().trim().min(1, "Give the recording a title").max(100),
  mimeType: z.string().max(100),
  durationSeconds: z.number().int().min(0).max(3600).nullable().optional(),
});

/** Record a recording that was already uploaded through /api/upload. The file must be in this student's own folder. */
export async function saveRecording(data: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const student = await requireStudent();
  const p = recordingSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  if (!p.data.fileKey.startsWith(`recording/${student.id}/`)) return fail(t("Invalid recording file."));
  const [r] = await db
    .insert(S.recording)
    .values({ studentId: student.id, title: p.data.title, fileKey: p.data.fileKey, mimeType: p.data.mimeType, durationSeconds: p.data.durationSeconds ?? null })
    .returning({ id: S.recording.id });
  refresh();
  return succeed(t("Recording saved."), { id: r.id });
}

export async function deleteRecording(id: string): Promise<ActionResult> {
  const t = await getT();
  const student = await requireStudent();
  if (!isUuid(id)) return fail(t("Recording not found."));
  const [r] = await db.select().from(S.recording).where(and(eq(S.recording.id, id), eq(S.recording.studentId, student.id))).limit(1);
  if (!r) return fail(t("Recording not found."));
  await db.delete(S.recording).where(eq(S.recording.id, r.id));
  await deleteFile(r.fileKey);
  refresh();
  return succeed(t("Recording deleted."));
}
