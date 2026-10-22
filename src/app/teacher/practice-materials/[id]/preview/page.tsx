import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { PracticeMaterialCard, PracticeMaterialView } from "@/components/practice-material-view";
import { getOwnedPracticeMaterial } from "@/lib/access";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Preview") };
}

export default async function PreviewPracticeMaterial({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const material = await getOwnedPracticeMaterial(teacher.id, id);
  if (!material) notFound();

  return (
    <article className="mx-auto max-w-3xl">
      <Link href={`/teacher/practice-materials/${material.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("Edit practice material")}
      </Link>

      <div className="mb-5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-4 py-2 text-sm font-semibold text-primary">
        <Eye className="size-4 shrink-0" /> {t("Preview mode — this is what students see")}
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t("Card on the Practice page")}</h2>
        <PracticeMaterialCard material={material} />
      </section>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("After the student opens it")}</h2>
      <div className="rounded-2xl border border-dashed p-4 sm:p-6">
        <PracticeMaterialView material={material} teacherName={teacher.name} />
      </div>
    </article>
  );
}
