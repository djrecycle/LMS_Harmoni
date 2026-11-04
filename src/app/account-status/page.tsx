import { redirect } from "next/navigation";
import { Clock, LogOut, School, ShieldOff } from "lucide-react";
import { signOut } from "@/app/actions/auth";
import { Brand } from "@/components/brand";
import { SchoolForm } from "@/components/school-form";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { dashboardPathFor, getRealUser, isActiveTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export const metadata = { title: "Account status" };

/**
 * Where a teacher lands before they can use the app: first to fill in their school (a Google sign-up hasn't given it
 * yet), then while their account waits for the Super Admin's approval, or after it is suspended.
 */
export default async function AccountStatusPage() {
  const t = await getT();
  const user = await getRealUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" || isActiveTeacher(user)) redirect(dashboardPathFor(user.role));
  const needsSchool = !user.schoolName;
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
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
            {needsSchool ? <School className="size-7" /> : pending ? <Clock className="size-7" /> : <ShieldOff className="size-7" />}
          </div>
          <h1 className="text-xl font-bold">{needsSchool ? t("Where do you teach?") : pending ? t("Your account is waiting for approval") : t("Your account is suspended")}</h1>
          <p className="text-sm text-muted-foreground">
            {needsSchool
              ? t("Hello {0}. Fill in the name of your school first. The admin uses it to check your teacher account.", user.name)
              : pending
              ? t("Hello {0}. Your teacher account has been created, but the admin has to approve it before you can use the app. Check back later.", user.name)
              : t("Hello {0}. Your teacher account can't be used for now. Contact the admin of this site if you think this is a mistake.", user.name)}
          </p>
          {needsSchool && <SchoolForm />}
          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">
              <LogOut /> {t("Sign out")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
