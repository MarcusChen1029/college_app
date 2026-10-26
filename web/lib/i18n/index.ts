// Translation lookup used by both server and client components. Pure; safe to import anywhere.
import { DEFAULT_LOCALE, interpolate, type Locale, type Vars } from "./core.ts";
import { en, type MessageKey, type Messages } from "./en.ts";
import { NAV_LABEL_KEYS } from "./messages/common.ts";
import { zhTW } from "./zh-TW.ts";

export { DEFAULT_LOCALE, HTML_LANG, LOCALE_COOKIE, LOCALE_NAMES, LOCALES, parseLocale, type Locale } from "./core.ts";
export type { MessageKey } from "./en.ts";

export const DICTIONARIES: Readonly<Record<Locale, Messages>> = { en, "zh-TW": zhTW };

export type TFunction = (key: MessageKey, vars?: Vars) => string;

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return interpolate(dict[key] ?? en[key] ?? key, vars);
}

export function makeT(locale: Locale): TFunction {
  return (key, vars) => translate(locale, key, vars);
}

/** Translates an English nav/tab label (as written in lib/roles.ts and the tab lists); unknown labels pass through unchanged. */
export function navLabel(t: TFunction, label: string): string {
  const key = NAV_LABEL_KEYS[label];
  return key ? t(key) : label;
}
