import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudentPreviewPage } from "@/components/student-preview-page";
import { isUuid } from "@/lib/access";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Try as a student") };
}

export default async function TryAsStudent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <StudentPreviewPage source={{ kind: "exam", id }} backHref={`/teacher/exams/${id}`} />;
}
