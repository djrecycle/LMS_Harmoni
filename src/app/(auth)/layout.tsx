import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { dashboardPathFor, getCurrentUser } from "@/lib/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const p = await getCurrentUser();
  if (p) redirect(dashboardPathFor(p.role));
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-32 size-[28rem] rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-40 size-[26rem] rounded-full bg-accent/20 blur-3xl" />
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-lg sm:p-8">{children}</div>
      </div>
    </div>
  );
}
