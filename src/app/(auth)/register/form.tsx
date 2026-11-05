"use client";

import { useActionState } from "react";
import Link from "next/link";
import { list } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { useT } from "@/i18n/client";

export function RegisterForm({ needsTeacherCode }: { needsTeacherCode: boolean }) {
  const t = useT();
  const [state, action] = useActionState(list, initialState);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-4">
      <Field label={t("Full name")} htmlFor="name" error={e.name}>
        <Input id="name" name="name" autoComplete="name" defaultValue={v.name} required />
      </Field>
      <Field label={t("School name")} htmlFor="schoolName" hint={t("Example: SMP Negeri 1 Surabaya")} error={e.schoolName}>
        <Input id="schoolName" name="schoolName" autoComplete="organization" defaultValue={v.schoolName} maxLength={160} required />
      </Field>
      <Field label="Email" htmlFor="email" error={e.email}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={v.email} required />
      </Field>
      <Field label={t("Password")} htmlFor="password" hint={t("At least 8 characters")} error={e.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label={t("Repeat password")} htmlFor="confirmText" error={e.confirmText}>
        <Input id="confirmText" name="confirmText" type="password" autoComplete="new-password" required />
      </Field>
      {needsTeacherCode && (
        <Field label={t("Teacher registration code")} htmlFor="teacherCode" hint={t("Ask your school admin for this code")} error={e.teacherCode}>
          <Input id="teacherCode" name="teacherCode" defaultValue={v.teacherCode} required />
        </Field>
      )}

      <div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="agree" defaultChecked={v.agree === "on"} required className="mt-0.5 size-4 shrink-0 accent-primary" />
          <span>
            {t("I agree to the")}{" "}
            <Link href="/terms" target="_blank" className="font-semibold text-primary hover:underline">
              {t("Terms and Conditions")}
            </Link>{" "}
            {t("and the")}{" "}
            <Link href="/privacy" target="_blank" className="font-semibold text-primary hover:underline">
              {t("Privacy Policy")}
            </Link>
            .
          </span>
        </label>
        {e.agree && <p className="mt-1 text-xs font-medium text-danger">{e.agree}</p>}
      </div>

      <FormMessage state={state} />
      <SubmitButton size="lg" pendingText={t("Registering…")}>
        {t("Create account")}
      </SubmitButton>
    </form>
  );
}
