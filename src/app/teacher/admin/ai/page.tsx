import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { isClaudeCliAvailable } from "@/lib/ai-cli";
import { getAiConfigView } from "@/lib/ai-config";
import { isOllamaReachable } from "@/lib/ai-ollama";
import { requireAdmin } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("AI Settings") };
}

export default async function AiSettingsPage() {
  const t = await getT();
  await requireAdmin();
  const view = await getAiConfigView(); // never contains a key, only "set …1234"
  return (
    <>
      <PageHeader
        title={t("AI Settings")}
        description={t("Choose which AI provider the teaching-document, quiz and calendar generators use. Only admins can see this page. Values saved here override the server's .env file.")}
      />
      <AiSettingsForm view={view} cliAvailable={isClaudeCliAvailable()} ollamaAvailable={await isOllamaReachable(view.ollama.baseUrl)} />
    </>
  );
}
