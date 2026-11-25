import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { decryptSecret, encryptSecret } from "./secret-box";

/**
 * The AI settings in effect for one teacher. Read on every use (tiny queries) so a change applies immediately,
 * also to background jobs.
 *  - The Super Admin uses the server's settings (`app_setting` key "ai", keys encrypted): anything left empty falls
 *    back to the environment variable, then to a built-in default. Only they can use Claude Code and Ollama, which
 *    run on the server itself.
 *  - Every other teacher brings their own API key (Anthropic, Gemini, Cloudflare or an OpenAI-compatible service) (key "ai:teacher:<id>"), with no fallback to
 *    the server's keys: until they add one, AI features are off for them.
 */

export type ProviderPref = "auto" | "claude-cli" | "anthropic" | "gemini" | "cloudflare" | "openai" | "ollama";
export type Source = "dashboard" | "env" | "default";

const SETTING_KEY = "ai";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
/** "" = pick the newest Gemini Flash model the key can use (see autoGeminiModel): fixed names get retired over time. */
const DEFAULT_GEMINI_MODEL = "";
const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
const DEFAULT_DAILY_LIMIT = 50;
export const DEFAULT_CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
export const DEFAULT_CLOUDFLARE_TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const PROVIDERS: readonly ProviderPref[] = ["auto", "claude-cli", "anthropic", "gemini", "cloudflare", "openai", "ollama"];

/** What is saved in the database. Every field is optional: missing = use the environment. */
type Stored = {
  provider?: ProviderPref;
  anthropicKeyEnc?: string;
  anthropicModel?: string;
  anthropicFallback?: boolean;
  geminiKeyEnc?: string;
  geminiModel?: string;
  /** Requests per day the teacher's Gemini free tier allows (Google does not report it): for the usage card only. */
  geminiFreeRpd?: number;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  cliModel?: string;
  dailyLimit?: number;
  /** Cloudflare Workers AI: makes pictures (free daily allowance). */
  cloudflareAccountId?: string;
  cloudflareTokenEnc?: string;
  cloudflareImageModel?: string;
  /** Workers AI text model (writing questions, documents…). */
  cloudflareModel?: string;
  /** Any service with the OpenAI Chat Completions API (OpenRouter, Groq, NVIDIA NIM…): address, key, model. */
  openaiBaseUrl?: string;
  openaiKeyEnc?: string;
  openaiModel?: string;
};

export type AiConfig = {
  /** "server": the Super Admin's settings; "teacher": a teacher's own keys (only the Anthropic and Gemini APIs). */
  scope: "server" | "teacher";
  provider: ProviderPref;
  anthropic: { key: string; model: string; fallback: boolean };
  gemini: { key: string; model: string; freeRpd: number | null };
  /** No key: Ollama is a local server. */
  ollama: { baseUrl: string; model: string };
  /** Pictures only. Usable when both the account id and the token are set. */
  cloudflare: { accountId: string; token: string; imageModel: string; model: string };
  /** The key may be empty (a local server needs none); usable when the address and model are set. */
  openai: { baseUrl: string; key: string; model: string };
  cliModel: string | undefined;
  dailyLimit: number;
  sources: Record<
    "provider" | "anthropicKey" | "anthropicModel" | "anthropicFallback" | "geminiKey" | "geminiModel" | "ollamaBaseUrl" | "ollamaModel" | "cliModel" | "dailyLimit" | "cloudflareAccountId" | "cloudflareToken" | "cloudflareModel" | "openaiBaseUrl" | "openaiKey" | "openaiModel",
    Source
  >;
  /** A key is saved but cannot be decrypted (BETTER_AUTH_SECRET changed): it has to be entered again. */
  unreadableKeys: KeyProvider[];
};

/** The providers whose key is saved (encrypted) in the settings. */
export type KeyProvider = "anthropic" | "gemini" | "cloudflare" | "openai";

