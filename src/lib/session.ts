import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { auth } from "./auth";

/** Cookie holding the id of the teacher's test student while "Student view" is on. */
export const STUDENT_VIEW_COOKIE = "harmoni_student_view";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student";
  isAdmin: boolean;
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
  return { ...demo, role: "student", isAdmin: false, studentView: { teacherId: real.id, teacherName: real.name } };
});

/** The account that is actually signed in, ignoring Student view. */
export const getRealUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string; isAdmin?: boolean };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === "teacher" ? "teacher" : "student",
    isAdmin: Boolean(u.isAdmin),
  };
});

export function dashboardPathFor(role: CurrentUser["role"]) {
  return role === "teacher" ? "/teacher" : "/student";
}

export async function requireUser(): Promise<CurrentUser> {
  const p = await getCurrentUser();
  if (!p) redirect("/login");
  return p;
}

/** Teacher-only pages & actions. Students are redirected to their own dashboard. */
export async function requireTeacher(): Promise<CurrentUser> {
  const p = await requireUser();
  if (p.role !== "teacher") redirect("/student");
  return p;
}

/** Admin-only pages & actions (the first teacher to register). Any other teacher goes back to their dashboard. */
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
