"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { getOwnedClassSession, getOwnedClassroom } from "@/lib/access";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { zodError } from "@/lib/action-result-server";
import { planJournalGeneration, type GeneratedRow } from "@/lib/journal-generate";
import { classRoster, doneCalendarData, existingSessionKeys, scheduleForGeneration } from "@/lib/journal-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

const S = schema;
const refresh = () => revalidatePath("/teacher/journal");

const attendanceItem = z.object({
  studentId: z.string().trim().min(1),
  status: z.enum(["hadir", "sakit", "izin", "alpa"]),
  keterangan: z.string().trim().max(200).optional(),
});

const sessionSchema = z.object({
  id: z.uuid().optional(),
  classroomId: z.uuid(),
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  waktu: z.string().trim().max(80).optional(),
  materi: z.string().trim().max(2000).optional(),
  kegiatan: z.string().trim().max(4000).optional(),
  kendala: z.string().trim().max(2000).optional(),
  catatan: z.string().trim().max(2000).optional(),
  attendance: z.array(attendanceItem).max(300),
});

export async function saveClassSession(data: unknown): Promise<ActionResult<{ id: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = sessionSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const v = p.data;
  const classroom = await getOwnedClassroom(teacher.id, v.classroomId);
  if (!classroom) return fail(t("Class not found."));

  // Defense in depth: only students actually enrolled in this class may receive an attendance status.
  const member = await db.select({ id: S.classroomMembership.studentId }).from(S.classroomMembership).where(eq(S.classroomMembership.classroomId, classroom.id));
  const memberIds = new Set(member.map((m) => m.id));
  if (v.attendance.some((a) => !memberIds.has(a.studentId))) return fail(t("One of the students is not in this class."));

  const values = { classroomId: classroom.id, tanggal: v.tanggal, waktu: v.waktu || null, materi: v.materi || null, kegiatan: v.kegiatan || null, kendala: v.kendala || null, catatan: v.catatan || null };

  let sessionId = v.id;
  if (sessionId) {
    const existing = await getOwnedClassSession(teacher.id, sessionId);
    if (!existing) return fail(t("Entry not found."));
    await db.update(S.classSession).set({ ...values, updatedAt: new Date() }).where(eq(S.classSession.id, sessionId));
  } else {
    const [row] = await db.insert(S.classSession).values({ teacherId: teacher.id, ...values }).returning({ id: S.classSession.id });
    sessionId = row.id;
  }

  if (v.attendance.length) {
    await db
      .insert(S.attendanceRecord)
      .values(v.attendance.map((a) => ({ classSessionId: sessionId!, studentId: a.studentId, status: a.status, keterangan: a.keterangan || null })))
      .onConflictDoUpdate({
        target: [S.attendanceRecord.classSessionId, S.attendanceRecord.studentId],
        set: { status: sql`excluded.status`, keterangan: sql`excluded.keterangan`, updatedAt: new Date() },
      });
  }

  refresh();
  redirect(`/teacher/journal/${sessionId}`);
}

export async function deleteClassSession(id: string): Promise<ActionResult> {
  const t = await getT();
  const teacher = await requireTeacher();
  const existing = await getOwnedClassSession(teacher.id, id);
  if (!existing) return fail(t("Entry not found."));
  await db.delete(S.classSession).where(eq(S.classSession.id, id));
  refresh();
  return succeed(t("Entry deleted."));
}

/* ------------------------------------------------------------------ */
/* Auto-generate journal entries from the weekly schedule + calendar   */
/* ------------------------------------------------------------------ */

const MS_DAY = 86_400_000;

const generateRangeSchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    classroomId: z.string().trim().optional(),
  })
  .refine((v) => v.end >= v.start, { path: ["end"], message: "End date must be on or after the start date" })
  .refine((v) => (new Date(`${v.end}T00:00:00Z`).getTime() - new Date(`${v.start}T00:00:00Z`).getTime()) / MS_DAY <= 92, {
    path: ["end"],
    message: "Choose a range of 3 months or less",
  });

async function buildGenerationPlan(teacherId: string, v: z.infer<typeof generateRangeSchema>): Promise<GeneratedRow[] | null> {
  let classroomId: string | undefined;
  if (v.classroomId) {
    const classroom = await getOwnedClassroom(teacherId, v.classroomId);
    if (!classroom) return null;
    classroomId = classroom.id;
  }
  const [schedule, calendars, existingKeys] = await Promise.all([
    scheduleForGeneration(teacherId, classroomId),
    doneCalendarData(teacherId),
    existingSessionKeys(teacherId, v.start, v.end),
  ]);
  return planJournalGeneration({ start: v.start, end: v.end, schedule, calendars, existingKeys });
}

/** Preview of what "Generate from schedule" would create for this range, without writing anything. */
export async function previewJournalGeneration(data: unknown): Promise<ActionResult<{ rows: GeneratedRow[] }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = generateRangeSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const rows = await buildGenerationPlan(teacher.id, p.data);
  if (rows === null) return fail(t("Class not found."));
  return succeed(undefined, { rows });
}

/** Create the missing sessions for this range (schedule × calendar), each with the whole roster marked present by default. */
export async function generateJournalEntries(data: unknown): Promise<ActionResult<{ count: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = generateRangeSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const rows = await buildGenerationPlan(teacher.id, p.data);
  if (rows === null) return fail(t("Class not found."));

  const toCreate = rows.filter((r) => r.status === "new");
  if (toCreate.length === 0) return succeed(t("Nothing to create."), { count: 0 });

  const inserted = await db
    .insert(S.classSession)
    .values(toCreate.map((r) => ({ teacherId: teacher.id, classroomId: r.classroomId, tanggal: r.tanggal, waktu: `${r.jamMulai}-${r.jamSelesai}` })))
    .returning({ id: S.classSession.id, classroomId: S.classSession.classroomId });

  const classroomIds = [...new Set(inserted.map((s) => s.classroomId))];
  const rosterByClassroom = new Map(await Promise.all(classroomIds.map(async (id) => [id, await classRoster(id)] as const)));

  const attendanceRows = inserted.flatMap((s) => (rosterByClassroom.get(s.classroomId) ?? []).map((m) => ({ classSessionId: s.id, studentId: m.id, status: "hadir" as const })));
  if (attendanceRows.length) await db.insert(S.attendanceRecord).values(attendanceRows);

  refresh();
  return succeed(t("{0} journal entries created.", inserted.length), { count: inserted.length });
}
