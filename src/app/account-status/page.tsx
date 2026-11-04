import { redirect } from "next/navigation";
import { Clock, LogOut, ShieldOff } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { dashboardPathFor, getRealUser, isActiveTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export const metadata = { title: "Account status" };

/** Where a teacher lands while their account waits for the Super Admin's approval, or after it is suspended. */
export default async function AccountStatusPage() {
  const t = await getT();
  const user = await getRealUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" || isActiveTeacher(user)) redirect(dashboardPathFor(user.role));
  const pending = user.teacherStatus === "pending";

  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-10">
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <div className="grid gap-4 rounded-2xl border bg-card p-6 text-center shadow-lg sm:p-8">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary-soft text-primary">{pending ? <Clock className="size-7" /> : <ShieldOff className="size-7" />}</div>
          <h1 className="text-xl font-bold">{pending ? t("Your account is waiting for approval") : t("Your account is suspended")}</h1>
          <p className="text-sm text-muted-foreground">
            {pending
              ? t("Hello {0}. Your teacher account has been created, but the admin has to approve it before you can use the app. Check back later.", user.name)
              : t("Hello {0}. Your teacher account can't be used for now. Contact the admin of this site if you think this is a mistake.", user.name)}
          </p>
          <form action={signOut}>
            <Button variant="outline" className="w-full">
              <LogOut /> {t("Sign out")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
