"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { aiImageReady, generateAiIllustration, generateAiImage } from "@/app/actions/ai-image";
import type { ImageReady } from "@/lib/ai";
import { uploadMedia } from "@/lib/notation-render";
import { svgToPng } from "@/lib/svg-render";
import { MediaUploader } from "@/components/media-uploader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/** Where a picture can go: the question itself, or one answer choice. */
export type ImageTarget = { id: string; label: string; shape: "question" | "option"; prefill: string };

type Style = "illustration" | "photo";

/**
 * The teacher writes what the picture should show and the AI draws it, or uploads their own file instead:
 *  - illustration: Claude draws it as SVG code, the browser turns it into a PNG;
 *  - photo: a realistic picture from a Gemini image model (needs a Gemini key with an image quota).
 * `onApply` puts the new media key on the chosen target (the question, or a choice).
 */
export function AiImagePanel({
  targets,
  initial,
  ready,
  disabled,
  onApply,
  onClose,
}: {
  targets: ImageTarget[];
  initial?: string;
  /** Which AI pictures the teacher can make. Left out = asked from the server. */
  ready?: ImageReady;
  disabled?: boolean;
  onApply: (targetId: string, key: string) => Promise<boolean> | boolean;
  onClose: () => void;
}) {
  const t = useT();
  const first = targets.find((x) => x.id === initial) ?? targets[0];
  const [target, setTarget] = useState(first?.id ?? "");
  const [prompt, setPrompt] = useState(first?.prefill ?? "");
  const [uploadVersion, setUploadVersion] = useState(0);
  const [busy, start] = useTransition();
  const [asked, setAsked] = useState<ImageReady | null>(null);
  useEffect(() => {
    if (ready !== undefined) return;
    let live = true;
    aiImageReady()
      .then((r) => live && setAsked(r))
      .catch(() => live && setAsked({ photo: false, illustration: null }));
    return () => {
      live = false;
    };
  }, [ready]);
  const can = ready ?? asked;
  const [chosenStyle, setStyle] = useState<Style | null>(null);
  const style: Style = chosenStyle ?? (can && !can.illustration && can.photo ? "photo" : "illustration");
  const canMake = can === null ? null : style === "photo" ? can.photo : Boolean(can.illustration);
  const current = targets.find((x) => x.id === target) ?? first;
  if (!current) return null;

  function pick(id: string) {
    const next = targets.find((x) => x.id === id);
    if (!next) return;
    // Keep what the teacher typed; only swap the suggestion when the box still holds the previous one (or nothing).
    if (!prompt.trim() || prompt === current.prefill) setPrompt(next.prefill);
    setTarget(id);
  }

  function generate() {
    start(async () => {
      let key: string;
      if (style === "photo") {
        const r = await generateAiImage({ prompt, shape: current.shape });
        if (!r.ok || !r.data) return void toast.error(r.error ?? t("Could not make the image"));
        key = r.data.key;
      } else {
        const r = await generateAiIllustration({ prompt, shape: current.shape });
        if (!r.ok || !r.data) return void toast.error(r.error ?? t("Could not make the image"));
        try {
          key = await uploadMedia(await svgToPng(r.data.svg));
        } catch (e) {
          return void toast.error(t(e instanceof Error ? e.message : "Could not make the image"));
        }
      }
      if (await onApply(current.id, key)) toast.success(t("The AI picture is ready."));
    });
  }

  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-3">
      <div className="flex items-start gap-2">
        <p className="flex flex-1 items-center gap-2 text-sm font-bold">
          <Sparkles className="size-4 text-primary" /> {t("Picture with AI")}
        </p>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label={t("Close")}>
          <X />
        </Button>
      </div>

      {targets.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Picture for")}>
          {targets.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === current.id}
              disabled={busy}
              onClick={() => pick(x.id)}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors", x.id === current.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}

      {can && (
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t("Picture style")}>
          <span className="text-xs font-semibold text-muted-foreground">{t("Style")}:</span>
          {(["illustration", "photo"] as const).map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={style === x}
              disabled={busy}
              onClick={() => setStyle(x)}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors", style === x ? "border-primary bg-primary-soft text-primary" : "bg-card hover:bg-muted")}
            >
              {x === "illustration" ? t("Illustration ({0})", can.illustration ?? "Claude") : t("Realistic (Gemini)")}
            </button>
          ))}
        </div>
      )}

      {canMake === null ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> {t("Loading…")}
        </p>
      ) : canMake ? (
        <>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={1500}
            disabled={busy}
            className="min-h-20 bg-card text-sm"
            placeholder={
              style === "illustration"
                ? current.shape === "option"
                  ? t("e.g. a soprano recorder seen from the front, the holes for the note G covered")
                  : t("e.g. a piano keyboard of one octave with the key D marked in red")
                : current.shape === "option"
                  ? t("e.g. a soprano recorder, realistic, white background")
                  : t("e.g. a student playing the pianika in front of the class, cartoon style")
            }
            aria-label={t("Describe the picture")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || disabled || prompt.trim().length < 3} onClick={generate}>
              {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />} {busy ? t("Making the picture…") : t("Make picture")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {style === "illustration"
                ? t("Simple drawings (instruments, keyboards, diagrams). Uses 1 AI allowance. Check the result: AI pictures can contain mistakes.")
                : t("Describe what the picture shows. Uses 1 AI allowance. Check the result: AI pictures can contain mistakes.")}
            </p>
          </div>
        </>
      ) : (
        <Alert kind="info">
          {style === "photo" ? t("Realistic pictures need a Gemini API key with an image quota.") : t("AI is not set up yet. Add your own Gemini or Anthropic API key in AI Settings first.")}{" "}
          <Link href="/teacher/ai-settings" className="font-semibold underline">
            {t("AI Settings")}
          </Link>
        </Alert>
      )}

      <div className="grid gap-1.5">
        <p className="text-xs font-semibold text-muted-foreground">{t("Or upload your own file")}</p>
        <div className="max-w-md">
          <MediaUploader
            key={`${current.id}-${uploadVersion}`}
            name={`own-${current.id}`}
            kind="image"
            allowLink={false}
            onChange={(key) => {
              if (!key) return;
              start(async () => {
                if (await onApply(current.id, key)) setUploadVersion((v) => v + 1);
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}
