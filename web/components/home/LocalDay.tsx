"use client";

import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/core";

// The home timetable counts from the visitor's own date, not the server's: a student in Taipei at 00:30 is already on
// the next day. The server renders its UTC date; after hydration React switches to the reader's local date.

const noop = () => () => {};
const localISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const useToday = (serverToday: string) => useSyncExternalStore(noop, localISO, () => serverToday);

const utcDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const DATE_LOCALE: Record<Locale, string> = { en: "en-US", "zh-TW": "zh-TW" };

export function TimetableCaption({ serverToday, locale }: { serverToday: string; locale: Locale }) {
  const t = useT();
  const today = useToday(serverToday);
  const date = new Date(utcDay(today)).toLocaleDateString(DATE_LOCALE[locale], { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return <>{t("home.timetable.caption", { date })}</>;
}

/** Days from the reader's today to `date`, toned like the rest of the site's deadline chips (urgent ≤7, soon ≤21). */
export function DaysLeft({ date, serverToday }: { date: string; serverToday: string }) {
  const t = useT();
  const days = Math.round((utcDay(date) - utcDay(useToday(serverToday))) / 86_400_000);
  const text = days <= 0 ? t("status.deadline.today") : days === 1 ? t("status.deadline.tomorrow") : t("status.deadline.days", { n: days });
  return <span className={days <= 7 ? "text-urgent" : days <= 21 ? "text-soon" : undefined}>{text}</span>;
}
