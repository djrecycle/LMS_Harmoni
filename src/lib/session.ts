import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student";
  isAdmin: boolean;
};

/** Session for this request (cached per request). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
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
