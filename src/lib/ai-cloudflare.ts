import { AiError } from "./ai-error";

/**
 * Pictures from Cloudflare Workers AI (default FLUX.1 schnell), which has a free daily allowance.
 * REST API: POST /accounts/{account}/ai/run/{model} with an API token that has the "Workers AI" permission.
 * AI_CLOUDFLARE_BASE_URL is only for a proxy or a test double.
 */
const BASE_URL = (process.env.AI_CLOUDFLARE_BASE_URL?.trim() || "https://api.cloudflare.com/client/v4").replace(/\/+$/, "");

type CfResponse = { success?: boolean; result?: { image?: string } | null; errors?: { code?: number; message?: string }[] };

/** The type of an image from its first bytes (JPEG, PNG or WebP). */
function sniff(data: Buffer): string | null {
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (data.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function runCloudflareImage({
  prompt,
  accountId,
  token,
  model,
  steps = 6,
}: {
  prompt: string;
  accountId: string;
  token: string;
  model: string;
  /** FLUX.1 schnell: 1-8; more = more detail, slower and more of the daily allowance. */
  steps?: number;
}): Promise<{ data: Buffer; mediaType: string }> {
  if (!accountId || !token) throw new AiError("Cloudflare Workers AI is not set up. Add the Account ID and API token in AI Settings.");
  if (!/^[0-9a-f]{32}$/i.test(accountId) || !/^@cf\/[\w.-]+\/[\w.-]+$/.test(model)) throw new AiError("The Cloudflare settings are invalid. Check the Account ID and model in AI Settings.");
  const body = /flux-1-schnell/.test(model) ? { prompt: prompt.slice(0, 2048), steps: Math.min(8, Math.max(1, steps)) } : { prompt: prompt.slice(0, 2048) };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/accounts/${accountId}/ai/run/${model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AiError("Cloudflare did not make the image within the time limit. Try again.");
    console.error("[ai] cloudflare connection", e);
    throw new AiError("Could not reach Cloudflare. Check the server connection and try again.");
  }

  // Some models answer with the image itself, others with JSON holding it as base64.
  const type = res.headers.get("content-type") ?? "";
  if (res.ok && type.startsWith("image/")) {
    const data = Buffer.from(await res.arrayBuffer());
    return { data, mediaType: sniff(data) ?? type.split(";")[0] };
  }
  let json: CfResponse;
  try {
    json = (await res.json()) as CfResponse;
  } catch {
    throw new AiError("The Cloudflare answer could not be read. Try again.");
  }
  if (!res.ok || json.success === false) {
    const reason = (json.errors ?? []).map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ").replace(/\s+/g, " ").slice(0, 200);
    console.error("[ai] cloudflare error", res.status, model, reason);
    if (res.status === 401 || res.status === 403 || /authenticat|unauthori/i.test(reason))
      throw new AiError("The Cloudflare API token is invalid or lacks the Workers AI permission. Check it in AI Settings.");
    if (res.status === 429 || /neuron|allocation|quota|rate limit/i.test(reason))
      throw new AiError("Today's free Cloudflare Workers AI allowance is used up. Try again tomorrow, or use the illustration style.");
    if (res.status === 404 || /no such model|not found/i.test(reason)) throw new AiError(`The Cloudflare model “${model}” was not found. Check the model in AI Settings.`);
    throw new AiError(`Cloudflare could not make the image${reason ? `: ${reason}` : "."}`);
  }
  const b64 = json.result?.image;
  if (!b64) throw new AiError("Cloudflare did not return a picture. Try describing it differently.");
  const data = Buffer.from(b64, "base64");
  const mediaType = sniff(data);
  if (!mediaType) throw new AiError("Cloudflare did not return a picture. Try describing it differently.");
  return { data, mediaType };
}

/* ------------------------------------------------------------------ */
/* Text (Workers AI models through the OpenAI-compatible endpoint)     */
/* ------------------------------------------------------------------ */

const TEXT_TIMEOUT_MS = 600_000;

function cfError(status: number, reason: string, model: string): AiError {
  console.error("[ai] cloudflare text error", status, model, reason);
  if (status === 401 || status === 403 || /authenticat|unauthori/i.test(reason)) return new AiError("The Cloudflare API token is invalid or lacks the Workers AI permission. Check it in AI Settings.");
  if (status === 429 || /neuron|allocation|quota|rate limit/i.test(reason)) return new AiError("Today's free Cloudflare Workers AI allowance is used up. Try again tomorrow, or pick another AI provider.");
  if (status === 404 || /no such model|not found/i.test(reason)) return new AiError(`The Cloudflare model “${model}” was not found. Choose another model in AI Settings.`);
  if (/context|too long|token/i.test(reason)) return new AiError("The request is too long for this Cloudflare model. Ask for fewer questions, or choose a model with a larger context in AI Settings.");
  return new AiError(`Cloudflare Workers AI could not answer${reason ? `: ${reason.slice(0, 200)}` : "."}`);
}

/** One text generation with a Workers AI model (chat completions, like the OpenAI API). */
export async function runCloudflareText({
  prompt,
  system,
  accountId,
  token,
  model,
  maxTokens = 16000,
  json = false,
}: {
  prompt: string;
  system: string;
  accountId: string;
  token: string;
  model: string;
  maxTokens?: number;
  json?: boolean;
}): Promise<string> {
  if (!accountId || !token) throw new AiError("Cloudflare Workers AI is not set up. Add the Account ID and API token in AI Settings.");
  if (!/^[0-9a-f]{32}$/i.test(accountId) || !/^@(cf|hf)\/[\w.-]+\/[\w.-]+$/.test(model)) throw new AiError("The Cloudflare settings are invalid. Check the Account ID and model in AI Settings.");
  const send = (withJson: boolean) =>
    fetch(`${BASE_URL}/accounts/${accountId}/ai/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model,
        messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
        ...(withJson ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
    });

  let res: Response;
  try {
    res = await send(json);
    // Not every model takes JSON mode: ask again without it (the JSON shape is in the prompt anyway).
    if (json && res.status === 400) res = await send(false);
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AiError("Cloudflare Workers AI did not respond within the time limit.");
    console.error("[ai] cloudflare connection", e);
    throw new AiError("Could not reach Cloudflare. Check the server connection and try again.");
  }
  let data: {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    errors?: { code?: number; message?: string }[];
    error?: { message?: string } | string;
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new AiError("The Cloudflare answer could not be read. Try again.");
  }
  if (!res.ok) {
    const reason = [...(data.errors ?? []).map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()), typeof data.error === "string" ? data.error : (data.error?.message ?? "")]
      .filter(Boolean)
      .join("; ")
      .replace(/\s+/g, " ");
    throw cfError(res.status, reason, model);
  }
  const choice = data.choices?.[0];
  const text = (choice?.message?.content ?? "").trim();
  if (!text) throw new AiError("Cloudflare Workers AI gave no answer. Try again.");
  if (choice?.finish_reason === "length") throw new AiError("The AI answer was cut off because it was too long. Try again with a narrower topic.");
  return text;
}

/** Text-generation models this account can run, for the model picker in AI Settings. */
export async function listCloudflareTextModels(accountId: string, token: string): Promise<string[]> {
  if (!accountId || !token) throw new AiError("Cloudflare Workers AI is not set up. Add the Account ID and API token in AI Settings.");
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/accounts/${accountId}/ai/models/search?task=${encodeURIComponent("Text Generation")}&per_page=200`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AiError("Could not reach Cloudflare. Check the server connection and try again.");
  }
  if (!res.ok) throw new AiError("Cloudflare could not list its models. Check the Account ID and API token.");
  const data = (await res.json()) as { result?: { name?: string }[] };
  return (data.result ?? [])
    .map((m) => m.name ?? "")
    .filter((n) => /^@(cf|hf)\//.test(n))
    .sort();
}
