"use server";

import { randomInt } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { APIError } from "better-auth/api";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { db, schema } from "@/db";
import { getOwnedClassroom, isStudentInTeacherClass } from "@/lib/access";
import { fail, succeed, type ActionResult } from "@/lib/action-result";
import { zodError } from "@/lib/action-result-server";
import { auth, signupContext } from "@/lib/auth";
import { generatePassword } from "@/lib/password";
import { requireTeacher } from "@/lib/session";
import { newInviteCode, parseRosterWorkbook, type RosterRow } from "@/lib/roster-upload";
import { firstNameBase, shortUsername, usernameField } from "@/lib/username";
import { getT } from "@/i18n/server";
import type { Translate } from "@/i18n";
import { memberOf, membersOf } from "@/lib/members";

const S = schema;
const refresh = () => revalidatePath("/", "layout");

/** A student account this app creates has no real inbox, so its email is a placeholder that is never sent to. */
const syntheticEmail = (username: string) => `${username}@siswa.harmoni.local`;

function mapAuthError(e: unknown, t: Translate): string {
  if (e instanceof APIError) {
    const m = String(e.body?.message ?? e.message ?? "");
    if (/already taken|exist/i.test(m)) return t("This username is already taken.");
    if (/password/i.test(m)) return t("The password must be at least 8 characters.");
  }
  // The username plugin's own duplicate check only runs for self-registration, not for admin.createUser
  // (used below), so a repeat username surfaces as a raw unique-constraint violation instead.
  if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505") return t("This username is already taken.");
  console.error("[roster]", e);
  return t("Could not create the account.");
}

/**
 * Create one student account with a username (no email) and enroll it in a class right away.
 * Uses the `admin` plugin's createUser, which — unlike signUpEmail — never starts a session for the new
 * account, so the teacher creating it stays signed in as themself.
 */
async function createStudentAccount(name: string, username: string, password: string) {
  // No `role` here on purpose: the admin plugin's role vocabulary is "admin"/"user" and does not know about
  // this app's teacher/student roles. `defaultRole: "student"` (see auth.ts) and the databaseHooks below decide it.
  const res = await signupContext.run({ role: "student" }, () =>
    auth.api.createUser({ body: { name, email: syntheticEmail(username), password, data: { username, emailVerified: true } } }),
  );
  return res.user.id;
}

/* ------------------------------------------------------------------ */
/* Add one student by hand                                             */
/* ------------------------------------------------------------------ */

const manualStudentSchema = z.object({
  classroomId: z.uuid(),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  username: usernameField,
  password: z.string().trim().max(128).optional(),
});

export async function addStudentManually(data: unknown): Promise<ActionResult<{ username: string; password?: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const p = manualStudentSchema.safeParse(data);
  if (!p.success) return zodError(p.error);
  const v = p.data;
  const classroom = await getOwnedClassroom(teacher.id, v.classroomId);
  if (!classroom) return fail(t("Class not found."));

  const autoPassword = !v.password;
  const password = v.password || generatePassword();
  if (password.length < 8) return fail(t("The password must be at least 8 characters."));

  let studentId: string;
  try {
    studentId = await createStudentAccount(v.name, v.username, password);
  } catch (e) {
    return fail(mapAuthError(e, t));
  }

  await db.insert(S.classroomMembership).values({ classroomId: classroom.id, studentId }).onConflictDoNothing({ target: [S.classroomMembership.classroomId, S.classroomMembership.studentId] });
  refresh();
  return succeed(t("Student account created."), { username: v.username, password: autoPassword ? password : undefined });
}

/* ------------------------------------------------------------------ */
/* Bulk upload: classes + students from a spreadsheet                  */
/* ------------------------------------------------------------------ */

export type UploadRowResult = { row: number; name: string; username: string; className: string; ok: boolean; password?: string; error?: string };
export type UploadResult = { classesCreated: string[]; classesReused: string[]; students: UploadRowResult[] };

export async function uploadRoster(formData: FormData): Promise<ActionResult<UploadResult>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail(t("Choose an .xlsx file first."));
  if (file.size > 2 * 1024 * 1024) return fail(t("The file is too large (maximum 2 MB)."));

  let rows: RosterRow[];
  try {
    rows = await parseRosterWorkbook(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return fail(t("The file could not be read. Use the downloadable template."));
  }
  if (rows.length === 0) return fail(t("The file has no rows to import."));
  if (rows.length > 300) return fail(t("At most 300 rows per upload."));

  return doUpload(teacher.id, rows, t);
}

/**
 * Pick a free short username from a name: first name + random number ("rizky_27"), trying 2-digit numbers
 * first, then 3 and 4 digits, until it is not in `used`.
 */
