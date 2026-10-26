// The teacher's roster as a CSV. Built only from RosterRow data (already free of logins, notes and résumé details).

import { toCsv } from "./csv.ts";
import type { RosterRow } from "./roster-view.ts";

export const ROSTER_CSV_HEADER = [
  "Name",
  "Email",
  "Classes",
  "SAT",
  "ACT",
  "GPA (unweighted)",
  "International",
  "Active colleges",
  "Total colleges",
  "Checklist items done",
  "Checklist items total",
  "Next deadline",
  "Next deadline college",
  "Flags",
  "Last active",
] as const;

/** `classNames` maps class id to name; ids it doesn't know (archived classes) are left out. */
export function rosterCsv(rows: readonly RosterRow[], classNames: ReadonlyMap<string, string>): string {
  const body = rows.map(({ student: s, flags, next, checklist, activeColleges }) => [
    s.displayName,
    s.email,
    s.classIds.map((id) => classNames.get(id)).filter(Boolean).join("; "),
    s.satTotal,
    s.actComposite,
    s.gpaUnweighted,
    s.isInternational ? "Yes" : "No",
    activeColleges,
    s.colleges.length,
    checklist.done,
    checklist.total,
    next?.date ?? "",
    next?.collegeName ?? "",
    flags.map((f) => f.label).join("; "),
    s.lastActive ? s.lastActive.slice(0, 10) : "",
  ]);
  return toCsv([[...ROSTER_CSV_HEADER], ...body]);
}

export function rosterCsvFilename(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `students-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.csv`;
}
