"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPassword } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { useT } from "@/i18n/client";

export default function ForgotPasswordPage() {
  const t = useT();
  const [state, action] = useActionState(forgotPassword, initialState);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("Forgot your password?")}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t("Enter your account email. We will send a link to create a new password.")}</p>
      <form action={action} className="grid gap-4">
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </Field>
        <FormMessage state={state} />
        <SubmitButton size="lg" pendingText={t("Sending…")}>
          {t("Send link")}
        </SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t("← Back to sign in")}
        </Link>
      </p>
    </>
  );
}
