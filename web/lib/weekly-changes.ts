// "What changed this week" for one student, from rows already read. Pure: no database, no clock (the caller passes
// today), so node --test can run it. The tracker keeps no history, so this reports the CURRENT value of everything that
// was touched in the window, never what it used to be. Days are Taipei calendar days, like taipeiToday() everywhere else:
// a timestamp is turned into its Taipei date before it is compared with `since`.

import { progress } from "./checklist.ts";
import { upcomingDeadlines, type UpcomingDeadline } from "./mcp/rules.ts";
import { entriesSince, type RefreshEntry } from "./refresh-log.ts";
import type { ListEntry } from "./student-rows.ts";
import type { Deadline } from "./types.ts";

/** Look back this many days unless the caller says otherwise. */
export const DEFAULT_DAYS = 7;
/** The deadline window of the "due soon" part, in days from today. */
export const DUE_SOON_DAYS = 14;

export type WeeklyChanges = {
  /** First day of the window (ISO), today minus `days`. */
  since: string;
  today: string;
  /** Listed colleges whose row was changed in the window, newest first: current status, plan and checklist count. */
  updated: { slug: string; name: string; status: string; plan: string | null; updatedOn: string; checklistDone: number; checklistTotal: number }[];
  /** Deadlines in the next 14 days for the listed colleges, soonest first (same rules as get_upcoming_deadlines). */
  dueSoon: UpcomingDeadline[];
  /** Listed colleges whose newest source access date falls in the window. */
  dataRefreshed: { slug: string; name: string; lastChecked: string }[];
  /** The site's own refresh-log entries in the window (English titles). */
  siteUpdates: { date: string; title: string }[];
};

const DAY_MS = 86_400_000;
const TAIPEI_OFFSET_MS = 8 * 3_600_000;

/** The ISO day `n` days before `iso`. */
function daysBefore(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - n * DAY_MS).toISOString().slice(0, 10);
}

/** The Taipei calendar day of a timestamp (UTC+8, no daylight saving), or null when it isn't a usable timestamp. */
function taipeiDay(timestamp: string | undefined): { day: string; at: number } | null {
  if (!timestamp) return null;
  const at = Date.parse(timestamp);
  if (Number.isNaN(at)) return null;
  return { day: new Date(at + TAIPEI_OFFSET_MS).toISOString().slice(0, 10), at };
}

export function buildWeeklyChanges(input: {
  today: string;
  days?: number;
  list: (ListEntry & { name: string })[];
  deadlines: Deadline[];
  /** True hides the deadlines that only apply to US residents (FAFSA), as get_upcoming_deadlines does. */
  international?: boolean;
  /** Newest source access date per listed slug (see freshness.ts); null or absent = no dated source. */
  lastCheckedBySlug: Record<string, string | null | undefined>;
  log?: readonly RefreshEntry[];
}): WeeklyChanges {
  const { today, list, deadlines, lastCheckedBySlug, international = false } = input;
  const since = daysBefore(today, input.days ?? DEFAULT_DAYS);

  const updated = list
    .flatMap((e) => {
      const stamp = taipeiDay(e.updatedAt);
      if (!stamp || stamp.day < since) return [];
      const p = progress(e.checklist);
      return [{ at: stamp.at, row: { slug: e.slug, name: e.name, status: e.status, plan: e.plan, updatedOn: stamp.day, checklistDone: p.done, checklistTotal: p.total } }];
    })
    .sort((a, b) => b.at - a.at)
    .map((x) => x.row);

  // upcomingDeadlines counts days from a Date's local fields, so build one that reads as `today` in any time zone.
  const [y, m, d] = today.split("-").map(Number);
  const dueSoon = upcomingDeadlines(
    list.map((e) => ({ slug: e.slug, name: e.name, id: e.institutionId, plan: e.plan })),
    deadlines,
    DUE_SOON_DAYS,
    new Date(y, m - 1, d),
    international,
  );

  const dataRefreshed = list
    .flatMap((e) => {
      const checked = lastCheckedBySlug[e.slug];
      return checked && checked >= since ? [{ slug: e.slug, name: e.name, lastChecked: checked }] : [];
    })
    .sort((a, b) => b.lastChecked.localeCompare(a.lastChecked) || a.name.localeCompare(b.name));

  const siteUpdates = entriesSince(since, input.log).map((e) => ({ date: e.date, title: e.en.title }));

  return { since, today, updated, dueSoon, dataRefreshed, siteUpdates };
}
