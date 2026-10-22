import type { Metadata } from "next";
import { BackPractice } from "@/components/back-practice";
import { RhythmPractice } from "@/components/rhythm-practice";
import { PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Rhythm Practice") };
}

export default async function RhythmPage({ searchParams }: { searchParams: Promise<{ pattern?: string }> }) {
  const t = await getT();
  const { pattern } = await searchParams;
  return (
    <>
      <BackPractice />
      <PageHeader title={t("Rhythm Practice")} description={t("Listen to the pattern, then tap it accurately to the tempo. Use headphones for better accuracy.")} />
      <RhythmPractice initialPatternId={pattern} />
    </>
  );
}
