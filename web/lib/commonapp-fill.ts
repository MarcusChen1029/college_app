// The fill plan for Common App's "Courses & Grades": which tracker courses go into which grade's dialog, with every
// value already in Common App's own words. Pure data in, pure data out; the browser extension just types the plan in.
// Grading Scale list and the dialog's schedule wording were read from a live account (read-only, 2026-10-26). The Current Year page's
// schedule options were read on the test account (2026-10-26); see docs/superpowers/research/2026-10-27-commonapp-dom.md.

import { mapCourse, yearLabel } from "./transcript-maps.ts";
import { COMMON_APP_MAP } from "./transcript-maps/common-app.ts";
import { addCredits, courseStatus, normalizeName, termCreditSum, TERMS_FOR_PERIOD, type GradeScale, type PeriodType, type TermCode, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

/** The Grading Scale dropdown, in Common App's order. After "Other" the student types each grade instead of picking it. */
export const COMMON_APP_GRADING_SCALES = ["A-F", "1-100", "0.0-4.0", "0.0-5.0", "1-7", "1-10", "1-11", "1-20", "Other"] as const;
export type CommonAppScale = (typeof COMMON_APP_GRADING_SCALES)[number];
export type CgGradeKey = "9" | "10" | "11" | "12" | "other";
/** Matched against the Schedule options read from the page by stem, because the dialog's wording differs from the map's ("Semesters" vs "Semester"). */
export type ScheduleStem = "semester" | "trimester" | "quarter" | "year";
/** A term column of a course row: grade{1..4}Control_T1Cn, or gradeFinalControl_T1Cn for "final". */
export type TermColumn = "1" | "2" | "3" | "4" | "final";
export type FillRow = {
  trackerId: string;
  name: string;
  subject: string | null;
  level: string | null;
  grades: Partial<Record<TermColumn, string>>;
  /** Credit boxes by column (credit{1..4}Control / creditFinalControl), exact text. Empty when creditNA. */
  credits: Partial<Record<TermColumn, string>>;
  creditNA: boolean;
};
export type Skipped = { where: CgGradeKey | "current"; course: string; field: string; reason: string };
export type CgGradePlan = {
  grade: CgGradeKey;
  schoolName: string;
  /** The school code (CEEB) from the transcript, when the student entered one: portals are matched by it first. */
  schoolCode?: string;
  schoolYear: string;
  scale: CommonAppScale;
  scheduleStem: ScheduleStem;
  rows: FillRow[];
  skipped: Skipped[];
  warnings: string[];
};

const GRADE_ORDER: CgGradeKey[] = ["9", "10", "11", "12", "other"];
const STEM: Record<PeriodType, ScheduleStem> = { full_year: "year", semester: "semester", trimester: "trimester", quarter: "quarter" };
const COLUMN: Record<TermCode, TermColumn> = { S1: "1", T1: "1", Q1: "1", S2: "2", T2: "2", Q2: "2", T3: "3", Q3: "3", Q4: "4", FY: "final" };
/** The term columns the dialog shows for each Schedule (Yearly has only Final). */
const SCHEDULE_COLUMNS: Record<ScheduleStem, TermColumn[]> = { semester: ["1", "2"], trimester: ["1", "2", "3"], quarter: ["1", "2", "3", "4"], year: [] };
/** Grading Scales whose grades are whole numbers, so a term average can be rounded to one of the list's options. */
const INTEGER_SCALES: readonly CommonAppScale[] = ["1-100", "1-7", "1-10", "1-11", "1-20"];
/** Common App's grade option for a term the course was not taken (owner, 2026-10-26: it means 0 credit). Matched exactly like any grade. */
export const NO_GRADE = "No Grade";
const NUMERIC = /^\d+(\.\d+)?$/;
/** Credit as text without trailing zeros: 2, 2.5, 0.25. */
const creditText = (n: number): string => String(addCredits([n]));

/** "2023-24" for the year starting in 2023. */
export function schoolYearLabel(year: number): string {
  return yearLabel(year);
}

export function gradingScaleFor(scale: GradeScale, max: number | null): CommonAppScale {
  if (scale === "percent_100") return "1-100";
  if (scale === "letter" || scale === "letter_plus_minus") return "A-F";
  if (scale === "ib_7") return "1-7";
  if (scale === "gpa_decimal") return max === 4 ? "0.0-4.0" : max === 5 ? "0.0-5.0" : "Other";
  if (scale === "other") return max === 10 ? "1-10" : max === 11 ? "1-11" : max === 20 ? "1-20" : "Other";
  return "Other";
}

const gradeKey = (c: TranscriptCourse): CgGradeKey => (c.gradeLevel != null && c.gradeLevel >= 9 && c.gradeLevel <= 12 ? (String(c.gradeLevel) as CgGradeKey) : "other");

/** The value that occurs most often; on a tie, the one seen first. */
function mostCommon<T>(items: T[]): T {
  const counts = new Map<T, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  let best = items[0] as T;
  for (const [v, n] of counts) if (n > counts.get(best)!) best = v;
  return best;
}

/** Term and final grades as printed, keyed by Common App's term column. Only graded terms with a grade; the year's final grade wins over an FY term. */
function gradesFor(c: TranscriptCourse): Partial<Record<TermColumn, string>> {
  const out: Partial<Record<TermColumn, string>> = {};
  for (const t of c.terms) {
    const g = t.grade.trim();
    if (t.status === "graded" && g) out[COLUMN[t.term]] = g;
  }
  const final = c.finalGrade?.trim();
  if (final) out.final = final;
  return out;
}

/** Subject and level in Common App's words (map, then the student's override); a missing one is blank and reported. Dual-enrollment courses are
 *  entered under the high school with level "Dual Enrollment", whatever level the transcript gave; a student override still wins. */
function subjectAndLevel(school: TranscriptSchool, c: TranscriptCourse, where: Skipped["where"], skipped: Skipped[]): { subject: string | null; level: string | null; warnings: string[] } {
  const mapped = mapCourse("common_app", school, c);
  const pick = (key: "subject" | "level"): string | null => {
    const f = mapped.fields.find((x) => x.key === key)!;
    if (f.value == null || f.status === "none") {
      skipped.push({ where, course: c.name, field: key, reason: f.note ?? `no Common App ${key} for this course` });
      return null;
    }
    return f.value;
  };
  const subject = pick("subject");
  const dual = c.isCollege && !c.overrides.common_app?.level ? COMMON_APP_MAP.level.dual_enrollment.value : null;
  return { subject, level: dual ?? pick("level"), warnings: mapped.warnings };
}

type Cells = { grades: Partial<Record<TermColumn, string>>; credits: Partial<Record<TermColumn, string>> };

/** The course's total credit: the sum of its term credits when it has them, else the course credit. */
function totalCredit(c: TranscriptCourse): number | null {
  return termCreditSum(c.terms) ?? c.credit;
}

/** The grade and credit boxes this course fills in a dialog with Grading Scale `scale` and Schedule `stem`; what is left out is reported.
 *  - Another scale: no grades at all. They would be matched against this scale's options (an IB "6" would become 6 on 1-100).
 *  - Another term system: only the final grade. A quarter's Q1 is not the dialog's Semester 1, so term grades are never moved across.
 *  In both cases only Final credit is filled (the course's total).
 *  - Same term system (owner, 2026-10-26): each term column gets its grade and credit as printed; a term with no grade ("none", or missing
 *    while the course has other terms of this system) gets "No Grade" and credit 0; in-progress / planned terms stay blank. Final is the printed
 *    final grade, else the rounded (half up) average of the graded terms on an integer scale, else blank and reported. Final credit is the sum of
 *    the term credits used, or the course credit when no term has one. */
function cellsInDialog(c: TranscriptCourse, scale: CommonAppScale, stem: ScheduleStem, where: CgGradeKey, skipped: Skipped[], warnings: string[]): Cells {
  const printed = gradesFor(c);
  const total = totalCredit(c);
  const finalCreditOnly = total != null ? { final: creditText(total) } : {};
  const own = gradingScaleFor(c.scale, c.scaleMax);
  if (own !== scale) {
    skipped.push({ where, course: c.name, field: "grades", reason: `grades are on scale ${own}; this grade uses ${scale} on Common App: enter them by hand` });
    return { grades: {}, credits: finalCreditOnly };
  }
  if (STEM[c.period] !== stem) {
    for (const t of c.terms) {
      if (t.status !== "graded" || !t.grade.trim() || COLUMN[t.term] === "final") continue;
      skipped.push({ where, course: c.name, field: `${t.term} grade`, reason: `the course is on a ${STEM[c.period]} schedule; this grade uses the ${stem} schedule on Common App, which has no ${t.term} column: enter it by hand` });
    }
    return { grades: printed.final ? { final: printed.final } : {}, credits: finalCreditOnly };
  }

  const grades: Partial<Record<TermColumn, string>> = {};
  const credits: Partial<Record<TermColumn, string>> = {};
  const cols = SCHEDULE_COLUMNS[stem];
  const termOf = (col: TermColumn) => c.terms.find((t) => COLUMN[t.term] === col);
  // A course with only a year grade has no term columns of its own: its missing terms are not "No Grade".
  const hasTerms = cols.some((col) => termOf(col));
  // Same rule as termCreditSum: credits on "none" terms (always 0) don't count.
  const hasTermCredits = c.terms.some((t) => t.status !== "none" && t.credit != null);
  const graded: string[] = [];
  const termCredits: number[] = [];
  let unfinished = false;
  for (const col of cols) {
    const t = termOf(col);
    if (!t || t.status === "none") {
      if (hasTerms) {
        grades[col] = NO_GRADE;
        credits[col] = "0";
      }
      continue;
    }
    const g = t.grade.trim();
    if (t.status !== "graded" || !g) {
      // In progress, planned, or a graded term whose grade is missing (flagged in the tracker): blank, and no average.
      unfinished = true;
      continue;
    }
    grades[col] = g;
    graded.push(g);
    if (t.credit != null) {
      credits[col] = creditText(t.credit);
      termCredits.push(t.credit);
    } else if (hasTermCredits) {
      // Other terms carry credits, so this one's is missing rather than "listed once for the course": say so, never guess it.
      skipped.push({ where, course: c.name, field: `${t.term} credit`, reason: "no credit for this term in the tracker; Final credit may be too low" });
    }
  }

  if (printed.final) grades.final = printed.final;
  else if (graded.length) {
    if (!unfinished && INTEGER_SCALES.includes(scale) && graded.every((g) => NUMERIC.test(g))) {
      const avg = graded.reduce((sum, g) => sum + Number(g), 0) / graded.length;
      // Round half up; toFixed first so 90.49999999 from floating point is not taken for 90.5 or the other way round.
      grades.final = String(Math.round(Number(avg.toFixed(6))));
      warnings.push(`${c.name}: Final grade ${grades.final} is the rounded average of the term grades`);
    } else {
      skipped.push({
        where, course: c.name, field: "final grade",
        reason: unfinished ? "a term is not graded yet, so there is no final grade; type it yourself" : "no final grade on the transcript; type it yourself",
      });
    }
  }

  if (termCredits.length) credits.final = creditText(addCredits(termCredits));
  else if (c.credit != null) credits.final = creditText(c.credit);
  return { grades, credits };
}

export function buildCgPlan(schools: TranscriptSchool[], courses: TranscriptCourse[]): CgGradePlan[] {
  const byId = new Map(schools.map((s) => [s.id, s]));
  const byGrade = new Map<CgGradeKey, TranscriptCourse[]>();
  for (const c of [...courses].sort((a, b) => a.sortOrder - b.sortOrder)) {
    // Only high-school transcripts: Common App has no course list for colleges (those go in Education > Colleges & Universities).
    if (byId.get(c.schoolId)?.kind !== "high_school") continue;
    const k = gradeKey(c);
    byGrade.set(k, [...(byGrade.get(k) ?? []), c]);
  }

  const plans: CgGradePlan[] = [];
  for (const grade of GRADE_ORDER) {
    const all = byGrade.get(grade);
    if (!all) continue;
    const skipped: Skipped[] = [];
    const warnings: string[] = [];

    // C&G takes courses with credit awarded; in-progress and planned ones belong in Current Year Courses.
    const fillable: TranscriptCourse[] = [];
    for (const c of all) {
      if (Object.keys(gradesFor(c)).length) fillable.push(c);
      else {
        const status = courseStatus(c);
        skipped.push({ where: grade, course: c.name, field: "course", reason: status === "graded" ? "no grades in tracker" : `${status.replace("_", " ")}: goes to Current Year Courses` });
      }
    }

    // One school and one school year per dialog: the busiest school, then its most common year.
    const pool = fillable.length ? fillable : all;
    const mainSchool = byId.get(mostCommon(pool.map((c) => c.schoolId)))!;
    const ofSchool = pool.filter((c) => c.schoolId === mainSchool.id);
    const mainYear = mostCommon(ofSchool.map((c) => c.academicYear));
    const rowsOf: TranscriptCourse[] = [];
    for (const c of fillable) {
      if (c.schoolId !== mainSchool.id) skipped.push({ where: grade, course: c.name, field: "course", reason: `another school (${byId.get(c.schoolId)!.name}): not filled, one school per grade` });
      else if (c.academicYear !== mainYear) skipped.push({ where: grade, course: c.name, field: "course", reason: `another school year (${schoolYearLabel(c.academicYear)}): not filled, one year per grade` });
      else rowsOf.push(c);
    }

    // One Grading Scale and one Schedule per dialog: the most common. Courses on another scale or term system still get a row, but their
    // grades are limited by gradesInDialog (never typed against another scale's options, never put in another term system's columns).
    const scales = ofSchool.filter((c) => c.academicYear === mainYear).map((c) => gradingScaleFor(c.scale, c.scaleMax));
    const scale = mostCommon(scales);
    const stem = mostCommon(ofSchool.filter((c) => c.academicYear === mainYear).map((c) => STEM[c.period]));

    const rows: FillRow[] = rowsOf.map((c) => {
      const { subject, level, warnings: ruleWarnings } = subjectAndLevel(mainSchool, c, grade, skipped);
      for (const w of ruleWarnings) warnings.push(`${c.name}: ${w}`);
      const cells = cellsInDialog(c, scale, stem, grade, skipped, warnings);
      // Only a real credit counts: the 0s of No Grade terms are not one. N/A makes every credit box read-only, so nothing is typed then.
      const hasCredit = cells.credits.final != null;
      const creditNA = !hasCredit && c.creditUnit === "not_listed";
      if (!hasCredit && !creditNA) skipped.push({ where: grade, course: c.name, field: "credit", reason: "no credit in tracker" });
      return { trackerId: c.id, name: c.name, subject, level, grades: cells.grades, credits: creditNA ? {} : cells.credits, creditNA };
    });

    plans.push({ grade, schoolName: mainSchool.name, schoolCode: mainSchool.schoolCode, schoolYear: schoolYearLabel(mainYear), scale, scheduleStem: stem, rows, skipped, warnings });
  }
  return plans;
}

/** The option equal to `wanted` after trimming, collapsing spaces and ignoring case; never a partial match. */
export function matchOption(options: readonly string[], wanted: string): string | null {
  const w = normalizeName(wanted);
  return options.find((o) => normalizeName(o) === w) ?? null;
}

/** The first option whose text starts with the stem ("quarter" finds "Quarters", "year" finds "Yearly"). */
export function matchStem(options: readonly string[], stem: ScheduleStem): string | null {
  return options.find((o) => o.trim().toLowerCase().startsWith(stem)) ?? null;
}

/** Keep mode: the rows whose course name is not already on the page. Names are matched like options, and each existing row covers only one tracker row. */
export function rowsToAdd<T extends { name: string }>(rows: T[], existingNames: string[]): T[] {
  const left = new Map<string, number>();
  for (const n of existingNames) left.set(normalizeName(n), (left.get(normalizeName(n)) ?? 0) + 1);
  return rows.filter((r) => {
    const key = normalizeName(r.name);
    const n = left.get(key) ?? 0;
    if (n > 0) left.set(key, n - 1);
    return n === 0;
  });
}

export type CurrentYearRow = { trackerId: string; name: string; subject: string | null; level: string | null; schedule: string | null };
export type CurrentYearPlan = { scheduleStem: ScheduleStem; rows: CurrentYearRow[]; skipped: Skipped[] };

/** Common App's Schedule wording for one course, from which terms it has; null when that is not known. */
function currentSchedule(c: TranscriptCourse): string | null {
  const codes = new Set(c.terms.map((t) => t.term));
  if (c.period === "full_year" || codes.has("FY")) return "Full Year";
  if (c.period === "semester") {
    if (codes.has("S1") && codes.has("S2")) return "Full Year";
    if (codes.has("S1")) return "First Semester";
    if (codes.has("S2")) return "Second Semester";
    return null;
  }
  // Every term of a trimester or quarter year is the whole year. A single term has its own option (read live, test account 2026-10-26).
  // Two or three of them would need several options picked at once (the field is multi-select), which one value cannot say: null.
  const terms = TERMS_FOR_PERIOD[c.period].filter((t) => t !== "FY");
  if (terms.every((t) => codes.has(t))) return "Full Year";
  const have = terms.filter((t) => codes.has(t));
  return have.length === 1 ? (SINGLE_TERM[have[0]!] ?? null) : null;
}

/** Common App's Current Year schedule options for a single trimester or quarter (the "Semester" system's two are handled above). */
const SINGLE_TERM: Partial<Record<TermCode, string>> = {
  T1: "First Trimester", T2: "Second Trimester", T3: "Third Trimester",
  Q1: "First Quarter", Q2: "Second Quarter", Q3: "Third Quarter", Q4: "Fourth Quarter",
};

/** Education > Current or Most Recent Year Courses: the high-school courses of the latest academic year (the finished year, if school is over). null when there are none. */
export function buildCurrentYearPlan(schools: TranscriptSchool[], courses: TranscriptCourse[]): CurrentYearPlan | null {
  const byId = new Map(schools.map((s) => [s.id, s]));
  const hs = [...courses].sort((a, b) => a.sortOrder - b.sortOrder).filter((c) => byId.get(c.schoolId)?.kind === "high_school");
  if (!hs.length) return null;
  const latest = Math.max(...hs.map((c) => c.academicYear));
  const skipped: Skipped[] = [];
  const rows: CurrentYearRow[] = [];
  const periods: PeriodType[] = [];
  for (const c of hs.filter((x) => x.academicYear === latest)) {
    const { subject, level } = subjectAndLevel(byId.get(c.schoolId)!, c, "current", skipped);
    const schedule = currentSchedule(c);
    if (schedule == null) skipped.push({ where: "current", course: c.name, field: "schedule", reason: c.terms.length ? "terms are not the whole year or a single term: pick the schedule options by hand" : "no terms in tracker" });
    rows.push({ trackerId: c.id, name: c.name, subject, level, schedule });
    periods.push(c.period);
  }
  return { scheduleStem: STEM[mostCommon(periods)], rows, skipped };
}
