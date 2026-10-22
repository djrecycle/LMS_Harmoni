"use client";

import { useActionState } from "react";
import { createClassroom, editClassroom } from "@/app/actions/classroom";
import { FormMessage } from "@/components/form-message";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { useT } from "@/i18n/client";

export function ClassForm({ classroom }: { classroom?: { id: string; name: string; description: string | null } }) {
  const t = useT();
  const [state, action] = useActionState(classroom ? editClassroom : createClassroom, initialState);
  const v = state.values ?? {};
  return (
    <form action={action} className="grid gap-4">
      {classroom && <input type="hidden" name="id" value={classroom.id} />}
      <Field label={t("Class name")} htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" placeholder={t("Example: Music Class VII-A")} defaultValue={v.name ?? classroom?.name} required />
      </Field>
      <Field label={t("Description (optional)")} htmlFor="description" error={state.fieldErrors?.description}>
        <Textarea id="description" name="description" rows={2} defaultValue={v.description ?? classroom?.description ?? ""} />
      </Field>
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingText={t("Saving…")}>{classroom ? t("Save changes") : t("Create class")}</SubmitButton>
      </div>
    </form>
  );
}
