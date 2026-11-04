import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, username } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getT } from "@/i18n/server";
import { sendEmail } from "./email";
import { teacherSignupBlocked } from "./platform";

/** The account is being created / signed in through an OAuth callback (Google), not the email form. */
const viaOAuth = (ctx: unknown) => {
  const path = (ctx as { path?: unknown } | null | undefined)?.path;
  return typeof path === "string" && path.startsWith("/callback");
};

/**
 * Google sign-in is only offered when both are set (see the README). It is for TEACHERS only: a new Google account
 * becomes a teacher waiting for the Super Admin's approval (and counts against the teacher limit); a student
 * account can't sign in with Google.
 */
const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
export const isGoogleSignInEnabled = () => googleConfigured;

/**
 * The role may only be set from the registration server action (which validates the teacher code).
 *  The /api/auth/sign-up/email endpoint called directly always produces a `student` account.
 */
export const signupContext = new AsyncLocalStorage<{ role: "teacher" | "student" }>();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      const t = await getT();
      await sendEmail({
        to: user.email,
        subject: t("Reset your Harmoni Music Class password"),
        text: t("Hello {0},\n\nClick the link below to create a new password (valid for 1 hour):\n{1}\n\nIgnore this email if you did not request it.", user.name, url),
        html: t('<p>Hello {0},</p><p><a href="{1}">Click here to create a new password</a> (valid for 1 hour).</p><p>Ignore this email if you did not request it.</p>', user.name, url),
      });
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  ...(googleConfigured
    ? { socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } } }
    : {}),
  user: {
    additionalFields: {
      // input:false -> the client cannot fill it in through the public endpoint
      role: { type: "string", required: false, defaultValue: "student", input: false },
      isAdmin: { type: "boolean", required: false, defaultValue: false, input: false },
      teacherStatus: { type: "string", required: false, defaultValue: "active", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u, ctx) => {
          const google = viaOAuth(ctx);
          const role = google ? "teacher" : (signupContext.getStore()?.role ?? "student");
          if (google) {
            const blocked = await teacherSignupBlocked();
            if (blocked) throw new APIError("FORBIDDEN", { code: blocked.code, message: blocked.message });
          }
          let isAdmin = false;
          if (role === "teacher") {
            // The very first teacher becomes the Super Admin; after that nobody can get it (a unique index also enforces one).
            const admin = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.isAdmin, true)).limit(1);
            isAdmin = admin.length === 0;
          }
          // Every later teacher waits for the Super Admin's approval.
          const teacherStatus = role === "teacher" && !isAdmin ? "pending" : "active";
          return { data: { ...u, role, isAdmin, teacherStatus } };
        },
      },
    },
    session: {
      create: {
        // Google is for teachers: a student account (e.g. one whose email matches) can't sign in with it.
        before: async (s, ctx) => {
          if (!viaOAuth(ctx)) return;
          const [u] = await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, s.userId)).limit(1);
          if (u?.role !== "teacher") throw new APIError("FORBIDDEN", { code: "google_teachers_only", message: "Google sign-in is for teachers only." });
        },
      },
    },
  },
  plugins: [
    // Accounts a teacher creates by hand (roster/attendance) sign in with a username instead of an email.
    username({ minUsernameLength: 3, maxUsernameLength: 24, displayUsername: false }),
    // Only used for admin.createUser: it creates an account WITHOUT starting a session for it, so a teacher
    // creating a student stays signed in as themself (signUpEmail always logs in as the new account).
    admin({ defaultRole: "student", adminRoles: [] }),
    nextCookies(), // must stay last: it needs to see the final response to set cookies
  ],
});
