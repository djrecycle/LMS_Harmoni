"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Trash, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MediaPlayer, type PlayerKind } from "@/components/media-player";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const ACCEPT: Record<PlayerKind, string> = {
  image: "image/png,image/jpeg,image/gif,image/webp,image/avif",
  audio: "audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,audio/webm,.mp3,.wav,.ogg,.m4a",
  video: "video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov",
};
const LABEL: Record<PlayerKind, string> = { image: "image", audio: "audio", video: "video" };
const LIMIT_MB = 50;

/** Upload a file to storage (or paste a link), keeping its key in the hidden input `name`. */
export function MediaUploader({
  name,
  kind,
  defaultValue,
  allowLink = true,
  onChange,
}: {
  name: string;
  kind: PlayerKind;
  defaultValue?: string | null;
  allowLink?: boolean;
  onChange?: (key: string) => void;
}) {
  const t = useT();
  const [key, setKey] = useState(defaultValue ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const edit = (k: string) => {
    setKey(k);
    onChange?.(k);
  };

  function upload(file: File) {
    setError("");
    if (file.size > LIMIT_MB * 1024 * 1024) return setError(t("Maximum file size is {0} MB.", LIMIT_MB));
    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) edit(res.key);
        else setError(res.error ?? t("Upload failed."));
      } catch {
        setError(t("Upload failed. Try again."));
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError(t("The connection dropped while uploading."));
    };
    setProgress(0);
    xhr.send(fd);
  }

  function useLink() {
    setError("");
    if (!/^https:\/\/\S+$/i.test(link.trim())) return setError(t("The link must start with https://"));
    edit(link.trim());
    setLink("");
  }

  return (
    <div className="grid gap-3">
      <input type="hidden" name={name} value={key} />
      {key ? (
        <div className="grid gap-2 rounded-lg border p-3">
          <MediaPlayer kind={kind} mediaKey={key} />
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">{/^https?:/.test(key) ? key : t("Uploaded file")}</p>
            <Button variant="danger-soft" size="sm" onClick={() => edit("")}>
              <Trash /> {t("Delete")}
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn("grid place-items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center", progress !== null && "opacity-70")}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) upload(f);
          }}
        >
          {progress !== null ? (
            <>
              <LoaderCircle className="size-6 animate-spin text-primary" />
              <p className="text-sm font-semibold">{t("Uploading…")} {progress}%</p>
              <div className="h-2 w-48 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </>
          ) : (
            <>
              <Upload className="size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("Drag")} {LABEL[kind]} {t("file here, or")}</p>
              <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                {t("Choose")} {LABEL[kind]}
              </Button>
              <p className="text-xs text-muted-foreground">{t("Max.")} {LIMIT_MB} MB</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT[kind]}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {!key && allowLink && kind !== "audio" && progress === null && (
        <div className="flex gap-2">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={kind === "video" ? t("…or paste a YouTube / Vimeo / video file link") : t("…or paste an image link (https://)")}
            aria-label={t("Media link")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                useLink();
              }
            }}
          />
          <Button variant="outline" onClick={useLink} disabled={!link}>
            {t("Use")}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
