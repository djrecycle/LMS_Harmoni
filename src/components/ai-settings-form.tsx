"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, LoaderCircle, PlugZap, RefreshCw, Save, Trash2 } from "lucide-react";
import { clearAiKey, listProviderModels, saveAiSettings, testAiProvider, testCloudflareImage } from "@/app/actions/ai-settings";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert, Badge } from "@/components/ui/misc";
import type { AiConfigView, Source } from "@/lib/ai-config"; // type-only: this file must not pull server code into the browser bundle
import { useT } from "@/i18n/client";

type Provider = "claude-cli" | "anthropic" | "gemini" | "cloudflare" | "ollama";

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
  /** A teacher's own settings: only their Anthropic / Gemini keys (Claude Code and Ollama run on the server, Super Admin only). */
  const personal = view.scope === "teacher";
  const defaultWord = personal ? t("Default") : t("Server default");
  const [busy, start] = useTransition();
  const [testing, setTesting] = useState<Provider | "cloudflare-image" | "">("");
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
    cloudflareAccountId: view.saved.cloudflareAccountId,
    cloudflareToken: "",
    cloudflareImageModel: view.saved.cloudflareImageModel,
    cloudflareModel: view.saved.cloudflareModel,
  });
  const [cfTest, setCfTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; fields?: Record<string, string> } | null>(null);
  const [lists, setLists] = useState<Partial<Record<Provider, ModelList>>>({});
  const loadModels = useCallback(async (p: Provider) => {
    setLists((s) => ({ ...s, [p]: { ...s[p], loading: true } }));
    const r = await listProviderModels(p);
    setLists((s) => ({ ...s, [p]: r.ok ? { models: r.data?.models ?? [] } : { error: r.error } }));
  }, []);
  const loadAllModels = useCallback(() => {
    if (!personal) for (const p of ["claude-cli", "ollama"] as const) void loadModels(p);
    if (view.anthropic.keySet) void loadModels("anthropic");
    if (view.gemini.keySet) void loadModels("gemini");
    if (view.cloudflare.keySet && view.cloudflare.accountId) void loadModels("cloudflare");
  }, [loadModels, personal, view.anthropic.keySet, view.gemini.keySet, view.cloudflare.keySet, view.cloudflare.accountId]);
  useEffect(loadAllModels, [loadAllModels]);
  const [tests, setTests] = useState<Partial<Record<Provider, { ok: boolean; text: string }>>>({});
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const err = (k: string) => (msg && !msg.ok ? msg.fields?.[k] : undefined);

  /** Saves the form. Returns false (and shows the error at the top) when the server rejects it. */
  async function persist(): Promise<boolean> {
    const r = await saveAiSettings({ ...f, anthropicKey: f.anthropicKey || undefined, geminiKey: f.geminiKey || undefined, cloudflareToken: f.cloudflareToken || undefined });
    if (!r.ok) {
      setMsg({ ok: false, text: r.error ?? t("Could not save the settings."), fields: r.fieldErrors });
      return false;
    }
    setF((s) => ({ ...s, anthropicKey: "", geminiKey: "", cloudflareToken: "" }));
    setMsg({ ok: true, text: r.message ?? "" });
    router.refresh();
    loadAllModels();
    return true;
  }

  function save() {
    setMsg(null);
    start(async () => {
      await persist();
    });
  }

  const cfUnsaved =
    f.cloudflareToken !== "" || f.cloudflareAccountId !== view.saved.cloudflareAccountId || f.cloudflareImageModel !== view.saved.cloudflareImageModel || f.cloudflareModel !== view.saved.cloudflareModel;
  function testCloudflare() {
    setCfTest(null);
    setTesting("cloudflare-image");
    start(async () => {
      if (cfUnsaved) {
        setMsg(null);
        if (!(await persist())) return setTesting("");
      }
      const r = await testCloudflareImage();
      setCfTest({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
      setTesting("");
    });
  }

  function removeKey(p: "anthropic" | "gemini" | "cloudflare") {
    setMsg(null);
    start(async () => {
      const r = await clearAiKey(p);
      setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
      router.refresh();
    });
  }

  /** The test runs on the SAVED settings, so a provider with unsaved edits is saved first. */
  const unsaved: Record<Provider, boolean> = {
    "claude-cli": f.cliModel !== view.saved.cliModel,
    anthropic: f.anthropicKey !== "" || f.anthropicModel !== view.saved.anthropicModel || f.anthropicFallback !== view.saved.anthropicFallback,
    gemini: f.geminiKey !== "" || f.geminiModel !== view.saved.geminiModel,
    cloudflare: cfUnsaved,
    ollama: f.ollamaBaseUrl !== view.saved.ollamaBaseUrl || f.ollamaModel !== view.saved.ollamaModel,
  };

  function test(p: Provider) {
    setTesting(p);
    setTests((s) => ({ ...s, [p]: undefined }));
    start(async () => {
      if (unsaved[p]) {
        setMsg(null);
        if (!(await persist())) return setTesting("");
      }
      const r = await testAiProvider(p);
      setTests((s) => ({ ...s, [p]: { ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" } }));
      setTesting("");
    });
  }

  const testButton = (p: Provider) => (
    <div className="grid gap-2">
      <div>
        <Button type="button" size="sm" variant="outline" onClick={() => test(p)} disabled={busy}>
          {testing === p ? <LoaderCircle className="animate-spin" /> : unsaved[p] ? <Save /> : <PlugZap />} {unsaved[p] ? t("Save & test connection") : t("Test connection")}
        </Button>
      </div>
      {unsaved[p] && !testing && <Alert kind="warning">{t("Not saved yet. The test and the model list use the saved settings.")}</Alert>}
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

      {personal && (
        <Alert kind="info" title={t("Use your own AI key")}>
          {t("The AI features use your own Gemini or Anthropic API key, so the usage is billed to your account with that provider. Gemini has a free tier: create a key at aistudio.google.com/apikey. Your key is stored encrypted and is never shown again.")}
        </Alert>
      )}

      <Section title={t("Default provider")} badges={!personal && <SourceBadge source={view.sources.provider} />}>
        <Field label={personal ? t("Provider used when you pick \"Automatic\"") : t("Provider used when a teacher picks \"Automatic\"")} htmlFor="ai-provider" error={err("provider")}>
          <Select id="ai-provider" value={f.provider} onChange={set("provider")}>
            {personal ? (
              <>
                <option value="">{t("Automatic (the one with a key)")}</option>
                <option value="anthropic">Anthropic API</option>
                <option value="gemini">Gemini API</option>
                <option value="cloudflare">Cloudflare Workers AI</option>
              </>
            ) : (
              <>
                <option value="">{t("Follow the server default")}</option>
                <option value="auto">{t("Automatic (Claude Code first)")}</option>
                <option value="claude-cli">Claude Code</option>
                <option value="anthropic">Anthropic API</option>
                <option value="gemini">Gemini API</option>
                <option value="cloudflare">Cloudflare Workers AI</option>
                <option value="ollama">Ollama (local)</option>
              </>
            )}
          </Select>
        </Field>
      </Section>

      {!personal && (
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
      )}

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
            defaultLabel={`${defaultWord} (${view.anthropic.model})`}
            list={lists.anthropic}
            onReload={() => void loadModels("anthropic")}
            disabled={busy}
          />
          <Field label={t("Fall back when the model refuses")} htmlFor="ai-anthropic-fallback">
            <Select id="ai-anthropic-fallback" value={f.anthropicFallback} onChange={set("anthropicFallback")}>
              <option value="">{personal ? t("Default (on)") : view.anthropic.fallback ? t("Server default (on)") : t("Server default (off)")}</option>
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
          defaultLabel={view.gemini.model ? `${defaultWord} (${view.gemini.model})` : `${defaultWord} (${t("newest Gemini Flash")})`}
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
        title="Cloudflare Workers AI"
        badges={
          <>
            {view.cloudflare.keySet && view.cloudflare.accountId ? (
              <Badge tone="success">
                {t("Key set")} {view.cloudflare.keyHint}
              </Badge>
            ) : (
              <Badge tone="warning">{t("Not set up")}</Badge>
            )}
            {view.cloudflare.keySet && <SourceBadge source={view.sources.cloudflareToken} />}
            {view.unreadableKeys.includes("cloudflare") && <Badge tone="danger">{t("Saved key cannot be read — enter it again")}</Badge>}
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t("Writes text (questions, documents) and makes realistic pictures (FLUX model) with a free daily allowance. In the Cloudflare dashboard open AI → Workers AI → Use REST API: copy the Account ID and create an API token with the Workers AI permission.")}
        </p>
        <Field label={t("Account ID")} htmlFor="ai-cf-account" error={err("cloudflareAccountId")}>
          <Input id="ai-cf-account" value={f.cloudflareAccountId} onChange={set("cloudflareAccountId")} maxLength={64} spellCheck={false} autoComplete="off" placeholder={view.cloudflare.accountId || "0123456789abcdef0123456789abcdef"} />
        </Field>
        <Field label={t("API token")} htmlFor="ai-cf-token" hint={view.sources.cloudflareToken === "dashboard" ? t("Leave empty to keep the saved key") : t("Stored encrypted. It is never shown again after saving.")} error={err("cloudflareToken")}>
          <Input id="ai-cf-token" type="password" autoComplete="off" spellCheck={false} value={f.cloudflareToken} onChange={set("cloudflareToken")} maxLength={400} placeholder={view.cloudflare.keySet ? "••••••••" : ""} />
        </Field>
        <ModelField
          id="ai-cf-text-model"
          label={t("Text model")}
          error={err("cloudflareModel")}
          value={f.cloudflareModel}
          onChange={(v) => setF((s) => ({ ...s, cloudflareModel: v }))}
          defaultLabel={`${defaultWord} (${view.cloudflare.model})`}
          list={lists.cloudflare}
          onReload={() => void loadModels("cloudflare")}
          disabled={busy}
        />
        <Field label={t("Image model")} htmlFor="ai-cf-model" hint={t("Empty = {0}", view.cloudflare.imageModel)} error={err("cloudflareImageModel")}>
          <Input id="ai-cf-model" value={f.cloudflareImageModel} onChange={set("cloudflareImageModel")} maxLength={100} spellCheck={false} placeholder="@cf/black-forest-labs/flux-1-schnell" />
        </Field>
        <div className="flex flex-wrap items-start gap-3">
          {testButton("cloudflare")}
          <div className="grid gap-2">
            <div>
              <Button type="button" size="sm" variant="outline" onClick={testCloudflare} disabled={busy}>
                {testing === "cloudflare-image" ? <LoaderCircle className="animate-spin" /> : cfUnsaved ? <Save /> : <ImageIcon />} {cfUnsaved ? t("Save & test a picture") : t("Test a picture")}
              </Button>
            </div>
            {cfTest && <Alert kind={cfTest.ok ? "success" : "error"}>{cfTest.text}</Alert>}
          </div>
          {view.sources.cloudflareToken === "dashboard" && (
            <Button type="button" size="sm" variant="ghost" onClick={() => removeKey("cloudflare")} disabled={busy}>
              <Trash2 /> {t("Remove saved key")}
            </Button>
          )}
        </div>
      </Section>

      {!personal && (
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
      )}

      <Section title={t("Usage limit")} badges={!personal && <SourceBadge source={view.sources.dailyLimit} />}>
        <Field label={t("My AI requests per day")} htmlFor="ai-limit" hint={personal ? t("Protects your API bill. Empty = {0}.", 50) : t("Empty = the server default.")} error={err("dailyLimit")}>
          <Input id="ai-limit" inputMode="numeric" value={f.dailyLimit} onChange={set("dailyLimit")} maxLength={5} placeholder={String(view.dailyLimit)} className="max-w-40" />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={busy}>
          {busy && !testing ? <LoaderCircle className="animate-spin" /> : <Save />} {t("Save settings")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("\"Test connection\" saves your changes first when needed.")}</p>
      </div>
    </div>
  );
}
