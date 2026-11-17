import type { Translate } from "@/i18n";
import type { Allowance, UsageProvider } from "./ai-usage"; // type-only: safe in the browser bundle

/** Lines of text about AI usage, shared by the notice after each use and the "Usage today" card. */

const SERVICES: Record<string, string> = {
  "openrouter.ai": "OpenRouter",
  "api.groq.com": "Groq",
  "integrate.api.nvidia.com": "NVIDIA NIM",
  "api.deepseek.com": "DeepSeek",
  "api.mistral.ai": "Mistral",
  "api.openai.com": "OpenAI",
};

const LABEL: Record<UsageProvider, string> = {
  "claude-cli": "Claude Code",
  anthropic: "Anthropic API",
  gemini: "Gemini",
  cloudflare: "Cloudflare Workers AI",
  openai: "OpenAI-compatible",
  ollama: "Ollama",
};

/** "Groq", "OpenRouter", "Gemini", … (an OpenAI-compatible service is named after its address). */
export const providerName = (provider: UsageProvider, host: string | null) => (provider === "openai" && host ? (SERVICES[host] ?? host) : LABEL[provider]);

export const formatNumber = (n: number, locale: string) => new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US").format(Math.round(n));

export function formatUsd(n: number, locale: string): string {
  const digits = n > 0 && n < 0.01 ? 4 : 2;
  return `$${new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)}`;
}

/** "1.240 tokens in · 860 out" */
export const tokenLine = (t: Translate, locale: string, input: number, output: number) => t("{0} tokens in · {1} out", formatNumber(input, locale), formatNumber(output, locale));

/** The free-allowance sentence, e.g. "≈ 1.234 of 10.000 free neurons used today (resets 07.00 WIB)". */
export function allowanceText(a: Allowance, t: Translate, locale: string): string {
  const n = (x: number) => formatNumber(x, locale);
  const unit = a.unit === "neurons" ? t("neurons") : a.unit === "tokens" ? t("tokens") : t("requests");
  let main: string;
  if (a.kind === "reported") {
    main =
      a.limit != null
        ? t("{0} of {1} {2} left{3} (reported by the service)", n(a.remaining ?? 0), n(a.limit), unit, a.per === "day" ? t(" today") : "")
        : t("{0} {1} left{2} (reported by the service)", n(a.remaining ?? 0), unit, a.per === "day" ? t(" today") : "");
  } else {
    const used = `${a.estimated ? "≈ " : ""}${n(a.used ?? 0)}`;
    main = a.limit != null ? t("{0} of {1} free {2} used today", used, n(a.limit), unit) : t("{0} {1} today", used, unit);
  }
  if (a.resetAt) main += ` · ${t("resets {0}", a.resetAt)}`;
  return main;
}

/** The extra notes under the allowance sentence. */
export const allowanceNotes = (a: Allowance, t: Translate, locale: string) =>
  (a.notes ?? []).map((x) => t(x.key, ...(x.args ?? []).map((v) => (typeof v === "number" ? formatNumber(v, locale) : v))));
