import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { decryptSecret, encryptSecret } from "./secret-box";

/**
 * The AI settings in effect. An admin can change them in the dashboard (stored in `app_setting`, keys encrypted);
 * anything the dashboard leaves empty falls back to the environment variable, then to a built-in default.
 * Read on every use (one tiny query) so a change applies immediately, also to background jobs.
 */

export type ProviderPref = "auto" | "claude-cli" | "anthropic" | "gemini" | "ollama";
export type Source = "dashboard" | "env" | "default";

const SETTING_KEY = "ai";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
const DEFAULT_DAILY_LIMIT = 50;
const PROVIDERS: readonly ProviderPref[] = ["auto", "claude-cli", "anthropic", "gemini", "ollama"];

/** What is saved in the database. Every field is optional: missing = use the environment. */
type Stored = {
  provider?: ProviderPref;
  anthropicKeyEnc?: string;
  anthropicModel?: string;
  anthropicFallback?: boolean;
  geminiKeyEnc?: string;
  geminiModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  cliModel?: string;
  dailyLimit?: number;
};

export type AiConfig = {
  provider: ProviderPref;
  anthropic: { key: string; model: string; fallback: boolean };
  gemini: { key: string; model: string };
  /** No key: Ollama is a local server. */
  ollama: { baseUrl: string; model: string };
  cliModel: string | undefined;
  dailyLimit: number;
  sources: Record<"provider" | "anthropicKey" | "anthropicModel" | "anthropicFallback" | "geminiKey" | "geminiModel" | "ollamaBaseUrl" | "ollamaModel" | "cliModel" | "dailyLimit", Source>;
  /** A key is saved but cannot be decrypted (BETTER_AUTH_SECRET changed): it has to be entered again. */
  unreadableKeys: ("anthropic" | "gemini")[];
};

async function readStored(): Promise<Stored> {
  try {
    const [row] = await db.select({ value: schema.appSetting.value }).from(schema.appSetting).where(eq(schema.appSetting.key, SETTING_KEY)).limit(1);
    return (row?.value ?? {}) as Stored;
  } catch (e) {
    // e.g. the migration has not run yet: keep AI working from the environment instead of failing every request.
    console.warn("[ai-config] could not read saved AI settings, using the environment only:", e instanceof Error ? e.message : e);
    return {};
  }
}

const env = (name: string) => process.env[name]?.trim() || "";

export async function getAiConfig(): Promise<AiConfig> {
  const s = await readStored();
  const unreadableKeys: AiConfig["unreadableKeys"] = [];
  const pick = <T>(saved: T | undefined | "", fromEnv: T | undefined | "", fallback: T): [T, Source] =>
    saved !== undefined && saved !== "" ? [saved, "dashboard"] : fromEnv !== undefined && fromEnv !== "" ? [fromEnv, "env"] : [fallback, "default"];

  const savedAnthropicKey = decryptSecret(s.anthropicKeyEnc);
  if (s.anthropicKeyEnc && savedAnthropicKey === null) unreadableKeys.push("anthropic");
  const savedGeminiKey = decryptSecret(s.geminiKeyEnc);
  if (s.geminiKeyEnc && savedGeminiKey === null) unreadableKeys.push("gemini");

  const envProvider = env("AI_PROVIDER").toLowerCase() as ProviderPref;
  const [provider, provider_src] = pick<ProviderPref>(s.provider && PROVIDERS.includes(s.provider) ? s.provider : undefined, PROVIDERS.includes(envProvider) ? envProvider : undefined, "auto");
  const [anthropicKey, anthropicKey_src] = pick<string>(savedAnthropicKey ?? undefined, env("ANTHROPIC_API_KEY"), "");
  const [anthropicModel, anthropicModel_src] = pick<string>(s.anthropicModel, env("AI_MODEL"), DEFAULT_ANTHROPIC_MODEL);
  const [anthropicFallback, anthropicFallback_src] = pick<boolean>(s.anthropicFallback, env("AI_FALLBACK") ? env("AI_FALLBACK").toLowerCase() !== "off" : undefined, true);
  const [geminiKey, geminiKey_src] = pick<string>(savedGeminiKey ?? undefined, env("GEMINI_API_KEY") || env("GOOGLE_API_KEY"), "");
  const [geminiModel, geminiModel_src] = pick<string>(s.geminiModel, env("AI_GEMINI_MODEL"), DEFAULT_GEMINI_MODEL);
  const [ollamaBaseUrl, ollamaBaseUrl_src] = pick<string>(s.ollamaBaseUrl, env("OLLAMA_BASE_URL"), DEFAULT_OLLAMA_URL);
  const [ollamaModel, ollamaModel_src] = pick<string>(s.ollamaModel, env("AI_OLLAMA_MODEL"), DEFAULT_OLLAMA_MODEL);
  const [cliModel, cliModel_src] = pick<string>(s.cliModel, env("AI_CLI_MODEL"), "");
  const envLimit = Number(env("AI_DAILY_LIMIT"));
  const [dailyLimit, dailyLimit_src] = pick<number>(s.dailyLimit, Number.isFinite(envLimit) && envLimit > 0 ? Math.floor(envLimit) : undefined, DEFAULT_DAILY_LIMIT);

  return {
    provider,
    anthropic: { key: anthropicKey, model: anthropicModel, fallback: anthropicFallback },
    gemini: { key: geminiKey, model: geminiModel },
    ollama: { baseUrl: ollamaBaseUrl, model: ollamaModel },
    cliModel: cliModel || undefined,
    dailyLimit,
    sources: {
      provider: provider_src,
      anthropicKey: anthropicKey_src,
      anthropicModel: anthropicModel_src,
      anthropicFallback: anthropicFallback_src,
      geminiKey: geminiKey_src,
      geminiModel: geminiModel_src,
      ollamaBaseUrl: ollamaBaseUrl_src,
      ollamaModel: ollamaModel_src,
      cliModel: cliModel_src,
      dailyLimit: dailyLimit_src,
    },
    unreadableKeys,
  };
}

