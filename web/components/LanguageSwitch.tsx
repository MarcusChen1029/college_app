"use client";

import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n/core";
import { setLocale, useLocale, useT } from "@/lib/i18n/client";

/** A compact "English | 繁體中文" control. `variant="header"` is the small header link; "settings" is a labelled pair of buttons. */
export function LanguageSwitch({ variant = "header", className = "" }: { variant?: "header" | "settings"; className?: string }) {
  const locale = useLocale();
  const t = useT();

  if (variant === "header") {
    const other: Locale = locale === "en" ? "zh-TW" : "en";
    return (
      <button
        type="button"
        lang={other === "en" ? "en" : "zh-Hant-TW"}
        title={t("lang.switchTo", { name: LOCALE_NAMES[other] })}
        aria-label={t("lang.switchTo", { name: LOCALE_NAMES[other] })}
        onClick={() => setLocale(other)}
        className={`whitespace-nowrap rounded-lg px-2 py-1 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-ink ${className}`}
      >
        {other === "en" ? "EN" : "中文"}
      </button>
    );
  }

  return (
    <div role="group" aria-label={t("lang.label")} className={`inline-flex rounded-xl border border-zinc-200 p-1 ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l === "en" ? "en" : "zh-Hant-TW"}
          aria-pressed={l === locale}
          onClick={() => l !== locale && setLocale(l)}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${l === locale ? "bg-blue-700 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
        >
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
