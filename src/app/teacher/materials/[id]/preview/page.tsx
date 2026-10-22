import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { MediaPlayer } from "@/components/media-player";
import { Markdown } from "@/components/markdown";
import { AiInteractiveLesson } from "@/components/lessons/ai-interactive-lesson";
import { InteractiveLesson } from "@/components/lessons/registry";
import { Badge } from "@/components/ui/misc";
import { getOwnedMaterial } from "@/lib/access";
import { isInteractiveLessonSlug } from "@/lib/interactive-lessons";
import { requireTeacher } from "@/lib/session";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Preview") };
}

export default async function PreviewMaterial({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const teacher = await requireTeacher();
  const { id } = await params;
  const material = await getOwnedMaterial(teacher.id, id);
  if (!material) notFound();

  const kind = material.typeMedia === "text" || material.typeMedia === "interactive" ? null : material.typeMedia;

  return (
    <article className="mx-auto max-w-3xl">
      <Link href={`/teacher/materials/${material.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("Edit lesson")}
      </Link>

      <div className="mb-5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft px-4 py-2 text-sm font-semibold text-primary">
        <Eye className="size-4" /> {t("Preview mode — this is what students see")}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {material.topic && <Badge tone="primary">{material.topic}</Badge>}
        <span className="text-sm text-muted-foreground">
          {t("by")} {teacher.name}
        </span>
      </div>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{material.title}</h1>

      {material.typeMedia === "interactive" && material.interactiveData && (
        <div className="mb-6">
          <AiInteractiveLesson data={material.interactiveData} title={material.title} materialId={material.id} completedInitial={false} preview />
        </div>
      )}

      {material.typeMedia === "interactive" && !material.interactiveData && material.mediaKey && isInteractiveLessonSlug(material.mediaKey) && (
        <div className="mb-6">
          <InteractiveLesson slug={material.mediaKey} materialId={material.id} completedInitial={false} preview />
        </div>
      )}

      {material.typeMedia === "interactive" && !material.interactiveData && (!material.mediaKey || !isInteractiveLessonSlug(material.mediaKey)) && (
        <div className="mb-6 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{t("This interactive lesson can't be previewed — it isn't registered.")}</div>
      )}

      {kind && material.mediaKey && (
        <div className="mb-6">
          <MediaPlayer kind={kind} mediaKey={material.mediaKey} title={material.title} />
        </div>
      )}

      {/* An interactive lesson replaces the text it was built from; the text stays stored as its source. */}
      {material.typeMedia !== "interactive" && material.content.trim() && (
        <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-7">
          <Markdown>{material.content}</Markdown>
        </div>
      )}
    </article>
  );
}
