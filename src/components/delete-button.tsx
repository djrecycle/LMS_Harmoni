"use client";

import { useState, useTransition } from "react";
import { Trash } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { useT } from "@/i18n/client";

/**
 * Delete button with two-step confirmation (no built-in browser dialog).
 *  `action` is a server action that takes the id.
 */
export function DeleteButton({
  action,
  id,
  label,
  confirmText,
  iconOnly,
  size = "sm",
  onDone,
}: {
  action: (id: string) => Promise<ActionResult>;
  id: string;
  label?: string;
  confirmText?: string;
  iconOnly?: boolean;
  size?: "sm" | "md";
  onDone?: () => void;
}) {
  const t = useT();
  const labelText = label ?? t("Delete");
  const confirmLabel = confirmText ?? t("Sure you want to delete?");
  const [asking, setTanya] = useState(false);
  const [busy, start] = useTransition();

  if (!asking) {
    return (
      <Button variant="danger-soft" size={iconOnly ? "icon" : size} className={iconOnly ? "size-9" : undefined} onClick={() => setTanya(true)} aria-label={labelText}>
        <Trash />
        {!iconOnly && labelText}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-danger-soft px-2 py-1">
      <span className="text-xs font-semibold text-danger">{confirmLabel}</span>
      <Button
        variant="danger"
        size="sm"
        className="h-7 px-2.5"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await action(id);
            if (!r.ok) toast.error(r.error ?? t("Could not delete"));
            else {
              toast.success(r.message ?? t("Deleted"));
              onDone?.();
            }
            setTanya(false);
          })
        }
      >
        {t("Yes")}
      </Button>
      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setTanya(false)} disabled={busy}>
        {t("Cancel")}
      </Button>
    </span>
  );
}
