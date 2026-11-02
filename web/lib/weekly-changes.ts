// "What changed this week" for one student, from rows already read. Pure: no database, no clock (the caller passes
// today), so node --test can run it. The tracker keeps no history, so this reports the CURRENT value of everything that
// was touched in the window, never what it used to be. Days are Taipei calendar days, like taipeiToday() everywhere else:
// a timestamp is turned into its Taipei date before it is compared with `since`.

import { CHECKLIST, isDone, progress } from "./checklist.ts";
import { deadlineApplies } from "./deadline-rules.ts";
import { daysUntil } from "./format.ts";
import { upcomingDeadlines, type UpcomingDeadline } from "./mcp/rules.ts";
import { taipeiToday } from "./plans.ts";
import { entriesSince, type RefreshEntry } from "./refresh-log.ts";
import type { ListEntry } from "./student-rows.ts";
import type { Deadline } from "./types.ts";

/** Look back this many days unless the caller says otherwise. */
export const DEFAULT_DAYS = 7;
/** The deadline window of the "due soon" part, in days from today. */
export const DUE_SOON_DAYS = 14;

/** A deadline for a listed college, with the names of the checklist items that college still has open ([] when all are done). */
export type DueSoonDeadline = UpcomingDeadline & { missing: string[] };
/** An application deadline that has already passed while the application is still in progress. `daysOverdue` counts from today (Taipei). */
export type OverdueDeadline = Omit<UpcomingDeadline, "days"> & { daysOverdue: number; missing: string[] };

export type WeeklyChanges = {
  /** First day of the window (ISO), today minus `days`. */
  since: string;
  today: string;
  /** Listed colleges whose row was changed in the window, newest first: current status, plan and checklist count. */
  updated: { slug: string; name: string; status: string; plan: string | null; updatedOn: string; checklistDone: number; checklistTotal: number }[];
  /** Deadlines in the next 14 days (today included) for the listed colleges, soonest first (same rules as get_upcoming_deadlines), each with what is still missing. */
  dueSoon: DueSoonDeadline[];
  /**
   * Application deadlines before today for colleges still in progress, longest overdue first, each with what is still missing.
   * A college with no plan yet is listed only when every applicable round has passed, once, for its latest round.
   */
  overdue: OverdueDeadline[];
  /** Listed colleges whose newest source access date falls in the window. */
  dataRefreshed: { slug: string; name: string; lastChecked: string }[];
  /** The site's own refresh-log entries in the window (English titles). */
  siteUpdates: { date: string; title: string }[];
};

const DAY_MS = 86_400_000;

/** The ISO day `n` days before `iso`. */
function daysBefore(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - n * DAY_MS).toISOString().slice(0, 10);
}

/** The Taipei calendar day of a timestamp, or null when it isn't a usable timestamp. `at` is the instant, for ordering. */
function taipeiDay(timestamp: string | undefined): { day: string; at: number } | null {
  if (!timestamp) return null;
  const at = Date.parse(timestamp);
  if (Number.isNaN(at)) return null;
  return { day: taipeiToday(new Date(at)), at };
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

  // The checklist items still open per college, by the labels the app and update_checklist already use.
  const missingBySlug = new Map(list.map((e) => [e.slug, CHECKLIST.filter(([key]) => !isDone(key, e.checklist)).map(([, label]) => label)]));
  const missing = (slug: string) => missingBySlug.get(slug) ?? [];

  // upcomingDeadlines and daysUntil count days from a Date's local fields, so build one that reads as `today` in any time zone.
  const [y, m, d] = today.split("-").map(Number);
  const todayDate = new Date(y, m - 1, d);

  const dueSoon = upcomingDeadlines(
    list.map((e) => ({ slug: e.slug, name: e.name, id: e.institutionId, plan: e.plan })),
    deadlines,
    DUE_SOON_DAYS,
    todayDate,
    international,
  ).map((u) => ({ ...u, missing: missing(u.slug) }));

  // Overdue: a college still in progress whose application deadline has passed. A submitted application or a decision has nothing
  // left to miss, and aid or other dates are not overdue "applications". With a decided plan, that plan's passed round is overdue.
  // With no plan yet the student may still pick a later round, so the college is overdue only when NO applicable round is still
  // ahead (today counts as ahead), and then it is reported once, for the latest round that passed.
  const overdue = list
    .filter((e) => e.status === "in_progress")
    .flatMap((e) => {
      const rounds = deadlines
        .filter((dl) => dl.institution_id === e.institutionId && dl.kind === "application" && dl.due_date && deadlineApplies(dl, { plan: e.plan, international }))
        .map((dl) => ({ dl, due: dl.due_date!, days: daysUntil(dl.due_date!, todayDate) }));
      let passed = rounds.filter((r) => r.days < 0);
      if (!e.plan) {
        if (passed.length === 0 || rounds.some((r) => r.days >= 0)) return [];
        passed = [passed.reduce((latest, r) => (r.due > latest.due ? r : latest))];
      }
      return passed.map(({ dl, due, days }) => ({
        slug: e.slug,
        college: e.name,
        due_date: due,
        daysOverdue: -days,
        kind: dl.kind,
        plan_key: dl.plan_key,
        label: dl.label,
        missing: missing(e.slug),
      }));
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.college.localeCompare(b.college));

  const dataRefreshed = list
    .flatMap((e) => {
      const checked = lastCheckedBySlug[e.slug];
      return checked && checked >= since ? [{ slug: e.slug, name: e.name, lastChecked: checked }] : [];
    })
    .sort((a, b) => b.lastChecked.localeCompare(a.lastChecked) || a.name.localeCompare(b.name));

  const siteUpdates = entriesSince(since, input.log).map((e) => ({ date: e.date, title: e.en.title }));

  return { since, today, updated, dueSoon, overdue, dataRefreshed, siteUpdates };
}
