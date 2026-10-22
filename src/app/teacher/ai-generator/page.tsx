import type { Metadata } from "next";
import { AiGenerator } from "@/components/generator-ai";
import { PageHeader } from "@/components/ui/misc";
import { dailyLimit, providerOptions, remainingAllowance } from "@/lib/ai";
import { topicSuggestions } from "@/lib/form-data";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("AI Generator") };
}

export default async function GeneratorAiPage() {
  const t = await getT();
  const teacher = await requireTeacher();
  const [{ remaining }, topics] = await Promise.all([remainingAllowance(teacher.id), topicSuggestions(teacher.id)]);
  return (
    <>
      <PageHeader title={t("AI Generator")} description={t("The AI drafts questions and lessons. You review, edit, and save them.")} />
      <AiGenerator providers={await providerOptions()} remainingInitial={remaining} limit={await dailyLimit()} topicSuggestions={topics} />
    </>
  );
}