function uniqueUsername(name: string, used: Set<string>): string {
  for (const digits of [2, 3, 4]) {
    for (let i = 0; i < 40; i++) {
      const candidate = shortUsername(name, () => randomInt(0, 1_000_000) / 1_000_000, digits);
      if (!used.has(candidate)) return candidate;
    }
  }
  // Practically unreachable (thousands of students with the same first name): count up instead.
  for (let n = 10_000; ; n++) {
    const candidate = `${firstNameBase(name)}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

async function doUpload(teacherId: string, rows: RosterRow[], t: Translate): Promise<ActionResult<UploadResult>> {
  const classByName = new Map<string, string>(); // lower(name) -> classroomId
  for (const c of await db.select({ id: S.classroom.id, name: S.classroom.name }).from(S.classroom).where(eq(S.classroom.teacherId, teacherId))) {
    classByName.set(c.name.trim().toLowerCase(), c.id);
  }
  // Usernames are unique across the whole app, not just this teacher's students, so pre-load every one in use.
  const usedUsernames = new Set<string>(
    (await db.select({ username: S.user.username }).from(S.user)).map((u) => u.username).filter((u): u is string => !!u),
  );
  const classesCreated: string[] = [];
  const classesReused: string[] = [];
  const students: UploadRowResult[] = [];
  // One shared password for every account created in this upload, so the teacher only has to announce it once.
  const sharedPassword = generatePassword();

  for (const r of rows) {
    const key = r.className.trim().toLowerCase();
    let classroomId = classByName.get(key);
    if (!classroomId) {
      const [k] = await db.insert(S.classroom).values({ name: r.className.trim(), teacherId, inviteCode: await newInviteCode() }).returning({ id: S.classroom.id });
      classroomId = k.id;
      classByName.set(key, classroomId);
      classesCreated.push(r.className.trim());
    } else if (!classesCreated.includes(r.className.trim()) && !classesReused.includes(r.className.trim())) {
      classesReused.push(r.className.trim());
    }

    if (!r.name.trim()) {
      students.push({ row: r.row, name: r.name, username: "", className: r.className, ok: false, error: t("Name is required.") });
      continue;
    }
    const uname = uniqueUsername(r.name, usedUsernames);
    usedUsernames.add(uname);

    try {
      const studentId = await createStudentAccount(r.name.trim(), uname, sharedPassword);
      await db.insert(S.classroomMembership).values({ classroomId, studentId }).onConflictDoNothing({ target: [S.classroomMembership.classroomId, S.classroomMembership.studentId] });
      students.push({ row: r.row, name: r.name, username: uname, className: r.className, ok: true, password: sharedPassword });
    } catch (e) {
      students.push({ row: r.row, name: r.name, username: uname, className: r.className, ok: false, error: mapAuthError(e, t) });
    }
  }

  refresh();
  const ok = students.filter((s) => s.ok).length;
  if (ok === 0) return fail(t("No student could be imported. Check the errors below."), undefined);
  return succeed(t("{0} of {1} students imported.", ok, students.length), { classesCreated, classesReused, students });
}

/* ------------------------------------------------------------------ */
/* Reset the password of an account the teacher created                */
/* ------------------------------------------------------------------ */

/**
 * Only for accounts this app created (they have a `username` and no working inbox, so they cannot use
 * "forgot password"). A self-registered student's password can only be changed by the student themself.
 */
export async function resetStudentPassword(studentId: string): Promise<ActionResult<{ password: string }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  if (!studentId || !(await isStudentInTeacherClass(teacher.id, studentId))) return fail(t("Student not found."));

  const [student] = await db.select({ username: S.user.username }).from(S.user).where(eq(S.user.id, studentId)).limit(1);
  if (!student?.username) return fail(t("This account signed up on its own; only the student can change its password."));

  const password = generatePassword();
  const hash = await hashPassword(password);
  const updated = await db
    .update(S.account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(S.account.userId, studentId), eq(S.account.providerId, "credential")))
    .returning({ id: S.account.id });
  if (!updated.length) return fail(t("Could not reset the password."));

  return succeed(t("Password reset."), { password });
}

export type ResetPasswordRow = { studentId: string; name: string; username: string };

/**
 * Gives the chosen students of one class a single new shared password (like a bulk upload does), so the teacher
 * announces it once. Only teacher-created accounts (with a username) are touched; the password is returned once
 * and never stored in plain text.
 */
export async function resetClassPasswords(classroomId: string, studentIds: unknown): Promise<ActionResult<{ password: string; students: ResetPasswordRow[] }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const classroom = await getOwnedClassroom(teacher.id, classroomId);
  if (!classroom) return fail(t("Class not found."));
  const ids = z.array(z.string().min(1)).min(1).max(300).safeParse(studentIds);
  if (!ids.success) return fail(t("Choose at least one student."));

  const students = await db
    .select({ studentId: S.user.id, name: S.user.name, username: S.user.username })
    .from(S.classroomMembership)
    .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
    .where(and(memberOf(classroom.id), inArray(S.user.id, ids.data)))
    .orderBy(S.user.name);
  const rows = students.filter((s): s is ResetPasswordRow => !!s.username);
  if (rows.length === 0) return fail(t("Choose at least one student."));

  const password = generatePassword();
  const hash = await hashPassword(password);
  await db
    .update(S.account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(inArray(S.account.userId, rows.map((r) => r.studentId)), eq(S.account.providerId, "credential")));

  return succeed(t("{0} passwords reset.", rows.length), { password, students: rows });
}

/* ------------------------------------------------------------------ */
/* Switch a class's existing usernames to the short format             */
/* ------------------------------------------------------------------ */

export type UsernameChange = { studentId: string; name: string; oldUsername: string; newUsername: string };

/** Already in the short format for this name ("rizky_27"), so there's nothing to change. */
const isShortUsername = (username: string, name: string) => new RegExp(`^${firstNameBase(name)}_\\d{2,}$`).test(username);

/**
 * Proposes a short username ("rizky_27") for every student in the class whose account the app created
 * (has a username) and isn't in the short format yet. Nothing is saved; the teacher confirms with applyShortUsernames.
 */
export async function previewShortUsernames(classroomId: string): Promise<ActionResult<{ changes: UsernameChange[] }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const classroom = await getOwnedClassroom(teacher.id, classroomId);
  if (!classroom) return fail(t("Class not found."));

  const members = await db
    .select({ id: S.user.id, name: S.user.name, username: S.user.username })
    .from(S.classroomMembership)
    .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
    .where(memberOf(classroom.id))
    .orderBy(S.user.name);
  const used = new Set((await db.select({ username: S.user.username }).from(S.user)).map((u) => u.username).filter((u): u is string => !!u));

  const changes: UsernameChange[] = [];
  for (const m of members) {
    if (!m.username || isShortUsername(m.username, m.name)) continue;
    const newUsername = uniqueUsername(m.name, used);
    used.add(newUsername);
    changes.push({ studentId: m.id, name: m.name, oldUsername: m.username, newUsername });
  }
  return succeed("", { changes });
}

const applySchema = z
  .array(z.object({ studentId: z.string().min(1), username: usernameField }))
  .min(1)
  .max(300)
  .refine((items) => new Set(items.map((i) => i.username)).size === items.length, "Duplicate usernames");

/**
 * Saves the usernames the teacher confirmed from previewShortUsernames. All or nothing: if any student isn't
 * in one of the teacher's classes, or any new username got taken in the meantime, nothing changes.
 * Passwords, grades and progress are untouched (they hang off the account id, not the username).
 */
export async function applyShortUsernames(classroomId: string, data: unknown): Promise<ActionResult<{ changed: number }>> {
  const t = await getT();
  const teacher = await requireTeacher();
  const classroom = await getOwnedClassroom(teacher.id, classroomId);
  if (!classroom) return fail(t("Class not found."));
  const p = applySchema.safeParse(data);
  if (!p.success) return fail(t("The list of usernames is invalid. Open the preview again."));
  const items = p.data;

  const members = await db
    .select({ id: S.user.id, username: S.user.username, email: S.user.email })
    .from(S.classroomMembership)
    .innerJoin(S.user, eq(S.user.id, S.classroomMembership.studentId))
    .where(memberOf(classroom.id));
  const byId = new Map(members.map((m) => [m.id, m]));
  if (items.some((i) => !byId.get(i.studentId)?.username)) return fail(t("The list of usernames is invalid. Open the preview again."));

  const taken = await db.select({ username: S.user.username }).from(S.user).where(inArray(S.user.username, items.map((i) => i.username)));
  if (taken.length) return fail(t("Some new usernames were taken in the meantime. Open the preview again."));

  try {
    await db.transaction(async (tx) => {
      for (const i of items) {
        const m = byId.get(i.studentId)!;
        // Keep the placeholder email in step with the username; a real email (if any) stays as it is.
        const email = m.email.endsWith("@siswa.harmoni.local") ? syntheticEmail(i.username) : m.email;
        await tx.update(S.user).set({ username: i.username, email, updatedAt: new Date() }).where(eq(S.user.id, i.studentId));
      }
    });
  } catch (e) {
    // Drizzle wraps the driver error, so the Postgres code (23505 = unique violation) sits on `cause`.
    const err = e as { code?: string; cause?: { code?: string } } | null;
    if (err?.code === "23505" || err?.cause?.code === "23505") return fail(t("Some new usernames were taken in the meantime. Open the preview again."));
    console.error("[roster] applyShortUsernames", e);
    return fail(t("Could not change the usernames."));
  }

  refresh();
  return succeed(t("{0} usernames changed.", items.length), { changed: items.length });
}
