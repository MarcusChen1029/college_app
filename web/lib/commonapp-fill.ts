// The fill plan for Common App's "Courses & Grades": which tracker courses go into which grade's dialog, with every
// value already in Common App's own words. Pure data in, pure data out; the browser extension just types the plan in.
// Grading Scale list and the dialog's schedule wording were read from a live account (read-only, 2026-10-26).

import { mapCourse, yearLabel } from "./transcript-maps.ts";
import { COMMON_APP_MAP } from "./transcript-maps/common-app.ts";
import { courseStatus, normalizeName, TERMS_FOR_PERIOD, type GradeScale, type PeriodType, type TermCode, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

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
  credit: string | null;
  creditNA: boolean;
};
export type Skipped = { where: CgGradeKey | "current"; course: string; field: string; reason: string };
export type CgGradePlan = {
  grade: CgGradeKey;
  schoolName: string;
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

    const scales = ofSchool.filter((c) => c.academicYear === mainYear).map((c) => gradingScaleFor(c.scale, c.scaleMax));
    const scale = mostCommon(scales);
    const stem = mostCommon(ofSchool.filter((c) => c.academicYear === mainYear).map((c) => STEM[c.period]));
    const otherScale = rowsOf.filter((c) => gradingScaleFor(c.scale, c.scaleMax) !== scale);
    if (otherScale.length) warnings.push(`Grading scale ${scale} was used for this grade; these courses use another scale, so check their grades: ${otherScale.map((c) => `${c.name} (${gradingScaleFor(c.scale, c.scaleMax)})`).join(", ")}.`);
    const otherPeriod = rowsOf.filter((c) => c.period !== "full_year" && STEM[c.period] !== stem);
    if (otherPeriod.length) warnings.push(`Schedule ${stem} was used for this grade; these courses use another term system, so check their grade columns: ${otherPeriod.map((c) => `${c.name} (${STEM[c.period]})`).join(", ")}.`);

    const rows: FillRow[] = rowsOf.map((c) => {
      const { subject, level, warnings: ruleWarnings } = subjectAndLevel(mainSchool, c, grade, skipped);
      for (const w of ruleWarnings) warnings.push(`${c.name}: ${w}`);
      const hasCredit = c.credit != null;
      const creditNA = !hasCredit && c.creditUnit === "not_listed";
      if (!hasCredit && !creditNA) skipped.push({ where: grade, course: c.name, field: "credit", reason: "no credit in tracker" });
      return { trackerId: c.id, name: c.name, subject, level, grades: gradesFor(c), credit: hasCredit ? String(c.credit) : null, creditNA };
    });

    plans.push({ grade, schoolName: mainSchool.name, schoolYear: schoolYearLabel(mainYear), scale, scheduleStem: stem, rows, skipped, warnings });
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
  // Every term of a trimester or quarter year is the whole year; a single one needs wording that has not been read from Common App yet.
  return TERMS_FOR_PERIOD[c.period].filter((t) => t !== "FY").every((t) => codes.has(t)) ? "Full Year" : null;
}

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
    if (schedule == null) skipped.push({ where: "current", course: c.name, field: "schedule", reason: c.terms.length ? "schedule wording not confirmed" : "no terms in tracker" });
    rows.push({ trackerId: c.id, name: c.name, subject, level, schedule });
    periods.push(c.period);
  }
  return { scheduleStem: STEM[mostCommon(periods)], rows, skipped };
}
