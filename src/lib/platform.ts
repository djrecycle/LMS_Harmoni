import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

/**
 * Platform-wide settings the Super Admin controls (stored in `app_setting`): whether teachers can sign up,
 * how many teacher accounts there may be, and the default upload space per teacher.
 */

const SETTING_KEY = "platform";

export type PlatformSettings = {
  /** New teachers can register (they still wait for approval). */
  registrationOpen: boolean;
  /** Teacher accounts allowed besides the Super Admin (pending + active + suspended). */
  maxTeachers: number;
  /** Upload space per teacher, in MB, unless set per teacher. */
  defaultStorageMb: number;
};

export const PLATFORM_DEFAULTS: PlatformSettings = { registrationOpen: true, maxTeachers: 20, defaultStorageMb: 500 };

export const platformSettingsSchema = z.object({
  registrationOpen: z.boolean(),
  maxTeachers: z.number().int("Must be a whole number").min(0, "Must be 0 or more").max(10_000),
  defaultStorageMb: z.number().int("Must be a whole number").min(10, "At least 10 MB").max(1_000_000),
});

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const [row] = await db.select({ value: schema.appSetting.value }).from(schema.appSetting).where(eq(schema.appSetting.key, SETTING_KEY)).limit(1);
  const p = platformSettingsSchema.partial().safeParse(row?.value ?? {});
  return { ...PLATFORM_DEFAULTS, ...(p.success ? p.data : {}) };
}

export async function savePlatformSettings(value: PlatformSettings, adminId: string) {
  await db
    .insert(schema.appSetting)
    .values({ key: SETTING_KEY, value, updatedBy: adminId })
    .onConflictDoUpdate({ target: schema.appSetting.key, set: { value, updatedAt: new Date(), updatedBy: adminId } });
}

/** Teacher accounts that count against `maxTeachers` (everyone but the Super Admin). */
export async function countTeachers(): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(schema.user)
    .where(and(eq(schema.user.role, "teacher"), eq(schema.user.isAdmin, false)));
  return r?.n ?? 0;
}

/** Teachers waiting for the Super Admin's approval. */
export async function countPendingTeachers(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(schema.user).where(and(eq(schema.user.role, "teacher"), eq(schema.user.teacherStatus, "pending")));
  return r?.n ?? 0;
}

/** Why a new teacher can't register right now, or null when they can. `message` is English, translated by the caller. */
export async function teacherSignupBlocked(): Promise<{ code: "teacher_registration_closed" | "teacher_registration_full"; message: string } | null> {
  const s = await getPlatformSettings();
  if (!s.registrationOpen) return { code: "teacher_registration_closed", message: "Teacher registration is closed for now." };
  if ((await countTeachers()) >= s.maxTeachers) return { code: "teacher_registration_full", message: "Teacher registration is full for now." };
  return null;
}

/** Upload space of one teacher in bytes (null for the Super Admin: no limit). */
export async function storageQuotaBytes(teacherId: string): Promise<number | null> {
  const [u] = await db.select({ isAdmin: schema.user.isAdmin, quota: schema.user.storageQuotaMb }).from(schema.user).where(eq(schema.user.id, teacherId)).limit(1);
  if (!u || u.isAdmin) return null;
  const mb = u.quota ?? (await getPlatformSettings()).defaultStorageMb;
  return mb * 1024 * 1024;
}
