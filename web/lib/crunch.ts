// The "what's due next" card on My list: the next week of application deadlines, and what is still open for them,
// grouped by checklist item so a shared item ("recommendations not sent") reads once instead of once per college.

import { isSubmitted } from "./application.ts";
import { contextFor, courseFor } from "./application-steps.ts";
import { checklistItems, progress, type Checklist, type ChecklistKey, type ExtraStep, type ItemKey } from "./checklist.ts";
import { deadlinesForEntry } from "./course-deadlines.ts";
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

/** `not_done`: a UK / Canadian / Australian item that is ticked, not sent (course chosen, UCAS marks, admissions test, the university's own steps). */
export type OpenReason = "no_essays_yet" | "essays_unfinished" | "not_sent" | "plan_undecided" | "not_done";
export type OpenCollege = { slug: string; name: string; reason: OpenReason; final?: number; total?: number };
/**
 * One open checklist item and the colleges it is open for. `id` is unique in the card: the item key, or for a university's
 * own step (`step`, whose ids are unique only within that university) the key plus the college's slug. `detail` is the
 * test step's name on a Canadian university's SAT/ACT item (e.g. "SAT/ACT disclosure"): it gets its own group (key plus
 * name) and the card labels it with that name. Null on every other group. (A test that is not the SAT/ACT, such as
 * Western's Casper, is a plain step.)
 */
export type OpenGroup = { id: string; key: ItemKey; shared: boolean; step: ExtraStep | null; detail: string | null; colleges: OpenCollege[] };
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
  // All of the college's rows first (the chosen course's date replaces the university's), the date window after.
  const rows = deadlinesForEntry(
    deadlines.filter((d) => d.institution_id === e.collegeId),
    { course: courseFor(e.slug, e.checklist.course), intake: e.checklist.intake },
  );
  for (const d of rows) {
    if (!d.due_date || !isApplicationDeadline(d)) continue;
    if (!deadlineApplies(d, { plan: e.plan, international: false })) continue;
    const days = daysUntil(d.due_date, today);
    if (days < 0) continue;
    if (!best || d.due_date < best.date) best = { slug: e.slug, name: e.name, date: d.due_date, days, deadlineId: d.id };
  }
  return best;
}

function openReason(key: ItemKey, c: Checklist): Omit<OpenCollege, "slug" | "name"> {
  if (key === "essays") {
    const list = c.essay_list ?? [];
    if (!list.length) return { reason: "no_essays_yet" };
    return { reason: "essays_unfinished", final: list.filter((e) => e.status === "final").length, total: list.length };
  }
  if (key === "test_scores" && !c.test_plan) return { reason: "plan_undecided" };
  if (key === "english_test" && !c.english_plan) return { reason: "plan_undecided" };
  // The shared items are the ones the student sends; every other open item (UK / CA / AU) is just not ticked yet.
  return { reason: SHARED_ITEMS.has(key as ChecklistKey) ? "not_sent" : "not_done" };
}

// Card order: the US items keep their checklist order (essays, recommendations, transcript, test scores, English test);
// the other countries' items fit around them, and a university's own steps come just before the test scores.
const ORDER: readonly string[] = ["course_choice", "essays", "recommendations", "ucas_ps", "ucas_reference", "transcript", "admissions_test", "step", "test_scores", "english_test"];
const rank = (key: ItemKey) => ORDER.indexOf(key.startsWith("step:") ? "step" : key);

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
  // Each college's own open items (its country's checklist), grouped by item so a shared one reads once.
  const groups = new Map<string, OpenGroup>();
  const ready: CrunchApp[] = [];
  for (const { entry, app } of inCluster) {
    const ctx = contextFor(entry.slug, entry.checklist);
    if (progress(entry.checklist, ctx).missing === 0) ready.push(app);
    for (const item of checklistItems(entry.checklist, ctx)) {
      if (item.done) continue;
      // Only a Canadian test item carries a detail on test_scores (US items never do), so US groups keep their ids.
      const detail = item.key === "test_scores" ? item.detail : null;
      const id = item.step ? `${item.key}@${entry.slug}` : detail ? `${item.key}:${detail}` : item.key;
      const group = groups.get(id) ?? { id, key: item.key, shared: SHARED_ITEMS.has(item.key as ChecklistKey) || item.shared, step: item.step, detail, colleges: [] };
      group.colleges.push({ slug: entry.slug, name: entry.name, ...openReason(item.key, entry.checklist) });
      groups.set(id, group);
    }
  }
  // Stable sort: steps (one rank) stay in the order their colleges come in.
  const open = [...groups.values()].sort((a, b) => rank(a.key) - rank(b.key));
  return { kind: "crunch", dates, apps: inCluster.map(({ app }) => app), open, ready };
}
