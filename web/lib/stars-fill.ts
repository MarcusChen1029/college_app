// The fill plan for STARS's coursework pages, one page per school and school year: "EnterInternationalCoursework" for a school outside
// the US, "EnterCoursework" for a US school (other lists, no "taken in" level, no per-course scale). Every course has each box already in
// STARS's own words. Pure data in, pure data out; the extension types it in.
// Lists and page facts: transcript-maps/stars-lists.ts and docs/superpowers/research/2026-10-27-portal-dom.md §1.

import { matchStarsTitle } from "./transcript-maps/stars-titles.ts";
import { isNonUs } from "./transcript-maps/types.ts";
import {
  STARS_INTL_ACADEMIC_LEVELS,
  STARS_INTL_GRADE_WORDS,
  STARS_INTL_LEVEL,
  STARS_INTL_LEVELS,
  STARS_INTL_SUBJECT,
  STARS_INTL_SUBJECTS,
  STARS_INTL_TITLES,
  STARS_US_LEVEL,
  STARS_US_LEVELS,
  STARS_US_SUBJECT,
  STARS_US_SUBJECTS,
  STARS_US_TITLES,
  starsIntlScalesFor,
} from "./transcript-maps/stars-lists.ts";
import { addCredits, normalizeName, TERMS_FOR_PERIOD, type Term, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

export type StarsBox = { grade: string | null; credit: string | null };
/** Which coursework page: a school outside the US ("intl") or in the US ("us"). */
export type StarsPageKind = "intl" | "us";
export type StarsRow = {
  trackerId: string;
  name: string;
  /** "Courses/Exams Were Taken in" (international page only). */
  academicLevel: string | null;
  subject: string;
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
  kind: StarsPageKind;
  /** The school year's end ("yr" in the page URL): 2024 for 2023-24. */
  endYear: number;
  schoolName: string;
  /** Every row's scale choices that need the student: each list has several options (the passing mark is not on the transcript). */
  scaleQuestions: string[][];
  rows: StarsRow[];
  skipped: StarsSkip[];
  warnings: string[];
  /** Course names whose generic title is STARS's "OTHER ..." (nothing in STARS's list matched the name). */
  titleOther: string[];
  /** How many courses print one credit for the whole course, split evenly over its terms. */
  creditsSplit: number;
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

const LISTS = {
  intl: { subjects: STARS_INTL_SUBJECTS as readonly string[], subject: STARS_INTL_SUBJECT as Record<string, string>, titles: STARS_INTL_TITLES as Record<string, readonly string[]>, levels: STARS_INTL_LEVELS as readonly string[], level: STARS_INTL_LEVEL },
  us: { subjects: STARS_US_SUBJECTS as readonly string[], subject: STARS_US_SUBJECT as Record<string, string>, titles: STARS_US_TITLES as Record<string, readonly string[]>, levels: STARS_US_LEVELS as readonly string[], level: STARS_US_LEVEL },
} as const;

function subjectOf(c: TranscriptCourse, kind: StarsPageKind): string {
  const ov = c.overrides.stars?.subject;
  const hit = ov ? LISTS[kind].subjects.find((s) => normalizeName(s) === normalizeName(ov)) : undefined;
  return hit ?? LISTS[kind].subject[c.subject]!;
}

/** The generic title: the student's (or AI's) choice when it is in this subject's list, else the map (exact name match, else "OTHER …"). */
/** The generic title: the student's (or AI's) choice when it is in this subject's list, else matched from the course name (stars-titles.ts). */
function titleOf(c: TranscriptCourse, kind: StarsPageKind, subject: string, other: string[]): string {
  const list = LISTS[kind].titles[subject]!;
  const ov = c.overrides.stars?.genericTitle;
  if (ov && list.includes(upper(ov))) return upper(ov);
  const m = matchStarsTitle(c.name, c.subject, c.gradeLevel, list, kind);
  if (m.how === "other") other.push(c.name);
  return m.title;
}

function levelOf(c: TranscriptCourse, kind: StarsPageKind, skipped: StarsSkip[]): string | null {
  const ov = c.overrides.stars?.level;
  const hit = ov ? LISTS[kind].levels.find((l) => normalizeName(l) === normalizeName(ov)) : undefined;
  const level = hit ?? (c.isCollege ? "Dual Enrollment" : LISTS[kind].level[c.level]);
  if (!level) skipped.push({ course: c.name, field: "Proficiency Level", reason: "no single STARS level fits this course's level; pick it on STARS" });
  return level;
}

/** Grade boxes. A printed year grade beside term grades means Full Year with only that grade (STARS's rule); otherwise one box per term. */
/** A grade for a US school's page: the school's scale decides STARS's list (numbers seen live; letters not seen), so the grade goes as printed
 *  and the filler picks it only if STARS lists it exactly. Words ("In Progress", "Withdrawn", ...) are matched to STARS's spelling. */
export function starsUsGrade(printed: string): string | null {
  const g = printed.trim();
  if (!g) return null;
  if (/^\d{1,3}$/.test(g)) return String(Number(g));
  return STARS_INTL_GRADE_WORDS.find((w) => normalizeName(w) === normalizeName(g)) ?? g.toUpperCase();
}

function boxesOf(c: TranscriptCourse, kind: StarsPageKind, skipped: StarsSkip[]): { length: StarsRow["length"]; boxes: StarsBox[]; split: boolean } {
  const grade = (printed: string, what: string): string | null => {
    const g = kind === "intl" ? starsIntlGrade(printed) : starsUsGrade(printed);
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
    return { length: "Full Year", boxes: [{ grade: value, credit: credit == null ? null : creditText(credit) }], split: false };
  }
  const codes = TERMS_FOR_PERIOD[c.period].filter((t) => t !== "FY");
  const termOf = (code: string): Term | undefined => termOnly.find((t) => t.term === code);
  const hasTermCredits = termOnly.some((t) => t.status !== "none" && t.credit != null);
  // One credit printed for the whole course (no term credits): spread it evenly over the terms the course runs, so STARS's 0.5 default
  // is not left in place.
  const taken = codes.filter((code) => {
    const t = termOf(code);
    return t && t.status !== "none";
  });
  const share = !hasTermCredits && c.credit != null && taken.length ? creditText(c.credit / taken.length) : null;
  const boxes = codes.map((code): StarsBox => {
    const t = termOf(code);
    if (!t || t.status === "none") return { grade: NOT_TAKEN, credit: termOnly.length && (hasTermCredits || share) ? "0" : null };
    const g = t.status === "graded" ? (t.grade.trim() ? grade(t.grade, code) : null) : IN_PROGRESS;
    if (t.status === "graded" && !t.grade.trim()) skipped.push({ course: c.name, field: `${code} grade`, reason: "the grade is missing in the tracker" });
    return { grade: g, credit: t.credit != null ? creditText(t.credit) : share };
  });
  return { length: LENGTH[c.period], boxes, split: share != null };
}

/** One plan per (high school, school year), in transcript order; `kind` says which of STARS's two pages it is for. */
export function buildStarsPlans(schools: TranscriptSchool[], courses: TranscriptCourse[]): StarsPagePlan[] {
  const byId = new Map(schools.map((s) => [s.id, s]));
  const plans = new Map<string, StarsPagePlan>();
  for (const c of [...courses].sort((a, b) => a.academicYear - b.academicYear || a.sortOrder - b.sortOrder)) {
    const school = byId.get(c.schoolId);
    if (!school || school.kind !== "high_school") continue;
    const kind: StarsPageKind = isNonUs(school) ? "intl" : "us";
    const key = `${school.id}|${c.academicYear}`;
    let plan = plans.get(key);
    if (!plan) {
      plan = { kind, endYear: c.academicYear + 1, schoolName: school.name, scaleQuestions: [], rows: [], skipped: [], warnings: [], titleOther: [], creditsSplit: 0 };
      plans.set(key, plan);
    }
    const gl = c.gradeLevel;
    if (gl == null || gl < 9 || gl > 13) {
      plan.skipped.push({ course: c.name, field: "course", reason: "STARS's coursework pages take grades 9-13; set the grade level in the tracker or enter it by hand" });
      continue;
    }
    const subject = subjectOf(c, kind);
    const title = titleOf(c, kind, subject, plan.titleOther);
    const level = levelOf(c, kind, plan.skipped);
    const { length, boxes, split } = boxesOf(c, kind, plan.skipped);
    if (split) plan.creditsSplit++;
    // The US page has no per-course scale: STARS uses the school's Grade Scale from Enter Schools.
    const scaleOptions = kind === "intl" ? starsIntlScalesFor(c.scale, c.scaleMax) : [];
    if (scaleOptions.length > 1 && !plan.scaleQuestions.some((q) => q.join("|") === scaleOptions.join("|"))) plan.scaleQuestions.push(scaleOptions);
    if (kind === "intl" && !scaleOptions.length) plan.skipped.push({ course: c.name, field: "Grading Scale", reason: "STARS's international page has no scale for this kind of grade (e.g. letters); pick one on STARS" });
    const academicLevel = kind === "intl" ? STARS_INTL_ACADEMIC_LEVELS[gl - 9]! : null;
    plan.rows.push({ trackerId: c.id, name: c.name, academicLevel, subject, title, level, length, scaleOptions, boxes });
  }
  return [...plans.values()];
}

/** Keep mode: rows whose name is not already in the page's table (STARS shows names upper-cased; one existing row per term). */
export function starsRowsToAdd(rows: StarsRow[], existingNames: string[]): StarsRow[] {
  const have = new Set(existingNames.map(upper));
  return rows.filter((r) => !have.has(upper(r.name)));
}

/** The international page's plans only. */
export const buildStarsIntlPlans = (schools: TranscriptSchool[], courses: TranscriptCourse[]): StarsPagePlan[] =>
  buildStarsPlans(schools, courses).filter((p) => p.kind === "intl");

/** The scale to pick for a row: its only option, else the student's answer among its options, else null (asked first). */
export function starsScaleFor(row: StarsRow, picked: readonly string[]): string | null {
  if (row.scaleOptions.length === 1) return row.scaleOptions[0]!;
  return row.scaleOptions.find((o) => picked.includes(o)) ?? null;
}
