"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PlugZap, RefreshCw, Save, Trash2 } from "lucide-react";
import { clearAiKey, listProviderModels, saveAiSettings, testAiProvider } from "@/app/actions/ai-settings";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import type { AiConfigView, Source } from "@/lib/ai-config"; // type-only: this file must not pull server code into the browser bundle
import { useT } from "@/i18n/client";

type Provider = "claude-cli" | "anthropic" | "gemini" | "ollama";

function SourceBadge({ source }: { source: Source }) {
  const t = useT();
  return <Badge tone={source === "dashboard" ? "primary" : "neutral"}>{source === "dashboard" ? t("Set here") : source === "env" ? t("From server (.env)") : t("Built-in default")}</Badge>;
}

type ModelList = { models?: string[]; error?: string; loading?: boolean };
const CUSTOM = "__custom__";

/**
 * A model picker: the provider's own model list plus "Other…" for a name that is not in it.
 * When the list cannot be loaded (no key yet, server down) it falls back to a plain text box, with the reason shown.
 */
function ModelField({ id, label, hint, error, value, onChange, defaultLabel, list, onReload, disabled }: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (v: string) => void;
  /** What "empty" means, e.g. "Server default (gemini-2.5-flash)". */
  defaultLabel: string;
  list: ModelList | undefined;
  onReload: () => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [other, setOther] = useState(false);
  const models = list?.models;
  const custom = other || (value !== "" && models !== undefined && !models.includes(value));
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        {models ? (
          <Select
            id={id}
            value={custom ? CUSTOM : value}
            onChange={(e) => {
              const v = e.target.value;
              setOther(v === CUSTOM);
              onChange(v === CUSTOM ? "" : v);
            }}
          >
            <option value="">{defaultLabel}</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={CUSTOM}>{t("Other…")}</option>
          </Select>
        ) : (
          <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={100} placeholder={defaultLabel} spellCheck={false} />
        )}
        <Button type="button" size="sm" variant="outline" onClick={onReload} disabled={disabled || list?.loading} aria-label={t("Reload the model list")} title={t("Reload the model list")}>
          <RefreshCw className={list?.loading ? "animate-spin" : ""} />
        </Button>
      </div>
      {custom && models && <Input className="mt-2" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={100} placeholder={t("Type the model name")} spellCheck={false} />}
      {list?.error && !list.loading && <p className="mt-1 text-xs text-muted-foreground">{t("Could not load the model list:")} {list.error}</p>}
    </Field>
  );
}

