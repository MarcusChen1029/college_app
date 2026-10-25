// Shared types and entry builders for the per-system transcript maps. Kept apart from transcript-maps.ts so the
// system files can import them without a circular import.

import type { Level, PeriodType, Subject, SystemKey, Term, TranscriptCourse, TranscriptSchool } from "../transcript.ts";

export type MapStatus = "verified" | "unverified" | "none";
export type MapEntry = { value: string | null; status: MapStatus; note?: string; source?: string };

export type SystemMap = {
  id: SystemKey;
  label: string;
  level: Record<Level, MapEntry>;
  subject: Record<Subject, MapEntry>;
  subSubject: (subject: Subject, sub: string | null) => MapEntry;
  period: Record<PeriodType, MapEntry>;
  /** What the student should know before copying this course into the system (warnings, not edits). */
  rules: (school: TranscriptSchool, course: TranscriptCourse) => string[];
  /** How this system writes one term's grade (default: the grade as printed). Return null to leave the term out. */
  termGrade?: (t: Term) => string | null;
  /** Set when the system has no per-course credit field; the text explains it. */
  noCredit?: string;
};

export type MappedFieldKey = "name" | "year" | "gradeLevel" | "subject" | "subSubject" | "level" | "period" | "grades" | "credit";
export type MappedField = { key: MappedFieldKey; label: string; value: string | null; status: MapStatus; note?: string; source?: string; overridden?: boolean };
export type MappedCourse = { system: SystemKey; fields: MappedField[]; warnings: string[] };

/** Read on an official page; `source` is that page. */
export const verified = (value: string, source?: string, note?: string): MapEntry => ({ value, status: "verified", ...(source ? { source } : {}), ...(note ? { note } : {}) });
/** A best guess (or null) that could not be confirmed from an official page. */
export const unverified = (value: string | null, note?: string, source?: string): MapEntry => ({ value, status: "unverified", ...(note ? { note } : {}), ...(source ? { source } : {}) });
/** The system has no such concept. */
export const none = (note?: string): MapEntry => ({ value: null, status: "none", ...(note ? { note } : {}) });

/** Builds a Record from entries listed for some keys, with `fallback` for the rest. */
export function table<K extends string>(keys: readonly K[], entries: Partial<Record<K, MapEntry>>, fallback: MapEntry): Record<K, MapEntry> {
  const out = {} as Record<K, MapEntry>;
  for (const k of keys) out[k] = entries[k] ?? fallback;
  return out;
}

/** True when the school's country is filled in and is not the United States. An empty country counts as unknown, not foreign. */
export const isNonUs = (school: Pick<TranscriptSchool, "country">): boolean => {
  const c = school.country.trim().toLowerCase().replace(/\./g, "");
  return c !== "" && !["us", "usa", "united states", "united states of america", "america"].includes(c);
};
