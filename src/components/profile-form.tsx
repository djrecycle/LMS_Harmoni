"use client";

import { useActionState } from "react";
import { editProfile, changePassword } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { useT } from "@/i18n/client";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const t = useT();
  const [p, profileAction] = useActionState(editProfile, initialState);
  const [s, passwordAction] = useActionState(changePassword, initialState);
  return (
    <div className="grid max-w-xl gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("Profile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={profileAction} className="grid gap-4">
            <Field label={t("Full name")} htmlFor="name" error={p.fieldErrors?.name}>
              <Input id="name" name="name" defaultValue={p.values?.name ?? name} required />
            </Field>
            <Field label="Email" htmlFor="email" hint={t("Email cannot be changed")}>
              <Input id="email" value={email} disabled readOnly />
            </Field>
            <FormMessage state={p} />
            <div>
              <SubmitButton pendingText={t("Saving…")}>{t("Save profile")}</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("Change password")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={passwordAction} className="grid gap-4" key={s.ok ? "ok" : "form"}>
            <Field label={t("Current password")} htmlFor="current" error={s.fieldErrors?.current}>
              <Input id="current" name="current" type="password" autoComplete="current-password" required />
            </Field>
            <Field label={t("New password")} htmlFor="fresh" hint={t("At least 8 characters")} error={s.fieldErrors?.fresh}>
              <Input id="fresh" name="fresh" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label={t("Repeat new password")} htmlFor="confirmText" error={s.fieldErrors?.confirmText}>
              <Input id="confirmText" name="confirmText" type="password" autoComplete="new-password" required />
            </Field>
            <FormMessage state={s} />
            <div>
              <SubmitButton pendingText={t("Saving…")}>{t("Change password")}</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
