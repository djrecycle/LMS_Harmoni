"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartColumn,
  ClipboardList,
  Ellipsis,
  FileQuestionMark,
  Headphones,
  LayoutDashboard,
  LogOut,
  Music,
  Piano,
  School,
  Trophy,
  User,
  WandSparkles,
  FileText,
  NotebookPen,
  CalendarClock,
  CalendarDays,
  ShieldCheck,
  X,
  Library,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Item = { href: string; label: string; Icon: React.ComponentType<{ className?: string }>; exact?: boolean };

const NAV: Record<"teacher" | "student", Item[]> = {
  teacher: [
    { href: "/teacher", label: "Dashboard", Icon: LayoutDashboard, exact: true },
    { href: "/teacher/classes", label: "Classes & Students", Icon: School },
    { href: "/teacher/materials", label: "Lessons", Icon: Library },
    { href: "/teacher/question-bank", label: "Question Bank", Icon: FileQuestionMark },
    { href: "/teacher/quizzes", label: "Quizzes", Icon: ClipboardList },
    { href: "/teacher/practice-materials", label: "Practice Materials", Icon: Music },
    { href: "/teacher/songs", label: "Piano Songs", Icon: Piano },
    { href: "/teacher/ai-generator", label: "AI Generator", Icon: WandSparkles },
    { href: "/teacher/perangkat-ajar", label: "Teaching Documents", Icon: FileText },
    { href: "/teacher/schedule", label: "Teaching Schedule", Icon: CalendarClock },
    { href: "/teacher/journal", label: "Teaching Journal", Icon: NotebookPen },
    { href: "/teacher/calendar", label: "Academic Calendar", Icon: CalendarDays },
    { href: "/teacher/grades", label: "Grades & Reports", Icon: ChartColumn },
    { href: "/teacher/profile", label: "Profile", Icon: User },
  ],
  student: [
    { href: "/student", label: "Home", Icon: LayoutDashboard, exact: true },
    { href: "/student/materials", label: "Lessons", Icon: Library },
    { href: "/student/quizzes", label: "Quizzes", Icon: ClipboardList },
    { href: "/student/practice", label: "Practice", Icon: Music },
    { href: "/student/grades", label: "My Grades", Icon: Trophy },
    { href: "/student/profile", label: "Profile", Icon: User },
  ],
};

/** Only the admin (first teacher) gets this; the page and its actions enforce it again on the server. */
const ADMIN_ITEMS: Item[] = [{ href: "/teacher/admin/ai", label: "AI Settings", Icon: ShieldCheck }];
const itemsFor = (role: "teacher" | "student", isAdmin?: boolean) => (role === "teacher" && isAdmin ? [...NAV.teacher, ...ADMIN_ITEMS] : NAV[role]);

function active(path: string, i: Item) {
  return i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/");
}

export function SidebarNav({ role, isAdmin }: { role: "teacher" | "student"; isAdmin?: boolean }) {
  const t = useT();
  const path = usePathname();
  return (
    <nav aria-label={t("Main menu")} className="flex flex-col gap-1">
      {itemsFor(role, isAdmin).map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={active(path, i) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
            active(path, i) ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <i.Icon className="size-[1.1rem]" />
          {t(i.label)}
        </Link>
      ))}
    </nav>
  );
}

/** Bottom navigation for phones: 4 main items + "Menu" holding the rest. */
export function BottomNav({ role, isAdmin }: { role: "teacher" | "student"; isAdmin?: boolean }) {
  const t = useT();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const all = itemsFor(role, isAdmin);
  const main = all.slice(0, 4);
  const remaining = all.slice(4);
  const remainingActive = remaining.some((i) => active(path, i));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-label={t("More menu")}
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t bg-card p-4 pb-24 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">{t("More menu")}</p>
              <button className="grid size-9 place-items-center rounded-lg hover:bg-muted" onClick={() => setOpen(false)} aria-label={t("Close")}>
                <X className="size-5" />
              </button>
            </div>
            <div className="grid gap-1">
              {remaining.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold",
                    active(path, i) ? "bg-primary-soft text-primary" : "hover:bg-muted",
                  )}
                >
                  <i.Icon className="size-5" />
                  {t(i.label)}
                </Link>
              ))}
              <form action={signOut}>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold text-danger hover:bg-danger-soft">
                  <LogOut className="size-5" /> {t("Sign out")}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
      <nav
        aria-label={t("Bottom menu")}
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {main.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active(path, i) ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold",
              active(path, i) ? "text-primary" : "text-muted-foreground",
            )}
          >
            <i.Icon className="size-5" />
            {t(i.label).split(" ")[0]}
          </Link>
        ))}
        <button
          onClick={() => setOpen((b) => !b)}
          className={cn("flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold", remainingActive || open ? "text-primary" : "text-muted-foreground")}
        >
          <Ellipsis className="size-5" />
          {t("Menu")}
        </button>
      </nav>
    </>
  );
}

export const HeadphonesIcon = Headphones;
