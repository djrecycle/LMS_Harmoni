import { AppShell } from "@/components/app-shell";
import { requireTeacher } from "@/lib/session";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTeacher();
  return <AppShell user={user}>{children}</AppShell>;
}
