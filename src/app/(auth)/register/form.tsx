"use client";

import { useActionState, useState } from "react";
import { GraduationCap, Music } from "lucide-react";
import { list } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

export function RegisterForm({ needsTeacherCode }: { needsTeacherCode: boolean }) {
  const t = useT();
  const [state, action] = useActionState(list, initialState);
  const [role, setRole] = useState<"student" | "teacher">((state.values?.role as "teacher" | "student") ?? "student");
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t("I am registering as a")}</legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["student", t("Student"), Music, t("Learn & practice")],
              ["teacher", t("Teacher"), GraduationCap, t("Manage classes")],
            ] as const
          ).map(([grade, label, Icon, hint]) => (
            <label
              key={grade}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-colors",
                role === grade ? "border-primary bg-primary-soft" : "border-input hover:bg-muted",
              )}
            >
              <input type="radio" name="role" value={grade} checked={role === grade} onChange={() => setRole(grade)} className="sr-only" />
              <Icon className={cn("size-6", role === grade ? "text-primary" : "text-muted-foreground")} />
              <span className="text-sm font-bold">{label}</span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </label>
          ))}
        </div>
        {e.role && <p className="mt-1 text-xs font-medium text-danger">{e.role}</p>}
      </fieldset>

      <Field label={t("Full name")} htmlFor="name" error={e.name}>
        <Input id="name" name="name" autoComplete="name" defaultValue={v.name} required />
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
      {role === "teacher" && needsTeacherCode && (
        <Field label={t("Teacher registration code")} htmlFor="teacherCode" hint={t("Ask your school admin for this code")} error={e.teacherCode}>
          <Input id="teacherCode" name="teacherCode" defaultValue={v.teacherCode} required />
        </Field>
      )}

      <FormMessage state={state} />
      <SubmitButton size="lg" pendingText={t("Registering…")}>
        {t("Create account")}
      </SubmitButton>
    </form>
  );
}
