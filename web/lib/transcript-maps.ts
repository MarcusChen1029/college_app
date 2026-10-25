// Maps a canonical transcript course onto each application system's own vocabulary. The per-system tables live in
// transcript-maps/*.ts as data; every value carries a status so unverified guesses are never shown as official.

import type { SystemKey, TranscriptCourse, TranscriptSchool } from "./transcript.ts";
import { COMMON_APP_MAP } from "./transcript-maps/common-app.ts";
import { STARS_MAP } from "./transcript-maps/stars.ts";
import type { MapEntry, MappedCourse, MappedField, SystemMap } from "./transcript-maps/types.ts";

export type { MapEntry, MapStatus, MappedCourse, MappedField, MappedFieldKey, SystemMap } from "./transcript-maps/types.ts";
export type SystemId = SystemKey;

export const SYSTEMS: Partial<Record<SystemId, SystemMap>> = {
  common_app: COMMON_APP_MAP,
  stars: STARS_MAP,
};
export const SYSTEM_IDS = Object.keys(SYSTEMS) as SystemId[];

const OVERRIDE_NOTE = "Set by you";

/** "2025-26" for a course whose academic year starts in 2025. */
export const yearLabel = (y: number): string => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;

function gradesValue(course: TranscriptCourse): string | null {
  const parts = course.terms
    .filter((t) => t.status !== "none")
    .map((t) => `${t.term}: ${t.grade || (t.status === "in_progress" ? "In progress" : t.status === "planned" ? "Planned" : "")}`.trimEnd());
  if (course.finalGrade) parts.push(course.terms.length ? `Final: ${course.finalGrade}` : course.finalGrade);
  return parts.length ? parts.join(", ") : null;
}

export function mapCourse(system: SystemId, school: TranscriptSchool, course: TranscriptCourse): MappedCourse {
  const map = SYSTEMS[system];
  if (!map) throw new Error(`Unknown system: ${system}`);
  const ov = course.overrides[system] ?? {};
  const pick = (entry: MapEntry, override: string | undefined): Pick<MappedField, "value" | "status" | "note" | "source" | "overridden"> =>
    override ? { value: override, status: "verified", note: OVERRIDE_NOTE, overridden: true } : { value: entry.value, status: entry.status, note: entry.note, source: entry.source };
  const credit = course.credit == null ? (course.creditUnit === "not_listed" ? "N/A" : null) : String(course.credit);
  const fields: MappedField[] = [
    { key: "name", label: "Course name", value: course.name, status: "verified" },
    { key: "year", label: "School year", value: yearLabel(course.academicYear), status: "verified" },
    { key: "gradeLevel", label: "Grade level", value: course.gradeLevel == null ? null : String(course.gradeLevel), status: "verified" },
    { key: "subject", label: "Subject", ...pick(map.subject[course.subject], ov.subject) },
    { key: "subSubject", label: "Sub-subject", ...pick(map.subSubject(course.subject, course.subSubject), ov.subSubject) },
    { key: "level", label: "Course level", ...pick(map.level[course.level], ov.level) },
    { key: "period", label: "Term system", ...pick(map.period[course.period], ov.period) },
    { key: "grades", label: "Grades", value: gradesValue(course), status: "verified" },
    { key: "credit", label: "Credit", ...(ov.credit ? pick({ value: null, status: "none" }, ov.credit) : { value: credit, status: "verified" as const }) },
  ];
  return { system, fields, warnings: map.rules(school, course) };
}
