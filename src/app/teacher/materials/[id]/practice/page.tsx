import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PracticeRecap } from "@/components/practice-recap";
import { PageHeader } from "@/components/ui/misc";
import { getOwnedMaterial } from "@/lib/access";
import { loadPracticeRecap } from "@/lib/practice-recap";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Practice recap") };
}

export default async function MaterialPracticeRecap({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const material = await getOwnedMaterial(teacher.id, id);
  if (!material) notFound();
  const { classes, rows } = await loadPracticeRecap(t, material.id);

  return (
    <>
      <Link href="/teacher/materials" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("All lessons")}
      </Link>
      <PageHeader
        title={t("Practice recap")}
        description={t("{0} — scores from the tempo, rhythm, melody and solfège practice in this lesson.", material.title)}
      />
      <PracticeRecap materialId={material.id} materialTitle={material.title} classes={classes} rows={rows} />
    </>
  );
}
