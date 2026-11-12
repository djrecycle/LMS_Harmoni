"use server";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { db, schema } from "@/db";
import { zodError } from "@/lib/action-result-server";
import { fail, succeed, formValues, type ActionResult } from "@/lib/action-result";
import { auth, signupContext } from "@/lib/auth";
import { teacherSignupBlocked } from "@/lib/platform";
import { isAllowedTeacherEmail, TEACHER_EMAIL_RULE } from "@/lib/teacher-email";
import { rateLimit } from "@/lib/ratelimit";
import { dashboardPathFor, getRealUser, requireUser, STUDENT_VIEW_COOKIE } from "@/lib/session";
import { getT } from "@/i18n/server";
import type { Translate } from "@/i18n";

const email = z.string().trim().toLowerCase().email("Invalid email format").max(200);
const password = z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long");

function apiErrorMessage(e: unknown, fallback: string, t: Translate) {
  if (e instanceof APIError) {
    const m = String(e.body?.message ?? e.message ?? "");
    if (/already taken/i.test(m)) return t("This username is already taken. Choose another.");
    if (/exist/i.test(m)) return t("This email is already registered. Please sign in.");
    if (/invalid (email|username) or password|credential/i.test(m)) return t("Incorrect email/username or password.");
    if (/token/i.test(m)) return t("This link is invalid or has expired. Request a new one.");
    if (/password/i.test(m)) return t("The password is not acceptable or is incorrect.");
  }
  console.error("[auth]", e);
  return fallback;
}

/* ----------------------------- Register ----------------------------- */

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
    email,
    password: password,
    confirmText: z.string(),
    teacherCode: z.string().optional(),
    schoolName: z.string().trim().min(3, "Enter the name of your school").max(160, "Too long"),
    agree: z.string().optional(),
  })
  .refine((v) => v.password === v.confirmText, { path: ["confirmText"], message: "Passwords do not match" })
  .refine((v) => v.agree === "on", { path: ["agree"], message: "You must agree to the Terms and the Privacy Policy" });

/** Sign-up is for teachers only: students get their account from their teacher (roster or Excel upload). */
export async function list(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const p = registerSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  const v = p.data;

  if (!isAllowedTeacherEmail(v.email)) {
    return { ok: false, error: t(TEACHER_EMAIL_RULE), fieldErrors: { email: t(TEACHER_EMAIL_RULE) }, values: formValues(fd) };
  }

  const requireCode = process.env.TEACHER_SIGNUP_CODE?.trim();
  if (requireCode && v.teacherCode?.trim() !== requireCode) {
    return { ok: false, error: t("Incorrect teacher registration code."), fieldErrors: { teacherCode: t("Incorrect teacher registration code") }, values: formValues(fd) };
  }

  const blocked = await teacherSignupBlocked();
  if (blocked) return { ok: false, error: t(blocked.message), values: formValues(fd) };

  const rate = rateLimit(`register:${(await headers()).get("x-forwarded-for") ?? "local"}`, 10, 60 * 60 * 1000);
  if (!rate.boleh) return fail(t("Too many sign-up attempts. Try again later."));

  try {
    await signupContext.run({ role: "teacher", schoolName: v.schoolName }, () =>
      auth.api.signUpEmail({ body: { name: v.name, email: v.email, password: v.password } }),
    );
  } catch (e) {
    return fail(apiErrorMessage(e, t("Registration failed. Try again."), t), fd);
  }
  redirect(dashboardPathFor("teacher"));
}

/** A teacher's school, saved straight on the account (Better Auth's updateUser can't set an `input: false` field). */
async function storeSchool(userId: string, schoolName: string) {
  await db.update(schema.user).set({ schoolName, updatedAt: new Date() }).where(eq(schema.user.id, userId));
}

const schoolSchema = z.object({ schoolName: z.string().trim().min(3, "Enter the name of your school").max(160, "Too long") });

/** Filled in on /account-status by a teacher who signed up with Google (the email form asks for it already). */
export async function saveSchoolName(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await getRealUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect(dashboardPathFor(user.role));
  const p = schoolSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  await storeSchool(user.id, p.data.schoolName);
  redirect("/teacher"); // goes on to the dashboard, or back to /account-status while waiting for approval
}

/* ----------------------------- Sign in ------------------------------ */

// Accounts a teacher creates by hand sign in with a username instead of an email; the field accepts either.
const loginSchema = z.object({ identifier: z.string().trim().min(1, "Enter your email or username").max(200), password: z.string().min(1, "Enter your password") });

