"use client";

import { cn } from "@/lib/utils";
import { mediaUrl } from "@/lib/questions";
import { useT } from "@/i18n/client";

function embedVideo(url: string): string | null {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = /vimeo\.com\/(\d+)/.exec(url);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

export type PlayerKind = "image" | "audio" | "video";

/** In-app media player: image, audio, video file, or YouTube/Vimeo video. */
export function MediaPlayer({
  kind,
  mediaKey,
  title,
  onCompleted,
  onPlay,
  className,
}: {
  kind: PlayerKind;
  mediaKey: string;
  title?: string;
  onCompleted?: () => void;
  onPlay?: () => void;
  className?: string;
}) {
  const t = useT();
  const src = mediaUrl(mediaKey);
  if (!src) return null;

  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={title ?? t("Question image")} loading="lazy" className={cn("max-h-96 w-full rounded-lg bg-muted object-contain", className)} />;
  }

  if (kind === "audio") {
    return (
      <div className={cn("rounded-lg bg-primary-soft p-3", className)}>
        <audio controls preload="metadata" src={src} className="w-full" onEnded={onCompleted} onPlay={onPlay}>
          {t("Your browser does not support the audio player.")}
        </audio>
      </div>
    );
  }

  const embed = embedVideo(src);
  if (embed) {
    return (
      <div className={cn("aspect-video overflow-hidden rounded-lg bg-black", className)}>
        <iframe
          src={embed}
          title={title ?? t("Video")}
          className="size-full"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <video
      controls
      playsInline
      preload="metadata"
      src={src}
      className={cn("max-h-[28rem] w-full rounded-lg bg-black", className)}
      onEnded={onCompleted}
      onPlay={onPlay}
    >
      {t("Your browser does not support the video player.")}
    </video>
  );
}
