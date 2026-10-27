// The fill plan for UIUC's Self-Reported Academic Record (myIllini SRAR): one plan per high school and grade level 9-12, one row per
// term grade (UIUC: "list each grade separately; do not list a final grade"), every box as the page's own option value. Pure data in,
// pure data out; the extension types it in (extension/src/uiuc/*). Page facts, seen live 2026-10-28:
// docs/superpowers/research/2026-10-27-portal-dom.md §5.

import { UIUC_MAP, UIUC_SUBJECTS } from "./transcript-maps/uiuc.ts";
import { normalizeName, type Level, type TermCode, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

/** Courses Years 9-11 and Courses Year 12 (two pages of the same form). */
export type UiucPage = "lower" | "upper";
export const UIUC_PAGE_PATH: Record<UiucPage, string> = {
  lower: "/Apply/Application/FreshmanSRAR",
  upper: "/Apply/Application/FreshmanSRAR?IsLower=False",
};
export const UIUC_PAGE_LABEL: Record<UiucPage, string> = { lower: "Courses Years 9-11", upper: "Courses Year 12" };

/** `.TermYear` option values: 9-11 page 1/2/3 (0 = Pre-High School), 12 page 4 (5 = Post-12th). */
export const UIUC_TERM_YEAR: Record<number, string> = { 9: "1", 10: "2", 11: "3", 12: "4" };

/** `.Term` option values by the tracker's term, and the page's own wording (for the report). */
export const UIUC_TERM: Record<TermCode | "summer", { value: string; label: string }> = {
  S1: { value: ".2.1", label: "1st Semester" },
  S2: { value: ".2.2", label: "2nd Semester" },
  T1: { value: ".3.1", label: "1st Trimester" },
  T2: { value: ".3.2", label: "2nd Trimester" },
  T3: { value: ".3.3", label: "3rd Trimester" },
  Q1: { value: ".4.1", label: "1st Quarter" },
  Q2: { value: ".4.2", label: "2nd Quarter" },
  Q3: { value: ".4.3", label: "3rd Quarter" },
  Q4: { value: ".4.4", label: "4th Quarter" },
  FY: { value: ".1.1", label: "All Year" },
  summer: { value: ".5.1", label: "Summer" },
};

/** `.CourseTypeID` option values by the subject's label. */
export const UIUC_SUBJECT_CODE: Record<(typeof UIUC_SUBJECTS)[number], string> = {
  English: "ENG",
  Mathematics: "M",
  Science: "SCI",
  "Social Science": "S",
  "Language Other Than English": "FL",
  Other: "OTH",
  Technical: "TECH",
};

/** `.AdvancedTypeID` options, value -> label. A Level / AS Level pop a confirm() and are never chosen by the filler. */
export const UIUC_TYPES: Record<string, string> = {
  None: "Regular", Academic: "Academic", Accelerated: "Accelerated", Advanced: "Advanced", AP: "AP Course", "AP Prep": "AP Prep",
  "A Level": "A Level", "AS Level": "AS Level", IGCSE: "IGCSE", "College Prep": "College Prep", Enriched: "Enriched", Gifted: "Gifted",
  "High Honors": "High Honors", Honors: "Honors", "IB HL": "IB HL", "IB SL": "IB SL", MYP: "MYP",
};
const NEVER_AUTO_TYPES = new Set(["A Level", "AS Level"]);

/** The tracker's level -> UIUC's Type value, where the two say the same thing. */
const LEVEL_TYPE: Partial<Record<Level, string>> = {
  regular: "None", honors: "Honors", high_honors: "High Honors", ap: "AP", ib_hl: "IB HL", ib_sl: "IB SL", advanced: "Advanced",
  enriched: "Enriched", accelerated: "Accelerated", gifted: "Gifted", college_prep: "College Prep",
};

/** UIUC's "In Progress" grade: only on the Year 12 page (it is that page's default). */
export const UIUC_IN_PROGRESS = "In Progress";
/** The Grade/Mark box's maxlength when the school's grading scale is "Other". */
export const UIUC_GRADE_MAX = 10;

export type UiucRow = {
  trackerId: string;
  name: string;
  /** `.TermYear` value. */
  year: string;
  /** `.Term` value and its wording. */
  term: string;
  termLabel: string;
  /** `.CourseTypeID` value; null = no certain subject (the row is left for the student). */
  subject: string | null;
  /** `.AdvancedTypeID` value. */
  type: string;
  /** The grade exactly as printed, or "In Progress"; null = nothing to enter (left for the student). */
  grade: string | null;
  repeat: boolean;
  /** Why the filler must leave this row for the student (no subject, no grade...); null = it can be added. */
  blocked: string | null;
};
export type UiucSkip = { course: string; field: string; reason: string };
export type UiucGradePlan = {
  schoolName: string;
  schoolCode?: string;
  gradeLevel: number;
  year: string;
  page: UiucPage;
  path: string;
  rows: UiucRow[];
  skipped: UiucSkip[];
  warnings: string[];
};

export const UIUC_SUBJECT_UNDECIDED = "UIUC subject not chosen: pick its Subject for UIUC in the tracker (Transcript > View as > UIUC SRAR > Override on the course), or add the course on myIllini yourself";
export const UIUC_TYPE_YOURSELF = "A Level / AS Level type: pick it on myIllini yourself (UIUC asks a question about it)";
export const UIUC_COLLEGE_SKIP = "college course: UIUC asks about college courses on the Education page";

/** UIUC's subject code for a course: the student's (or AI's) UIUC tag, else the map's subject for the category when it is verified. */
export function uiucSubject(c: TranscriptCourse): string | null {
  const tag = c.overrides.uiuc?.subject;
  if (tag) {
    const label = UIUC_SUBJECTS.find((s) => normalizeName(s) === normalizeName(tag));
    if (label) return UIUC_SUBJECT_CODE[label];
  }
  const m = UIUC_MAP.subject[c.subject];
  if (m.status !== "verified" || !m.value) return null;
  const label = UIUC_SUBJECTS.find((s) => s === m.value);
  return label ? UIUC_SUBJECT_CODE[label] : null;
}

/** UIUC's Type value for a course, and a warning when it had to fall back to Regular. null type = the student must pick (A Level / AS). */
export function uiucType(c: TranscriptCourse): { type: string | null; warning: string | null } {
  const ov = c.overrides.uiuc?.level?.trim();
  if (ov) {
    const k = normalizeName(ov);
    const value = Object.entries(UIUC_TYPES).find(([v, label]) => normalizeName(v) === k || normalizeName(label) === k)?.[0];
    if (value && NEVER_AUTO_TYPES.has(value)) return { type: null, warning: null };
    if (value) return { type: value, warning: null };
  }
  const t = LEVEL_TYPE[c.level];
  if (t) return { type: t, warning: null };
  return { type: "None", warning: `${c.name}: entered as Regular; UIUC has no Type for the tracker's "${c.level.replace(/_/g, " ")}" level (change it on myIllini if the transcript lists one)` };
}

/** The term grades UIUC gets for a course: every term except a year/final grade; the year grade only when there are no term grades. */
function termGrades(c: TranscriptCourse): { code: TermCode; grade: string; status: "graded" | "in_progress" | "planned" }[] {
  const out: { code: TermCode; grade: string; status: "graded" | "in_progress" | "planned" }[] = [];
  for (const t of c.terms) {
    if (t.term === "FY" || t.status === "none") continue;
    out.push({ code: t.term, grade: t.grade.trim(), status: t.status });
  }
  if (out.length) return out;
  const fy = c.terms.find((t) => t.term === "FY");
  if (fy && fy.status !== "none") return [{ code: "FY", grade: fy.grade.trim() || (c.finalGrade ?? "").trim(), status: fy.status }];
  if (!fy && c.finalGrade?.trim()) return [{ code: "FY", grade: c.finalGrade.trim(), status: "graded" }];
  return [];
}

/** One plan per (high school, grade level 9-12), in grade order. */
export function buildUiucPlans(schools: TranscriptSchool[], courses: TranscriptCourse[]): UiucGradePlan[] {
  const out: UiucGradePlan[] = [];
  for (const school of schools) {
    if (school.kind !== "high_school") continue;
    const mine = courses.filter((c) => c.schoolId === school.id).sort((a, b) => (a.gradeLevel ?? 0) - (b.gradeLevel ?? 0) || a.sortOrder - b.sortOrder);
    const plans = new Map<number, UiucGradePlan>();
    for (const c of mine) {
      const gl = c.gradeLevel;
      if (gl == null || gl < 9 || gl > 12) continue; // Pre-High School / Post-12th are not filled
      let plan = plans.get(gl);
      if (!plan) {
        const page: UiucPage = gl === 12 ? "upper" : "lower";
        plan = {
          schoolName: school.name, ...(school.schoolCode ? { schoolCode: school.schoolCode } : {}), gradeLevel: gl,
          year: `${c.academicYear} - ${c.academicYear + 1}`, page, path: UIUC_PAGE_PATH[page], rows: [], skipped: [], warnings: [],
        };
        plans.set(gl, plan);
      }
      const p = plan;
      if (c.isCollege || c.level === "dual_enrollment") {
        p.skipped.push({ course: c.name, field: "course", reason: UIUC_COLLEGE_SKIP });
        continue;
      }
      const grades = termGrades(c);
      if (!grades.length) continue; // every term is "not taken"
      const subject = uiucSubject(c);
      const { type, warning } = uiucType(c);
      if (warning) p.warnings.push(warning);
      // A box the whole course can't fill (no certain subject, an A Level type) blocks all its rows; said once.
      const courseBlock = !subject ? UIUC_SUBJECT_UNDECIDED : type === null ? UIUC_TYPE_YOURSELF : null;
      if (courseBlock) p.skipped.push({ course: c.name, field: !subject ? "Subject" : "Type", reason: courseBlock });
      if (c.isSummer && grades.length > 1) p.warnings.push(`${c.name}: a summer course with ${grades.length} grades; each is entered as Summer`);
      for (const g of grades) {
        const term = c.isSummer ? UIUC_TERM.summer : UIUC_TERM[g.code];
        let grade: string | null = g.grade || null;
        let rowBlock: string | null = null;
        if (g.status !== "graded") {
          if (gl === 12) {
            grade = UIUC_IN_PROGRESS;
            if (g.status === "planned") p.warnings.push(`${c.name} (${term.label}): planned, entered as In Progress`);
          } else {
            grade = null;
            rowBlock = `${term.label} is ${g.status === "planned" ? "planned" : "in progress"}: UIUC takes In Progress only on the Year 12 page; add it yourself once the grade is out`;
          }
        } else if (!grade) {
          rowBlock = `the ${term.label} grade is missing in the tracker`;
        } else if (grade.length > UIUC_GRADE_MAX) {
          rowBlock = `"${grade}" is longer than UIUC's ${UIUC_GRADE_MAX}-character Grade/Mark box; enter it yourself`;
        }
        if (rowBlock && !courseBlock) p.skipped.push({ course: c.name, field: `${term.label} grade`, reason: rowBlock });
        p.rows.push({
          trackerId: c.id, name: c.name, year: UIUC_TERM_YEAR[gl]!, term: term.value, termLabel: term.label, subject, type: type ?? "None", grade,
          repeat: c.isRepeat, blocked: courseBlock ?? rowBlock,
        });
      }
    }
    out.push(...[...plans.values()].sort((a, b) => a.gradeLevel - b.gradeLevel));
  }
  return out;
}
