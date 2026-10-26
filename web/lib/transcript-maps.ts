// Maps a canonical transcript course onto each application system's own vocabulary. The per-system tables live in
// transcript-maps/*.ts as data; every value carries a status so unverified guesses are never shown as official.

import type { SystemKey, Term, TranscriptCourse, TranscriptSchool } from "./transcript.ts";
import { COMMON_APP_MAP } from "./transcript-maps/common-app.ts";
import { CSU_MAP } from "./transcript-maps/csu.ts";
import { STARS_MAP } from "./transcript-maps/stars.ts";
import { UC_MAP } from "./transcript-maps/uc.ts";
import { UIUC_MAP } from "./transcript-maps/uiuc.ts";
import { UT_MAP } from "./transcript-maps/ut.ts";
import type { MapEntry, MappedCourse, MappedField, SystemMap } from "./transcript-maps/types.ts";

export type { MapEntry, MapStatus, MappedCourse, MappedField, MappedFieldKey, SystemMap } from "./transcript-maps/types.ts";
export { matchSubjectOption } from "./transcript-maps/types.ts";
export type SystemId = SystemKey;

export const SYSTEMS: Record<SystemId, SystemMap> = {
  common_app: COMMON_APP_MAP,
  stars: STARS_MAP,
  csu: CSU_MAP,
  uc: UC_MAP,
  uiuc: UIUC_MAP,
  ut: UT_MAP,
};
export const SYSTEM_IDS = Object.keys(SYSTEMS) as SystemId[];

const OVERRIDE_NOTE = "Set on this course";

/** "2025-26" for a course whose academic year starts in 2025. */
export const yearLabel = (y: number): string => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;

const defaultTermGrade = (t: Term): string | null =>
  t.status === "none" ? null : t.grade || (t.status === "in_progress" ? "In progress" : t.status === "planned" ? "Planned" : "");

function gradesValue(course: TranscriptCourse, termGrade: (t: Term) => string | null): string | null {
  const parts = course.terms.flatMap((t) => {
    const g = termGrade(t);
    return g == null ? [] : [`${t.term}: ${g}`.trimEnd()];
  });
  if (course.finalGrade) parts.push(course.terms.length ? `Final: ${course.finalGrade}` : course.finalGrade);
  return parts.length ? parts.join(", ") : null;
}

export function mapCourse(system: SystemId, school: TranscriptSchool, course: TranscriptCourse): MappedCourse {
  const map = SYSTEMS[system];
  const ov = course.overrides[system] ?? {};
  const pick = (entry: MapEntry, override: string | undefined): Pick<MappedField, "value" | "status" | "note" | "source" | "overridden"> =>
    override ? { value: override, status: "verified", note: OVERRIDE_NOTE, overridden: true } : { value: entry.value, status: entry.status, note: entry.note, source: entry.source };
  const credit = course.credit == null ? (course.creditUnit === "not_listed" ? "N/A" : null) : String(course.credit);
  const fields: MappedField[] = [
    { key: "name", label: "Course name", value: course.name, status: "verified" },
    { key: "year", label: "School year", value: yearLabel(course.academicYear), status: "verified" },
    { key: "gradeLevel", label: "Grade level", value: course.gradeLevel == null ? null : String(course.gradeLevel), status: "verified" },
    { key: "subject", label: "Subject", ...pick(map.subjectFor?.(course.subject, course.subSubject) ?? map.subject[course.subject], ov.subject) },
    { key: "subSubject", label: "Sub-subject", ...pick(map.subSubject(course.subject, course.subSubject), ov.subSubject) },
    { key: "level", label: "Course level", ...pick(map.level[course.level], ov.level) },
    { key: "period", label: "Term system", ...pick(map.period[course.period], ov.period) },
    { key: "grades", label: "Grades", value: gradesValue(course, map.termGrade ?? defaultTermGrade), status: "verified" },
    {
      key: "credit",
      label: "Credit",
      ...(ov.credit ? pick({ value: null, status: "none" }, ov.credit) : map.noCredit ? { value: null, status: "none" as const, note: map.noCredit } : { value: credit, status: "verified" as const }),
    },
  ];
  return { system, fields, warnings: map.rules(school, course) };
}
