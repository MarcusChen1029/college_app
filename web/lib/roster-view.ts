// Teacher roster view logic: relative-time wording, per-student rows, filtering and sorting, deadline
// grouping and status wording. Pure functions so the components stay thin (and testable).

import { RESULT_LABEL, resultStatus, stage } from "./application.ts";
import type { Checklist } from "./checklist.ts";
import { checklistSummary, computeFlags, daysUntil, isActiveCollege, nextDeadline, worstSeverity, type Flag, type RosterStudent, type UpcomingDeadline } from "./roster.ts";
import type { Status } from "./student-rows.ts";

const DAY = 86_400_000;

/** "Today", "Yesterday", "3 days ago", "2 weeks ago", "5 months ago"; "Never" when there is no date. */
export function relativeTime(iso: string | null, now: Date): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "Never";
  const days = Math.floor((now.getTime() - t) / DAY);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/** "today", "tomorrow", "in 8 days"; past dates read "yesterday" / "3 days ago". */
export function daysLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** "Sat, Nov 1" for a yyyy-mm-dd date. */
export function weekdayDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// ───────── roster rows ─────────

export type RosterRow = {
  student: RosterStudent;
  flags: Flag[];
  next: ReturnType<typeof nextDeadline>;
  checklist: { done: number; total: number };
  activeColleges: number;
};

export function buildRows(students: RosterStudent[], now: Date): RosterRow[] {
  return students.map((student) => ({
    student,
    flags: computeFlags(student, now),
    next: nextDeadline(student, now),
    checklist: checklistSummary(student),
    activeColleges: student.colleges.filter(isActiveCollege).length,
  }));
}

export const ALL_CLASSES = "all";
export const NO_CLASS = "none";

/** `activeClassIds`: ids of the teacher's non-archived classes. Archived classes don't count as a class for the filters. */
export type RosterFilter = { query: string; classId: string; attentionOnly: boolean; activeClassIds?: readonly string[] };
export type RosterSort = "attention" | "name" | "deadline" | "active";
export const ROSTER_SORTS: readonly (readonly [RosterSort, string])[] = [
  ["attention", "Needs attention first"],
  ["name", "Name"],
  ["deadline", "Next deadline"],
  ["active", "Last active"],
];

const byName = (a: RosterRow, b: RosterRow) => a.student.displayName.localeCompare(b.student.displayName, "en", { sensitivity: "base" });
// Smaller first, rows without a value last.
const nullsLast = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b);
const nextDays = (r: RosterRow) => r.next?.days ?? null;
const activeAt = (r: RosterRow) => {
  const t = r.student.lastActive ? Date.parse(r.student.lastActive) : NaN;
  return Number.isNaN(t) ? null : -t; // most recent first
};

const COMPARE: Record<RosterSort, (a: RosterRow, b: RosterRow) => number> = {
  attention: (a, b) => worstSeverity(b.flags) - worstSeverity(a.flags) || b.flags.length - a.flags.length || nullsLast(nextDays(a), nextDays(b)),
  name: () => 0,
  deadline: (a, b) => nullsLast(nextDays(a), nextDays(b)),
  active: (a, b) => nullsLast(activeAt(a), activeAt(b)),
};

/** Filters then sorts; ties always fall back to name so the order is stable. */
export function viewRows(rows: RosterRow[], filter: RosterFilter, sort: RosterSort): RosterRow[] {
  const q = filter.query.trim().toLowerCase();
  const classesOf = (s: RosterStudent) => (filter.activeClassIds ? s.classIds.filter((id) => filter.activeClassIds!.includes(id)) : s.classIds);
  return rows
    .filter(({ student, flags }) => {
      if (q && !student.displayName.toLowerCase().includes(q) && !student.email.toLowerCase().includes(q)) return false;
      if (filter.classId === NO_CLASS && classesOf(student).length > 0) return false;
      if (filter.classId !== ALL_CLASSES && filter.classId !== NO_CLASS && !classesOf(student).includes(filter.classId)) return false;
      return !filter.attentionOnly || flags.length > 0;
    })
    .sort((a, b) => COMPARE[sort](a, b) || byName(a, b));
}

// ───────── wording ─────────

/** What a college's status reads as to a teacher: In progress / Ready (checklist done) / Submitted / the decision. */
export function statusLabel(status: string, checklist: Checklist = {}): string {
  const s = status as Status;
  const st = stage(s, checklist);
  if (st === "submitted") return s === "submitted" || s === "interview" ? "Submitted" : RESULT_LABEL[resultStatus(s)];
  return st === "ready" ? "Ready" : "In progress";
}

// ───────── upcoming deadlines ─────────

export type DeadlineGroup = { date: string; heading: string; items: UpcomingDeadline[] };

/** Groups by date (soonest first), keeping the incoming order inside a day. Heading: "Sat, Nov 1 - in 8 days". */
export function groupDeadlines(list: UpcomingDeadline[], now: Date): DeadlineGroup[] {
  const groups = new Map<string, UpcomingDeadline[]>();
  for (const d of [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const items = groups.get(d.dueDate);
    if (items) items.push(d);
    else groups.set(d.dueDate, [d]);
  }
  return [...groups].map(([date, items]) => ({ date, heading: `${weekdayDate(date)} - ${daysLabel(daysUntil(date, now))}`, items }));
}
