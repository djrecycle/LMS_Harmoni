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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const t = await getT();
  const { password } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("Welcome back")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t("Sign in to keep learning.")}</p>
      {password === "changed" && (
        <Alert kind="success" className="mb-4">
          {t("Your password was changed. Please sign in.")}
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
        {t("Don't have an account?")}{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          {t("Sign up")}
        </Link>
      </p>
    </>
  );
}