/** The providers a teacher (not the Super Admin) may use: their own API keys only. */
export const TEACHER_PROVIDERS = ["anthropic", "gemini", "cloudflare", "openai"] as const;

const settingKey = (ownerId: string | null) => (ownerId ? `${SETTING_KEY}:teacher:${ownerId}` : SETTING_KEY);

/** Null for the Super Admin (they use the server settings), else the teacher's own id. */
async function personalOwner(userId: string): Promise<string | null> {
  const [u] = await db.select({ isAdmin: schema.user.isAdmin }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  return u?.isAdmin ? null : userId;
}

async function readStored(ownerId: string | null = null): Promise<Stored> {
  try {
    const [row] = await db.select({ value: schema.appSetting.value }).from(schema.appSetting).where(eq(schema.appSetting.key, settingKey(ownerId))).limit(1);
    return (row?.value ?? {}) as Stored;
  } catch (e) {
    // e.g. the migration has not run yet: keep AI working from the environment instead of failing every request.
    console.warn("[ai-config] could not read saved AI settings, using the environment only:", e instanceof Error ? e.message : e);
    return {};
  }
}

const env = (name: string) => process.env[name]?.trim() || "";

/** The AI settings that apply to `userId` (the teacher using the AI). */
export async function getAiConfig(userId: string): Promise<AiConfig> {
  const owner = await personalOwner(userId);
  return owner ? teacherConfig(owner) : serverConfig();
}

/** A teacher's own settings: only what they saved, nothing from the server or its environment. */
async function teacherConfig(ownerId: string): Promise<AiConfig> {
  const s = await readStored(ownerId);
  const unreadableKeys: AiConfig["unreadableKeys"] = [];
  const anthropicKey = decryptSecret(s.anthropicKeyEnc);
  if (s.anthropicKeyEnc && anthropicKey === null) unreadableKeys.push("anthropic");
  const geminiKey = decryptSecret(s.geminiKeyEnc);
  if (s.geminiKeyEnc && geminiKey === null) unreadableKeys.push("gemini");
  const cloudflareToken = decryptSecret(s.cloudflareTokenEnc);
  if (s.cloudflareTokenEnc && cloudflareToken === null) unreadableKeys.push("cloudflare");
  const openaiKey = decryptSecret(s.openaiKeyEnc);
  if (s.openaiKeyEnc && openaiKey === null) unreadableKeys.push("openai");
  const src = (v: unknown): Source => (v === undefined || v === "" ? "default" : "dashboard");
  const provider: ProviderPref = s.provider && (TEACHER_PROVIDERS as readonly string[]).includes(s.provider) ? s.provider : "auto";
  return {
    scope: "teacher",
    provider,
    anthropic: { key: anthropicKey ?? "", model: s.anthropicModel || DEFAULT_ANTHROPIC_MODEL, fallback: s.anthropicFallback ?? true },
    gemini: { key: geminiKey ?? "", model: s.geminiModel || DEFAULT_GEMINI_MODEL, freeRpd: s.geminiFreeRpd ?? null },
    ollama: { baseUrl: "", model: "" },
    cloudflare: {
      accountId: s.cloudflareAccountId ?? "",
      token: cloudflareToken ?? "",
      imageModel: s.cloudflareImageModel || DEFAULT_CLOUDFLARE_IMAGE_MODEL,
      model: s.cloudflareModel || DEFAULT_CLOUDFLARE_TEXT_MODEL,
    },
    openai: { baseUrl: s.openaiBaseUrl ?? "", key: openaiKey ?? "", model: s.openaiModel ?? "" },
    cliModel: undefined,
    dailyLimit: s.dailyLimit ?? DEFAULT_DAILY_LIMIT,
    sources: {
      provider: src(s.provider),
      anthropicKey: src(s.anthropicKeyEnc),
      anthropicModel: src(s.anthropicModel),
      anthropicFallback: src(s.anthropicFallback),
      geminiKey: src(s.geminiKeyEnc),
      geminiModel: src(s.geminiModel),
      ollamaBaseUrl: "default",
      ollamaModel: "default",
      cliModel: "default",
      dailyLimit: src(s.dailyLimit),
      cloudflareAccountId: src(s.cloudflareAccountId),
      cloudflareToken: src(s.cloudflareTokenEnc),
      cloudflareModel: src(s.cloudflareModel),
      openaiBaseUrl: src(s.openaiBaseUrl),
      openaiKey: src(s.openaiKeyEnc),
      openaiModel: src(s.openaiModel),
    },
    unreadableKeys,
  };
}

async function serverConfig(): Promise<AiConfig> {
  const s = await readStored();
  const unreadableKeys: AiConfig["unreadableKeys"] = [];
  const pick = <T>(saved: T | undefined | "", fromEnv: T | undefined | "", fallback: T): [T, Source] =>
    saved !== undefined && saved !== "" ? [saved, "dashboard"] : fromEnv !== undefined && fromEnv !== "" ? [fromEnv, "env"] : [fallback, "default"];

  const savedAnthropicKey = decryptSecret(s.anthropicKeyEnc);
  if (s.anthropicKeyEnc && savedAnthropicKey === null) unreadableKeys.push("anthropic");
  const savedGeminiKey = decryptSecret(s.geminiKeyEnc);
  if (s.geminiKeyEnc && savedGeminiKey === null) unreadableKeys.push("gemini");
  const savedCloudflareToken = decryptSecret(s.cloudflareTokenEnc);
  if (s.cloudflareTokenEnc && savedCloudflareToken === null) unreadableKeys.push("cloudflare");
  const savedOpenaiKey = decryptSecret(s.openaiKeyEnc);
  if (s.openaiKeyEnc && savedOpenaiKey === null) unreadableKeys.push("openai");

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
  const [cloudflareAccountId, cloudflareAccountId_src] = pick<string>(s.cloudflareAccountId, env("CLOUDFLARE_ACCOUNT_ID"), "");
  const [cloudflareToken, cloudflareToken_src] = pick<string>(savedCloudflareToken ?? undefined, env("CLOUDFLARE_API_TOKEN"), "");
  const cloudflareImageModel = s.cloudflareImageModel || env("AI_CLOUDFLARE_IMAGE_MODEL") || DEFAULT_CLOUDFLARE_IMAGE_MODEL;
  const [cloudflareModel, cloudflareModel_src] = pick<string>(s.cloudflareModel, env("AI_CLOUDFLARE_MODEL"), DEFAULT_CLOUDFLARE_TEXT_MODEL);
  const [openaiBaseUrl, openaiBaseUrl_src] = pick<string>(s.openaiBaseUrl, env("OPENAI_COMPAT_BASE_URL"), "");
  const [openaiKey, openaiKey_src] = pick<string>(savedOpenaiKey ?? undefined, env("OPENAI_COMPAT_API_KEY"), "");
  const [openaiModel, openaiModel_src] = pick<string>(s.openaiModel, env("AI_OPENAI_COMPAT_MODEL"), "");
  const envLimit = Number(env("AI_DAILY_LIMIT"));
  const [dailyLimit, dailyLimit_src] = pick<number>(s.dailyLimit, Number.isFinite(envLimit) && envLimit > 0 ? Math.floor(envLimit) : undefined, DEFAULT_DAILY_LIMIT);

  return {
    scope: "server",
    provider,
    anthropic: { key: anthropicKey, model: anthropicModel, fallback: anthropicFallback },
    gemini: { key: geminiKey, model: geminiModel, freeRpd: s.geminiFreeRpd ?? null },
    ollama: { baseUrl: ollamaBaseUrl, model: ollamaModel },
    cloudflare: { accountId: cloudflareAccountId, token: cloudflareToken, imageModel: cloudflareImageModel, model: cloudflareModel },
    openai: { baseUrl: openaiBaseUrl, key: openaiKey, model: openaiModel },
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
      cloudflareAccountId: cloudflareAccountId_src,
      cloudflareToken: cloudflareToken_src,
      cloudflareModel: cloudflareModel_src,
      openaiBaseUrl: openaiBaseUrl_src,
      openaiKey: openaiKey_src,
      openaiModel: openaiModel_src,
    },
    unreadableKeys,
  };
}

