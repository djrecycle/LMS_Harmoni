import type { Metadata } from "next";
import { BackPractice } from "@/components/back-practice";
import { NotePractice } from "@/components/note-practice";
import { PageHeader } from "@/components/ui/misc";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Pitch Practice") };
}

export default async function PitchPage() {
  const t = await getT();
  return (
    <>
      <BackPractice />
      <PageHeader title={t("Pitch Practice")} description={t("Listen to a short melody, then repeat the notes on the piano.")} />
      <NotePractice />
    </>
  );
}
