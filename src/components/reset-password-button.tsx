"use client";

import { useState, useTransition } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { resetStudentPassword } from "@/app/actions/roster";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** For an account the teacher created (username, no working email): generates and shows a new password once. */
export function ResetPasswordButton({ studentId }: { studentId: string }) {
  const t = useT();
  const [busy, start] = useTransition();
  const [shown, setShown] = useState<string | null>(null);

  if (shown) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-soft px-2 py-1 text-xs font-semibold">
        {t("New password:")} <span className="font-mono">{shown}</span>
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await resetStudentPassword(studentId);
          if (!r.ok || !r.data) return void toast.error(r.error ?? t("Could not reset the password."));
          setShown(r.data.password);
        })
      }
    >
      {busy ? <LoaderCircle className="animate-spin" /> : <KeyRound />} {t("Reset password")}
    </Button>
  );
}
