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
import { rateLimit } from "@/lib/ratelimit";
import { dashboardPathFor, requireUser, STUDENT_VIEW_COOKIE } from "@/lib/session";
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
    role: z.enum(["teacher", "student"], { error: "Choose a role" }),
    teacherCode: z.string().optional(),
  })
  .refine((v) => v.password === v.confirmText, { path: ["confirmText"], message: "Passwords do not match" });

export async function list(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const t = await getT();
  const p = registerSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  const v = p.data;

  const requireCode = process.env.TEACHER_SIGNUP_CODE?.trim();
  if (v.role === "teacher" && requireCode && v.teacherCode?.trim() !== requireCode) {
    return { ok: false, error: t("Incorrect teacher registration code."), fieldErrors: { teacherCode: t("Incorrect teacher registration code") }, values: formValues(fd) };
  }

  const rate = rateLimit(`register:${(await headers()).get("x-forwarded-for") ?? "local"}`, 10, 60 * 60 * 1000);
  if (!rate.boleh) return fail(t("Too many sign-up attempts. Try again later."));

  try {
    await signupContext.run({ role: v.role }, () =>
      auth.api.signUpEmail({ body: { name: v.name, email: v.email, password: v.password } }),
    );
  } catch (e) {
    return fail(apiErrorMessage(e, t("Registration failed. Try again."), t), fd);
  }
  redirect(dashboardPathFor(v.role));
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
  const res = await auth.api.signInSocial({ body: { provider: "google", callbackURL: "/student" } });
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
  if ((await requireUser()).studentView) return fail(t("This is not available in Student view."));
  const p = z.object({ name: z.string().trim().min(2, t("Name must be at least 2 characters")).max(80) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return zodError(p.error, fd);
  try {
    await auth.api.updateUser({ body: { name: p.data.name }, headers: await headers() });
  } catch (e) {
    return fail(apiErrorMessage(e, t("Could not save the profile."), t));
  }
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
