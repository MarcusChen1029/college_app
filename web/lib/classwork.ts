// Classwork helpers for the Classroom screens: due state, the student To-do buckets, the class card's due list, topic
// grouping and the Stream merge. Pure functions only. Dates are calendar dates (`YYYY-MM-DD`) compared without time
// zones: day counts come from the date parts, never from Date.now(). The limits below mirror the checks in
// supabase/migrations/0053_classroom_gc.sql, so keep the two in step.

import { isHttpUrl } from "./linkify.ts";

/** What the lists below need to know about one piece of classwork; screens pass richer rows (extra fields are kept). */
export type WorkItem = {
  id: string;
  title: string;
  dueOn: string | null;
  done: boolean;
  doneAt: string | null;
  topic: string | null;
  createdAt: string;
};

export const DONE_LIMITS = { note: 500, link: 500 } as const;

/** Checks the optional note and link a student attaches when marking classwork done. Empty becomes null. */
export function validateDone(i: {
  note?: unknown;
  link?: unknown;
}): { ok: true; note: string | null; link: string | null } | { ok: false; error: "note" | "link" } {
  const note = i.note == null ? "" : i.note;
  const link = i.link == null ? "" : i.link;
  if (typeof note !== "string") return { ok: false, error: "note" };
  if (typeof link !== "string") return { ok: false, error: "link" };
  const n = note.trim();
  const l = link.trim();
  if (n.length > DONE_LIMITS.note) return { ok: false, error: "note" };
  if (l.length > DONE_LIMITS.link || (l !== "" && !isHttpUrl(l))) return { ok: false, error: "link" };
  return { ok: true, note: n === "" ? null : n, link: l === "" ? null : l };
}

// ---- dates ----

