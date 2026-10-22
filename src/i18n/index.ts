/** Shared i18n helpers (safe to import from both server and client code). */
export const LOCALES = ["en", "id"] as const;
export type Locale = (typeof LOCALES)[number];
/** Language for visitors who have not picked one yet (no `locale` cookie): the users are Indonesian schools. */
export const DEFAULT_LOCALE: Locale = "id";
export const LOCALE_COOKIE = "locale";
export const LOCALE_LABEL: Record<Locale, string> = { en: "English", id: "Language Indonesia" };

export type Dict = Record<string, string>;
export type Translate = (key: string, ...args: (string | number)[]) => string;

export const isLocale = (v: unknown): v is Locale => v === "en" || v === "id";

/** Look up `key` in `dict` (falls back to the key itself, which is the English text) and fill `{0}`, `{1}`… placeholders. */
export function translate(dict: Dict, key: string, args: (string | number)[]): string {
  const text = dict[key] ?? key;
  return args.length ? text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? "")) : text;
}
