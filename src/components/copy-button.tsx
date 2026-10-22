"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const t = useT();
  const labelText = label ?? t("Copy");
  const [ok, setOk] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1800);
        } catch {
          /* clipboard is not available */
        }
      }}
    >
      {ok ? <Check /> : <Copy />}
      {ok ? t("Copied") : labelText}
    </Button>
  );
}
