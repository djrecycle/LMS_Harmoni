import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { BackPractice } from "@/components/back-practice";
import { PracticeMaterialView } from "@/components/practice-material-view";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/access";
import { requireStudent } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Practice") };
}
const S = schema;

export default async function PracticeMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const student = await requireStudent();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // Only materials shown to one of this student's classes.
  const [row] = await db
    .select({ material: S.practiceMaterial, teacher: S.user.name })
    .from(S.classroomPracticeMaterial)
    .innerJoin(S.classroomMembership, eq(S.classroomMembership.classroomId, S.classroomPracticeMaterial.classroomId))
    .innerJoin(S.practiceMaterial, eq(S.practiceMaterial.id, S.classroomPracticeMaterial.practiceMaterialId))
    .innerJoin(S.user, eq(S.user.id, S.practiceMaterial.teacherId))
    .where(and(eq(S.classroomPracticeMaterial.practiceMaterialId, id), eq(S.classroomMembership.studentId, student.id)))
    .limit(1);
  if (!row) notFound();

  return (
    <article className="mx-auto max-w-3xl">
      <BackPractice />
      <PracticeMaterialView material={row.material} teacherName={row.teacher} />
    </article>
  );
}
