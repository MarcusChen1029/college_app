// The teacher home's "who needs you this week": the next seven days of open deadlines (with how much of each
// college's checklist is still open) and the other students the roster flags. Pure, so it is tested.

import { isSubmitted } from "./application.ts";
import { progress } from "./checklist.ts";
import { daysUntil, type Flag, type RosterStudent, type UpcomingDeadline } from "./roster.ts";
import { ALL_CLASSES, buildRows, viewRows, type RosterRow } from "./roster-view.ts";
import type { Status } from "./student-rows.ts";

/** Today plus the six days after it. */
export const WEEK_DAYS = 7;

/** `open`: checklist items still open for that college, or null when the roster has no such college. */
export type WeekItem = { deadline: UpcomingDeadline; open: number | null; total: number | null };
export type WeekDay = { date: string; days: number; items: WeekItem[] };
/** A flagged student and their flags, less "deadline soon" when the week list already shows that student's deadline. */
export type CheckIn = { row: RosterRow; reasons: Flag[] };
export type Week = {
  days: WeekDay[];
  /** Application deadlines in the week that are already submitted: done, so not listed. */
  submitted: number;
  /** Students with at least one open deadline this week. */
  dueStudents: number;
  checkIns: CheckIn[];
  students: number;
};

/** A deadline counts as done the way the Deadlines page says it: an application deadline that is submitted. */
export const isDoneDeadline = (d: UpcomingDeadline) => d.kind === "application" && isSubmitted(d.status as Status);

export function buildWeek(roster: RosterStudent[], deadlines: UpcomingDeadline[], now: Date): Week {
  const byStudent = new Map(roster.map((s) => [s.studentId, s]));
  const days = new Map<string, WeekDay>();
  let submitted = 0;
  const due = new Set<string>();

  for (const d of [...deadlines].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const n = daysUntil(d.dueDate, now);
    if (n < 0 || n >= WEEK_DAYS) continue;
    if (isDoneDeadline(d)) {
      submitted++;
      continue;
    }
    const college = byStudent.get(d.studentId)?.colleges.find((c) => c.slug === d.collegeSlug);
    const p = college ? progress(college.checklist) : null;
    const day = days.get(d.dueDate) ?? { date: d.dueDate, days: n, items: [] };
    day.items.push({ deadline: d, open: p ? p.missing : null, total: p ? p.total : null });
    days.set(d.dueDate, day);
    due.add(d.studentId);
  }

  const flagged = viewRows(buildRows(roster, now), { query: "", classId: ALL_CLASSES, attentionOnly: true }, "attention");
  // "Deadline soon" reaches 14 days out; drop it only for students the week list already shows.
  const checkIns = flagged
    .map((row) => ({ row, reasons: row.flags.filter((f) => f.key !== "deadline_soon" || !due.has(row.student.studentId)) }))
    .filter((c) => c.reasons.length > 0);

  return { days: [...days.values()], submitted, dueStudents: due.size, checkIns, students: roster.length };
}
