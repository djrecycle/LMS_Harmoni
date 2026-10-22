import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { isGoogleSignInEnabled } from "@/lib/auth";
import { RegisterForm } from "./form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Sign up") };
}

export default async function RegisterPage() {
  const t = await getT();
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("Create a new account")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t("Start learning and teaching music together.")}</p>
      <RegisterForm needsTeacherCode={Boolean(process.env.TEACHER_SIGNUP_CODE?.trim())} />
      {isGoogleSignInEnabled() && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("or, as a student")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton />
        </>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("Already have an account?")}{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t("Sign in")}
        </Link>
      </p>
    </>
  );
}
