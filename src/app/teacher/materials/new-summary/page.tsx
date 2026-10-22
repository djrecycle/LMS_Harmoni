import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { SummaryForm, type SourceLesson } from "@/components/summary-form";
import { PageHeader } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { dailyLimit, providerOptions, remainingAllowance } from "@/lib/ai";
import { materialFormData } from "@/lib/form-data";
import { str } from "@/lib/perangkat/util";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("New Summary") };
}

export default async function NewSummaryPage() {
  const t = await getT();
  const teacher = await requireTeacher();
  const S = schema;

  const [form, ownMaterials, perangkatDocs, providers, { remaining }] = await Promise.all([
    materialFormData(teacher.id),
    db
      .select({ id: S.material.id, title: S.material.title, topic: S.material.topic })
      .from(S.material)
      .where(and(eq(S.material.teacherId, teacher.id), eq(S.material.typeMedia, "text")))
      .orderBy(desc(S.material.updatedAt)),
    db
      .select({ id: S.teachingDoc.id, kind: S.teachingDoc.kind, title: S.teachingDoc.title, context: S.teachingDoc.context })
      .from(S.teachingDoc)
      .where(and(eq(S.teachingDoc.teacherId, teacher.id), inArray(S.teachingDoc.kind, ["materi_guru", "materi_siswa"]), eq(S.teachingDoc.status, "done")))
      .orderBy(desc(S.teachingDoc.createdAt)),
    providerOptions(),
    remainingAllowance(teacher.id),
  ]);

  const sources: SourceLesson[] = [
    ...ownMaterials.map((m) => ({ id: m.id, title: m.title, topic: m.topic, kind: "material" as const })),
    ...perangkatDocs.map((d) => ({ id: d.id, title: d.title, topic: str(d.context?.bab_judul) || str(d.context?.topik) || null, kind: d.kind as "materi_guru" | "materi_siswa" })),
  ];

  return (
    <>
      <PageHeader title={t("Short Lesson / Summary")} description={t("Write a short summary by hand, or let the AI condense one of your existing lessons.")} />
      <SummaryForm {...form} sources={sources} providers={providers} remaining={remaining} limit={await dailyLimit()} />
    </>
  );
}
