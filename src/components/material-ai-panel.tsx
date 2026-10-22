"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, LoaderCircle, WandSparkles } from "lucide-react";
import { generateMaterialDraft } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import { useT } from "@/i18n/client";

const LEVELS = ["Upper elementary", "Junior high", "SMA/SMK"] as const;
type ModulAjar = { id: string; title: string };

/**
 * Fills the lesson content with AI, grounded in whatever the teacher combines: the Topic/TP already typed
 * above, an existing Modul Ajar from Teaching Documents (Perangkat Ajar), and/or a free instruction of their
 * own. At least one of the three is required; any combination is allowed.
 */
export function MaterialAiPanel({
  topic,
  modulAjarDocs,
  providers,
  remaining: remainingInitial,
  limit,
  onGenerated,
}: {
  topic: string;
  modulAjarDocs: ModulAjar[];
  providers: ProviderOption[];
  remaining: number;
  limit: number;
  onGenerated: (draft: { title: string; content: string }) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useProviderPick();
  const anyProvider = providers.some((o) => o.available);
  const available = providerReady(providers, pick);
  const [remaining, setRemaining] = useState(remainingInitial);
  const [modulAjarId, setModulAjarId] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("Junior high");
  const [length, setLength] = useState<"short" | "medium" | "long" | "auto">("medium");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [membuat, startCreate] = useTransition();

  const canCreate = available && !membuat && (topic.trim().length >= 3 || modulAjarId || prompt.trim());

  function create() {
    if (!canCreate) return;
    setError("");
    startCreate(async () => {
      const r = await generateMaterialDraft({
        topic: topic.trim() || undefined,
        sourceDocId: modulAjarId || undefined,
        note: prompt.trim() || undefined,
        level,
        kind: "material",
        length,
        provider: pick,
      });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not create the lesson."));
      setRemaining(r.data.remaining);
      onGenerated({ title: r.data.title, content: r.data.content });
    });
  }

  return (
    <div className="rounded-lg border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 p-3 text-left text-sm font-semibold" aria-expanded={open}>
        <WandSparkles className="size-4 text-primary" />
        {t("Generate content with AI")}
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

          <p className="text-sm text-muted-foreground">{t("Combine any of these: the Topic/TP above, a Modul Ajar already in Teaching Documents, and your own instructions.")}</p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <ProviderSelect options={providers} value={pick} onChange={setPick} />
            <Badge tone={remaining > 0 ? "primary" : "danger"}>
              {t("Remaining today:")} {remaining}/{limit}
            </Badge>
          </div>

          <Field label={t("Base it on a Modul Ajar (optional)")} htmlFor="ai-modul">
            <Select id="ai-modul" value={modulAjarId} onChange={(e) => setModulAjarId(e.target.value)}>
              <option value="">{modulAjarDocs.length ? t("— none —") : t("No Modul Ajar yet")}</option>
              {modulAjarDocs.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Level")} htmlFor="ai-mat-level">
              <Select id="ai-mat-level" value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(l)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Length")} htmlFor="ai-mat-length">
              <Select id="ai-mat-length" value={length} onChange={(e) => setLength(e.target.value as "short" | "medium" | "long" | "auto")}>
                <option value="auto">{t("Automatic (AI decides)")}</option>
                <option value="short">{t("Short (~200 words)")}</option>
                <option value="medium">{t("Medium (~450 words)")}</option>
                <option value="long">{t("Detailed (~800 words)")}</option>
              </Select>
            </Field>
          </div>

          <Field label={t("Your own instructions (optional)")} htmlFor="ai-prompt" hint={t("A custom prompt: what to focus on, what to leave out, tone, anything else.")}>
            <Textarea id="ai-prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={500} />
          </Field>

          {!topic.trim() && !modulAjarId && !prompt.trim() && <p className="text-xs text-muted-foreground">{t("Fill the Topic field above, choose a Modul Ajar, or write an instruction to enable this.")}</p>}
          {error && <Alert kind="error">{error}</Alert>}

          <div>
            <Button type="button" onClick={create} disabled={!canCreate}>
              {membuat ? <LoaderCircle className="animate-spin" /> : <WandSparkles />} {membuat ? t("The AI is writing…") : t("Fill content with AI")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
