import { AiError } from "./ai-error";

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