export async function login(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const p = loginSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  const { identifier, password } = p.data;
  const isEmail = identifier.includes("@");

  const rate = rateLimit(`login:${identifier.toLowerCase()}`, 8, 10 * 60 * 1000);
  if (!rate.boleh) return fail(t("Too many sign-in attempts. Try again in {0} minutes.", Math.ceil(rate.secondsWait / 60)));

  try {
    if (isEmail) await auth.api.signInEmail({ body: { email: identifier.toLowerCase(), password } });
    else await auth.api.signInUsername({ body: { username: identifier, password } });
  } catch (e) {
    return fail(apiErrorMessage(e, t("Sign-in failed. Try again."), t), fd);
  }
  const [u] = isEmail
    ? await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.email, identifier.toLowerCase())).limit(1)
    : await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.username, identifier.toLowerCase())).limit(1);
  redirect(dashboardPathFor(u?.role ?? "student"));
}

/** Redirects to Google's consent screen. Only offered when GOOGLE_CLIENT_ID/SECRET are set (see the README). */
export async function signInWithGoogle() {
  const { isGoogleSignInEnabled } = await import("@/lib/auth");
  if (!isGoogleSignInEnabled()) redirect("/login");
  // Teachers only (see lib/auth.ts): a new Google account becomes a teacher waiting for approval; errors come back to /login.
  const res = await auth.api.signInSocial({ body: { provider: "google", callbackURL: "/teacher", errorCallbackURL: "/login" } });
  if (res.url) redirect(res.url);
  redirect("/login");
}

export async function signOut() {
  (await cookies()).delete(STUDENT_VIEW_COOKIE);
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    /* the session no longer exists */
  }
  redirect("/");
}

/* ------------------------- Forgot password -------------------------- */

export async function forgotPassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const p = z.object({ email }).safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);

  const rate = rateLimit(`forgot:${p.data.email}`, 3, 15 * 60 * 1000);
  if (rate.boleh) {
    try {
      await auth.api.requestPasswordReset({ body: { email: p.data.email, redirectTo: "/reset-password" } });
    } catch (e) {
      console.error("[forgot-password]", e);
    }
  }
  // Always answer the same way so we do not reveal which emails are registered.
  return succeed(t("If the email is registered, a link to create a new password has been sent. Check your inbox (and spam folder)."));
}

const resetSchema = z
  .object({ token: z.string().min(1, "Invalid link"), password: password, confirmText: z.string() })
  .refine((v) => v.password === v.confirmText, { path: ["confirmText"], message: "Passwords do not match" });

export async function resetPassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const p = resetSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  try {
    await auth.api.resetPassword({ body: { newPassword: p.data.password, token: p.data.token } });
  } catch (e) {
    return fail(apiErrorMessage(e, t("Could not reset the password."), t));
  }
  redirect("/login?password=changed");
}

/* ----------------------------- Profile ------------------------------ */

export async function editProfile(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  // In Student view the session belongs to the teacher: never change the teacher's account from here.
  const user = await requireUser();
  if (user.studentView) return fail(t("This is not available in Student view."));
  const p = z
    .object({ name: z.string().trim().min(2, t("Name must be at least 2 characters")).max(80), schoolName: z.string().trim().max(160, "Too long").optional() })
    .refine((v) => user.role !== "teacher" || user.isAdmin || (v.schoolName?.length ?? 0) >= 3, { path: ["schoolName"], message: "Enter the name of your school" })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  try {
    await auth.api.updateUser({ body: { name: p.data.name }, headers: await headers() });
  } catch (e) {
    return fail(apiErrorMessage(e, t("Could not save the profile."), t));
  }
  if (user.role === "teacher" && p.data.schoolName !== undefined) await storeSchool(user.id, p.data.schoolName);
  return succeed(t("Profile saved."));
}

const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password"), fresh: password, confirmText: z.string() })
  .refine((v) => v.fresh === v.confirmText, { path: ["confirmText"], message: "Passwords do not match" });

export async function changePassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const user = await requireUser();
  if (user.studentView) return fail(t("This is not available in Student view."));
  const p = changePasswordSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  const rate = rateLimit(`ubahsandi:${user.id}`, 6, 10 * 60 * 1000);
  if (!rate.boleh) return fail(t("Too many attempts. Try again later."));
  try {
    await auth.api.changePassword({
      body: { currentPassword: p.data.current, newPassword: p.data.fresh, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (e) {
    return fail(apiErrorMessage(e, t("Could not change the password."), t));
  }
  return succeed(t("Password changed. Your other devices were signed out."));
}
