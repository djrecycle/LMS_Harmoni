import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { AiError } from "./ai-error";
import { stripThinking } from "./ai-json";

/**
 * Any service that speaks the OpenAI Chat Completions API: OpenRouter, Groq, NVIDIA NIM, DeepSeek, Mistral, OpenAI
 * itself, or a local LM Studio / llama.cpp / vLLM server. Settings: a base URL (…/v1), an optional key, a model name.
 *
 * A teacher types the address, and the server then calls it: so for teachers (`publicOnly`) the address must be https
 * and resolve to public IPs only, and redirects are refused. Otherwise a teacher could make the server reach its own
 * database or other internal services. The Super Admin may use any address (e.g. a local model server).
 */

const TEXT_TIMEOUT_MS = 600_000;

export type OpenAiTarget = { baseUrl: string; key: string; model: string; publicOnly: boolean };

const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const)
  PRIVATE.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  PRIVATE.addSubnet(net, prefix, "ipv6");

function isPrivateIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return PRIVATE.check(mapped[1], "ipv4");
  return PRIVATE.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");
}

const base = (u: string) => u.trim().replace(/\/+$/, "");

/** Throws AiError when the address is not allowed for this user. */
async function checkAddress(baseUrl: string, publicOnly: boolean): Promise<URL> {
  let url: URL;
  try {
    url = new URL(base(baseUrl));
  } catch {
    throw new AiError("The OpenAI-compatible address is not a valid URL. Check it in AI Settings.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AiError("The OpenAI-compatible address must start with https://.");
  if (!publicOnly) return url;
  if (url.protocol !== "https:") throw new AiError("The OpenAI-compatible address must start with https://.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new AiError("The OpenAI-compatible address could not be found. Check it in AI Settings.");
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp)) throw new AiError("That OpenAI-compatible address is not allowed. Use the public address of an AI service.");
  return url;
}

const headers = (key: string) => ({ "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) });

type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string } | string;
  message?: string;
  detail?: string;
};

const reasonOf = (d: ChatResponse) => (typeof d.error === "string" ? d.error : (d.error?.message ?? d.message ?? d.detail ?? "")).replace(/\s+/g, " ").slice(0, 300);

function httpError(status: number, reason: string, model: string): AiError {
  console.error("[ai] openai-compatible error", status, model, reason);
  if (status === 401 || status === 403) return new AiError("The OpenAI-compatible API key is invalid or lacks permission. Check it in AI Settings.");
  if (status === 402 || /credit|balance|billing|insufficient/i.test(reason)) return new AiError("The AI service balance is used up. Top up your account with the AI provider, or use another key.");
  if (status === 429) return new AiError("The AI service is busy or today's free allowance is used up. Wait a moment and try again.");
  if (status === 404 || /model.*(not (found|exist)|does not exist|unknown)|no such model/i.test(reason)) return new AiError(`The AI model “${model}” was not found. Check the model name in AI Settings.`);
  if (/context|too long|maximum.*length/i.test(reason)) return new AiError("The request is too long for this model. Ask for fewer questions, or choose a model with a larger context in AI Settings.");
  return new AiError(`The OpenAI-compatible service could not answer${reason ? `: ${reason.slice(0, 200)}` : "."}`);
}

/** One text generation (Chat Completions). `json` asks for JSON mode, dropped again when the service does not support it. */
export async function runOpenAi({ prompt, system, maxTokens = 16000, json = false, ...t }: OpenAiTarget & { prompt: string; system: string; maxTokens?: number; json?: boolean }): Promise<string> {
  if (!t.baseUrl || !t.model) throw new AiError("The OpenAI-compatible provider is not set up. Add the address and model in AI Settings.");
  const url = await checkAddress(t.baseUrl, t.publicOnly);
  const opts = { json, maxTokens: maxTokens as number | undefined };
  const send = () =>
    fetch(`${url.href.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: headers(t.key),
      redirect: "error",
      body: JSON.stringify({
        model: t.model,
        messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
        temperature: 0.7,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(TEXT_TIMEOUT_MS),
    });

  for (;;) {
    let res: Response;
    try {
      res = await send();
    } catch (e) {
      if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) throw new AiError("The OpenAI-compatible service did not respond within the time limit.");
      console.error("[ai] openai-compatible connection", e);
      throw new AiError("Could not reach the OpenAI-compatible service. Check the address in AI Settings.");
    }
    let data: ChatResponse;
    try {
      data = (await res.json()) as ChatResponse;
    } catch {
      throw new AiError("The answer from the OpenAI-compatible service could not be read. Check the address (it usually ends in /v1).");
    }
    if (!res.ok) {
      const reason = reasonOf(data);
      // Services differ in what they accept: retry without the output limit (models with a smaller one), then without JSON mode.
      if ((res.status === 400 || res.status === 422) && opts.maxTokens && /max_(completion_)?tokens|max.*tokens|output tokens/i.test(reason)) {
        opts.maxTokens = undefined;
        continue;
      }
      if ((res.status === 400 || res.status === 422) && opts.json) {
        opts.json = false;
        continue;
      }
      throw httpError(res.status, reason, t.model);
    }
    const choice = data.choices?.[0];
    // Reasoning models (DeepSeek R1, Qwen, …) may put their thinking in the reply.
    const text = stripThinking(choice?.message?.content ?? "");
    if (!text) throw new AiError("The OpenAI-compatible service gave no answer. Try again or use a different model.");
    if (choice?.finish_reason === "length") throw new AiError("The AI answer was cut off because it was too long. Try again with a narrower topic.");
    return text;
  }
}

/** The models the service offers (GET /models), for the model picker. */
export async function listOpenAiModels(t: Omit<OpenAiTarget, "model">): Promise<string[]> {
  if (!t.baseUrl) throw new AiError("Add the address of the OpenAI-compatible service first.");
  const url = await checkAddress(t.baseUrl, t.publicOnly);
  let res: Response;
  try {
    res = await fetch(`${url.href.replace(/\/+$/, "")}/models`, { headers: headers(t.key), redirect: "error", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AiError("Could not reach the OpenAI-compatible service. Check the address in AI Settings.");
  }
  if (res.status === 401 || res.status === 403) throw new AiError("The OpenAI-compatible API key is invalid or lacks permission. Check it in AI Settings.");
  if (!res.ok) throw new AiError("This service does not list its models. Type the model name instead.");
  try {
    const data = (await res.json()) as { data?: { id?: string }[] };
    return [...new Set((data.data ?? []).map((m) => m.id ?? "").filter(Boolean))].sort();
  } catch {
    throw new AiError("This service does not list its models. Type the model name instead.");
  }
}
