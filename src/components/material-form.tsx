"use client";

import { useActionState, useRef, useState } from "react";
import { saveMaterial } from "@/app/actions/material";
import { BlockEditor } from "@/components/block-editor";
import { FormMessage } from "@/components/form-message";
import { InteractiveAiPanel } from "@/components/interactive-ai-panel";
import { InteractiveLessonEditor } from "@/components/interactive-lesson-editor";
import { Markdown } from "@/components/markdown";
import { MaterialAiPanel } from "@/components/material-ai-panel";
import { MediaUploader } from "@/components/media-uploader";
import { TopicPicker } from "@/components/topic-picker";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit";
import type { ProviderOption } from "@/components/provider-select";
import { initialState } from "@/lib/action-result";
import type { TopicSuggestions } from "@/lib/form-data";
import { normalizeInteractiveLesson, type InteractiveLessonData } from "@/lib/interactive-lessons";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

type Type = "text" | "image" | "audio" | "video" | "interactive";
type Classroom = { id: string; name: string };
type Assignment = { classroomId: string; date: string };
type ModulAjar = { id: string; title: string };

const TYPES: { grade: Type; label: string }[] = [
  { grade: "text", label: "Text" },
  { grade: "image", label: "Image" },
  { grade: "audio", label: "Audio" },
  { grade: "video", label: "Video" },
  { grade: "interactive", label: "Interactive" },
];

