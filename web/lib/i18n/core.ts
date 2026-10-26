// Locale basics shared by the server, the client and the tests. No React, no Next imports.

export const LOCALES = ["en", "zh-TW"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie holding the chosen language. Read on the server (inside a Suspense boundary), written by the language switch. */
export const LOCALE_COOKIE = "lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Value for <html lang>. */
export const HTML_LANG: Record<Locale, string> = { en: "en", "zh-TW": "zh-Hant-TW" };

/** Each language's name, written in that language (shown in the switch). */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", "zh-TW": "繁體中文" };

export function parseLocale(v: unknown): Locale {
  return v === "zh-TW" ? "zh-TW" : DEFAULT_LOCALE;
}

/** The section dictionaries' shape: a translation must have exactly the English keys. */
export type Translation<T> = { readonly [K in keyof T]: string };

export type Vars = Record<string, string | number>;

/** Replaces {name} with vars.name. Unknown placeholders are left as they are, so a missing var is visible, not silently blank. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
