"use client";

// Presentational pieces of My list and Interested (components/MyList.tsx, InterestedList.tsx): the timetable row of
// "Upcoming dates", the sent strip on a route ticket's stub, the list's balance bar and a chevron. No data logic: every
// value arrives computed by the screen.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Fit, FitResult } from "@/lib/fit";
import type { TFunction } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/core";
import { useLocale, useT } from "@/lib/i18n/client";
import { fitLabel, fitReasonText } from "@/lib/i18n/fit-text";
import { deadlineTone, type Tone } from "@/lib/status";
import { buttonClass, FIT_LEVEL, fitDotClass } from "@/lib/ui";
import { StatusIcon } from "../StatusPill";

// The rail's sticky offset (xl:top-20, 80px): clears the 60px sticky site header with room to breathe.
const RAIL_TOP = 80;

/** My list's rail beside the tickets (from 1280px). It stays in view while the tickets scroll, but only while the whole
 *  of it fits the window under the site header; when it doesn't (a short window, or every date opened) it scrolls with
 *  the page, so no row is ever cut off and nothing hides in an inner scroll. */
export function Rail({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [fits, setFits] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setFits(el.offsetHeight + RAIL_TOP + 16 <= window.innerHeight);
    // The observer reports the rail's size once on start and again whenever its content grows or shrinks.
    const ro = new ResizeObserver(check);
    ro.observe(el);
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);
  return (
    <aside ref={ref} className={`${className} ${fits ? "xl:sticky xl:top-20" : ""}`}>
      {children}
    </aside>
  );
}

/** A list that shows its first few rows and opens the rest in place with a real button (aria-expanded, aria-controls on
 *  the list; focus stays on the button). The rows arrive rendered and in order; this only decides how many show. */
export function ShowFirst({ id, items, first = 5, className }: { id: string; items: ReactNode[]; first?: number; className?: string }) {
  const t = useT();
  const [all, setAll] = useState(false);
  const more = items.length > first;
  return (
    <>
      <ol id={id} className={className}>
        {all || !more ? items : items.slice(0, first)}
      </ol>
      {more && (
        <button type="button" className={`${buttonClass("ghost", "sm")} mt-3`} aria-expanded={all} aria-controls={id} onClick={() => setAll((v) => !v)}>
          {all ? t("application.list.fewerDates") : t("application.list.allDates", { n: items.length })}
          <Chevron dir="down" className={`transition-transform motion-reduce:transition-none ${all ? "rotate-180" : ""}`} />
        </button>
      )}
    </>
  );
}

// A row's fit chip: the band's mark as a pale wash with its word in the band's dark ink, so a column of sixteen reads
// as data rather than a stripe of dark blobs (the solid FitBadge stays for single, prominent uses such as the checklist
// dialog). The four dots keep FitBadge's ladder: filled harder-to-easier in the band's own mark colour, so the band
// still reads without colour and darker still means harder. Text holds >= 7:1 on every wash.
const FIT_TINT: Record<Fit, string> = {
  super_reach: "bg-fit-super-reach-mark/15 text-fit-super-reach-edge",
  reach: "bg-fit-reach-mark/15 text-fit-reach",
  target: "bg-fit-target-mark/15 text-fit-target",
  safety: "bg-fit-safety-mark/25 text-fit-safety",
};

export function FitChip({ fit, result }: { fit: Fit; result?: FitResult }) {
  const t = useT();
  return (
    <span
      className={`inline-flex h-7 flex-none items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold whitespace-nowrap ${FIT_TINT[fit]}`}
      title={result ? fitReasonText(t, result) : undefined}
    >
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`size-1.5 rounded-full ${n <= FIT_LEVEL[fit] ? fitDotClass(fit) : "ring-1 ring-inset ring-current opacity-40"}`} />
        ))}
      </span>
      {fitLabel(t, fit)}
    </span>
  );
}

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
    <li className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-x-3 border-b border-ink/15 py-3">
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
