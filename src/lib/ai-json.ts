import { AiError } from "./ai-error";

/**
 * Remove the reasoning that "thinking" models (DeepSeek R1, Qwen QwQ, …) write before the answer, as <think>…</think>.
 * Some only print the closing tag (the opening one is in their prompt template), so everything up to the last
 * </think> goes. A reply still inside <think> ran out of room while thinking: that is an error, not an answer.
 */
export function stripThinking(text: string): string {
  const end = text.lastIndexOf("</think>");
  const out = (end >= 0 ? text.slice(end + "</think>".length) : text).trim();
  if (/^<think>/i.test(out)) throw new AiError("The AI model was still thinking when its answer was cut off. Try again, or choose a model that does not \"think\" (for example a Llama model) in AI Settings.");
  return out;
}

/**
 * Pull a JSON value out of model text: strips code fences, tries a plain parse,
 * then falls back to the outermost {...} and finally the outermost [...].
 */
export function ambilJson<T = unknown>(text: string): T {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    /* fall through to the bracket search */
  }
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const a = s.indexOf(open);
    const b = s.lastIndexOf(close);
    if (a !== -1 && b > a) {
      try {
        return JSON.parse(s.slice(a, b + 1)) as T;
      } catch {
        /* try the next shape */
      }
    }
  }
  throw new AiError("The AI answer format could not be read. Try running it again.");
}
