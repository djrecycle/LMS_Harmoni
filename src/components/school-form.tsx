"use client";

import { useActionState } from "react";
import { saveSchoolName } from "@/app/actions/auth";
import { FormMessage } from "@/components/form-message";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { useT } from "@/i18n/client";

/** Asks a teacher who signed up with Google for their school before anything else. */
export function SchoolForm() {
  const t = useT();
  const [state, action] = useActionState(saveSchoolName, initialState);
  return (
    <form action={action} className="grid gap-3 text-left">
      <Field label={t("School name")} htmlFor="schoolName" hint={t("Example: SMP Negeri 1 Surabaya")} error={state.fieldErrors?.schoolName}>
        <Input id="schoolName" name="schoolName" defaultValue={state.values?.schoolName} maxLength={160} required autoFocus />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingText={t("Saving…")}>{t("Save and continue")}</SubmitButton>
    </form>
  );
}
