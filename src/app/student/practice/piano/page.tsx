import type { Metadata } from "next";
import { Metronome } from "@/components/metronome";
import { PianoModes } from "@/components/piano-modes";
import { PageHeader } from "@/components/ui/misc";
import { BackPractice } from "@/components/back-practice";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Virtual Piano") };
}

export default async function PianoPage() {
  const t = await getT();
  return (
    <>
      <BackPractice />
      <PageHeader title={t("Virtual Piano")} description={t("Play a song with falling notes, or play freely. Slide your finger across the keys for a glissando.")} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
          <PianoModes />
        </div>
        <Metronome />
      </div>
    </>
  );
}
