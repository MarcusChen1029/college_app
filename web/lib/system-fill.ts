// Entry plans for the application systems other than Common App (UC, STARS, Cal State Apply, UIUC SRAR, UT Austin): every course the
// student has to type into that system, grouped the way the system asks for them (school, then grade level), with every value already
// in that system's words. Pure data in, pure data out. The extension's fill assistant shows these and types them into the page;
// Common App has its own, page-specific plan in commonapp-fill.ts.

import { mapCourse, SYSTEMS, yearLabel, type MapStatus } from "./transcript-maps.ts";
import { STARS_INTL_LEVEL, STARS_INTL_LEVELS, STARS_INTL_SUBJECT, STARS_INTL_SUBJECTS } from "./transcript-maps/stars-lists.ts";
import { isNonUs } from "./transcript-maps/types.ts";
import { TERM_LABEL, type SystemKey, type Term, type TermCode, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

export const FILL_SYSTEMS = ["uc", "stars", "csu", "uiuc", "ut"] as const satisfies readonly SystemKey[];
export type FillSystem = (typeof FILL_SYSTEMS)[number];

export type EntryFieldKey = "name" | "subject" | "subSubject" | "genericTitle" | "level" | "period" | "credit" | "summer" | "repeat" | "college";
export type EntryField = { key: EntryFieldKey; label: string; value: string; status: MapStatus; note?: string };
/** One grade box: the system's label for the term and the value to type. */
export type EntryGrade = { term: TermCode | "final"; label: string; value: string };
export type EntryRow = { trackerId: string; name: string; fields: EntryField[]; grades: EntryGrade[]; warnings: string[] };
export type EntryGroup = { key: string; schoolName: string; gradeLevel: number | null; year: string; title: string; rows: EntryRow[] };
export type EntrySkip = { course: string; reason: string };
export type SystemPlan = { system: FillSystem; label: string; groups: EntryGroup[]; skipped: EntrySkip[]; notes: string[] };

/** What each system calls the boxes, and the extra rules that decide which courses and grades go in. */
type Rules = {
  /** Why this course is not entered in this system, or null to enter it. */
  exclude: (school: TranscriptSchool, c: TranscriptCourse) => string | null;
  /** The grade boxes for this course, already in the system's codes. */
  grades: (c: TranscriptCourse) => EntryGrade[];
  /** Fields this system asks for beyond subject / level / term system / credit. */
  extra?: (c: TranscriptCourse) => EntryField[];
  /** The term system to show for this course when the system decides it from the grades (STARS: "Full Year" when a year grade is printed). */
  period?: (c: TranscriptCourse) => string | null;
  /** Shown once at the top of the plan. */
  notes: string[];
};

const LETTER_SIGN = /^([A-F])[+-]$/i;
const isLowerGrade = (c: TranscriptCourse) => c.gradeLevel != null && c.gradeLevel < 9;
const termBox = (t: Term, value: string): EntryGrade => ({ term: t.term, label: TERM_LABEL[t.term], value });
const finalBox = (value: string): EntryGrade => ({ term: "final", label: "Final", value });
const unfinished = (c: TranscriptCourse) => c.terms.some((t) => t.status === "in_progress" || t.status === "planned");

/** Each printed term in order with `code(t)`, then the year grade when `withFinal`. A term `code` returns null for is left out. */
function termsThenFinal(c: TranscriptCourse, code: (t: Term) => string | null, withFinal: boolean): EntryGrade[] {
  const out: EntryGrade[] = [];
  for (const t of c.terms) {
    if (t.term === "FY") continue;
    const v = code(t);
    if (v != null && v !== "") out.push(termBox(t, v));
  }
  const fy = c.terms.find((t) => t.term === "FY");
  const final = c.finalGrade?.trim() || (fy ? code(fy) : null);
  if ((withFinal || out.length === 0) && final) out.push(finalBox(final));
  return out;
}

const RULES: Record<FillSystem, Rules> = {
  // UC Quick Reference Guide (Aug 2026): codes NO / IP / PL, no +/- in high school, no Pass/Fail for A-G, college courses in their own tab,
  // 7th/8th grade only for math and LOTE (no grades entered), non-A-G courses under Activities & awards > Other coursework.
  uc: {
    exclude: (school, c) => {
      if (school.kind !== "high_school" || c.isCollege) return "college course: enter it under Colleges attended while in high school";
      if (["business", "pe_health", "career_technical"].includes(c.subject)) return "not an A-G subject: add it under Activities & awards > Other coursework if you want";
      if (isLowerGrade(c) && c.subject !== "mathematics" && c.subject !== "world_language") return "UC takes 7th/8th grade courses only for math and language other than English";
      return null;
    },
    grades: (c) => {
      if (isLowerGrade(c)) return []; // UC asks for no grades for 7th/8th grade courses
      const code = (t: Term) => (t.status === "in_progress" ? "IP" : t.status === "planned" ? "PL" : t.status === "none" ? "NO" : t.grade.trim().replace(LETTER_SIGN, "$1"));
      // UC enters one grade per term of the school's term system; a year-only course has just its year grade.
      return termsThenFinal(c, code, false).map((g) => (g.term === "final" ? { ...g, value: g.value.replace(LETTER_SIGN, "$1") } : g));
    },
    notes: [
      "UC drops + and -: a B+ is entered as B.",
      "Use NO for a term the course did not run, IP for in progress and PL for planned.",
      "UC asks for the school's grading system and term system once per school; pick the ones shown on each group below.",
    ],
  },
  // STARS help center: unweighted grade; Full Year + only the final when the transcript prints a year grade; IP for courses without a final.
  stars: {
    exclude: (school) => (school.kind === "college" ? "college transcript: STARS takes only dual-enrollment courses that appear on the high-school transcript" : null),
    grades: (c) => {
      const final = c.finalGrade?.trim();
      if (final && c.terms.some((t) => t.term !== "FY")) return [finalBox(final)];
      return termsThenFinal(c, (t) => (t.status === "in_progress" || t.status === "planned" ? "IP" : t.status === "none" ? null : t.grade.trim()), false);
    },
    period: (c) => (c.finalGrade?.trim() ? "Full Year" : null),
    extra: (c) => (c.isCollege && c.collegeName.trim() ? [{ key: "college", label: "College name", value: c.collegeName.trim(), status: "verified" }] : []),
    notes: ["When the transcript prints a year grade, STARS wants Course Length \"Full Year\" and only that grade.", "Courses without a final grade get IP (In Progress)."],
  },
  // Cal State Apply help center: per-term grade, In Progress / Planned / No Grade / No Course, summer switch, college courses elsewhere.
  csu: {
    exclude: (school, c) => (school.kind !== "high_school" || c.isCollege ? "college course: enter it under College Coursework" : null),
    grades: (c) =>
      termsThenFinal(c, (t) => (t.status === "in_progress" ? "In Progress" : t.status === "planned" ? "Planned" : t.status === "none" ? "No Grade / No Course" : t.grade.trim()), false),
    extra: (c) => [{ key: "summer", label: "Summer course", value: c.isSummer ? "Yes" : "No", status: "verified" }],
    notes: ["Repeated course: Cal State Apply wants only the highest grade.", "Students who attended only high schools outside the US skip course entry."],
  },
  // UIUC first-year FAQ: list every term grade, never average; no final grade when terms exist; IP for senior courses in progress.
  uiuc: {
    exclude: () => null,
    grades: (c) => termsThenFinal(c, (t) => (t.status === "in_progress" || t.status === "planned" ? "IP" : t.status === "none" ? null : t.grade.trim()), false),
    extra: (c) => (c.isRepeat ? [{ key: "repeat", label: "Repeated course", value: "Yes", status: "verified" }] : []),
    notes: ["UIUC wants every semester, trimester or quarter grade on its own; do not enter a year average."],
  },
  // UT Austin FAQ: completed courses only; dual credit is reported as a transfer institution.
  ut: {
    exclude: (school, c) => {
      if (school.kind !== "high_school" || c.isCollege) return "dual credit: UT wants it reported as a transfer institution";
      if (unfinished(c)) return "not finished: UT's form takes completed courses only";
      return null;
    },
    grades: (c) => termsThenFinal(c, (t) => (t.status === "graded" ? t.grade.trim() : null), true),
    notes: ["UT's Academic Coursework Entry Form appears in MyStatus only for applicants from high schools outside Texas."],
  },
};

const FIELD_LABEL: Partial<Record<EntryFieldKey, string>> = { subject: "Subject", subSubject: "Discipline", genericTitle: "Course/Exam Content", level: "Level", period: "Term system", credit: "Credit" };
const LIVE_STARS = "Read on STARS's page for schools outside the US";

/** STARS shows schools outside the US another page with other lists (English is under "Languages"): use those, keeping a valid override. */
function starsIntl(c: TranscriptCourse, key: "subject" | "level"): { value: string | null; status: MapStatus; note?: string } {
  const ov = c.overrides.stars?.[key];
  const list: readonly string[] = key === "subject" ? STARS_INTL_SUBJECTS : STARS_INTL_LEVELS;
  const hit = ov ? list.find((o) => o.toLowerCase() === ov.toLowerCase()) : undefined;
  if (hit) return { value: hit, status: "verified" };
  if (key === "subject") return { value: STARS_INTL_SUBJECT[c.subject], status: "verified", note: LIVE_STARS };
  const level = c.isCollege ? "Dual Enrollment" : STARS_INTL_LEVEL[c.level];
  return level ? { value: level, status: "verified", note: LIVE_STARS } : { value: null, status: "unverified", note: "No single STARS level fits; pick it on STARS" };
}

function fieldsFor(system: FillSystem, school: TranscriptSchool, c: TranscriptCourse): { fields: EntryField[]; warnings: string[] } {
  const mapped = mapCourse(system, school, c);
  const fields: EntryField[] = [{ key: "name", label: "Course name", value: c.name, status: "verified" }];
  const intl = system === "stars" && isNonUs(school);
  for (const key of ["subject", "subSubject", "genericTitle", "level", "period", "credit"] as const) {
    const found = mapped.fields.find((x) => x.key === key);
    if (!found) continue;
    let f: { value: string | null; status: MapStatus; note?: string } = found;
    if (intl && (key === "subject" || key === "level")) f = starsIntl(c, key);
    let value = f.value;
    if (key === "period") value = RULES[system].period?.(c) ?? value;
    if (key === "level" && system === "stars" && !intl && c.isCollege && !c.overrides.stars?.level) value = "Dual Enrollment";
    if (value == null || f.status === "none") continue;
    fields.push({ key, label: FIELD_LABEL[key]!, value, status: f.status, ...(f.note ? { note: f.note } : {}) });
  }
  fields.push(...(RULES[system].extra?.(c) ?? []));
  return { fields, warnings: mapped.warnings };
}

const gradeTitle = (g: number | null) => (g == null ? "Other courses" : `Grade ${g}`);

/** The courses to enter in `system`, school by school and grade by grade, in transcript order. */
export function buildSystemPlan(system: FillSystem, schools: TranscriptSchool[], courses: TranscriptCourse[]): SystemPlan {
  const rules = RULES[system];
  const byId = new Map(schools.map((s) => [s.id, s]));
  const skipped: EntrySkip[] = [];
  const groups = new Map<string, EntryGroup>();
  const sorted = [...courses].sort((a, b) => {
    const sa = schools.findIndex((s) => s.id === a.schoolId), sb = schools.findIndex((s) => s.id === b.schoolId);
    return sa - sb || (a.gradeLevel ?? 99) - (b.gradeLevel ?? 99) || a.academicYear - b.academicYear || a.sortOrder - b.sortOrder;
  });
  for (const c of sorted) {
    const school = byId.get(c.schoolId);
    if (!school) continue;
    const why = rules.exclude(school, c);
    if (why) {
      skipped.push({ course: c.name, reason: why });
      continue;
    }
    const { fields, warnings } = fieldsFor(system, school, c);
    const grades = rules.grades(c);
    if (!grades.length && !isLowerGrade(c)) warnings.push("No grades in the tracker for this course");
    const key = `${school.id}|${c.gradeLevel ?? "other"}|${c.academicYear}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, schoolName: school.name, gradeLevel: c.gradeLevel, year: yearLabel(c.academicYear), title: `${gradeTitle(c.gradeLevel)} · ${yearLabel(c.academicYear)} · ${school.name}`, rows: [] };
      groups.set(key, group);
    }
    group.rows.push({ trackerId: c.id, name: c.name, fields, grades, warnings });
  }
  return { system, label: SYSTEMS[system].label, groups: [...groups.values()], skipped, notes: rules.notes };
}

/** Every value of a row in the order a student types them: fields, then grades. Used by "fill this course" and by the copy list. */
export function rowValues(row: EntryRow): { label: string; value: string }[] {
  return [...row.fields.map((f) => ({ label: f.label, value: f.value })), ...row.grades.map((g) => ({ label: `Grade: ${g.label}`, value: g.value }))];
}
