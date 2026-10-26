"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { DEFAULT_LOCALE, HTML_LANG, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./core.ts";
import { makeT, type TFunction } from "./index.ts";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Gives client components the language. `locale` comes from the server (the cookie, read inside a Suspense boundary in
 * app/layout.tsx), so the server HTML and the first client render agree and nothing mismatches on hydration.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // The inline script in LocaleRoot sets <html lang> on a full load; this keeps it right if the provider re-renders.
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** `const t = useT(); t("nav.explore")`. Outside the provider it falls back to English. */
export function useT(): TFunction {
  const locale = useLocale();
  return useMemo(() => makeT(locale), [locale]);
}

/** Saves the choice in the cookie and reloads, so server-rendered text, client text and cached router payloads all switch together. */
export function setLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
  window.location.reload();
}
