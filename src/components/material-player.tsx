"use client";

import { useState, useTransition } from "react";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { markMaterialCompleted } from "@/app/actions/material";
import { MediaPlayer } from "@/components/media-player";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** Lesson media + "Mark as completed" button. Audio/video played to the end automatically marks the lesson completed. */
export function MaterialPlayer({
  materialId,
  kind,
  mediaKey,
  title,
  completedInitial,
}: {
  materialId: string;
  kind: "image" | "audio" | "video" | null;
  mediaKey: string | null;
  title: string;
  completedInitial: boolean;
}) {
  const t = useT();
  const [completed, setCompleted] = useState(completedInitial);
  const [busy, start] = useTransition();

  function edit(value: boolean, auto = false) {
    start(async () => {
      const r = await markMaterialCompleted(materialId, value);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setCompleted(value);
      if (!auto || value) toast.success(r.message);
    });
  }

  return (
    <div className="grid gap-4">
      {kind && mediaKey && (
        <MediaPlayer
          kind={kind}
          mediaKey={mediaKey}
          title={title}
          onCompleted={kind === "audio" || kind === "video" ? () => !completed && edit(true, true) : undefined}
        />
      )}
      <div>
        {completed ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg bg-success-soft px-4 py-2.5 text-sm font-bold text-success">
              <CircleCheck className="size-5" /> {t("Lessons completed")}
            </span>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => edit(false)}>
              {t("Undo completed mark")}
            </Button>
          </div>
        ) : (
          <Button size="lg" disabled={busy} onClick={() => edit(true)}>
            <CircleCheck /> {t("Mark as completed")}
          </Button>
        )}
      </div>
    </div>
  );
}
