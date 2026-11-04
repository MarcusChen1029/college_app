// Which of a college's deadline rows one student sees once a course (and, in Australia, an intake) is picked.
// A UK / Canadian / Australian university can have its own application rows (program_id null) and one row per course
// (program_id = programs.id). Task 9's SQL (the college_summary view and the teacher / parent RPCs) mirrors these rules exactly.

import type { CourseInfo, Intake } from "./checklist.ts";
import type { Deadline } from "./types.ts";

/** "s1" / "s2" pass through; anything else (including "s3", "" and non-strings) means no intake. */
export function normalIntake(v: unknown): Intake | null {
  return v === "s1" || v === "s2" ? v : null;
}

/**
 * The rows that belong to one student's entry. Callers pass ALL of the college's rows, before any date-window filter,
 * and filter by date afterwards (the SQL looks at course rows of any date, so pre-filtering would make the two disagree).
 *
 * 1. Keep a row when its program is none or the picked course, and its intake is none, or no intake is picked, or it matches.
 * 2. Drop a university application row when a kept course application row has the same intake (null equals null).
 * 3. Input order is kept. Rows of other kinds are never dropped by rule 2.
 * US rows have neither field, so they pass through untouched.
 */
export function deadlinesForEntry<D extends Pick<Deadline, "kind" | "program_id" | "intake">>(
  rows: readonly D[],
  pick: { course: CourseInfo | null; intake: Intake | null | undefined },
): D[] {
  const i = normalIntake(pick.intake);
  const courseId = pick.course?.id ?? null;
  const kept = rows.filter((r) => (r.program_id == null || r.program_id === courseId) && (r.intake == null || i === null || r.intake === i));
  // Intakes of the course application rows that are kept, as a set ("" stands for no intake).
  const covered = new Set(kept.filter((r) => r.kind === "application" && r.program_id != null).map((r) => r.intake ?? ""));
  if (covered.size === 0) return kept;
  return kept.filter((r) => !(r.kind === "application" && r.program_id == null && covered.has(r.intake ?? "")));
}

/** The college's own rows only, for views with no student and no course (compare, the lists, public tools). */
export function universityDeadlines<D extends Pick<Deadline, "program_id">>(rows: readonly D[]): D[] {
  return rows.filter((r) => r.program_id == null);
}

/**
 * The college page's timetable: the university's own rows plus a course's rows of other kinds (e.g. Law's "LNAT must be
 * taken by"), which the course table does not show. A course's application date shows in the course table instead.
 */
export function collegePageDeadlines<D extends Pick<Deadline, "kind" | "program_id">>(rows: readonly D[]): D[] {
  return rows.filter((r) => r.program_id == null || r.kind !== "application");
}
