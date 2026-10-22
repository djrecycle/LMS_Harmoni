"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, WandSparkles } from "lucide-react";
import { generatePracticeMaterialDraft } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import { useT } from "@/i18n/client";

const LEVELS = ["Upper elementary", "Junior high", "SMA/SMK"] as const;
type Lesson = { id: string; title: string };
export type PracticeDraft = { title: string; description: string; content: string };

/** Fills a practice material with AI from a topic/song, an existing lesson, and/or the teacher's own instructions. */
export function PracticeMaterialAiPanel({
  lessons,
  providers,
  remaining: remainingInitial,
  limit,
  onGenerated,
}: {
  lessons: Lesson[];
  providers: ProviderOption[];
  remaining: number;
  limit: number;
  onGenerated: (draft: PracticeDraft) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useProviderPick();
  const anyProvider = providers.some((o) => o.available);
  const available = providerReady(providers, pick);
  const [remaining, setRemaining] = useState(remainingInitial);
  const [topic, setTopic] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Junior high");
  const [length, setLength] = useState<"short" | "medium" | "long" | "auto">("medium");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [busy, startBusy] = useTransition();

  const canCreate = available && !busy && (topic.trim().length >= 3 || lessonId || prompt.trim());

  function create() {
    if (!canCreate) return;
    setError("");
    startBusy(async () => {
      const r = await generatePracticeMaterialDraft({
        topic: topic.trim() || undefined,
        sourceMaterialId: lessonId || undefined,
        note: prompt.trim() || undefined,
        level,
        length,
        provider: pick,
      });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not create the practice material."));
      setRemaining(r.data.remaining);
      onGenerated({ title: r.data.title, description: r.data.description, content: r.data.content });
    });
  }

  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 p-3 text-left text-sm font-semibold" aria-expanded={open}>
        <WandSparkles className="size-4 text-primary" />
        {t("Generate practice with AI")}
        {open ? <ChevronUp className="ml-auto size-4" /> : <ChevronDown className="ml-auto size-4" />}
      </button>
      {open && (
        <div className="grid gap-4 border-t p-3.5">
          {!anyProvider && (
            <Alert kind="warning" title={t("AI is not enabled yet")}>
              {t("Install Claude Code on the server and log in, or set")} <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> {t("or")} <code className="rounded bg-muted px-1">GEMINI_API_KEY</code> {t("in the server settings (see the README), then restart the app.")}
            </Alert>
          )}
          {anyProvider && !available && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}

          <p className="text-sm text-muted-foreground">{t("The AI writes a step-by-step exercise: warm-up, practice steps, tips and a self-check list. It fills the title, short description and content; you can edit everything afterwards.")}</p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ProviderSelect options={providers} value={pick} onChange={setPick} />
            <Badge tone={remaining > 0 ? "primary" : "danger"}>
              {t("Remaining today:")} {remaining}/{limit}
            </Badge>
          </div>

          <Field label={t("Topic, song or skill")} htmlFor="ai-pm-topic" hint={t("e.g. Ampar-Ampar Pisang melody, ti-ti rhythm, C major scale")}>
            <Input id="ai-pm-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} />
          </Field>

          <Field label={t("Base it on a lesson (optional)")} htmlFor="ai-pm-lesson">
            <Select id="ai-pm-lesson" value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
              <option value="">{lessons.length ? t("— none —") : t("No lessons yet")}</option>
              {lessons.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Level")} htmlFor="ai-pm-level">
              <Select id="ai-pm-level" value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(l)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Length")} htmlFor="ai-pm-length">
              <Select id="ai-pm-length" value={length} onChange={(e) => setLength(e.target.value as "short" | "medium" | "long" | "auto")}>
                <option value="auto">{t("Automatic (AI decides)")}</option>
                <option value="short">{t("Short (~150 words)")}</option>
                <option value="medium">{t("Medium (~300 words)")}</option>
                <option value="long">{t("Detailed (~550 words)")}</option>
              </Select>
            </Field>
          </div>

          <Field label={t("Your own instructions (optional)")} htmlFor="ai-pm-prompt" hint={t("A custom prompt: what to focus on, what to leave out, tone, anything else.")}>
            <Textarea id="ai-pm-prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={500} />
          </Field>

          {!topic.trim() && !lessonId && !prompt.trim() && <p className="text-xs text-muted-foreground">{t("Fill a topic, choose a lesson, or write an instruction to enable this.")}</p>}
          {error && <Alert kind="error">{error}</Alert>}

          <div>
            <Button type="button" onClick={create} disabled={!canCreate}>
              {busy ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {busy ? t("The AI is writing…") : t("Fill with AI")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
