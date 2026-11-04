"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/misc";
import { useT } from "@/i18n/client";

/** Shown where an AI feature is offered but the teacher has no usable AI provider yet. */
export function AiSetupNotice() {
  const t = useT();
  return (
    <Alert kind="warning" title={t("AI is not set up yet")}>
      {t("Add your own Gemini or Anthropic API key first, then the AI features work for your account.")}{" "}
      <Link href="/teacher/ai-settings" className="font-semibold text-primary underline">
        {t("Open AI Settings")}
      </Link>
    </Alert>
  );
}