/* ------------------------------------------------------------------ */
/* What the admin page may see: never the keys themselves              */
/* ------------------------------------------------------------------ */

const keyHint = (k: string) => (k.length >= 12 ? `…${k.slice(-4)}` : "");

export type AiConfigView = {
  scope: AiConfig["scope"];
  provider: ProviderPref;
  /** What is saved in the dashboard itself ("" = not set, follow the server default). */
  saved: {
    provider: string;
    anthropicModel: string;
    anthropicFallback: "" | "on" | "off";
    geminiModel: string;
    geminiFreeRpd: string;
    ollamaBaseUrl: string;
    ollamaModel: string;
    cliModel: string;
    dailyLimit: string;
    cloudflareAccountId: string;
    cloudflareImageModel: string;
    cloudflareModel: string;
    openaiBaseUrl: string;
    openaiModel: string;
  };
  anthropic: { keySet: boolean; keyHint: string; model: string; fallback: boolean };
  gemini: { keySet: boolean; keyHint: string; model: string };
  ollama: { baseUrl: string; model: string };
  cloudflare: { keySet: boolean; keyHint: string; accountId: string; imageModel: string; model: string };
  openai: { keySet: boolean; keyHint: string; baseUrl: string; model: string };
  cliModel: string;
  dailyLimit: number;
  sources: AiConfig["sources"];
  unreadableKeys: AiConfig["unreadableKeys"];
};

