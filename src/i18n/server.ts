import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, translate, type Dict, type Locale, type Translate } from "./index";
import { id } from "./id";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Dictionary to ship to the client (empty for English, since the code already contains English). */
export function dictFor(locale: Locale): Dict {
  return locale === "id" ? id : {};
}

/** Translator for server components, route handlers and server actions. */
export async function getT(): Promise<Translate> {
  const dict = dictFor(await getLocale());
  return (key, ...args) => translate(dict, key, args);
}
