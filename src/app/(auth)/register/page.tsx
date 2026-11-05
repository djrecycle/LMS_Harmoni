import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { Alert } from "@/components/ui/misc";
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
      <h1 className="text-2xl font-extrabold tracking-tight">{t("Sign up as a teacher")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("New teacher accounts wait for the admin's approval.")}</p>
      <Alert className="mt-4 mb-6">{t("Students don't sign up here. Their teacher creates their account and gives them a username and password.")}</Alert>
      <RegisterForm needsTeacherCode={Boolean(process.env.TEACHER_SIGNUP_CODE?.trim())} />
      {isGoogleSignInEnabled() && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton label={t("Sign up as a teacher with Google")} />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t("By signing up you agree to the")}{" "}
            <Link href="/terms" className="underline">
              {t("Terms and Conditions")}
            </Link>{" "}
            {t("and the")}{" "}
            <Link href="/privacy" className="underline">
              {t("Privacy Policy")}
            </Link>
            .
          </p>
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
