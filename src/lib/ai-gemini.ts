import { AiError } from "./ai-error";

/** Same limit as the original desktop app. Long documents can take minutes. */
const GEMINI_TIMEOUT_MS = 900_000;
/** AI_GEMINI_BASE_URL is only for a proxy or a test double. */
const BASE_URL = (process.env.AI_GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
const endpoint = (model: string) => `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;

/** Models that can generate text with this key. */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey) throw new AiError("The Gemini API key is not set. Add your key in AI Settings.");
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/models?pageSize=1000`, { headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AiError("Could not reach Gemini. Check the server connection and try again.");
  }
  if (!res.ok) throw new AiError("Gemini could not list its models. Check the API key.");
  const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (data.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .sort();
}

/** The automatic model per key, remembered for a few hours so it isn't looked up on every request. */
const autoCache = new Map<string, { model: string; at: number }>();
const AUTO_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * The model used when none is chosen: the newest stable "gemini-<version>-flash" this key can use (Google retires
 * older ones for new keys), else any other Flash or Gemini text model.
 */
export async function autoGeminiModel(apiKey: string): Promise<string> {
  const hit = autoCache.get(apiKey);
  if (hit && Date.now() - hit.at < AUTO_TTL_MS) return hit.model;
  const models = await listGeminiModels(apiKey);
  const version = (m: string) => Number(/^gemini-(\d+(?:\.\d+)?)-flash$/.exec(m)?.[1] ?? -1);
  const notText = /image|tts|audio|live|embedding|robotics|computer-use/i;
  const model =
    models.filter((m) => version(m) >= 0).sort((a, b) => version(b) - version(a))[0] ??
    models.find((m) => /^gemini-.*flash/i.test(m) && !notText.test(m) && !/lite/i.test(m)) ??
    models.find((m) => /^gemini-/i.test(m) && !notText.test(m));
  if (!model) throw new AiError("No Gemini text model is available for this API key.");
  autoCache.set(apiKey, { model, at: Date.now() });
  return model;
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: unknown;
  error?: { message?: string };
};

/**
 * One text generation through the Gemini REST API (no SDK, like the original app).
 * `json` asks Gemini for a JSON reply (responseMimeType), which makes JSON answers more reliable.
 * `image` lets Gemini see a photo alongside the prompt (Gemini's multimodal input).
 */
export async function runGemini({
  prompt,
  system,
  apiKey: key,
  model,
  maxTokens = 32768,
  json = false,
  image,
}: {
  prompt: string;
  system: string;
  /** From the AI settings (see ai-config.ts); only ever used on the server. */
  apiKey: string;
  model: string;
  maxTokens?: number;
  json?: boolean;
  image?: { data: Uint8Array; mediaType: "image/jpeg" | "image/png" };
}): Promise<string> {
  if (!key) throw new AiError("The Gemini API key is not set. Add your key in AI Settings.");

  // Gemma models on the Gemini API take no system instruction and no JSON mode, and have a smaller output
  // limit: the instructions go at the top of the prompt instead (the JSON shape is already asked in the prompt).
  const gemma = /^gemma/i.test(model);
  const text = gemma && system ? `${system}\n\n${prompt}` : prompt;
  const parts = image ? [{ inline_data: { mime_type: image.mediaType, data: Buffer.from(image.data).toString("base64") } }, { text }] : [{ text }];
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.7, maxOutputTokens: gemma ? Math.min(maxTokens, 8192) : maxTokens, ...(json && !gemma ? { responseMimeType: "application/json" } : {}) },
    ...(system && !gemma ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };

  let res: Response;
  try {
    res = await fetch(endpoint(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AiError("Gemini did not respond within the time limit.");
    console.error("[ai] gemini connection", e);
    throw new AiError("Could not reach Gemini. Check the server connection and try again.");
  }

  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    throw new AiError("The Gemini answer could not be read. Try again.");
  }

  if (!res.ok) {
    console.error("[ai] gemini error", res.status, data.error?.message?.slice(0, 300));
    const reason = (data.error?.message ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (res.status === 400 && /api key/i.test(reason)) throw new AiError("The Gemini API key is invalid. Check the key in AI Settings.");
    if (res.status === 401 || res.status === 403) throw new AiError("The Gemini API key is invalid or lacks permission. Check the key in AI Settings.");
    if (res.status === 404) {
      autoCache.clear(); // the automatic choice may have been retired: look it up again next time
      throw new AiError(`The Gemini model “${model}” can't be used with this key${reason ? ` (${reason})` : ""}. Choose another model in AI Settings, or leave it on Default.`);
    }
    if (res.status === 429) throw new AiError("Gemini is busy or the quota is used up. Wait a moment and try again.");
    // Show Gemini's own reason (e.g. the model doesn't support something), so the teacher knows what to change.
    throw new AiError(reason ? `Gemini rejected the request (${model}): ${reason}` : "Gemini rejected the request. Try again in a little while.");
  }

  const cand = data.candidates?.[0];
  const reply = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!reply) {
    console.error("[ai] gemini empty reply", cand?.finishReason, data.promptFeedback);
    throw new AiError("Gemini gave no answer. Try rephrasing the topic.");
  }
  if (cand?.finishReason === "MAX_TOKENS") throw new AiError("The AI answer was cut off because it was too long. Try again with a narrower topic.");
  return reply;
}

/* ------------------------------------------------------------------ */
/* Image generation (Gemini image models, e.g. gemini-*-flash-image)   */
/* ------------------------------------------------------------------ */

const imageModelCache = new Map<string, { model: string; at: number }>();

/**
 * The image model used for this key: AI_GEMINI_IMAGE_MODEL when set, else the newest stable Gemini image model the key
 * can use (Flash before Pro: cheaper and fast enough for exam pictures).
 */
export async function autoGeminiImageModel(apiKey: string): Promise<string> {
  const fixed = process.env.AI_GEMINI_IMAGE_MODEL?.trim();
  if (fixed) return fixed;
  const hit = imageModelCache.get(apiKey);
  if (hit && Date.now() - hit.at < AUTO_TTL_MS) return hit.model;
  const models = (await listGeminiModels(apiKey)).filter((m) => /^gemini-.*image/i.test(m) && !/tts|audio|live|embedding/i.test(m));
  const version = (m: string) => Number(/^gemini-(\d+(?:\.\d+)?)/.exec(m)?.[1] ?? 0);
  const score = (m: string) => (/preview|exp/i.test(m) ? 0 : 2) + (/flash/i.test(m) ? 1 : 0);
  const model = models.sort((a, b) => score(b) - score(a) || version(b) - version(a))[0];
  if (!model) throw new AiError("This Gemini API key cannot make images (no Gemini image model is available for it).");
  imageModelCache.set(apiKey, { model, at: Date.now() });
  return model;
}

type GeminiImagePart = { text?: string; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } };

