import { AppShell } from "@/components/app-shell";
import { PresenceHeartbeat } from "@/components/live/presence-heartbeat";
import { requireStudent } from "@/lib/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStudent();
  return (
    <AppShell user={user}>
      <PresenceHeartbeat />
      {children}
    </AppShell>
  );
}
