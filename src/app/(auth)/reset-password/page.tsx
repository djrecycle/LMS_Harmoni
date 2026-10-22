"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { Alert } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { useT } from "@/i18n/client";

function Content() {
  const t = useT();
  const token = useSearchParams().get("token");
  const error = useSearchParams().get("error");
  const [state, action] = useActionState(resetPassword, initialState);

  if (!token || error) {
    return (
      <div className="grid gap-4">
        <Alert kind="error">{t("This link is invalid or has expired.")}</Alert>
        <Link href="/forgot-password" className="text-center text-sm font-semibold text-primary hover:underline">
          {t("Request a new link")}
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <Field label={t("New password")} htmlFor="password" hint={t("At least 8 characters")} error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label={t("Repeat new password")} htmlFor="confirmText" error={state.fieldErrors?.confirmText}>
        <Input id="confirmText" name="confirmText" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" pendingText={t("Saving…")}>
        {t("Save password")}
      </SubmitButton>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useT();
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("Create a new password")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t("Choose a password that is easy for you to remember but hard to guess.")}</p>
      <Suspense>
        <Content />
      </Suspense>
    </>
  );
}