/** One picture from a text prompt. Returns the image bytes and their type (PNG or JPEG). */
export async function runGeminiImage({ prompt, apiKey: key, aspectRatio = "1:1" }: { prompt: string; apiKey: string; aspectRatio?: "1:1" | "4:3" | "3:4" | "16:9" }): Promise<{ data: Buffer; mediaType: string }> {
  if (!key) throw new AiError("Making images needs a Gemini API key. Add your Gemini key in AI Settings.");
  const model = await autoGeminiImageModel(key);
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio } },
  };
  const send = async (b: unknown) => {
    try {
      return await fetch(endpoint(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(b),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AiError("Gemini did not make the image within the time limit. Try again.");
      console.error("[ai] gemini image connection", e);
      throw new AiError("Could not reach Gemini. Check the server connection and try again.");
    }
  };

  let res = await send(body);
  // Older image models do not know imageConfig: ask again without it.
  if (res.status === 400) {
    const peek = (await res.clone().json().catch(() => ({}))) as GeminiResponse;
    if (/image_?config|aspect/i.test(peek.error?.message ?? "")) res = await send({ ...body, generationConfig: { responseModalities: ["TEXT", "IMAGE"] } });
  }
  let data: GeminiResponse & { candidates?: { content?: { parts?: GeminiImagePart[] }; finishReason?: string }[] };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new AiError("The Gemini answer could not be read. Try again.");
  }
  if (!res.ok) {
    console.error("[ai] gemini image error", res.status, model, data.error?.message?.slice(0, 300));
    const reason = (data.error?.message ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (res.status === 400 && /api key/i.test(reason)) throw new AiError("The Gemini API key is invalid. Check the key in AI Settings.");
    if (res.status === 401 || res.status === 403) throw new AiError("The Gemini API key is invalid or lacks permission. Check the key in AI Settings.");
    if (res.status === 404) {
      imageModelCache.clear();
      throw new AiError(`The Gemini image model “${model}” can't be used with this key. Try again in a moment.`);
    }
    if (res.status === 429 && /free_tier|limit: 0\b/i.test(data.error?.message ?? ""))
      throw new AiError("This Gemini key has no quota for making images (free plan). Turn on billing for the key in Google AI Studio, then try again.");
    if (res.status === 429) throw new AiError("Gemini is busy or the image quota is used up (image models usually need a paid Gemini plan). Wait a moment and try again.");
    throw new AiError(`Gemini could not make the image${reason ? `: ${reason}` : "."}`);
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inlineData ? { mime: p.inlineData.mimeType, data: p.inlineData.data } : p.inline_data ? { mime: p.inline_data.mime_type, data: p.inline_data.data } : null;
    if (inline?.data) return { data: Buffer.from(inline.data, "base64"), mediaType: inline.mime || "image/png" };
  }
  console.error("[ai] gemini image: no picture", data.candidates?.[0]?.finishReason, data.promptFeedback, parts.map((p) => p.text).join(" ").slice(0, 200));
  throw new AiError("Gemini did not make a picture for this prompt. Try describing the picture differently.");
}
