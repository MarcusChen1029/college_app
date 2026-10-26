// The fill plan for STARS's coursework page for a school outside the US ("EnterInternationalCoursework", one page per school year):
// every course with each box already in STARS's own words. Pure data in, pure data out; the extension types it in.
// Lists and page facts: transcript-maps/stars-lists.ts and docs/superpowers/research/2026-10-27-portal-dom.md §1.

import { mapCourse } from "./transcript-maps.ts";
import { isNonUs } from "./transcript-maps/types.ts";
import {
  STARS_INTL_ACADEMIC_LEVELS,
  STARS_INTL_GRADE_WORDS,
  STARS_INTL_LEVEL,
  STARS_INTL_LEVELS,
  STARS_INTL_SUBJECT,
  STARS_INTL_SUBJECTS,
  STARS_INTL_TITLES,
  starsIntlScalesFor,
  type StarsIntlSubject,
} from "./transcript-maps/stars-lists.ts";
import { addCredits, normalizeName, TERMS_FOR_PERIOD, type Term, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

export type StarsBox = { grade: string | null; credit: string | null };
export type StarsRow = {
  trackerId: string;
  name: string;
  academicLevel: string;
  subject: StarsIntlSubject;
  title: string;
  level: string | null;
  length: "Full Year" | "Semester" | "Trimester" | "Quarterly";
  /** Grading Scale options that fit this course's grades: one = use it; several = the student's pick (pickScale); none = STARS has no fit. */
  scaleOptions: string[];
  /** One per grade box the length shows (Full Year: one). A null grade or credit leaves that box as STARS has it. */
  boxes: StarsBox[];
};
export type StarsSkip = { course: string; field: string; reason: string };
export type StarsPagePlan = {
  /** The school year's end ("yr" in the page URL): 2024 for 2023-24. */
  endYear: number;
  schoolName: string;
  /** Every row's scale choices that need the student: each list has several options (the passing mark is not on the transcript). */
  scaleQuestions: string[][];
  rows: StarsRow[];
  skipped: StarsSkip[];
  warnings: string[];
};

const LENGTH = { full_year: "Full Year", semester: "Semester", trimester: "Trimester", quarter: "Quarterly" } as const;
const NOT_TAKEN = "No Grade - Not In Progress";
const IN_PROGRESS = "In Progress";
const upper = (s: string) => s.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ");
const creditText = (n: number) => String(addCredits([n]));

/** A grade STARS can take on these scales: a whole number 1-200, or one of its words. Anything else is typed by the student. */
export function starsIntlGrade(printed: string): string | null {
  const g = printed.trim();
  if (/^\d{1,3}$/.test(g) && Number(g) >= 1 && Number(g) <= 200) return String(Number(g));
  return STARS_INTL_GRADE_WORDS.find((w) => normalizeName(w) === normalizeName(g)) ?? null;
}

function subjectOf(c: TranscriptCourse): StarsIntlSubject {
  const ov = c.overrides.stars?.subject;
  const hit = ov ? STARS_INTL_SUBJECTS.find((s) => normalizeName(s) === normalizeName(ov)) : undefined;
  return hit ?? STARS_INTL_SUBJECT[c.subject];
}

/** The generic title: the student's (or AI's) choice when it is in this subject's list, else the map (exact name match, else "OTHER …"). */
function titleOf(school: TranscriptSchool, c: TranscriptCourse, subject: StarsIntlSubject, warnings: string[]): string {
  const list = STARS_INTL_TITLES[subject];
  const ov = c.overrides.stars?.genericTitle;
  if (ov && list.includes(upper(ov))) return upper(ov);
  const f = mapCourse("stars", school, c).fields.find((x) => x.key === "genericTitle");
  const value = f?.value && list.includes(f.value) ? f.value : list.find((t) => t.startsWith("OTHER"))!;
  if (f?.status !== "verified" || value !== f.value) warnings.push(`${c.name}: Course/Exam Content set to ${value}; pick a closer title on STARS if there is one`);
  return value;
}

function levelOf(c: TranscriptCourse, skipped: StarsSkip[]): string | null {
  const ov = c.overrides.stars?.level;
  const hit = ov ? STARS_INTL_LEVELS.find((l) => normalizeName(l) === normalizeName(ov)) : undefined;
  const level = hit ?? (c.isCollege ? "Dual Enrollment" : STARS_INTL_LEVEL[c.level]);
  if (!level) skipped.push({ course: c.name, field: "Proficiency Level", reason: "no single STARS level fits this course's level; pick it on STARS" });
  return level;
}

/** Grade boxes. A printed year grade beside term grades means Full Year with only that grade (STARS's rule); otherwise one box per term. */
function boxesOf(c: TranscriptCourse, skipped: StarsSkip[], warnings: string[]): { length: StarsRow["length"]; boxes: StarsBox[] } {
  const grade = (printed: string, what: string): string | null => {
    const g = starsIntlGrade(printed);
    if (g == null && printed.trim()) skipped.push({ course: c.name, field: `${what} grade`, reason: `"${printed}" is not a grade STARS lists on this scale; type it yourself` });
    return g;
  };
  const final = c.finalGrade?.trim() ?? "";
  const fy = c.terms.find((t) => t.term === "FY");
  const termOnly = c.terms.filter((t) => t.term !== "FY");
  if (c.period === "full_year" || (final && termOnly.length)) {
    const status = fy?.status ?? (final ? "graded" : null);
    const g = final || (fy?.status === "graded" ? fy.grade : "");
    const value = status === "in_progress" || status === "planned" ? IN_PROGRESS : g ? grade(g, "Year") : null;
    if (value == null && !g) skipped.push({ course: c.name, field: "Year grade", reason: "no year grade in the tracker" });
    const credit = c.credit ?? fy?.credit ?? null;
    return { length: "Full Year", boxes: [{ grade: value, credit: credit == null ? null : creditText(credit) }] };
  }
  const codes = TERMS_FOR_PERIOD[c.period].filter((t) => t !== "FY");
  const termOf = (code: string): Term | undefined => termOnly.find((t) => t.term === code);
  const hasTermCredits = termOnly.some((t) => t.status !== "none" && t.credit != null);
  if (!hasTermCredits && c.credit != null) {
    warnings.push(`${c.name}: the transcript lists ${c.credit} credit for the whole course; STARS's per-term credit default is kept, check it`);
  }
  const boxes = codes.map((code): StarsBox => {
    const t = termOf(code);
    if (!t || t.status === "none") return { grade: NOT_TAKEN, credit: termOnly.length && hasTermCredits ? "0" : null };
    const g = t.status === "graded" ? (t.grade.trim() ? grade(t.grade, code) : null) : IN_PROGRESS;
    if (t.status === "graded" && !t.grade.trim()) skipped.push({ course: c.name, field: `${code} grade`, reason: "the grade is missing in the tracker" });
    return { grade: g, credit: t.credit == null ? null : creditText(t.credit) };
  });
  return { length: LENGTH[c.period], boxes };
}

/** One plan per (school outside the US, school year), in transcript order. US schools use STARS's other page, which this plan does not cover. */
export function buildStarsIntlPlans(schools: TranscriptSchool[], courses: TranscriptCourse[]): StarsPagePlan[] {
  const byId = new Map(schools.map((s) => [s.id, s]));
  const plans = new Map<string, StarsPagePlan>();
  for (const c of [...courses].sort((a, b) => a.academicYear - b.academicYear || a.sortOrder - b.sortOrder)) {
    const school = byId.get(c.schoolId);
    if (!school || school.kind !== "high_school" || !isNonUs(school)) continue;
    const key = `${school.id}|${c.academicYear}`;
    let plan = plans.get(key);
    if (!plan) {
      plan = { endYear: c.academicYear + 1, schoolName: school.name, scaleQuestions: [], rows: [], skipped: [], warnings: [] };
      plans.set(key, plan);
    }
    const gl = c.gradeLevel;
    if (gl == null || gl < 9 || gl > 13) {
      plan.skipped.push({ course: c.name, field: "course", reason: "STARS's international page takes grades 9-13 only; set the grade level in the tracker or enter it by hand" });
      continue;
    }
    const subject = subjectOf(c);
    const title = titleOf(school, c, subject, plan.warnings);
    const level = levelOf(c, plan.skipped);
    const { length, boxes } = boxesOf(c, plan.skipped, plan.warnings);
    const scaleOptions = starsIntlScalesFor(c.scale, c.scaleMax);
    if (scaleOptions.length > 1 && !plan.scaleQuestions.some((q) => q.join("|") === scaleOptions.join("|"))) plan.scaleQuestions.push(scaleOptions);
    if (!scaleOptions.length) plan.skipped.push({ course: c.name, field: "Grading Scale", reason: "STARS's international page has no scale for this kind of grade (e.g. letters); pick one on STARS" });
    plan.rows.push({ trackerId: c.id, name: c.name, academicLevel: STARS_INTL_ACADEMIC_LEVELS[gl - 9]!, subject, title, level, length, scaleOptions, boxes });
  }
  return [...plans.values()];
}

/** Keep mode: rows whose name is not already in the page's table (STARS shows names upper-cased; one existing row per term). */
export function starsRowsToAdd(rows: StarsRow[], existingNames: string[]): StarsRow[] {
  const have = new Set(existingNames.map(upper));
  return rows.filter((r) => !have.has(upper(r.name)));
}

/** The scale to pick for a row: its only option, else the student's answer among its options, else null (asked first). */
export function starsScaleFor(row: StarsRow, picked: readonly string[]): string | null {
  if (row.scaleOptions.length === 1) return row.scaleOptions[0]!;
  return row.scaleOptions.find((o) => picked.includes(o)) ?? null;
}
