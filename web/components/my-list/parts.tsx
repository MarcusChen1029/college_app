"use client";

// Presentational pieces of My list and Interested (components/MyList.tsx, InterestedList.tsx): the timetable row of
// "Upcoming dates", the sent strip on a route ticket's stub, the list's balance bar and a chevron. No data logic: every
// value arrives computed by the screen.

import type { ReactNode } from "react";
import type { Fit } from "@/lib/fit";
import type { TFunction } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/core";
import { useLocale, useT } from "@/lib/i18n/client";
import { deadlineTone, type Tone } from "@/lib/status";
import { fitDotClass } from "@/lib/ui";
import { StatusIcon } from "../StatusPill";

const DATE_LOCALE: Record<Locale, string> = { en: "en-US", "zh-TW": "zh-TW" };

/** "Nov 30" / "11月30日": the timetable's big date. Rows run in date order and each says how many days are left. */
function shortDay(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(DATE_LOCALE[locale], { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The words DeadlineChip uses (lib/status.ts deadlineText), in the visitor's language. */
function daysWords(t: TFunction, days: number): string {
  if (days < 0) return t("status.deadline.overdue");
  if (days === 0) return t("status.deadline.today");
  if (days === 1) return t("status.deadline.tomorrow");
  return t("status.deadline.days", { n: days });
}

// Tone as text colour only: a timetable is ink on paper, and the days left carry the signal (with its icon).
const TONE_TEXT: Record<Tone, string> = {
  urgent: "text-urgent",
  soon: "text-soon",
  done: "text-done",
  progress: "text-ink",
  neutral: "text-zinc-600",
};

/** One line of the printed timetable: the date large, the days left under it, then what is due. */
export function TimetableRow({ date, days, done, title, sub }: { date: string; days: number; done: boolean; title: ReactNode; sub?: ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const tone = deadlineTone(days, done);
  return (
    <li className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-x-3 border-b border-ink/15 py-3.5">
      <div>
        {/* 100px holds the longest date on one line in both languages ("Nov 30", "11月30日"). */}
        <div className="whitespace-nowrap font-display text-[22px] font-extrabold leading-none tracking-tight tabular-nums">{shortDay(date, locale)}</div>
        <div className={`mt-2 flex items-center gap-1 text-[13px] font-semibold ${TONE_TEXT[tone]}`}>
          {tone !== "neutral" && <StatusIcon tone={tone} />}
          {done ? t("status.done") : daysWords(t, days)}
        </div>
      </div>
      <div className="min-w-0 pt-0.5 text-[15px] leading-snug [overflow-wrap:anywhere]">
        <div className="font-semibold text-ink">{title}</div>
        {sub && <div className="mt-0.5 text-sm text-zinc-600">{sub}</div>}
      </div>
    </li>
  );
}

/** One segment per application on a route (or on the whole list), filled once it is sent. The pill beside it says the
 *  same in words, so this stays out of the accessibility tree. */
export function SentStrip({ sent, total, className = "w-24" }: { sent: number; total: number; className?: string }) {
  if (total === 0) return null;
  return (
    <span aria-hidden className={`flex h-2 gap-[3px] ${className}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-full min-w-[3px] flex-1 rounded-full ${i < sent ? "bg-ink" : "bg-white ring-1 ring-inset ring-zinc-400"}`} />
      ))}
    </span>
  );
}

const FIT_ORDER: Fit[] = ["super_reach", "reach", "target", "safety"];

/** The list's balance as one bar: each fit band as wide as its count, in the fit mark colours (darker = harder). The
 *  sentence beside it gives the counts. */
export function BalanceBar({ counts }: { counts: Record<Fit, number> }) {
  const shown = FIT_ORDER.filter((f) => counts[f] > 0);
  if (!shown.length) return null;
  return (
    <span aria-hidden className="flex h-2.5 w-full gap-[3px]">
      {shown.map((f) => (
        <span key={f} className={`h-full rounded-full ${fitDotClass(f)}`} style={{ flexGrow: counts[f], flexBasis: 0 }} />
      ))}
    </span>
  );
}

export function Chevron({ dir = "right", className = "" }: { dir?: "right" | "down"; className?: string }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={dir === "right" ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6"} />
    </svg>
  );
}
