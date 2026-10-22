"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, translate, type Dict, type Locale, type Translate } from "./index";

type Ctx = { locale: Locale; dict: Dict };
const I18nContext = createContext<Ctx>({ locale: DEFAULT_LOCALE, dict: {} });

export function I18nProvider({ locale, dict, children }: { locale: Locale; dict: Dict; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, dict }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useLocale = () => useContext(I18nContext).locale;

/** Translator for client components. */
export function useT(): Translate {
  const { dict } = useContext(I18nContext);
  return useCallback((key, ...args) => translate(dict, key, args), [dict]);
}
