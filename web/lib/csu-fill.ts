// The fill plan for Cal State Apply's High School Coursework: every course per US high school with each box in Cal State Apply's words.
// Pure data in, pure data out; the extension types it in. Page facts: docs/superpowers/research/2026-10-27-portal-dom.md §2.

import { mapCourse } from "./transcript-maps.ts";
import { csuYear } from "./csu-labels.ts";
import { isNonUs } from "./transcript-maps/types.ts";
import { TERMS_FOR_PERIOD, type PeriodType, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

/** Grade options in the course form (live, 2026-10-27). In Progress and Planned only exist for the current school year. */
export const CSU_GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "In Progress", "Planned", "No Course", "Pass", "No Pass"] as const;
export const CSU_COURSE_TYPES = ["None", "Advanced Placement", "International Baccalaureate", "Honors"] as const;
export const CSU_TERM_TYPES: Record<PeriodType, string> = { full_year: "Full Year", semester: "Semester", trimester: "Trimester", quarter: "Quarter" };
/** Cal State Apply Grade Values Chart: US percentages (help center article 10_Cal_State_Apply_Grade_Values_Chart). */
const CHART = "Cal State Apply's grade chart for US percentages (90-100 A, 80-89 B, 70-79 C, 60-69 D, 59 and below F; between values rounds up)";

export type CsuRow = {
  trackerId: string;
  name: string;
  gradeLevel: number;
  /** "2023-2024", as the Year dropdown writes it. */
  year: string;
  summer: boolean;
  courseType: (typeof CSU_COURSE_TYPES)[number];
  /** One per term box of the school's Term Type, in order. null = left for the student (reported). */
  grades: (string | null)[];
  /** A-G Matching code (A, B, C, D1, D2, E, F, G), or null when it can't be told. */
  agCode: string | null;
};
export type CsuSkip = { course: string; field: string; reason: string };
export type CsuSchoolPlan = { schoolId: string; schoolName: string; schoolCode?: string; termType: string; rows: CsuRow[]; skipped: CsuSkip[]; warnings: string[] };

export { csuGradeLevelLabel, csuGradeLevelOption, csuYear } from "./csu-labels.ts";

/** A printed grade in Cal State Apply's words; a percentage goes through Cal State Apply's own chart (and says so). null = can't. */
export function csuGrade(printed: string, scale: TranscriptCourse["scale"]): { value: string | null; converted: boolean } {
  const g = printed.trim();
  const up = g.toUpperCase();
  if (/^(P|PASS)$/i.test(g)) return { value: "Pass", converted: false };
  if (/^(NP|NO PASS)$/i.test(g)) return { value: "No Pass", converted: false };
  if ((scale === "letter" || scale === "letter_plus_minus" || scale === "pass_fail") && (CSU_GRADES as readonly string[]).includes(up)) return { value: up, converted: false };
  if (scale === "percent_100" && /^\d{1,3}(\.\d+)?$/.test(g)) {
    const n = Number(g);
    if (n > 100) return { value: null, converted: false };
    const letter = n > 89 ? "A" : n > 79 ? "B" : n > 69 ? "C" : n > 59 ? "D" : "F";
    return { value: letter, converted: true };
  }
  return { value: null, converted: false };
}

function courseType(c: TranscriptCourse, warnings: string[]): CsuRow["courseType"] {
  const ov = c.overrides.csu?.level;
  const hit = ov ? CSU_COURSE_TYPES.find((t) => t.toLowerCase() === ov.toLowerCase()) : undefined;
  if (hit) return hit;
  if (c.level === "ap") return "Advanced Placement";
  if (c.level === "ib" || c.level === "ib_hl" || c.level === "ib_sl") return "International Baccalaureate";
  if (c.level === "honors" || c.level === "high_honors") {
    warnings.push(`${c.name}: marked Honors; Cal State Apply gives honors points only to CSU-approved honors courses`);
    return "Honors";
  }
  return "None";
}

