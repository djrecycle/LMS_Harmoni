import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, lte } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { MaterialPlayer } from "@/components/material-player";
import { MaterialViewTracker } from "@/components/live/material-view-tracker";
import { AiInteractiveLesson } from "@/components/lessons/ai-interactive-lesson";
import { InteractiveLesson } from "@/components/lessons/registry";
import { Badge } from "@/components/ui/misc";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/access";
import { requireStudent } from "@/lib/session";
import { today } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Lessons") };
}
const S = schema;

export default async function ReadMaterial({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const student = await requireStudent();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  // Only lessons already published in this student's class.
  const [m] = await db
    .select({ material: S.material, teacher: S.user.name })
    .from(S.classroomMaterial)
    .innerJoin(S.classroomMembership, eq(S.classroomMembership.classroomId, S.classroomMaterial.classroomId))
    .innerJoin(S.material, eq(S.material.id, S.classroomMaterial.materialId))
    .innerJoin(S.user, eq(S.user.id, S.material.teacherId))
    .where(and(eq(S.classroomMaterial.materialId, id), eq(S.classroomMembership.studentId, student.id), lte(S.classroomMaterial.date, today())))
    .limit(1);
  if (!m) notFound();

  const [progress] = await db
    .select({ completed: S.materialProgress.completed })
    .from(S.materialProgress)
    .where(and(eq(S.materialProgress.studentId, student.id), eq(S.materialProgress.materialId, id)))
    .limit(1);

  const { material } = m;
  const kind = material.typeMedia === "text" || material.typeMedia === "interactive" ? null : material.typeMedia;

  return (
    <article className="mx-auto max-w-3xl">
      <MaterialViewTracker materialId={material.id} />
      <Link href="/student/materials" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("All lessons")}
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {material.topic && <Badge tone="primary">{material.topic}</Badge>}
        <span className="text-sm text-muted-foreground">{t("by")} {m.teacher}</span>
      </div>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{material.title}</h1>

      {material.typeMedia === "interactive" && material.interactiveData && (
        <div className="mb-6">
          <AiInteractiveLesson data={material.interactiveData} title={material.title} materialId={material.id} completedInitial={progress?.completed ?? false} />
        </div>
      )}
      {material.typeMedia === "interactive" && !material.interactiveData && material.mediaKey && (
        <div className="mb-6">
          <InteractiveLesson slug={material.mediaKey} materialId={material.id} completedInitial={progress?.completed ?? false} />
        </div>
      )}

      {kind && (
        <div className="mb-6">
          <MaterialPlayer materialId={material.id} kind={kind} mediaKey={material.mediaKey} title={material.title} completedInitial={progress?.completed ?? false} />
        </div>
      )}

      {/* An interactive lesson replaces the text it was built from; the text stays stored as its source. */}
      {material.typeMedia !== "interactive" && material.content.trim() && (
        <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-7">
          <Markdown>{material.content}</Markdown>
        </div>
      )}

      {!kind && material.typeMedia !== "interactive" && (
        <div className="mt-6">
          <MaterialPlayer materialId={material.id} kind={null} mediaKey={null} title={material.title} completedInitial={progress?.completed ?? false} />
        </div>
      )}
    </article>
  );
}
