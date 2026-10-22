import { AiError } from "./ai-error";

/** Same limit as the original desktop app. Long documents can take minutes. */
const GEMINI_TIMEOUT_MS = 900_000;
/** AI_GEMINI_BASE_URL is only for a proxy or a test double. */
const BASE_URL = (process.env.AI_GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
const endpoint = (model: string) => `${BASE_URL}/models/${encodeURIComponent(model)}:generateContent`;

/** Models that can generate text with this key. */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  if (!apiKey) throw new AiError("The Gemini API key is not set on the server.");
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
  if (!key) throw new AiError("The Gemini API key is not set on the server.");

  const parts = image ? [{ inline_data: { mime_type: image.mediaType, data: Buffer.from(image.data).toString("base64") } }, { text: prompt }] : [{ text: prompt }];
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: "application/json" } : {}) },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
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
    if (res.status === 400 && /api key/i.test(data.error?.message ?? "")) throw new AiError("The Gemini API key is invalid. Contact an admin.");
    if (res.status === 401 || res.status === 403) throw new AiError("The Gemini API key is invalid or lacks permission. Contact an admin.");
    if (res.status === 404) throw new AiError(`The Gemini model “${model}” was not found. Check the model name in AI Settings.`);
    if (res.status === 429) throw new AiError("Gemini is busy or the quota is used up. Wait a moment and try again.");
    throw new AiError("Gemini rejected the request. Try again in a little while.");
  }

  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    console.error("[ai] gemini empty reply", cand?.finishReason, data.promptFeedback);
    throw new AiError("Gemini gave no answer. Try rephrasing the topic.");
  }
  if (cand?.finishReason === "MAX_TOKENS") throw new AiError("The AI answer was cut off because it was too long. Try again with a narrower topic.");
  return text;
}
