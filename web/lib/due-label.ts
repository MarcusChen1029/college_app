// The words for a piece of classwork's due state ("Due Thursday", "Missing · 2 days late", "Done Oct 30"), in the
// reader's language. Pure (no React, no `@/` imports) so it can be unit-tested; components/classroom/ClassroomText.ts
// re-exports `dueLabel` for the components. Dates are calendar dates: the due date is `today` plus the state's day
// count, so nothing here reads the clock.

import type { DueState } from "./classwork.ts";
import type { Locale } from "./i18n/core.ts";
import type { TFunction } from "./i18n/index.ts";

const TAG: Record<Locale, string> = { en: "en-US", "zh-TW": "zh-TW" };

/** A due date this many days ahead is named by its weekday up to here, and by its date after (a week is unambiguous). */
const WEEKDAY_MAX_DAYS = 6;

/**
 * When something is due, without the word "Due": "today", "tomorrow", the weekday within six days ("Thursday"), else
 * the date ("Nov 15", with the year when it is not this year's). "" when `today` is not a `YYYY-MM-DD` date.
 */
export function dueWhen(t: TFunction, days: number, today: string, locale: Locale): string {
  if (days === 0) return t("classroom.due.today");
  if (days === 1) return t("classroom.due.tomorrow");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!m) return "";
  const year = Number(m[1]);
  const at = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]) + days));
  const tag = TAG[locale];
  if (days <= WEEKDAY_MAX_DAYS) return at.toLocaleDateString(tag, { weekday: "long", timeZone: "UTC" });
  return at.toLocaleDateString(tag, { month: "short", day: "numeric", ...(at.getUTCFullYear() === year ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** "Nov 2" / "11月2日" for a timestamp in the reader's time zone, "" when it cannot be read. */
function doneDate(iso: string, locale: Locale): string {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? "" : new Date(ms).toLocaleDateString(TAG[locale], { month: "short", day: "numeric" });
}

/**
 * What a row or card says about the work's timing. `today` is the same `YYYY-MM-DD` the state was computed from
 * (`dueState(item, today)`); it is needed because a "due" state only knows how many days away it is.
 */
export function dueLabel(t: TFunction, state: DueState, locale: Locale, today: string): string {
  switch (state.kind) {
    case "none":
      return t("classroom.due.none");
    case "due": {
      const when = dueWhen(t, state.days, today, locale);
      return when ? t("classroom.due.on", { when }) : t("classroom.due.none");
    }
    case "missing":
      return t(state.daysLate === 1 ? "classroom.due.missing.one" : "classroom.due.missing.other", { n: state.daysLate });
    case "done": {
      const date = doneDate(state.at, locale);
      return date ? t("classroom.task.doneOn", { date }) : t("classroom.due.done");
    }
  }
}
