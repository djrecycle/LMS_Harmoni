import type { Metadata } from "next";
import { BackPractice } from "@/components/back-practice";
import { EarTrainingPractice } from "@/components/ear-training";
import { PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Scales") };
}

export default async function ScalesPage() {
  const t = await getT();
  return (
    <>
      <BackPractice />
      <PageHeader title={t("Scales")} description={t("Listen to a scale and name its type.")} />
      <EarTrainingPractice mode="scale" />
    </>
  );
}
