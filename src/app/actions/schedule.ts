"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getOwnedClassroom, getOwnedSchedule, isUuid } from "@/lib/access";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { zodError } from "@/lib/action-result-server";
import { aiErrorMessage, generateJson, isPerangkatAiAvailable, PROVIDER_CHOICES, providerUnavailableMessage, refundAllowance, remainingAllowance, takeAllowance, type ProviderChoice } from "@/lib/ai";
import { AiError } from "@/lib/ai-error";
import { DAYS } from "@/lib/days";
import { extractScheduleSource } from "@/lib/schedule-import/extract";
import { buildPrompt, SCHEMA, SYSTEM } from "@/lib/schedule-import/prompt";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/teacher/schedule");

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const scheduleSchema = z
  .object({
    id: z.uuid().optional(),
    classroomId: z.string().optional(), // "" = free-text class, no linked classroom
    className: z.string().trim().max(80).optional(),
    hari: z.enum(["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"]),
    jamMulai: z.string().regex(HHMM, "Invalid time"),
    jamSelesai: z.string().regex(HHMM, "Invalid time"),
    mataPelajaran: z.string().trim().min(2, "Enter the subject").max(120),
    catatan: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.jamSelesai > v.jamMulai, { path: ["jamSelesai"], message: "End time must be after the start time" })
  .refine((v) => v.classroomId || v.className?.trim(), { path: ["className"], message: "Choose a class or enter a class name" });

export async function saveSchedule(data: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = scheduleSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const v = p.data;

  let classroomId: string | null = null;
  let className: string | null = v.className?.trim() || null;
  if (v.classroomId && isUuid(v.classroomId)) {
    const classroom = await getOwnedClassroom(teacher.id, v.classroomId);
    if (!classroom) return fail(t("Class not found."));
    classroomId = classroom.id;
    className = null; // the classroom's own name is used instead
  }

  const values = { classroomId, className, hari: v.hari, jamMulai: v.jamMulai, jamSelesai: v.jamSelesai, mataPelajaran: v.mataPelajaran, catatan: v.catatan || null };

  if (v.id) {
    const existing = await getOwnedSchedule(teacher.id, v.id);
    if (!existing) return fail(t("Entry not found."));
    await db.update(S.teacherSchedule).set({ ...values, updatedAt: new Date() }).where(eq(S.teacherSchedule.id, v.id));
    refresh();
    return succeed(t("Schedule entry saved."), { id: v.id });
  }
  const [row] = await db.insert(S.teacherSchedule).values({ teacherId: teacher.id, ...values }).returning({ id: S.teacherSchedule.id });
  refresh();
  return succeed(t("Schedule entry saved."), { id: row.id });
}

export async function deleteSchedule(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const existing = await getOwnedSchedule(teacher.id, id);
  if (!existing) return fail(t("Entry not found."));
  await db.delete(S.teacherSchedule).where(eq(S.teacherSchedule.id, id));
  refresh();
  return succeed(t("Entry deleted."));
}

/* ------------------------------------------------------------------ */
/* Import a whole timetable from an uploaded file/photo (AI-assisted)  */
/* ------------------------------------------------------------------ */

export type ScheduleDraftRow = { hari: (typeof DAYS)[number]; jamMulai: string; jamSelesai: string; mataPelajaran: string; kelas: string; catatan: string };

const rawEntrySchema = z
  .object({
    hari: z.enum(DAYS),
    jam_mulai: z.string().regex(HHMM),
    jam_selesai: z.string().regex(HHMM),
    mata_pelajaran: z.string().trim().min(1).max(120),
    kelas: z.string().trim().max(80).optional().default(""),
    catatan: z.string().trim().max(500).optional().default(""),
  })
  .refine((v) => v.jam_selesai > v.jam_mulai)
  .transform((v): ScheduleDraftRow => ({ hari: v.hari, jamMulai: v.jam_mulai, jamSelesai: v.jam_selesai, mataPelajaran: v.mata_pelajaran, kelas: v.kelas, catatan: v.catatan }));

const extractUploadSchema = z.object({ provider: z.enum(PROVIDER_CHOICES).default("auto") });

/** Read an uploaded timetable file/photo with the AI. The result is a draft only — nothing is saved yet. */
export async function extractScheduleDraft(formData: FormData): Promise<ActionResult<{ rows: ScheduleDraftRow[]; discarded: number; remaining: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = extractUploadSchema.safeParse({ provider: formData.get("provider") ?? "auto" });
  if (!p.success) return fail(t("Invalid request."));
  const { provider } = p.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(t("Choose a file first."));

  let source: Awaited<ReturnType<typeof extractScheduleSource>>;
  try {
    source = await extractScheduleSource(file);
  } catch (e) {
    return fail(t(e instanceof AiError ? e.message : "The file could not be read."));
  }

  if (!(await isPerangkatAiAvailable(provider))) return fail(t(providerUnavailableMessage(provider)));
  if (!(await takeAllowance(teacher.id))) return fail(t("You have reached today's AI usage limit. Try again tomorrow."));

  try {
    const { data: result } = await generateJson<{ entries: unknown[] }>({
      system: SYSTEM,
      user: buildPrompt(source.kind === "text" ? source.text : ""),
      image: source.kind === "image" ? { data: source.data, mediaType: source.mediaType } : undefined,
      schema: SCHEMA,
      provider,
      maxTokens: 8000,
      effort: "medium",
    });

    const rows: ScheduleDraftRow[] = [];
    let discarded = 0;
    for (const raw of result.entries ?? []) {
      const parsed = rawEntrySchema.safeParse(raw);
      if (parsed.success) rows.push(parsed.data);
      else discarded++;
    }
    if (rows.length === 0) {
      await refundAllowance(teacher.id);
      return fail(t("The AI could not find any schedule entries in this file."));
    }
    const { remaining } = await remainingAllowance(teacher.id);
    return succeed(undefined, { rows, discarded, remaining });
  } catch (e) {
    await refundAllowance(teacher.id);
    return fail(t(aiErrorMessage(e)));
  }
}

const importRowSchema = z
  .object({
    hari: z.enum(DAYS),
    jamMulai: z.string().regex(HHMM, "Invalid time"),
    jamSelesai: z.string().regex(HHMM, "Invalid time"),
    mataPelajaran: z.string().trim().min(2, "Enter the subject").max(120),
    kelas: z.string().trim().max(80),
    catatan: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.jamSelesai > v.jamMulai, { path: ["jamSelesai"], message: "End time must be after the start time" });

const importSchema = z.object({ rows: z.array(importRowSchema).min(1, "Select at least one entry").max(60, "Import at most 60 entries at a time") });

/** Save the reviewed draft rows as real schedule entries. A class name matching an existing classroom (case-insensitive) is linked automatically. */
export async function importScheduleRows(data: unknown): Promise<ActionResult<{ count: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = importSchema.safeParse(data);
  if (!p.success) return zodError(p.error);

  const classrooms = await db.select({ id: S.classroom.id, name: S.classroom.name }).from(S.classroom).where(eq(S.classroom.teacherId, teacher.id));
  const byName = new Map(classrooms.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const values = p.data.rows.map((r) => {
    const matched = byName.get(r.kelas.trim().toLowerCase());
    return {
      teacherId: teacher.id,
      classroomId: matched ?? null,
      className: matched ? null : r.kelas.trim() || null,
      hari: r.hari,
      jamMulai: r.jamMulai,
      jamSelesai: r.jamSelesai,
      mataPelajaran: r.mataPelajaran,
      catatan: r.catatan?.trim() || null,
    };
  });
  await db.insert(S.teacherSchedule).values(values);
  refresh();
  return succeed(t("{0} schedule entries imported.", values.length), { count: values.length });
}
