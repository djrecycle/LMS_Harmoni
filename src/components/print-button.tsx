"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

export function PrintButton({ label }: { label?: string }) {
  const t = useT();
  const text = label ?? t("Print / Save as PDF");
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer /> {text}
    </Button>
  );
}
