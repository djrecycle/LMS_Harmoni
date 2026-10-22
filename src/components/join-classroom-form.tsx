"use client";

import { useActionState } from "react";
import { joinClassroom } from "@/app/actions/classroom";
import { FormMessage } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { useT } from "@/i18n/client";

export function JoinClassForm() {
  const t = useT();
  const [state, action] = useActionState(joinClassroom, initialState);
  return (
    <form action={action} className="grid gap-3">
      <div className="flex gap-2">
        <Input
          name="code"
          placeholder={t("Class code, e.g. MUSIC7A")}
          aria-label={t("Class code")}
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          className="font-mono tracking-widest uppercase"
          required
        />
        <SubmitButton pendingText="…">{t("Join")}</SubmitButton>
      </div>
      {state.fieldErrors?.code && <p className="text-xs font-medium text-danger">{state.fieldErrors.code}</p>}
      {!state.fieldErrors?.code && <FormMessage state={state} />}
    </form>
  );
}
