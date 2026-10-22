import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { BottomNav, SidebarNav } from "@/components/nav-links";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/misc";
import type { CurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const t = await getT();
  const initial = user.name.trim().slice(0, 1).toUpperCase();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-card p-4 lg:flex">
        <Brand href={user.role === "teacher" ? "/teacher" : "/student"} className="px-2 pt-2" />
        <div className="flex-1 overflow-y-auto">
          <SidebarNav role={user.role} isAdmin={user.isAdmin} />
        </div>
        <div className="rounded-xl bg-muted p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-accent font-bold text-primary-foreground">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{user.name}</p>
              <Badge tone="primary" className="mt-0.5">
                {user.role === "teacher" ? (user.isAdmin ? t("Teacher · Admin") : t("Teacher")) : t("Student")}
              </Badge>
            </div>
          </div>
          <LocaleSwitcher className="mt-3 w-full justify-center" />
          <div className="mt-2 flex items-center gap-1">
            <form action={signOut} className="flex-1">
              <button className="flex h-9 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-card hover:text-danger">
                <LogOut className="size-4" /> {t("Sign out")}
              </button>
            </form>
            <ThemeToggle className="size-9" />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile header */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b bg-card/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <Brand href={user.role === "teacher" ? "/teacher" : "/student"} />
          <div className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate text-sm font-semibold">{user.name.split(" ")[0]}</span>
            <LocaleSwitcher className="shrink-0" />
            <ThemeToggle className="shrink-0" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:px-6 lg:px-8 lg:py-8 lg:pb-10">{children}</main>
      </div>
      <BottomNav role={user.role} isAdmin={user.isAdmin} />
    </div>
  );
}