function Section({ title, badges, children }: { title: string; badges?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-lg font-bold">{title}</h2>
        {badges}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

/** The admin's AI provider settings. API keys are write-only: the server never sends a saved key back, only "set …1234". */
export function AiSettingsForm({ view, cliAvailable, ollamaAvailable }: { view: AiConfigView; cliAvailable: boolean; ollamaAvailable: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [testing, setTesting] = useState<Provider | "">("");
  const [f, setF] = useState({
    provider: view.saved.provider,
    anthropicKey: "",
    anthropicModel: view.saved.anthropicModel,
    anthropicFallback: view.saved.anthropicFallback,
    geminiKey: "",
    geminiModel: view.saved.geminiModel,
    ollamaBaseUrl: view.saved.ollamaBaseUrl,
    ollamaModel: view.saved.ollamaModel,
    cliModel: view.saved.cliModel,
    dailyLimit: view.saved.dailyLimit,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string; fields?: Record<string, string> } | null>(null);
  const [lists, setLists] = useState<Partial<Record<Provider, ModelList>>>({});
  const loadModels = useCallback(async (p: Provider) => {
    setLists((s) => ({ ...s, [p]: { ...s[p], loading: true } }));
    const r = await listProviderModels(p);
    setLists((s) => ({ ...s, [p]: r.ok ? { models: r.data?.models ?? [] } : { error: r.error } }));
  }, []);
  const loadAllModels = useCallback(() => {
    for (const p of ["claude-cli", "ollama"] as const) void loadModels(p);
    if (view.anthropic.keySet) void loadModels("anthropic");
    if (view.gemini.keySet) void loadModels("gemini");
  }, [loadModels, view.anthropic.keySet, view.gemini.keySet]);
  useEffect(loadAllModels, [loadAllModels]);
  const [tests, setTests] = useState<Partial<Record<Provider, { ok: boolean; text: string }>>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const err = (k: string) => (msg && !msg.ok ? msg.fields?.[k] : undefined);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveAiSettings({ ...f, anthropicKey: f.anthropicKey || undefined, geminiKey: f.geminiKey || undefined });
      if (!r.ok) return setMsg({ ok: false, text: r.error ?? t("Could not save the settings."), fields: r.fieldErrors });
      setF((s) => ({ ...s, anthropicKey: "", geminiKey: "" }));
      setMsg({ ok: true, text: r.message ?? "" });
      router.refresh();
      loadAllModels();
    });
  }

  function removeKey(p: "anthropic" | "gemini") {
    setMsg(null);
    start(async () => {
      const r = await clearAiKey(p);
      setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
      router.refresh();
    });
  }

  function test(p: Provider) {
    setTesting(p);
    setTests((s) => ({ ...s, [p]: undefined }));
    start(async () => {
      const r = await testAiProvider(p);
      setTests((s) => ({ ...s, [p]: { ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" } }));
      setTesting("");
    });
  }

  const testButton = (p: Provider) => (
    <div className="grid gap-2">
      <div>
        <Button type="button" size="sm" variant="outline" onClick={() => test(p)} disabled={busy}>
          {testing === p ? <LoaderCircle className="animate-spin" /> : <PlugZap />} {t("Test connection")}
        </Button>
      </div>
      {tests[p] && <Alert kind={tests[p]!.ok ? "success" : "error"}>{tests[p]!.text}</Alert>}
    </div>
  );

  const keyStatus = (which: "anthropic" | "gemini") => {
    const v = view[which];
    const unreadable = view.unreadableKeys.includes(which);
    const source = view.sources[which === "anthropic" ? "anthropicKey" : "geminiKey"];
    return (
      <>
        {v.keySet ? (
          <Badge tone="success">
            {t("Key set")} {v.keyHint}
          </Badge>
        ) : (
          <Badge tone="warning">{t("No key")}</Badge>
        )}
        {v.keySet && <SourceBadge source={source} />}
        {unreadable && <Badge tone="danger">{t("Saved key cannot be read — enter it again")}</Badge>}
      </>
    );
  };

  const keyHintText = (which: "anthropic" | "gemini") =>
    view.sources[which === "anthropic" ? "anthropicKey" : "geminiKey"] === "dashboard" ? t("Leave empty to keep the saved key") : t("Stored encrypted. It is never shown again after saving.");

  return (
    <div className="grid gap-4">
      {msg && <Alert kind={msg.ok ? "success" : "error"}>{msg.text}</Alert>}

      <Section title={t("Default provider")} badges={<SourceBadge source={view.sources.provider} />}>
        <Field label={t("Provider used when a teacher picks \"Automatic\"")} htmlFor="ai-provider" error={err("provider")}>
          <Select id="ai-provider" value={f.provider} onChange={set("provider")}>
            <option value="">{t("Follow the server default")}</option>
            <option value="auto">{t("Automatic (Claude Code first)")}</option>
            <option value="claude-cli">Claude Code</option>
            <option value="anthropic">Anthropic API</option>
            <option value="gemini">Gemini API</option>
            <option value="ollama">Ollama (local)</option>
          </Select>
        </Field>
      </Section>

      <Section
        title="Claude Code"
        badges={
          <>
            <Badge tone={cliAvailable ? "success" : "warning"}>{cliAvailable ? t("Installed on the server") : t("Not installed on the server")}</Badge>
            <SourceBadge source={view.sources.cliModel} />
          </>
        }
      >
        <ModelField
          id="ai-cli-model"
          label={t("Model (optional)")}
          hint={t("Empty = the Claude Code default. It uses the account logged in on the server, so it has no API key here.")}
          error={err("cliModel")}
          value={f.cliModel}
          onChange={(v) => setF((s) => ({ ...s, cliModel: v }))}
          defaultLabel={view.cliModel ? `${t("Server default")} (${view.cliModel})` : t("Claude Code default")}
          list={lists["claude-cli"]}
          onReload={() => void loadModels("claude-cli")}
          disabled={busy}
        />
        {testButton("claude-cli")}
      </Section>

      <Section title="Anthropic API" badges={keyStatus("anthropic")}>
        <Field label={t("API key")} htmlFor="ai-anthropic-key" hint={keyHintText("anthropic")} error={err("anthropicKey")}>
          <Input id="ai-anthropic-key" type="password" autoComplete="off" spellCheck={false} value={f.anthropicKey} onChange={set("anthropicKey")} maxLength={400} placeholder={view.anthropic.keySet ? "••••••••" : "sk-ant-…"} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModelField
            id="ai-anthropic-model"
            label={t("Model")}
            error={err("anthropicModel")}
            value={f.anthropicModel}
            onChange={(v) => setF((s) => ({ ...s, anthropicModel: v }))}
            defaultLabel={`${t("Server default")} (${view.anthropic.model})`}
            list={lists.anthropic}
            onReload={() => void loadModels("anthropic")}
            disabled={busy}
          />
          <Field label={t("Fall back when the model refuses")} htmlFor="ai-anthropic-fallback">
            <Select id="ai-anthropic-fallback" value={f.anthropicFallback} onChange={set("anthropicFallback")}>
              <option value="">{view.anthropic.fallback ? t("Server default (on)") : t("Server default (off)")}</option>
              <option value="on">{t("On")}</option>
              <option value="off">{t("Off (needed behind a proxy, Bedrock or Vertex)")}</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          {testButton("anthropic")}
          {view.sources.anthropicKey === "dashboard" && (
            <Button type="button" size="sm" variant="ghost" onClick={() => removeKey("anthropic")} disabled={busy}>
              <Trash2 /> {t("Remove saved key")}
            </Button>
          )}
        </div>
      </Section>

      <Section title="Gemini API" badges={keyStatus("gemini")}>
        <Field label={t("API key")} htmlFor="ai-gemini-key" hint={keyHintText("gemini")} error={err("geminiKey")}>
          <Input id="ai-gemini-key" type="password" autoComplete="off" spellCheck={false} value={f.geminiKey} onChange={set("geminiKey")} maxLength={400} placeholder={view.gemini.keySet ? "••••••••" : "AIza…"} />
        </Field>
        <ModelField
          id="ai-gemini-model"
          label={t("Model")}
          error={err("geminiModel")}
          value={f.geminiModel}
          onChange={(v) => setF((s) => ({ ...s, geminiModel: v }))}
          defaultLabel={`${t("Server default")} (${view.gemini.model})`}
          list={lists.gemini}
          onReload={() => void loadModels("gemini")}
          disabled={busy}
        />
        <div className="flex flex-wrap items-start gap-3">
          {testButton("gemini")}
          {view.sources.geminiKey === "dashboard" && (
            <Button type="button" size="sm" variant="ghost" onClick={() => removeKey("gemini")} disabled={busy}>
              <Trash2 /> {t("Remove saved key")}
            </Button>
          )}
        </div>
      </Section>

      <Section
        title="Ollama"
        badges={
          <>
            <Badge tone={ollamaAvailable ? "success" : "warning"}>{ollamaAvailable ? t("Running") : t("Not reachable")}</Badge>
            <SourceBadge source={view.sources.ollamaBaseUrl} />
          </>
        }
      >
        <Field label={t("Server address")} htmlFor="ai-ollama-url" hint={t("Ollama runs on this machine by default. In Docker use http://host.docker.internal:11434. It has no API key.")} error={err("ollamaBaseUrl")}>
          <Input id="ai-ollama-url" value={f.ollamaBaseUrl} onChange={set("ollamaBaseUrl")} maxLength={200} placeholder={view.ollama.baseUrl} spellCheck={false} />
        </Field>
        <ModelField
          id="ai-ollama-model"
          label={t("Model")}
          hint={t("Must already be installed (ollama pull <model>). A photo can only be read by a vision model, e.g. granite3.2-vision.")}
          error={err("ollamaModel")}
          value={f.ollamaModel}
          onChange={(v) => setF((s) => ({ ...s, ollamaModel: v }))}
          defaultLabel={`${t("Server default")} (${view.ollama.model})`}
          list={lists.ollama}
          onReload={() => void loadModels("ollama")}
          disabled={busy}
        />
        {testButton("ollama")}
      </Section>

      <Section title={t("Usage limit")} badges={<SourceBadge source={view.sources.dailyLimit} />}>
        <Field label={t("AI requests per teacher per day")} htmlFor="ai-limit" hint={t("Empty = the server default.")} error={err("dailyLimit")}>
          <Input id="ai-limit" inputMode="numeric" value={f.dailyLimit} onChange={set("dailyLimit")} maxLength={5} placeholder={String(view.dailyLimit)} className="max-w-40" />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={busy}>
          {busy && !testing ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save settings")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("\"Test connection\" uses the saved settings — save first.")}</p>
      </div>
    </div>
  );
}