export async function getAiConfigView(userId: string): Promise<AiConfigView> {
  const owner = await personalOwner(userId);
  const [c, s] = await Promise.all([owner ? teacherConfig(owner) : serverConfig(), readStored(owner)]);
  return {
    scope: c.scope,
    provider: c.provider,
    saved: {
      provider: s.provider ?? "",
      anthropicModel: s.anthropicModel ?? "",
      anthropicFallback: s.anthropicFallback === undefined ? "" : s.anthropicFallback ? "on" : "off",
      geminiModel: s.geminiModel ?? "",
      geminiFreeRpd: s.geminiFreeRpd === undefined ? "" : String(s.geminiFreeRpd),
      ollamaBaseUrl: s.ollamaBaseUrl ?? "",
      ollamaModel: s.ollamaModel ?? "",
      cliModel: s.cliModel ?? "",
      dailyLimit: s.dailyLimit === undefined ? "" : String(s.dailyLimit),
      cloudflareAccountId: s.cloudflareAccountId ?? "",
      cloudflareImageModel: s.cloudflareImageModel ?? "",
      cloudflareModel: s.cloudflareModel ?? "",
      openaiBaseUrl: s.openaiBaseUrl ?? "",
      openaiModel: s.openaiModel ?? "",
    },
    anthropic: { keySet: c.anthropic.key !== "", keyHint: keyHint(c.anthropic.key), model: c.anthropic.model, fallback: c.anthropic.fallback },
    gemini: { keySet: c.gemini.key !== "", keyHint: keyHint(c.gemini.key), model: c.gemini.model },
    ollama: c.ollama,
    cloudflare: { keySet: c.cloudflare.token !== "", keyHint: keyHint(c.cloudflare.token), accountId: c.cloudflare.accountId, imageModel: c.cloudflare.imageModel, model: c.cloudflare.model },
    openai: { keySet: c.openai.key !== "", keyHint: keyHint(c.openai.key), baseUrl: c.openai.baseUrl, model: c.openai.model },
    cliModel: c.cliModel ?? "",
    dailyLimit: c.dailyLimit,
    sources: c.sources,
    unreadableKeys: c.unreadableKeys,
  };
}

