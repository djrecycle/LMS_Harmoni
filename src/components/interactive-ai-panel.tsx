"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RotateCcw, WandSparkles } from "lucide-react";
import { generateInteractiveLessonDraft } from "@/app/actions/ai";
import { Field, Textarea } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ProviderSelect, providerReady, useProviderPick, type ProviderOption } from "@/components/provider-select";
import type { InteractiveLessonData } from "@/lib/interactive-lessons";
import { useT } from "@/i18n/client";

/**
 * Generates an interactive version of the lesson (a paged lesson: cover, parts with self-checks, case study,
 * quiz, summary, closing task) from the lesson's current content. The teacher edits it in
 * InteractiveLessonEditor, can regenerate, then saves.
 */
export function InteractiveAiPanel({
  content,
  getTitle,
  providers,
  remaining: remainingInitial,
  limit,
  draft,
  onGenerated,
}: {
  content: string;
  /** The lesson title as currently typed in the form (read when generating). */
  getTitle: () => string;
  providers: ProviderOption[];
  remaining: number;
  limit: number;
  draft: InteractiveLessonData | null;
  onGenerated: (data: InteractiveLessonData | null) => void;
}) {
  const t = useT();
  const [pick, setPick] = useProviderPick();
  const anyProvider = providers.some((o) => o.available);
  const available = providerReady(providers, pick);
  const [remaining, setRemaining] = useState(remainingInitial);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [membuat, startCreate] = useTransition();

  const hasContent = content.trim().length >= 3;
  const canCreate = available && hasContent && !membuat;

  function create() {
    if (!canCreate) return;
    setError("");
    startCreate(async () => {
      const r = await generateInteractiveLessonDraft({ title: getTitle().trim().slice(0, 150) || undefined, content, note: note.trim() || undefined, provider: pick });
      if (!r.ok || !r.data) return setError(r.error ?? t("Could not create the interactive lesson."));
      setRemaining(r.data.remaining);
      onGenerated(r.data.data);
    });
  }

  return (
    <div className="grid gap-4 rounded-lg border p-3.5">
      {!anyProvider && (
        <Alert kind="warning" title={t("AI is not enabled yet")}>
          {t("Install Claude Code on the server and log in, or set")} <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> {t("or")} <code className="rounded bg-muted px-1">GEMINI_API_KEY</code>{" "}
          {t("in the server settings (see the README), then restart the app.")}
        </Alert>
      )}
      {anyProvider && !available && <Alert kind="warning">{t("The chosen AI provider is not available on this server. Pick another one.")}</Alert>}
      {!hasContent && <Alert kind="warning">{t("Write or generate the lesson content below first — the interactive version is built from it.")}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProviderSelect options={providers} value={pick} onChange={setPick} />
        <Badge tone={remaining > 0 ? "primary" : "danger"}>
          {t("Remaining today:")} {remaining}/{limit}
        </Badge>
      </div>

      <Field label={t("Your own instructions (optional)")} htmlFor="ai-interactive-note" hint={t("What to emphasize, how many sections, anything else.")}>
        <Textarea id="ai-interactive-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </Field>

      {error && <Alert kind="error">{error}</Alert>}

      <div>
        <Button type="button" onClick={create} disabled={!canCreate}>
          {membuat ? <LoaderCircle className="animate-spin" /> : draft ? <RotateCcw /> : <WandSparkles />}
          {membuat ? t("The AI is writing…") : draft ? t("Regenerate") : t("Generate the interactive lesson")}
        </Button>
      </div>

      {draft && <p className="text-xs text-muted-foreground">{t("Edit the lesson below, then save. Regenerating replaces your edits.")}</p>}
    </div>
  );
}
