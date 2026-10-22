"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import type { ActionResult } from "@/lib/action-result";
import { useT } from "@/i18n/client";

/**
 * A grade-level (7/8/9) tag, editable inline — click to set or correct it. Used on Perangkat Ajar documents
 * and lessons alike. `action` is a server action taking { id, kelas } — passed as a plain reference (like
 * DeleteButton's `action` prop) so this also works when the parent is a Server Component.
 */
export function KelasBadge({ id, value, action }: { id: string; value: string; action: (data: { id: string; kelas: string }) => Promise<ActionResult> }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value);
  const [saving, startSave] = useTransition();

  function open() {
    setInput(value);
    setEditing(true);
  }

  function save() {
    startSave(async () => {
      const r = await action({ id, kelas: input });
      if (!r.ok) return void toast.error(r.error ?? t("Could not save."));
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={t("Example: VII")}
          maxLength={40}
          className="h-7 w-24 px-2 text-xs"
        />
        <Button size="sm" className="h-7 px-2" disabled={saving} onClick={save} aria-label={t("Save")}>
          {saving ? <LoaderCircle className="size-3 animate-spin" /> : <Check className="size-3" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2" disabled={saving} onClick={() => setEditing(false)} aria-label={t("Cancel")}>
          <X className="size-3" />
        </Button>
      </span>
    );
  }

  return value ? (
    <button type="button" onClick={open} className="group">
      <Badge tone="primary" className="cursor-pointer gap-1 hover:brightness-110">
        {t("Class {0}", value)}
        <Pencil className="size-2.5 opacity-60 group-hover:opacity-100" />
      </Badge>
    </button>
  ) : (
    <button type="button" onClick={open}>
      <Badge tone="neutral" className="cursor-pointer border border-dashed hover:brightness-110">
        {t("Set class")}
      </Badge>
    </button>
  );
}
