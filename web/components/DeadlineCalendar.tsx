"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { groupByDate, monthGrid, monthOf, monthTitle, shiftMonth } from "@/lib/calendar";
import { daysUntil, fmtDate } from "@/lib/format";
import { deadlineTone, type Tone } from "@/lib/status";
import { toneClass } from "@/lib/ui";

export type CalendarEvent = { id: string; date: string; label: string; college: string; slug: string; done: boolean };

const URGENCY: Tone[] = ["urgent", "soon", "neutral", "progress", "done"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const navButton = "grid h-8 w-8 place-items-center rounded-full border-2 border-zinc-200 text-sm font-semibold hover:bg-zinc-50 focus-visible:outline-3 focus-visible:outline-blue-400";

/** The most urgent tone among a day's deadlines. */
function dayTone(events: CalendarEvent[], today: string): Tone {
  const [y, m, d] = today.split("-").map(Number);
  const now = new Date(y, m - 1, d);
  const tones = events.map((e) => deadlineTone(daysUntil(e.date, now), e.done));
  return URGENCY.find((t) => tones.includes(t)) ?? "neutral";
}

/**
 * A month calendar with a dot on every day that has a deadline. It opens on the month of the next upcoming
 * deadline (or this month); picking a day lists that day's deadlines, otherwise the month's are listed.
 */
export function DeadlineCalendar({ events, today }: { events: CalendarEvent[]; today: string }) {
  const byDate = useMemo(() => groupByDate(events, (e) => e.date), [events]);
  const next = useMemo(() => events.map((e) => e.date).filter((d) => d >= today).sort()[0], [events, today]);
  const [view, setView] = useState(() => monthOf(next ?? today));
  const [picked, setPicked] = useState<string | null>(null);

  const weeks = monthGrid(view.year, view.month);
  const monthEvents = weeks
    .flat()
    .filter((c) => c.inMonth)
    .flatMap((c) => byDate.get(c.iso) ?? []);
  const listed = picked ? (byDate.get(picked) ?? []) : monthEvents;
  const go = (by: number) => {
    setView((v) => shiftMonth(v, by));
    setPicked(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={navButton} onClick={() => go(-1)} aria-label="Previous month">
          ‹
        </button>
        <h3 className="text-sm font-bold" aria-live="polite">
          {monthTitle(view.year, view.month)}
        </h3>
        <button type="button" className={navButton} onClick={() => go(1)} aria-label="Next month">
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-400" aria-hidden>
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div role="group" aria-label={`Deadlines in ${monthTitle(view.year, view.month)}`} className="grid grid-cols-7 gap-y-1">
        {weeks.flat().map((c) => {
          const here = byDate.get(c.iso) ?? [];
          const isToday = c.iso === today;
          const isPicked = c.iso === picked;
          const upcoming = c.iso >= today;
          const tone = isPicked
            ? "bg-ink text-white"
            : here.length
              ? upcoming
                ? "bg-blue-50 font-semibold hover:bg-blue-100"
                : "bg-zinc-100 font-semibold text-zinc-500 hover:bg-zinc-200"
              : "hover:bg-zinc-50";
          return (
            <button
              key={c.iso}
              type="button"
              disabled={here.length === 0}
              aria-pressed={here.length ? isPicked : undefined}
              aria-label={`${fmtDate(c.iso)}${isToday ? " (today)" : ""}${here.length ? `: ${here.length} ${here.length === 1 ? "deadline" : "deadlines"}` : ""}`}
              onClick={() => setPicked(isPicked ? null : c.iso)}
              className={`relative mx-auto grid h-9 w-9 place-items-center rounded-full text-sm focus-visible:outline-3 focus-visible:outline-blue-400 disabled:cursor-default ${tone} ${c.inMonth ? "" : "opacity-35"} ${isToday ? "ring-2 ring-ink" : ""}`}
            >
              {c.day}
              {here.length > 1 && (
                <span aria-hidden className={`absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full border px-1 text-[10px] font-bold leading-none ${toneClass(dayTone(here, today))}`}>
                  {here.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-zinc-100 pt-3">
        <p className="text-xs font-semibold text-zinc-500">{picked ? fmtDate(picked) : `This month (${monthEvents.length})`}</p>
        {listed.length === 0 ? (
          <p className="mt-1.5 text-sm text-zinc-600">{events.length === 0 ? "Add colleges to your list and their deadlines will show up here." : "No deadlines this month."}</p>
        ) : (
          <ul className="mt-1 divide-y divide-zinc-100">
            {listed.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <Link href={`/colleges/${e.slug}`} className="font-semibold hover:text-blue-700">
                    {e.college}
                  </Link>
                  <span className="text-zinc-500"> · {e.label}</span>
                </span>
                {!picked && <span className={`shrink-0 text-xs ${e.date < today ? "text-zinc-400" : "text-zinc-600"}`}>{fmtDate(e.date)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