/* ------------------------------------------------------------------ */
/* Saving (each teacher their own; the Super Admin the server's)       */
/* ------------------------------------------------------------------ */

const optionalKey = z.string().trim().max(400, "The API key is too long").refine((v) => v === "" || (v.length >= 10 && !/\s/.test(v)), "That does not look like an API key");

export const aiSettingsSchema = z.object({
  provider: z.enum(["", "auto", "claude-cli", "anthropic", "gemini", "cloudflare", "openai", "ollama"]),
  anthropicKey: optionalKey.optional(),
  anthropicModel: z.string().trim().max(100),
  anthropicFallback: z.enum(["", "on", "off"]),
  geminiKey: optionalKey.optional(),
  geminiModel: z.string().trim().max(100),
  geminiFreeRpd: z
    .string()
    .trim()
    .regex(/^\d{0,6}$/, "The Gemini free limit must be a whole number")
    .default(""),
  ollamaBaseUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https?:\/\/[^\s/]+[^\s]*$/i.test(v), "The Ollama address must start with http:// or https://"),
  ollamaModel: z.string().trim().max(100),
  cliModel: z.string().trim().max(100),
  cloudflareAccountId: z
    .string()
    .trim()
    .max(64)
    .refine((v) => v === "" || /^[0-9a-f]{32}$/i.test(v), "The Cloudflare Account ID is 32 letters/digits (see the Workers AI page)")
    .default(""),
  cloudflareToken: optionalKey.optional(),
  cloudflareModel: z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === "" || /^@(cf|hf)\/[\w.-]+\/[\w.-]+$/.test(v), "A Workers AI model looks like @cf/meta/llama-3.3-70b-instruct-fp8-fast")
    .default(""),
  cloudflareImageModel: z
    .string()
    .trim()
    .max(100)
    .refine((v) => v === "" || /^@cf\/[\w.-]+\/[\w.-]+$/.test(v), "A Workers AI model looks like @cf/black-forest-labs/flux-1-schnell")
    .default(""),
  openaiBaseUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^https?:\/\/[^\s/]+[^\s]*$/i.test(v), "The address must start with https:// (for example https://openrouter.ai/api/v1)")
    .default(""),
  openaiKey: optionalKey.optional(),
  openaiModel: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/\s/.test(v), "A model name has no spaces")
    .default(""),
  dailyLimit: z.string().trim().regex(/^\d{0,5}$/, "The daily limit must be a whole number").refine((v) => v === "" || Number(v) >= 1, "The daily limit must be at least 1"),
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

