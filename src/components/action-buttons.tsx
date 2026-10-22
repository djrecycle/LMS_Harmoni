"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { regenerateInviteCode, deleteClassroom } from "@/app/actions/classroom";
import { DeleteButton } from "@/components/delete-button";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function ResetInviteCodeButton({ id }: { id: string }) {
  const t = useT();
  const [busy, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await regenerateInviteCode(id);
          r.ok ? toast.success(r.message) : toast.error(r.error);
        })
      }
    >
      <RefreshCw className={busy ? "animate-spin" : ""} /> {t("New code")}
    </Button>
  );
}

export function DeleteClassButton({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  return <DeleteButton action={deleteClassroom} id={id} label={t("Delete class")} confirmText={t("Delete permanently?")} size="md" onDone={() => router.push("/teacher/classes")} />;
}
