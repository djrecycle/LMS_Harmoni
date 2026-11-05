import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/components/google-button";
import { Alert } from "@/components/ui/misc";
import { isGoogleSignInEnabled } from "@/lib/auth";
import { LoginForm } from "./form";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Sign in") };
}

/** Errors Google sign-in sends back here (see lib/auth.ts); anything else gets the generic message. */
const GOOGLE_ERRORS: Record<string, string> = {
  google_teachers_only: "Google sign-in is for teachers only. Students, please sign in with your email or username and password.",
  teacher_registration_closed: "Teacher registration is closed for now.",
  teacher_registration_full: "Teacher registration is full for now.",
  access_denied: "Google sign-in was cancelled.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ password?: string; error?: string }> }) {
  const t = await getT();
  const { password, error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("Welcome back")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t("Sign in to keep learning.")}</p>
      {password === "changed" && (
        <Alert kind="success" className="mb-4">
          {t("Your password was changed. Please sign in.")}
        </Alert>
      )}
      {error && (
        <Alert kind="error" className="mb-4">
          {t(GOOGLE_ERRORS[error] ?? "Google sign-in failed. Try again, or sign in with your email and password.")}
        </Alert>
      )}
      <LoginForm />
      {isGoogleSignInEnabled() && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t("or")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton />
        </>
      )}
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("New teacher?")}{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          {t("Sign up as a teacher")}
        </Link>
        <span className="mt-1 block text-xs">{t("Students: ask your teacher for your username and password.")}</span>
      </p>
    </>
  );
}
