import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TemplateManager } from "@/components/template-manager";
import { PageHeader } from "@/components/ui/misc";
import { listTemplates } from "@/lib/perangkat/store";
import { ringkasan } from "@/lib/perangkat/template";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Modul Ajar templates") };
}

export default async function TemplatesPage() {
  const t = await getT();
  const teacher = await requireTeacher();
  const templates = await listTemplates(teacher.id);
  return (
    <>
      <Link href="/teacher/perangkat-ajar" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="size-4" /> {t("Teaching Documents")}
      </Link>
      <PageHeader title={t("Modul Ajar templates")} description={t("A template sets how the Word file of a Modul Ajar looks and how the AI writes it.")} />
      <TemplateManager templates={templates.map((x) => ({ id: x.id, name: x.nama, description: x.deskripsi, summary: ringkasan(x), builtin: x.bawaan }))} />
    </>
  );
}
