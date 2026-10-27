// The "what's due next" card on My list: the next week of application deadlines, and what is still open for them,
// grouped by checklist item so a shared item ("recommendations not sent") reads once instead of once per college.

import { isSubmitted } from "./application.ts";
import { CHECKLIST, isDone, progress, type Checklist, type ChecklistKey } from "./checklist.ts";
import { deadlineApplies } from "./deadline-rules.ts";
import { daysUntil } from "./format.ts";
import { SOON_DAYS_CHIP } from "./status.ts";
import type { Status } from "./student-store";
import type { Deadline } from "./types.ts";

/** Deadlines this many days after the next one join its cluster (a 7-day window), so Nov 1 and Nov 3 show together. */
export const CLUSTER_SPAN_DAYS = 6;
/** The card opens when the next deadline is this close (the "soon" tone); further out it is a one-line note. */
export const CRUNCH_DAYS = SOON_DAYS_CHIP;

/** Items the student does once for every college (one letter set, one score report); essays differ per college. */
export const SHARED_ITEMS: ReadonlySet<ChecklistKey> = new Set(["recommendations", "transcript", "test_scores", "english_test"]);

export type CrunchEntry = { slug: string; name: string; collegeId: string; plan: string | null; status: Status; checklist: Checklist };

export type OpenReason = "no_essays_yet" | "essays_unfinished" | "not_sent" | "plan_undecided";
export type OpenCollege = { slug: string; name: string; reason: OpenReason; final?: number; total?: number };
export type OpenGroup = { key: ChecklistKey; shared: boolean; colleges: OpenCollege[] };
export type CrunchApp = { slug: string; name: string; date: string; days: number; deadlineId: string };
export type CrunchDate = { date: string; days: number; apps: CrunchApp[] };

export type Crunch =
  | { kind: "none" }
  | { kind: "later"; date: string; days: number; count: number }
  | { kind: "crunch"; dates: CrunchDate[]; apps: CrunchApp[]; open: OpenGroup[]; ready: CrunchApp[] };

/** Application deadlines only: the college's own ones ("application") and the date a student typed for a custom college. */
const isApplicationDeadline = (d: Deadline) => d.kind === "application" || d.kind === "custom";

/** The application deadline an unsubmitted entry is working toward: its plan's date, or the earliest one while undecided. */
function nextApplicationDeadline(e: CrunchEntry, deadlines: Deadline[], today: Date): CrunchApp | null {
  let best: CrunchApp | null = null;
  for (const d of deadlines) {
    if (d.institution_id !== e.collegeId || !d.due_date || !isApplicationDeadline(d)) continue;
    if (!deadlineApplies(d, { plan: e.plan, international: false })) continue;
    const days = daysUntil(d.due_date, today);
    if (days < 0) continue;
    if (!best || d.due_date < best.date) best = { slug: e.slug, name: e.name, date: d.due_date, days, deadlineId: d.id };
  }
  return best;
}

function openReason(key: ChecklistKey, c: Checklist): Omit<OpenCollege, "slug" | "name"> {
  if (key === "essays") {
    const list = c.essay_list ?? [];
    if (!list.length) return { reason: "no_essays_yet" };
    return { reason: "essays_unfinished", final: list.filter((e) => e.status === "final").length, total: list.length };
  }
  if (key === "test_scores" && !c.test_plan) return { reason: "plan_undecided" };
  if (key === "english_test" && !c.english_plan) return { reason: "plan_undecided" };
  return { reason: "not_sent" };
}

export function buildCrunch(entries: CrunchEntry[], deadlines: Deadline[], today = new Date()): Crunch {
  const apps = entries
    .filter((e) => !isSubmitted(e.status))
    .flatMap((e) => {
      const a = nextApplicationDeadline(e, deadlines, today);
      return a ? [{ entry: e, app: a }] : [];
    })
    .sort((x, y) => x.app.date.localeCompare(y.app.date) || x.app.name.localeCompare(y.app.name));
  if (!apps.length) return { kind: "none" };

  const first = apps[0].app;
  if (first.days > CRUNCH_DAYS) return { kind: "later", date: first.date, days: first.days, count: apps.filter((a) => a.app.date === first.date).length };

  const inCluster = apps.filter((a) => a.app.days <= first.days + CLUSTER_SPAN_DAYS);
  const dates: CrunchDate[] = [];
  for (const { app } of inCluster) {
    const last = dates[dates.length - 1];
    if (last?.date === app.date) last.apps.push(app);
    else dates.push({ date: app.date, days: app.days, apps: [app] });
  }
  const open: OpenGroup[] = CHECKLIST.flatMap(([key]) => {
    const colleges = inCluster
      .filter(({ entry }) => !isDone(key, entry.checklist))
      .map(({ entry }) => ({ slug: entry.slug, name: entry.name, ...openReason(key, entry.checklist) }));
    return colleges.length ? [{ key, shared: SHARED_ITEMS.has(key), colleges }] : [];
  });
  const ready = inCluster.filter(({ entry }) => progress(entry.checklist).missing === 0).map(({ app }) => app);
  return { kind: "crunch", dates, apps: inCluster.map(({ app }) => app), open, ready };
}
