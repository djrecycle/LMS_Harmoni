import Anthropic from "@anthropic-ai/sdk";
import { and, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "./utils";
import { AiError } from "./ai-error";
import { isClaudeCliAvailable, runClaudeCli } from "./ai-cli";
import { ambilJson } from "./ai-json";
import { listGeminiModels, runGemini } from "./ai-gemini";
import { isOllamaReachable, listOllamaModels, ollamaSupportsVision, runOllama } from "./ai-ollama";
import { getAiConfig, type AiConfig } from "./ai-config";

export { AiError };

// The provider settings (keys, models, default provider, daily limit) come from ai-config.ts:
// what an admin saved in the dashboard, else the environment variables.

let client: { key: string; sdk: Anthropic } | null = null;
function getClient(cfg: AiConfig) {
  if (!cfg.anthropic.key) throw new AiError("The AI feature is not enabled. Ask an admin to set the Anthropic API key in AI Settings.");
  // Rebuilt when an admin changes the key.
  if (client?.key !== cfg.anthropic.key) client = { key: cfg.anthropic.key, sdk: new Anthropic({ apiKey: cfg.anthropic.key, timeout: 120_000, maxRetries: 2 }) };
  return client.sdk;
}

/** A missing model is a settings problem, so say which model was asked for. */
function rethrowAnthropic(e: unknown, model: string): never {
  if (e instanceof Anthropic.NotFoundError) throw new AiError(`The AI model “${model}” was not found. Check the model name in AI Settings.`);
  throw e;
}

/* ------------------------------------------------------------------ */
/* Text generation for the teaching-document generator                 */
/* (Claude Code CLI, Anthropic API, Gemini API or a local Ollama)                      */
/* ------------------------------------------------------------------ */

export type AiProvider = "claude-cli" | "anthropic" | "gemini" | "ollama";

/** What a user can pick in the UI: a specific provider, or "auto" (the server decides). */
export type ProviderChoice = "auto" | AiProvider;
export const PROVIDER_CHOICES: readonly ProviderChoice[] = ["auto", "claude-cli", "anthropic", "gemini", "ollama"];

const PROVIDER_LABEL: Record<AiProvider, string> = { "claude-cli": "Claude Code", anthropic: "Anthropic API", gemini: "Gemini API", ollama: "Ollama (local)" };
/** Async because Ollama has no key to look for: it is available when its server answers. */
const isAvailable = async (p: AiProvider, cfg: AiConfig): Promise<boolean> =>
  p === "claude-cli" ? isClaudeCliAvailable() : p === "anthropic" ? cfg.anthropic.key !== "" : p === "gemini" ? cfg.gemini.key !== "" : isOllamaReachable(cfg.ollama.baseUrl);
/** "auto" prefers the account already logged in on the server, then the paid keys, then the local model. */
const AUTO_ORDER: readonly AiProvider[] = ["claude-cli", "anthropic", "gemini", "ollama"];
async function firstAvailable(cfg: AiConfig, accept: (p: AiProvider) => Promise<boolean> = async () => true): Promise<AiProvider | null> {
  for (const p of AUTO_ORDER) if ((await isAvailable(p, cfg)) && (await accept(p))) return p;
  return null;
}

/** Providers this server can use right now, for the provider picker. */
export async function providerOptions(): Promise<{ id: AiProvider; label: string; available: boolean }[]> {
  const cfg = await getAiConfig();
  return Promise.all(AUTO_ORDER.map(async (id) => ({ id, label: PROVIDER_LABEL[id], available: await isAvailable(id, cfg) })));
}

/** Claude Code accepts these aliases (and full model ids); there is no way to ask it for a list. */
const CLI_MODELS = ["opus", "sonnet", "haiku"];

/** The models a provider offers, for the model pickers in AI Settings. Uses the SAVED settings. Throws AiError when the provider cannot be asked. */
export async function listModels(provider: AiProvider): Promise<string[]> {
  const cfg = await getAiConfig();
  if (provider === "claude-cli") return CLI_MODELS;
  if (provider === "ollama") return listOllamaModels(cfg.ollama.baseUrl);
  if (provider === "gemini") return listGeminiModels(cfg.gemini.key);
  try {
    const page = await getClient(cfg).models.list({ limit: 100 });
    return page.data.map((m) => m.id);
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError(aiErrorMessage(e));
  }
}

/**
 * The provider to use, or null when none is usable. An explicit choice is honoured only if that provider is available;
 * "auto" follows the default provider setting (auto | claude-cli | anthropic | gemini | ollama) and otherwise takes the first available in AUTO_ORDER.
 */
export async function resolveProvider(choice: ProviderChoice = "auto", cfg?: AiConfig): Promise<AiProvider | null> {
  const c = cfg ?? (await getAiConfig());
  if (choice !== "auto") return (await isAvailable(choice, c)) ? choice : null;
  if (c.provider !== "auto") return (await isAvailable(c.provider, c)) ? c.provider : null;
  return firstAvailable(c);
}

export const isPerangkatAiAvailable = async (choice: ProviderChoice = "auto") => (await resolveProvider(choice)) !== null;

/** Message for "the chosen provider cannot be used". */
export const providerUnavailableMessage = (choice: ProviderChoice) =>
  choice === "claude-cli"
    ? "Claude Code is not installed or not logged in on the server."
    : choice === "anthropic"
      ? "The Anthropic API key is not set. Ask an admin to add it in AI Settings."
      : choice === "gemini"
        ? "The Gemini API key is not set. Ask an admin to add it in AI Settings."
        : choice === "ollama"
          ? "Ollama is not running or cannot be reached. Start Ollama on the server, or check its address in AI Settings."
          : "The AI feature is not enabled. Install Claude Code on the server, start Ollama, or ask an admin to add an API key in AI Settings.";

/**
 * One free-text generation. The JSON shape is requested in the prompt itself and parsed by the caller (ambilJson),
 * so both providers behave the same way.
 */
export async function generateText({
  system,
  prompt,
  maxTokens = 32000,
  provider: choice = "auto",
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
  provider?: ProviderChoice;
}): Promise<{ text: string; provider: AiProvider }> {
  const cfg = await getAiConfig();
  const provider = await resolveProvider(choice, cfg);
  if (!provider) throw new AiError(providerUnavailableMessage(choice));

  if (provider === "claude-cli") return { text: await runClaudeCli({ prompt, system, model: cfg.cliModel }), provider };
  if (provider === "gemini") return { text: await runGemini({ prompt, system, apiKey: cfg.gemini.key, model: cfg.gemini.model }), provider };
  if (provider === "ollama") return { text: await runOllama({ prompt, system, maxTokens, baseUrl: cfg.ollama.baseUrl, model: cfg.ollama.model }), provider };

  // Long documents: stream so the SDK accepts a large max_tokens.
  let response: Anthropic.Beta.BetaMessage;
  try {
    const stream = getClient(cfg).beta.messages.stream({
      model: cfg.anthropic.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    } as never);
    response = (await stream.finalMessage()) as Anthropic.Beta.BetaMessage;
  } catch (e) {
    rethrowAnthropic(e, cfg.anthropic.model);
  }
  if (response.stop_reason === "refusal") throw new AiError("The AI cannot help with this request. Try changing the topic or wording.");
  if (response.stop_reason === "max_tokens") throw new AiError("The AI answer was cut off because it was too long. Try again with a narrower topic.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new AiError("The AI gave no answer. Try again.");
  return { text, provider };
}

/** Turn an SDK error into a clear message for the user. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof AiError) return e.message;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return "The AI API key is invalid or lacks permission. Contact an admin.";
  if (e instanceof Anthropic.RateLimitError) return "The AI service is busy. Wait a moment and try again.";
  if (e instanceof Anthropic.BadRequestError) {
    console.error("[ai] bad request", e.message);
    return /credit|billing|balance/i.test(e.message) ? "The AI service balance is used up. Contact an admin." : "The AI request was rejected. Try changing the topic or asking for fewer questions.";
  }
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the AI service. Check the server connection and try again.";
  if (e instanceof Anthropic.APIError) {
    console.error("[ai] api error", e.status, e.message);
    return "The AI service is having problems. Try again in a little while.";
  }
  console.error("[ai]", e);
  return "Something went wrong while calling the AI. Try again.";
}

type Options = {
  system: string;
  message: Anthropic.MessageParam[];
  maxTokens?: number;
  /** JSON Schema for structured output. When present, the result is parsed as JSON. */
  schema?: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  /** Settings already loaded by the caller (saves a query). */
  cfg?: AiConfig;
};

/**
 * One call to Claude. The API key is only read on the server.
 *  Uses server-side fallback so a model refusal does not fail a legitimate request (can be turned off in AI Settings / AI_FALLBACK=off).
 */
export async function callAi({ system, message, maxTokens = 8000, schema, effort = "medium", cfg: given }: Options): Promise<string> {
  const cfg = given ?? (await getAiConfig());
  const c = getClient(cfg);
  const useFallback = cfg.anthropic.fallback;

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = (await c.beta.messages.create({
      model: cfg.anthropic.model,
      max_tokens: maxTokens,
      system: system,
      messages: message as Anthropic.Beta.BetaMessageParam[],
      thinking: { type: "adaptive" },
      output_config: { effort, ...(schema ? { format: { type: "json_schema", schema: schema } } : {}) },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    } as never)) as Anthropic.Beta.BetaMessage;
  } catch (e) {
    rethrowAnthropic(e, cfg.anthropic.model);
  }

  if (response.stop_reason === "refusal") throw new AiError("The AI cannot help with this request. Try changing the topic or wording.");
  if (response.stop_reason === "max_tokens") throw new AiError("The AI answer was cut off because it was too long. Ask for fewer questions or shorten the topic.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new AiError("The AI gave no answer. Try again.");
  return text;
}

export async function callAiJson<T>(o: Required<Pick<Options, "schema">> & Options): Promise<T> {
  const text = await callAi(o);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("The AI answer format could not be read. Try again.");
  }
}

