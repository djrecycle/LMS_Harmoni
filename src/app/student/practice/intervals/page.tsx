import type { Metadata } from "next";
import { BackPractice } from "@/components/back-practice";
import { EarTrainingPractice } from "@/components/ear-training";
import { PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Intervals") };
}

export default async function IntervalsPage() {
  const t = await getT();
  return (
    <>
      <BackPractice />
      <PageHeader title={t("Intervals")} description={t("Listen to two notes and name the distance between them.")} />
      <EarTrainingPractice mode="interval" />
    </>
  );
}
