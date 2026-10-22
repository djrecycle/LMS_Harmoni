import type { Metadata } from "next";
import { BackPractice } from "@/components/back-practice";
import { EarTrainingPractice } from "@/components/ear-training";
import { PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Chords") };
}

export default async function ChordsPage() {
  const t = await getT();
  return (
    <>
      <BackPractice />
      <PageHeader title={t("Chords")} description={t("Listen to a chord and tell whether it is major, minor, diminished or augmented.")} />
      <EarTrainingPractice mode="chord" />
    </>
  );
}