/**
 * A JSON answer from any provider. The Anthropic API enforces `schema` (structured output). Claude Code, Gemini and
 * Ollama cannot, so the schema is written into the prompt and the reply is parsed and checked for the JSON shape only.
 */
export async function generateJson<T>({
  system,
  user,
  schema,
  maxTokens = 8000,
  effort = "medium",
  provider: choice = "auto",
  image,
}: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  provider?: ProviderChoice;
  /** A photo to read alongside (or instead of) `user`. Claude Code (CLI) cannot see images; Ollama only with a vision model (e.g. llava, granite3.2-vision). */
  image?: { data: Uint8Array; mediaType: "image/jpeg" | "image/png" };
}): Promise<{ data: T; provider: AiProvider }> {
  const cfg = await getAiConfig();
  let provider = await resolveProvider(choice, cfg);
  if (!provider) throw new AiError(providerUnavailableMessage(choice));
  const canSeeImages = async (p: AiProvider) => p === "anthropic" || p === "gemini" || (p === "ollama" && (await ollamaSupportsVision(cfg.ollama.baseUrl, cfg.ollama.model)));
  if (image && !(await canSeeImages(provider))) {
    if (choice !== "auto") throw new AiError("Reading a photo needs the Anthropic API, the Gemini API or an Ollama vision model. Pick one of those, or upload a document file instead.");
    const fallback = await firstAvailable(cfg, canSeeImages);
    if (!fallback) throw new AiError("Reading a photo needs the Anthropic API, the Gemini API or an Ollama vision model, and none is set up on this server.");
    provider = fallback;
  }
  if (provider === "anthropic") {
    const content: Anthropic.MessageParam["content"] = image
      ? [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: Buffer.from(image.data).toString("base64") } }, { type: "text", text: user }]
      : user;
    return { data: await callAiJson<T>({ system, message: [{ role: "user", content }], schema, maxTokens, effort, cfg }), provider };
  }
  const prompt = `${user}\n\nReply with ONLY one JSON object (no explanation, no code fence) that is valid against this JSON Schema:\n${JSON.stringify(schema)}`;
  // These providers cannot enforce a schema, so an occasional reply is not valid JSON: try once more before giving up.
  for (let attempt = 1; ; attempt++) {
    const text =
      provider === "gemini"
        ? await runGemini({ prompt, system, json: true, image, apiKey: cfg.gemini.key, model: cfg.gemini.model })
        : provider === "ollama"
          ? await runOllama({ prompt, system, maxTokens, json: true, image, baseUrl: cfg.ollama.baseUrl, model: cfg.ollama.model })
          : await runClaudeCli({ prompt, system, model: cfg.cliModel });
    try {
      return { data: ambilJson<T>(text), provider };
    } catch (e) {
      console.error(`[ai] ${PROVIDER_LABEL[provider]} reply is not valid JSON (attempt ${attempt}, ${text.length} chars). Start: ${JSON.stringify(text.slice(0, 200))} End: ${JSON.stringify(text.slice(-200))}`);
      if (attempt >= 2) throw e;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Daily quota per user (cost control)                                 */
/* ------------------------------------------------------------------ */

export async function dailyLimit(): Promise<number> {
  return (await getAiConfig()).dailyLimit;
}

/** Take one allowance atomically. false = today's allowance is used up. */
export async function takeAllowance(userId: string): Promise<boolean> {
  const t = schema.aiUsage;
  const limit = await dailyLimit();
  const row = await db
    .insert(t)
    .values({ userId, date: today(), count: 1 })
    .onConflictDoUpdate({ target: [t.userId, t.date], set: { count: sql`${t.count} + 1` }, setWhere: lt(t.count, limit) })
    .returning({ count: t.count });
  return row.length > 0;
}

/** Give the allowance back if the AI call fails (not the user's fault). */
export async function refundAllowance(userId: string) {
  const t = schema.aiUsage;
  await db
    .update(t)
    .set({ count: sql`greatest(${t.count} - 1, 0)` })
    .where(and(eq(t.userId, userId), eq(t.date, today())));
}

export async function remainingAllowance(userId: string) {
  const [r] = await db
    .select({ count: schema.aiUsage.count })
    .from(schema.aiUsage)
    .where(and(eq(schema.aiUsage.userId, userId), eq(schema.aiUsage.date, today())));
  const limit = await dailyLimit();
  return { limit, remaining: Math.max(0, limit - (r?.count ?? 0)) };
}
