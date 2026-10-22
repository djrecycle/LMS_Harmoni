import Link from "next/link";
import { BookOpen, Headphones, Image as ImageIcon, Video } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { MediaPlayer } from "@/components/media-player";
import { getT } from "@/i18n/server";

type TypeMedia = "text" | "image" | "audio" | "video" | "interactive";
type PracticeMaterial = { id: string; title: string; description: string; content: string; typeMedia: TypeMedia; mediaKey: string | null };

const ICON = { text: BookOpen, image: ImageIcon, audio: Headphones, video: Video, interactive: BookOpen } as const;

/** The card on the students' Practice page. Without `href` it is shown as a plain box (teacher preview). */
export function PracticeMaterialCard({ material, href }: { material: Pick<PracticeMaterial, "title" | "description" | "typeMedia">; href?: string }) {
  const Icon = ICON[material.typeMedia];
  const inner = (
    <>
      <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-lime-500 to-green-600 text-white shadow-sm transition-transform group-hover:rotate-3">
        <Icon className="size-8" />
      </span>
      <div className="min-w-0">
        <h3 className="break-words text-lg font-bold">{material.title}</h3>
        {material.description && <p className="break-words text-sm text-muted-foreground">{material.description}</p>}
      </div>
    </>
  );
  const cls = "group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-xs";
  return href ? (
    <Link href={href} className={`${cls} transition hover:-translate-y-0.5 hover:shadow-md`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** A practice material as the student reads it (title, media, content). */
export async function PracticeMaterialView({ material, teacherName }: { material: PracticeMaterial; teacherName: string }) {
  const t = await getT();
  const kind = material.typeMedia === "image" || material.typeMedia === "audio" || material.typeMedia === "video" ? material.typeMedia : null;
  return (
    <>
      <p className="mb-2 text-sm text-muted-foreground">
        {t("by")} {teacherName}
      </p>
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-balance break-words sm:text-4xl">{material.title}</h1>
      {material.description && <p className="mb-6 break-words text-muted-foreground">{material.description}</p>}
      {kind && material.mediaKey && (
        <div className="mb-6">
          <MediaPlayer kind={kind} mediaKey={material.mediaKey} title={material.title} />
        </div>
      )}
      {material.content.trim() && (
        <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-7">
          <Markdown>{material.content}</Markdown>
        </div>
      )}
    </>
  );
}
