import { AiError } from "./ai-error";

/** A model on a laptop CPU can take minutes for a long document. */
const OLLAMA_TIMEOUT_MS = 900_000;
/** Ollama's own default context is only 2–4k tokens, which silently cuts long prompts. */
const NUM_CTX = 16384;
const PROBE_TIMEOUT_MS = 1500;
const PROBE_CACHE_MS = 10_000;

const base = (baseUrl: string) => baseUrl.replace(/\/+$/, "");

/** Is an Ollama server answering at this address? Cached briefly: the provider list is built on every AI page load. */
const probes = new Map<string, { at: number; ok: boolean }>();
export async function isOllamaReachable(baseUrl: string): Promise<boolean> {
  const hit = probes.get(baseUrl);
  if (hit && Date.now() - hit.at < PROBE_CACHE_MS) return hit.ok;
  let ok = false;
  try {
    ok = (await fetch(`${base(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })).ok;
  } catch {
    ok = false;
  }
  probes.set(baseUrl, { at: Date.now(), ok });
  return ok;
}

/** The models installed on the server (`ollama list`), including cloud models signed in through it. */
export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${base(baseUrl)}/api/tags`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS * 2) });
  } catch {
    throw new AiError("Could not reach Ollama. Make sure it is running and the address in AI Settings is right.");
  }
  if (!res.ok) throw new AiError("Ollama could not list its models.");
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name).sort();
}

/** Only some models can read a photo (llava, granite-vision, …). Ollama lists that in the model's capabilities. */
export async function ollamaSupportsVision(baseUrl: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${base(baseUrl)}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS * 2),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { capabilities?: string[] };
    return data.capabilities?.includes("vision") ?? false;
  } catch {
    return false;
  }
}

type OllamaResponse = {
  message?: { content?: string };
  done_reason?: string;
  error?: string;
};

/**
 * One text generation through a local (or remote) Ollama server, using its REST API (no SDK, like Gemini).
 * `json` asks Ollama to constrain the reply to valid JSON. `image` is sent only to models that can see (see ollamaSupportsVision).
 */
export async function runOllama({
  prompt,
  system,
  baseUrl,
  model,
  maxTokens = 32768,
  json = false,
  image,
}: {
  prompt: string;
  system: string;
  /** From the AI settings (see ai-config.ts). */
  baseUrl: string;
  model: string;
  maxTokens?: number;
  json?: boolean;
  image?: { data: Uint8Array; mediaType: "image/jpeg" | "image/png" };
}): Promise<string> {
  const body = {
    model,
    stream: false,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt, ...(image ? { images: [Buffer.from(image.data).toString("base64")] } : {}) },
    ],
    options: { temperature: 0.7, num_predict: maxTokens, num_ctx: NUM_CTX },
    ...(json ? { format: "json" } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`${base(baseUrl)}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AiError("Ollama did not respond within the time limit.");
    console.error("[ai] ollama connection", e);
    throw new AiError("Could not reach Ollama. Make sure it is running and the address in AI Settings is right.");
  }

  let data: OllamaResponse;
  try {
    data = (await res.json()) as OllamaResponse;
  } catch {
    throw new AiError("The Ollama answer could not be read. Try again.");
  }

  if (!res.ok) {
    console.error("[ai] ollama error", res.status, data.error?.slice(0, 300));
    if (res.status === 404) throw new AiError(`The Ollama model “${model}” is not installed. Run "ollama pull ${model}" or change the model in AI Settings.`);
    throw new AiError("Ollama rejected the request. Check the model name in AI Settings, then try again.");
  }

  // Reasoning models (e.g. deepseek-r1) may put their thinking in the reply.
  const text = (data.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) throw new AiError("Ollama gave no answer. Try again or use a different model.");
  if (data.done_reason === "length") throw new AiError("The AI answer was cut off because it was too long. Try again with a narrower topic.");
  return text;
}
