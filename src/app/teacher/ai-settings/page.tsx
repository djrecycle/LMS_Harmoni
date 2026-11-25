import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { AiDemoCard } from "@/components/ai-demo-card";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { AiUsageCard } from "@/components/ai-usage-card";
import { isClaudeCliAvailable } from "@/lib/ai-cli";
import { getAiConfigView } from "@/lib/ai-config";
import { demoUsage, getDemoConfig, getDemoRequest } from "@/lib/ai-demo";
import { isOllamaReachable } from "@/lib/ai-ollama";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("AI Settings") };
}

export default async function AiSettingsPage() {
  const t = await getT();
  const teacher = await requireTeacher();
  const view = await getAiConfigView(teacher.id); // never contains a key, only "set …1234"
  // The AI demo (a trial of the Super Admin's Claude API) is offered to other teachers when the admin turned it on.
  const demoRequest = teacher.isAdmin ? null : await getDemoRequest(teacher.id);
  const showDemo = !teacher.isAdmin && ((await getDemoConfig()).enabled || demoRequest?.status === "approved");
  const demoUse = showDemo ? await demoUsage(demoRequest) : null;
  return (
    <>
      <PageHeader
        title={t("AI Settings")}
        description={
          teacher.isAdmin
            ? t("The server's AI settings, used by your account (Super Admin). Other teachers use their own API keys. Values saved here override the server's .env file.")
            : t("Set up the AI provider for your account. The AI features (teaching documents, questions, lessons, calendar) work once you add your own API key.")
        }
      />
      {showDemo && <AiDemoCard request={demoRequest} usage={demoUse} />}
      <AiUsageCard userId={teacher.id} isAdmin={teacher.isAdmin} />
      <AiSettingsForm view={view} cliAvailable={teacher.isAdmin && isClaudeCliAvailable()} ollamaAvailable={teacher.isAdmin && (await isOllamaReachable(view.ollama.baseUrl))} />
    </>
  );
}
