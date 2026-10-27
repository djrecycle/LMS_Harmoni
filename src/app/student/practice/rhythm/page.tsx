import type { Metadata } from "next";
import { BackPractice } from "@/components/back-practice";
import { RhythmPractice } from "@/components/rhythm-practice";
import { PageHeader } from "@/components/ui/misc";
import { rhythmPatternsFromMaterials } from "@/lib/rhythm-materials";
import { requireStudent } from "@/lib/session";
import { studentPracticeMaterials } from "@/lib/student-data";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Rhythm Practice") };
}

export default async function RhythmPage({ searchParams }: { searchParams: Promise<{ pattern?: string }> }) {
  const t = await getT();
  const { pattern } = await searchParams;
  const student = await requireStudent();
  // Rhythm blocks of the teacher's practice materials join the pattern list.
  const teacherPatterns = rhythmPatternsFromMaterials(await studentPracticeMaterials(student.id));
  return (
    <>
      <BackPractice />
      <PageHeader title={t("Rhythm Practice")} description={t("Listen to the pattern, then tap it accurately to the tempo. Use headphones for better accuracy.")} />
      <RhythmPractice initialPatternId={pattern} teacherPatterns={teacherPatterns} />
    </>
  );
}