export function MaterialForm({
  material,
  classroom,
  initialAssignment,
  topicSuggestions,
  today,
  modulAjarDocs,
  providers,
  remaining,
  limit,
}: {
  material?: { id: string; title: string; topic: string | null; typeMedia: Type; mediaKey: string | null; interactiveData: InteractiveLessonData | null; content: string };
  classroom: Classroom[];
  initialAssignment: Assignment[];
  topicSuggestions: TopicSuggestions;
  today: string;
  modulAjarDocs: ModulAjar[];
  providers: ProviderOption[];
  remaining: number;
  limit: number;
}) {
  const t = useT();
  const [state, action] = useActionState(saveMaterial, initialState);
  const [type, setType] = useState<Type>(material?.typeMedia ?? "text");
  const [topic, setTopic] = useState(state.values?.topic ?? material?.topic ?? "");
  const [content, setContent] = useState(material?.content ?? "");
  const [preview, setPreview] = useState(false);
  const [interactiveDraft, setInteractiveDraft] = useState<InteractiveLessonData | null>(material?.interactiveData ?? null);
  const [assignment, setAssignment] = useState<Assignment[]>(initialAssignment);
  const titleRef = useRef<HTMLInputElement>(null);
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  function onGenerated(draft: { title: string; content: string }) {
    setContent(draft.content);
    setPreview(false);
    if (titleRef.current && !titleRef.current.value.trim()) titleRef.current.value = draft.title;
  }

  const selected = (id: string) => assignment.find((x) => x.classroomId === id);
  const toggle = (id: string) =>
    setAssignment((t) => (t.some((x) => x.classroomId === id) ? t.filter((x) => x.classroomId !== id) : [...t, { classroomId: id, date: today }]));
  const setDate = (id: string, date: string) => setAssignment((t) => t.map((x) => (x.classroomId === id ? { ...x, date } : x)));

  return (
    <form action={action} className="grid gap-6">
      {material && <input type="hidden" name="id" value={material.id} />}
      <input type="hidden" name="typeMedia" value={type} />
      <input type="hidden" name="content" value={content} />
      <input type="hidden" name="assignment" value={JSON.stringify(assignment)} />
      {type === "interactive" && interactiveDraft && <input type="hidden" name="interactiveData" value={JSON.stringify(normalizeInteractiveLesson(interactiveDraft) ?? interactiveDraft)} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Lesson title")} htmlFor="title" error={e.title}>
          <Input id="title" name="title" ref={titleRef} defaultValue={v.title ?? material?.title} required />
        </Field>
        <Field label={t("Topic (optional)")} htmlFor="topic" hint={t("For grouping, e.g. Music Theory, Rhythm")} error={e.topic}>
          <TopicPicker id="topic" name="topic" value={topic} onChange={setTopic} suggestions={topicSuggestions} maxLength={300} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">{t("Main media")}</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((x) => (
            <button
              key={x.grade}
              type="button"
              onClick={() => setType(x.grade)}
              aria-pressed={type === x.grade}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
                type === x.grade ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {t(x.label)}
            </button>
          ))}
        </div>
        {(type === "image" || type === "audio" || type === "video") && (
          <div className="mt-3">
            <MediaUploader key={type} name="mediaKey" kind={type} defaultValue={type === material?.typeMedia ? material?.mediaKey : null} />
            {e.mediaKey && <p className="mt-1 text-xs font-medium text-danger">{e.mediaKey}</p>}
          </div>
        )}
        {type === "interactive" && (
          <div className="mt-3 grid gap-3">
            <p className="text-xs text-muted-foreground">{t("Write or generate the lesson content below, then generate the interactive version from it.")}</p>
            <InteractiveAiPanel
              content={content}
              getTitle={() => titleRef.current?.value ?? ""}
              providers={providers}
              remaining={remaining}
              limit={limit}
              draft={interactiveDraft}
              onGenerated={setInteractiveDraft}
            />
            {interactiveDraft && (
              <InteractiveLessonEditor value={interactiveDraft} onChange={setInteractiveDraft} title={titleRef.current?.value || material?.title || ""} materialId={material?.id} />
            )}
            {e.mediaKey && !interactiveDraft && <p className="text-xs font-medium text-danger">{e.mediaKey}</p>}
          </div>
        )}
      </fieldset>

      {(type === "text" || type === "interactive") && (
        <MaterialAiPanel topic={topic} modulAjarDocs={modulAjarDocs} providers={providers} remaining={remaining} limit={limit} onGenerated={onGenerated} />
      )}

      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="content-editor" className="text-sm font-semibold">
            {type === "text" || type === "interactive" ? t("Lesson content") : t("Explanation / notes")}
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
        {type === "interactive" && <p className="mb-2 text-xs text-muted-foreground">{t("This text is the source of the interactive lesson — students only see the interactive version.")}</p>}
        {preview ? (
          <div className="min-h-48 rounded-lg border bg-card p-4">{content.trim() ? <Markdown>{content}</Markdown> : <p className="text-sm text-muted-foreground">{t("No content yet.")}</p>}</div>
        ) : (
          <BlockEditor value={content} onChange={setContent} />
        )}
        {e.content && <p className="mt-1 text-xs font-medium text-danger">{e.content}</p>}
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t("Assign to classes")}</legend>
        <p className="mb-3 text-xs text-muted-foreground">{t("The lesson shows up in students' \"Today's Lessons\" on the chosen date, and stays available afterward.")}</p>
        {classroom.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("There are no classes yet. Create a class first to assign lessons (lessons can still be saved as drafts).")}</p>
        ) : (
          <div className="grid gap-2">
            {classroom.map((k) => {
              const assigned = selected(k.id);
              return (
                <div key={k.id} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3", assigned && "border-primary bg-primary-soft/50")}>
                  <label className="flex min-w-0 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={Boolean(assigned)} onChange={() => toggle(k.id)} className="size-5 shrink-0 accent-[var(--primary)]" />
                    <span className="min-w-0 break-words font-semibold">{k.name}</span>
                  </label>
                  {assigned && (
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{t("Publish on")}</span>
                      <Input type="date" value={assigned.date} onChange={(ev) => setDate(k.id, ev.target.value)} className="h-9 w-auto" required />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </fieldset>

      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="lg" pendingText={t("Saving…")}>
          {material ? t("Save changes") : t("Save lesson")}
        </SubmitButton>
      </div>
    </form>
  );
}