/** Whole days since 1970-01-01 for a `YYYY-MM-DD` string, or null when it is not one. */
function dayNumber(iso: string | null): number | null {
  const m = iso === null ? null : /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** Days from `today` to the due date (negative = late); null when the item has no usable due date. */
function daysToDue(w: Pick<WorkItem, "dueOn">, today: string): number | null {
  const due = dayNumber(w.dueOn);
  const now = dayNumber(today);
  return due === null || now === null ? null : due - now;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Newest first for ISO timestamps (a missing one goes last). Compares real instants, falls back to the text. */
function timeDesc(a: string | null, b: string | null): number {
  const x = a ?? "";
  const y = b ?? "";
  const tx = Date.parse(x);
  const ty = Date.parse(y);
  if (Number.isFinite(tx) && Number.isFinite(ty) && tx !== ty) return ty - tx;
  return cmp(y, x);
}

// ---- due state ----

export type DueState =
  | { kind: "none" }
  | { kind: "due"; days: number }
  | { kind: "missing"; daysLate: number }
  | { kind: "done"; at: string };

/** Done wins over everything; otherwise no date, due in `days` (0 = today) or `daysLate` past due. */
export function dueState(w: WorkItem, today: string): DueState {
  if (w.done) return { kind: "done", at: w.doneAt ?? "" };
  const days = daysToDue(w, today);
  if (days === null) return { kind: "none" };
  return days >= 0 ? { kind: "due", days } : { kind: "missing", daysLate: -days };
}

// ---- To-do ----

export type TodoTab = "assigned" | "missing" | "done";
export type TodoGroup = "this_week" | "next_week" | "later" | "no_date";

export function todoTab(w: WorkItem, today: string): TodoTab {
  const s = dueState(w, today);
  return s.kind === "done" ? "done" : s.kind === "missing" ? "missing" : "assigned";
}

/** Group of an Assigned item: due in 0-6 days is this week, 7-13 next week, 14 or more later, no date its own group. */
export function todoGroup(w: WorkItem, today: string): TodoGroup {
  const days = daysToDue(w, today);
  if (days === null) return "no_date";
  return days < 7 ? "this_week" : days < 14 ? "next_week" : "later";
}

const byDueThenTitle = (a: WorkItem, b: WorkItem): number => cmp(a.dueOn ?? "", b.dueOn ?? "") || cmp(a.title, b.title);

/**
 * Splits classwork into the three To-do tabs. Assigned is grouped (earliest due first, then title); Missing is one
 * list with the most recently due first (the spec groups only Assigned); Done is newest first by `doneAt`.
 */
export function todoBuckets<T extends WorkItem>(
  items: readonly T[],
  today: string,
): { assigned: Record<TodoGroup, T[]>; missing: T[]; done: T[] } {
  const assigned: Record<TodoGroup, T[]> = { this_week: [], next_week: [], later: [], no_date: [] };
  const missing: T[] = [];
  const done: T[] = [];
  for (const w of items) {
    const tab = todoTab(w, today);
    if (tab === "assigned") assigned[todoGroup(w, today)].push(w);
    else if (tab === "missing") missing.push(w);
    else done.push(w);
  }
  for (const g of Object.values(assigned)) g.sort(byDueThenTitle);
  missing.sort((a, b) => cmp(b.dueOn ?? "", a.dueOn ?? "") || cmp(a.title, b.title));
  done.sort((a, b) => timeDesc(a.doneAt, b.doneAt));
  return { assigned, missing, done };
}

/** The next few things coming up: not done, dated, not yet missed; nearest first. */
export function upcoming<T extends WorkItem>(items: readonly T[], today: string, max = 3): T[] {
  return items
    .filter((w) => dueState(w, today).kind === "due")
    .sort(byDueThenTitle)
    .slice(0, max);
}

/**
 * What a class card shows under its banner: not done and dated; anything already missed first (most recently due
 * first), then the nearest due. Undated work has no "due" to show, so it is left out.
 */
export function cardDue<T extends WorkItem>(items: readonly T[], today: string, max = 2): T[] {
  const late: T[] = [];
  const soon: T[] = [];
  for (const w of items) {
    const s = dueState(w, today);
    if (s.kind === "missing") late.push(w);
    else if (s.kind === "due") soon.push(w);
  }
  late.sort((a, b) => cmp(b.dueOn ?? "", a.dueOn ?? "") || cmp(a.title, b.title));
  soon.sort(byDueThenTitle);
  return [...late, ...soon].slice(0, max);
}

// ---- topics ----

/**
 * Groups classwork by topic: the no-topic group first (if any), then topics with the newest work first; inside a
 * group the newest item comes first.
 */
export function byTopic<T extends WorkItem>(items: readonly T[]): { topic: string | null; items: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const w of items) {
    const list = groups.get(w.topic);
    if (list) list.push(w);
    else groups.set(w.topic, [w]);
  }
  const out = [...groups].map(([topic, list]) => ({ topic, items: [...list].sort((a, b) => timeDesc(a.createdAt, b.createdAt)) }));
  const newest = (g: { items: T[] }) => g.items[0].createdAt;
  return out.sort((a, b) => {
    if (a.topic === null || b.topic === null) return a.topic === b.topic ? 0 : a.topic === null ? -1 : 1;
    return timeDesc(newest(a), newest(b)) || cmp(a.topic, b.topic);
  });
}

// ---- stream ----

export type StreamEntry<P, W> =
  | { kind: "post"; at: string; pinned: boolean; post: P }
  | { kind: "task"; at: string; pinned: false; task: W };

/** Posts and classwork in one feed: pinned posts first (newest first), then everything else newest first. */
export function streamOf<P extends { createdAt: string; pinned: boolean }, W extends WorkItem>(
  posts: readonly P[],
  tasks: readonly W[],
): StreamEntry<P, W>[] {
  const entries: StreamEntry<P, W>[] = [
    ...posts.map((post): StreamEntry<P, W> => ({ kind: "post", at: post.createdAt, pinned: post.pinned, post })),
    ...tasks.map((task): StreamEntry<P, W> => ({ kind: "task", at: task.createdAt, pinned: false, task })),
  ];
  return entries.sort((a, b) => Number(b.pinned) - Number(a.pinned) || timeDesc(a.at, b.at));
}
