import Link from "next/link";
import { CircleCheck, Headphones, Image as ImageIcon, Sparkles, Type, Video } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import type { StudentMaterial } from "@/lib/student-data";
import { cn, formatDate } from "@/lib/utils";
import { getT } from "@/i18n/server";

const ICON = { text: Type, image: ImageIcon, audio: Headphones, video: Video, interactive: Sparkles } as const;
const LABEL = { text: "Reading", image: "Image", audio: "Audio", video: "Video", interactive: "Interactive" } as const;

export async function StudentMaterialCard({ m }: { m: StudentMaterial }) {
  const t = await getT();
  const Icon = ICON[m.typeMedia];
  return (
    <Link
      href={`/student/materials/${m.id}`}
      className={cn(
        // min-w-0: inside a grid the card would otherwise grow to fit a long title and push the page sideways on phones.
        "group flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3.5 shadow-xs transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md",
        m.completed && "bg-success-soft/40",
      )}
    >
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl", m.completed ? "bg-success-soft text-success" : "bg-primary-soft text-primary")}>
        {m.completed ? <CircleCheck className="size-6" /> : <Icon className="size-6" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words font-bold group-hover:text-primary">{m.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{m.classroomName}</span>
          <span>·</span>
          <span>{m.today ? t("Today") : formatDate(m.date)}</span>
          <Badge tone="neutral">{t(LABEL[m.typeMedia])}</Badge>
          {m.topic && <Badge tone="neutral">{m.topic}</Badge>}
        </div>
      </div>
      {m.completed && <Badge tone="success">{t("Completed")}</Badge>}
    </Link>
  );
}
