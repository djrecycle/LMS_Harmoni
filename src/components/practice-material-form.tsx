"use client";

import { useActionState, useRef, useState } from "react";
import { savePracticeMaterial } from "@/app/actions/practice-material";
import { BlockEditor } from "@/components/block-editor";
import { FormMessage } from "@/components/form-message";
import { Markdown } from "@/components/markdown";
import { MediaUploader } from "@/components/media-uploader";
import { PracticeMaterialAiPanel, type PracticeDraft } from "@/components/practice-material-ai-panel";
import type { ProviderOption } from "@/components/provider-select";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import { initialState } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Type = "text" | "image" | "audio" | "video";

const TYPES: { value: Type; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
];

export function PracticeMaterialForm({
  material,
  classroom,
  initialClassroomIds,
  lessons,
  providers,
  remaining,
  limit,
}: {
  material?: { id: string; title: string; description: string; typeMedia: Type; mediaKey: string | null; content: string };
  classroom: { id: string; name: string }[];
  initialClassroomIds: string[];
  lessons: { id: string; title: string }[];
  providers: ProviderOption[];
  remaining: number;
  limit: number;
}) {
  const t = useT();
  const [state, action] = useActionState(savePracticeMaterial, initialState);
  const [type, setType] = useState<Type>(material?.typeMedia ?? "text");
  const [content, setContent] = useState(material?.content ?? "");
  const [preview, setPreview] = useState(false);
  const [classroomIds, setClassroomIds] = useState<string[]>(initialClassroomIds);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  // The AI fills the content; title and description only when the teacher left them empty.
  function onGenerated(draft: PracticeDraft) {
    setContent(draft.content);
    setPreview(false);
    if (titleRef.current && !titleRef.current.value.trim()) titleRef.current.value = draft.title;
    if (descriptionRef.current && !descriptionRef.current.value.trim()) descriptionRef.current.value = draft.description;
  }

  const toggle = (id: string) => setClassroomIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
    <form action={action} className="grid gap-6">
      {material && <input type="hidden" name="id" value={material.id} />}
      <input type="hidden" name="typeMedia" value={type} />
      <input type="hidden" name="content" value={content} />
      <input type="hidden" name="classroomIds" value={JSON.stringify(classroomIds)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Title")} htmlFor="title" error={e.title}>
          <Input id="title" name="title" ref={titleRef} defaultValue={v.title ?? material?.title} required maxLength={150} />
        </Field>
        <Field label={t("Short description (optional)")} htmlFor="description" hint={t("Shown on the card in the students' Practice page")} error={e.description}>
          <Input id="description" name="description" ref={descriptionRef} defaultValue={v.description ?? material?.description} maxLength={200} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t("Main media")}</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((x) => (
            <button
              key={x.value}
              type="button"
              onClick={() => setType(x.value)}
              aria-pressed={type === x.value}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
                type === x.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
        {type !== "text" && (
          <div className="mt-3">
            <MediaUploader key={type} name="mediaKey" kind={type} defaultValue={type === material?.typeMedia ? material?.mediaKey : null} />
            {e.mediaKey && <p className="mt-1 text-xs font-medium text-danger">{e.mediaKey}</p>}
          </div>
        )}
      </fieldset>

      <PracticeMaterialAiPanel lessons={lessons} providers={providers} remaining={remaining} limit={limit} onGenerated={onGenerated} />

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="content-editor" className="text-sm font-semibold">
            {type === "text" ? t("Practice content") : t("Instructions / notes")}
          </label>
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
            <button type="button" onClick={() => setPreview(false)} className={cn("rounded-md px-3 py-1", !preview && "bg-card shadow-xs")}>
              {t("Write")}
            </button>
            <button type="button" onClick={() => setPreview(true)} className={cn("rounded-md px-3 py-1", preview && "bg-card shadow-xs")}>
              {t("Preview")}
            </button>
          </div>
        </div>
        {preview ? (
          <div className="min-h-48 rounded-lg border bg-card p-4">{content.trim() ? <Markdown>{content}</Markdown> : <p className="text-sm text-muted-foreground">{t("No content yet.")}</p>}</div>
        ) : (
          <BlockEditor value={content} onChange={setContent} />
        )}
        {e.content && <p className="mt-1 text-xs font-medium text-danger">{e.content}</p>}
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t("Show to classes")}</legend>
        <p className="mb-3 text-xs text-muted-foreground">{t("Students in the ticked classes see this on their Practice page.")}</p>
        {classroom.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("There are no classes yet. Create a class first (the practice material can still be saved as a draft).")}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {classroom.map((k) => {
              const on = classroomIds.includes(k.id);
              return (
                <label key={k.id} className={cn("flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border p-3", on && "border-primary bg-primary-soft/50")}>
                  <input type="checkbox" checked={on} onChange={() => toggle(k.id)} className="size-5 shrink-0 accent-[var(--primary)]" />
                  <span className="min-w-0 break-words font-semibold">{k.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="lg" pendingText={t("Saving…")}>
          {material ? t("Save changes") : t("Save practice material")}
        </SubmitButton>
      </div>
    </form>
  );
}
