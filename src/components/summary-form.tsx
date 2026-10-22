"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { generateMaterialDraft, saveMaterialFromAi } from "@/app/actions/ai";
import { MaterialForm } from "@/components/material-form";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import type { TopicSuggestions } from "@/lib/form-data";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

const LEVELS = ["Upper elementary", "Junior high", "SMA/SMK"] as const;

export type SourceLesson = { id: string; title: string; topic: string | null; kind: "material" | "materi_guru" | "materi_siswa" };
type Classroom = { id: string; name: string };
type ModulAjar = { id: string; title: string };

const SOURCE_GROUP_LABEL = { material: "My Lessons", materi_guru: "Teacher material (Teaching Documents)", materi_siswa: "Student material (Teaching Documents)" } as const;

export function SummaryForm({
  classroom,
  topicSuggestions,
  today,
  modulAjarDocs,
  sources,
  providers,
  remaining: remainingInitial,
  limit,
}: {
  classroom: Classroom[];
  topicSuggestions: TopicSuggestions;
  today: string;
  modulAjarDocs: ModulAjar[];
  sources: SourceLesson[];
  providers: ProviderOption[];
  remaining: number;
  limit: number;
}) {
  const t = useT();
  const [mode, setMode] = useState<"manual" | "ai">(sources.length > 0 ? "ai" : "manual");

  return (
    <div className="grid gap-5">
      <div className="inline-flex w-fit rounded-lg bg-muted p-1 text-sm font-semibold">
        {(
          [
            ["manual", t("Write by hand")],
            ["ai", t("Summarize with AI")],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={cn("rounded-md px-4 py-2", mode === k && "bg-card shadow-xs")}>
            {l}
          </button>
        ))}
      </div>

      {mode === "manual" ? (
        <MaterialForm classroom={classroom} initialAssignment={[]} topicSuggestions={topicSuggestions} today={today} modulAjarDocs={modulAjarDocs} providers={providers} remaining={remainingInitial} limit={limit} />
      ) : (
        <SummarizeExistingForm sources={sources} providers={providers} remainingInitial={remainingInitial} limit={limit} />
      )}
    </div>
  );
}

function SummarizeExistingForm({ sources, providers, remainingInitial, limit }: { sources: SourceLesson[]; providers: ProviderOption[]; remainingInitial: number; limit: number }) {
  const t = useT();
  const router = useRouter();
  const [pick, setPick] = useProviderPick();
  const anyProvider = providers.some((o) => o.available);
  const available = providerReady(providers, pick);
  const [remaining, setRemaining] = useState(remainingInitial);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Junior high");
  const [length, setLength] = useState<"short" | "medium" | "long" | "auto">("short");
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [membuat, startCreate] = useTransition();
  const [menyimpan, startSave] = useTransition();

  const source = sources.find((s) => s.id === sourceId);

  function create() {
    if (!source) return;
    setError("");
    startCreate(async () => {
      const r = await generateMaterialDraft({
        ...(source.kind === "material" ? { sourceMaterialId: source.id } : { sourceDocId: source.id }),
        level,
        kind: "summary",
        length,
        note: note || undefined,
        provider: pick,
      });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not create the lesson."));
      setTitle(r.data.title);
      setContent(r.data.content);
      setPreview(false);
      setRemaining(r.data.remaining);
    });
  }

  function save() {
    startSave(async () => {
      const r = await saveMaterialFromAi({ title, content, topic: source?.topic ?? undefined });
      if (!r.ok || !r.data) return void toast.error(r.error);
      toast.success(t("Lesson saved. Assign it to a class on this page."));
      router.push(`/teacher/materials/${r.data.id}`);
    });
  }

  return (
    <div className="grid gap-5">
      {!anyProvider && (
        <Alert kind="warning" title={t("AI is not enabled yet")}>
          {t("Install Claude Code on the server and log in, or set")} <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> {t("or")} <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> {t("in the server settings (see the README), then restart the app.")}
        </Alert>
      )}
      {anyProvider && !available && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}

      {sources.length === 0 ? (
        <Alert kind="info">{t("Nothing to summarize yet. Write a text lesson by hand first, or create a teacher/student material in Teaching Documents.")}</Alert>
      ) : (
        <form
          // grid-cols-1: a long lesson title in the select must not widen the form past a phone screen.
          className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{t("Summarize an existing lesson")}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <ProviderSelect options={providers} value={pick} onChange={setPick} />
              <Badge tone={remaining > 0 ? "primary" : "danger"}>
                {t("Remaining today:")} {remaining}/{limit}
              </Badge>
            </div>
          </div>
          <Field label={t("Lesson to summarize")} htmlFor="s-source">
            <Select id="s-source" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {(["material", "materi_guru", "materi_siswa"] as const).map((k) => {
                const group = sources.filter((s) => s.kind === k);
                if (!group.length) return null;
                return (
                  <optgroup key={k} label={t(SOURCE_GROUP_LABEL[k])}>
                    {group.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Level")} htmlFor="s-level">
              <Select id="s-level" value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {t(level)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Length")} htmlFor="s-length">
              <Select id="s-length" value={length} onChange={(e) => setLength(e.target.value as "short" | "medium" | "long" | "auto")}>
                <option value="auto">{t("Automatic (AI decides)")}</option>
                <option value="short">{t("Short (~200 words)")}</option>
                <option value="medium">{t("Medium (~450 words)")}</option>
                <option value="long">{t("Detailed (~800 words)")}</option>
              </Select>
            </Field>
          </div>
          <Field label={t("Extra notes (optional)")} htmlFor="s-note">
            <Textarea id="s-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          {error && <Alert kind="error">{error}</Alert>}
          <div>
            <Button type="submit" size="lg" disabled={!available || membuat || !sourceId}>
              {membuat ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {membuat ? t("The AI is writing…") : t("Create draft")}
            </Button>
          </div>
        </form>
      )}

      {content && (
        <section className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
          <div>
            <h2 className="text-lg font-bold">{t("AI draft")}</h2>
            <p className="text-sm text-muted-foreground">{t("Read and edit before saving. Markdown format.")}</p>
          </div>
          <Field label={t("Title")} htmlFor="d-title">
            <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="d-content" className="text-sm font-semibold">
                {t("Content")}
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
              <div className="min-h-48 rounded-lg border p-4">
                <Markdown>{content}</Markdown>
              </div>
            ) : (
              <Textarea id="d-content" value={content} onChange={(e) => setContent(e.target.value)} rows={16} className="font-mono text-[0.9rem]" />
            )}
          </div>
          <div>
            <Button size="lg" onClick={save} disabled={menyimpan || title.trim().length < 3 || content.trim().length < 10}>
              {menyimpan ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save as lesson")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