/* ------------------------------------------------------------------ */
/* What the admin page may see: never the keys themselves              */
/* ------------------------------------------------------------------ */

const keyHint = (k: string) => (k.length >= 12 ? `…${k.slice(-4)}` : "");

export type AiConfigView = {
  provider: ProviderPref;
  /** What is saved in the dashboard itself ("" = not set, follow the server default). */
  saved: { provider: string; anthropicModel: string; anthropicFallback: "" | "on" | "off"; geminiModel: string; ollamaBaseUrl: string; ollamaModel: string; cliModel: string; dailyLimit: string };
  anthropic: { keySet: boolean; keyHint: string; model: string; fallback: boolean };
  gemini: { keySet: boolean; keyHint: string; model: string };
  ollama: { baseUrl: string; model: string };
  cliModel: string;
  dailyLimit: number;
  sources: AiConfig["sources"];
  unreadableKeys: AiConfig["unreadableKeys"];
};

export async function getAiConfigView(): Promise<AiConfigView> {
  const [c, s] = await Promise.all([getAiConfig(), readStored()]);
  return {
    provider: c.provider,
    saved: {
      provider: s.provider ?? "",
      anthropicModel: s.anthropicModel ?? "",
      anthropicFallback: s.anthropicFallback === undefined ? "" : s.anthropicFallback ? "on" : "off",
      geminiModel: s.geminiModel ?? "",
      ollamaBaseUrl: s.ollamaBaseUrl ?? "",
      ollamaModel: s.ollamaModel ?? "",
      cliModel: s.cliModel ?? "",
      dailyLimit: s.dailyLimit === undefined ? "" : String(s.dailyLimit),
    },
    anthropic: { keySet: c.anthropic.key !== "", keyHint: keyHint(c.anthropic.key), model: c.anthropic.model, fallback: c.anthropic.fallback },
    gemini: { keySet: c.gemini.key !== "", keyHint: keyHint(c.gemini.key), model: c.gemini.model },
    ollama: c.ollama,
    cliModel: c.cliModel ?? "",
    dailyLimit: c.dailyLimit,
    sources: c.sources,
    unreadableKeys: c.unreadableKeys,
  };
}

/* ------------------------------------------------------------------ */
/* Saving (admin only — the caller must have checked requireAdmin)     */
/* ------------------------------------------------------------------ */

const optionalKey = z.string().trim().max(400, "The API key is too long").refine((v) => v === "" || (v.length >= 10 && !/\s/.test(v)), "That does not look like an API key");

export const aiSettingsSchema = z.object({
  provider: z.enum(["", "auto", "claude-cli", "anthropic", "gemini", "ollama"]),
  anthropicKey: optionalKey.optional(),
  anthropicModel: z.string().trim().max(100),
  anthropicFallback: z.enum(["", "on", "off"]),
  geminiKey: optionalKey.optional(),
  geminiModel: z.string().trim().max(100),
  ollamaBaseUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https?:\/\/[^\s/]+[^\s]*$/i.test(v), "The Ollama address must start with http:// or https://"),
  ollamaModel: z.string().trim().max(100),
  cliModel: z.string().trim().max(100),
  dailyLimit: z.string().trim().regex(/^\d{0,5}$/, "The daily limit must be a whole number").refine((v) => v === "" || Number(v) >= 1, "The daily limit must be at least 1"),
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

export async function saveAiConfig(input: AiSettingsInput, adminId: string): Promise<void> {
  const cur = await readStored();
  const next: Stored = {
    provider: input.provider === "" ? undefined : input.provider,
    anthropicModel: input.anthropicModel || undefined,
    anthropicFallback: input.anthropicFallback === "" ? undefined : input.anthropicFallback === "on",
    geminiModel: input.geminiModel || undefined,
    ollamaBaseUrl: input.ollamaBaseUrl || undefined,
    ollamaModel: input.ollamaModel || undefined,
    cliModel: input.cliModel || undefined,
    dailyLimit: input.dailyLimit === "" ? undefined : Number(input.dailyLimit),
    // a blank key field keeps the saved key; a new one replaces it
    anthropicKeyEnc: input.anthropicKey ? encryptSecret(input.anthropicKey) : cur.anthropicKeyEnc,
    geminiKeyEnc: input.geminiKey ? encryptSecret(input.geminiKey) : cur.geminiKeyEnc,
  };
  await writeStored(next, adminId);
}

/** Forget a saved key (that provider goes back to its environment variable, if any). */
export async function clearAiKey(provider: "anthropic" | "gemini", adminId: string): Promise<void> {
  const cur = await readStored();
  if (provider === "anthropic") delete cur.anthropicKeyEnc;
  else delete cur.geminiKeyEnc;
  await writeStored(cur, adminId);
}

async function writeStored(s: Stored, adminId: string) {
  const value = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Record<string, unknown>;
  await db
    .insert(schema.appSetting)
    .values({ key: SETTING_KEY, value, updatedBy: adminId })
    .onConflictDoUpdate({ target: schema.appSetting.key, set: { value, updatedAt: new Date(), updatedBy: adminId } });
}