/** A setting that cannot be saved for this user (the action shows `message` at `field`). */
export class AiSettingsError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export async function saveAiConfig(input: AiSettingsInput, userId: string): Promise<void> {
  const owner = await personalOwner(userId);
  const cur = await readStored(owner);
  // A teacher can't point the server at Claude Code or an Ollama address: those settings are the Super Admin's.
  if (owner) {
    if (input.provider === "claude-cli" || input.provider === "ollama") input = { ...input, provider: "auto" };
    input = { ...input, ollamaBaseUrl: "", ollamaModel: "", cliModel: "" };
  }
  // A teacher's address is called by the server: https only (and public IPs only, checked on every call in ai-openai.ts).
  if (owner && input.openaiBaseUrl && !/^https:\/\//i.test(input.openaiBaseUrl)) throw new AiSettingsError("openaiBaseUrl", "The address must start with https:// (for example https://openrouter.ai/api/v1)");
  const next: Stored = {
    provider: input.provider === "" ? undefined : input.provider,
    anthropicModel: input.anthropicModel || undefined,
    anthropicFallback: input.anthropicFallback === "" ? undefined : input.anthropicFallback === "on",
    geminiModel: input.geminiModel || undefined,
    geminiFreeRpd: input.geminiFreeRpd === "" || Number(input.geminiFreeRpd) < 1 ? undefined : Number(input.geminiFreeRpd),
    ollamaBaseUrl: input.ollamaBaseUrl || undefined,
    ollamaModel: input.ollamaModel || undefined,
    cliModel: input.cliModel || undefined,
    dailyLimit: input.dailyLimit === "" ? undefined : Number(input.dailyLimit),
    cloudflareAccountId: input.cloudflareAccountId || undefined,
    cloudflareImageModel: input.cloudflareImageModel || undefined,
    cloudflareModel: input.cloudflareModel || undefined,
    cloudflareTokenEnc: input.cloudflareToken ? encryptSecret(input.cloudflareToken) : cur.cloudflareTokenEnc,
    // a blank key field keeps the saved key; a new one replaces it
    anthropicKeyEnc: input.anthropicKey ? encryptSecret(input.anthropicKey) : cur.anthropicKeyEnc,
    geminiKeyEnc: input.geminiKey ? encryptSecret(input.geminiKey) : cur.geminiKeyEnc,
    openaiBaseUrl: input.openaiBaseUrl.replace(/\/+$/, "") || undefined,
    openaiModel: input.openaiModel || undefined,
    openaiKeyEnc: input.openaiKey ? encryptSecret(input.openaiKey) : cur.openaiKeyEnc,
  };
  await writeStored(owner, next, userId);
}

/** Forget a saved key (for the Super Admin, that provider goes back to its environment variable, if any). */
export async function clearAiKey(provider: KeyProvider, userId: string): Promise<void> {
  const owner = await personalOwner(userId);
  const cur = await readStored(owner);
  if (provider === "anthropic") delete cur.anthropicKeyEnc;
  else if (provider === "gemini") delete cur.geminiKeyEnc;
  else if (provider === "openai") delete cur.openaiKeyEnc;
  else delete cur.cloudflareTokenEnc;
  await writeStored(owner, cur, userId);
}

/* ------------------------------------------------------------------ */
/* AI demo (see ai-demo.ts): the Super Admin fills a teacher's         */
/* OpenAI-compatible settings with a demo token, and clears them again */
/* ------------------------------------------------------------------ */

/** Point `teacherId`'s OpenAI-compatible provider at the demo API. "Auto" (or unset) becomes "openai" so the demo is used. */
export async function setTeacherDemoAi(teacherId: string, demo: { baseUrl: string; key: string; model: string }, by: string): Promise<void> {
  const cur = await readStored(teacherId);
  await writeStored(
    teacherId,
    {
      ...cur,
      openaiBaseUrl: demo.baseUrl.replace(/\/+$/, ""),
      openaiKeyEnc: encryptSecret(demo.key),
      openaiModel: demo.model,
      provider: !cur.provider || cur.provider === "auto" ? "openai" : cur.provider,
    },
    by,
  );
}

/** Undo setTeacherDemoAi, but only while the teacher still uses that demo key (they may have entered their own since). */
export async function clearTeacherDemoAi(teacherId: string, demoKey: string, by: string): Promise<void> {
  const cur = await readStored(teacherId);
  if (!cur.openaiKeyEnc || decryptSecret(cur.openaiKeyEnc) !== demoKey) return;
  const next: Stored = { ...cur };
  delete next.openaiBaseUrl;
  delete next.openaiKeyEnc;
  delete next.openaiModel;
  if (next.provider === "openai") delete next.provider;
  await writeStored(teacherId, next, by);
}

async function writeStored(ownerId: string | null, s: Stored, userId: string) {
  const value = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Record<string, unknown>;
  await db
    .insert(schema.appSetting)
    .values({ key: settingKey(ownerId), value, updatedBy: userId })
    .onConflictDoUpdate({ target: schema.appSetting.key, set: { value, updatedAt: new Date(), updatedBy: userId } });
}