/** The A-G code from the CSU map's subject (override first): "B – English" -> "B". */
function agCode(school: TranscriptSchool, c: TranscriptCourse): string | null {
  const v = mapCourse("csu", school, c).fields.find((f) => f.key === "subject")?.value;
  const m = v?.match(/^(D1|D2|[A-G])\b/);
  return m ? m[1]! : null;
}

/** One plan per US high school in the transcript, in transcript order. Schools outside the US skip course entry on Cal State Apply. */
export function buildCsuPlans(schools: TranscriptSchool[], courses: TranscriptCourse[]): CsuSchoolPlan[] {
  const out: CsuSchoolPlan[] = [];
  for (const school of schools) {
    if (school.kind !== "high_school" || isNonUs(school)) continue;
    const plan: CsuSchoolPlan = { schoolId: school.id, schoolName: school.name, schoolCode: school.schoolCode, termType: CSU_TERM_TYPES[school.defaultPeriod], rows: [], skipped: [], warnings: [] };
    const mine = courses.filter((c) => c.schoolId === school.id).sort((a, b) => (a.gradeLevel ?? 0) - (b.gradeLevel ?? 0) || a.academicYear - b.academicYear || a.sortOrder - b.sortOrder);
    for (const c of mine) {
      const skip = (field: string, reason: string) => plan.skipped.push({ course: c.name, field, reason });
      if (c.isCollege) {
        skip("course", "college course: enter it under College Coursework");
        continue;
      }
      if (c.subject === "pe_health") {
        skip("course", "physical education is not a college-preparatory (A-G) course; Cal State Apply says to leave it out");
        continue;
      }
      if (c.gradeLevel == null || c.gradeLevel < 7 || c.gradeLevel > 12) {
        skip("course", "Cal State Apply takes grades 7-12; set the grade level in the tracker");
        continue;
      }
      if (c.gradeLevel < 9 && c.subject !== "mathematics" && c.subject !== "world_language") {
        skip("course", "7th/8th grade courses count only for math and languages other than English");
        continue;
      }
      if (c.period !== school.defaultPeriod) {
        skip("grades", `the course is on a ${c.period.replace("_", " ")} schedule but the school is set to ${CSU_TERM_TYPES[school.defaultPeriod]}: enter its grades by hand`);
      }
      const codes = TERMS_FOR_PERIOD[school.defaultPeriod].filter((t) => school.defaultPeriod === "full_year" || t !== "FY");
      const grades = codes.map((code): string | null => {
        if (c.period !== school.defaultPeriod) return null;
        const t = c.terms.find((x) => x.term === code) ?? (code === "FY" && c.finalGrade ? { term: "FY" as const, grade: c.finalGrade, status: "graded" as const } : undefined);
        if (!t || t.status === "none") return "No Course";
        if (t.status === "in_progress") return "In Progress";
        if (t.status === "planned") return "Planned";
        const { value, converted } = csuGrade(t.grade, c.scale);
        if (value == null) skip(`${code} grade`, t.grade.trim() ? `"${t.grade}" has no Cal State Apply grade; enter it by hand` : "the grade is missing in the tracker");
        else if (converted) plan.warnings.push(`${c.name} ${code}: ${t.grade} entered as ${value} using ${CHART}`);
        return value;
      });
      const ag = agCode(school, c);
      if (!ag) skip("A-G area", "choose D1 (biological) or D2 (physical) science on the A-G Matching page");
      if (c.subject === "business" || c.subject === "career_technical" || c.subject === "computer_science") plan.warnings.push(`${c.name}: counts only if it is an A-G approved course`);
      plan.rows.push({ trackerId: c.id, name: c.name, gradeLevel: c.gradeLevel, year: csuYear(c.academicYear), summer: c.isSummer, courseType: courseType(c, plan.warnings), grades, agCode: ag });
    }
    out.push(plan);
  }
  return out;
}
