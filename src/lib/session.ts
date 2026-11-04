import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { auth } from "./auth";
import { recordVisit } from "./traffic";

/** Cookie holding the id of the teacher's test student while "Student view" is on. */
export const STUDENT_VIEW_COOKIE = "harmoni_student_view";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student";
  /** The Super Admin (only one account). */
  isAdmin: boolean;
  /** Teachers: "pending" until the Super Admin approves, "suspended" when blocked. Always "active" for students. */
  teacherStatus: "pending" | "active" | "suspended";
  /** Teachers: the school they teach at (required for every teacher but the Super Admin). */
  schoolName: string | null;
  /** Set while a teacher uses Student view: this user is then the teacher's test student. */
  studentView?: { teacherId: string; teacherName: string };
};

/**
 * Session for this request (cached per request). In Student view a teacher is shown as their test student:
 *  the cookie only names that student, and it is honoured only when the student belongs to the signed-in teacher.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const real = await getRealUser();
  if (!real || real.role !== "teacher") return real;
  const demoId = (await cookies()).get(STUDENT_VIEW_COOKIE)?.value;
  if (!demoId) return real;
  const [demo] = await db
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
    .from(schema.user)
    .where(and(eq(schema.user.id, demoId), eq(schema.user.demoOwnerId, real.id)))
    .limit(1);
  if (!demo) return real;
  return { ...demo, role: "student", isAdmin: false, teacherStatus: "active", schoolName: null, studentView: { teacherId: real.id, teacherName: real.name } };
});

/** The account that is actually signed in, ignoring Student view. */
export const getRealUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string; isAdmin?: boolean; teacherStatus?: string; schoolName?: string | null };
  const user: CurrentUser = {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === "teacher" ? "teacher" : "student",
    isAdmin: Boolean(u.isAdmin),
    teacherStatus: u.teacherStatus === "pending" || u.teacherStatus === "suspended" ? u.teacherStatus : "active",
    schoolName: u.schoolName?.trim() || null,
  };
  await recordVisit(user);
  return user;
});

export function dashboardPathFor(role: CurrentUser["role"]) {
  return role === "teacher" ? "/teacher" : "/student";
}

export async function requireUser(): Promise<CurrentUser> {
  const p = await getCurrentUser();
  if (!p) redirect("/login");
  return p;
}

/** A teacher who may use the app: approved, not suspended, and with their school filled in (the Super Admin always). */
export const isActiveTeacher = (u: Pick<CurrentUser, "role" | "isAdmin" | "teacherStatus" | "schoolName"> | null) =>
  Boolean(u && u.role === "teacher" && (u.isAdmin || (u.teacherStatus === "active" && u.schoolName)));

/** Teacher-only pages & actions. Students are redirected to their own dashboard; a teacher not yet approved (or suspended, or without a school) to /account-status. */
export async function requireTeacher(): Promise<CurrentUser> {
  const p = await requireUser();
  if (p.role !== "teacher") redirect("/student");
  if (!isActiveTeacher(p)) redirect("/account-status");
  return p;
}

/** Super Admin-only pages & actions (the first teacher to register). Any other teacher goes back to their dashboard. */
export async function requireAdmin(): Promise<CurrentUser> {
  const p = await requireTeacher();
  if (!p.isAdmin) redirect("/teacher");
  return p;
}

export async function requireStudent(): Promise<CurrentUser> {
  const p = await requireUser();
  if (p.role !== "student") redirect("/teacher");
  return p;
}
