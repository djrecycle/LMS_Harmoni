import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TemplateEditor } from "@/components/template-editor";
import { PageHeader } from "@/components/ui/misc";
import { isUuid } from "@/lib/access";
import { getTemplate } from "@/lib/perangkat/store";
import { BAWAAN_ID } from "@/lib/perangkat/template";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Edit template") };
}

export default async function TemplateEditPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  if (id !== BAWAAN_ID && !isUuid(id)) notFound();
  const tpl = await getTemplate(teacher.id, id);
  // getTemplate falls back to the built-in template for an unknown id; that must be a 404 here.
  if (id !== BAWAAN_ID && tpl.id !== id) notFound();
  return (
    <>
      <Link href="/teacher/perangkat-ajar/templates" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="size-4" /> {t("Modul Ajar templates")}
      </Link>
      <PageHeader title={tpl.nama} description={t("Change how the Modul Ajar looks and how the AI writes it.")} />
      <TemplateEditor initial={tpl} />
    </>
  );
}
