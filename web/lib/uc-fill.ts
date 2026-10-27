// The fill plan for the UC application's "Enter courses & grades" pages (one per grade level 9-12, per high school): every course with each
// box in UC's own words. Pure data in, pure data out; the extension types it in. Lists: transcript-maps/uc-lists.ts; page facts:
// docs/superpowers/research/2026-10-27-portal-dom.md §3. UC's rules (QRG Aug 2026): no +/- in high school, no Pass/Fail for A-G,
// NO / IP / PL codes, college courses and non-A-G courses go elsewhere.

import { isNonUs } from "./transcript-maps/types.ts";
import { UC_DISCIPLINES, UC_GRADE_CODES, UC_LANGUAGES, ucDisciplineLabels } from "./transcript-maps/uc-lists.ts";
import { normalizeName, TERMS_FOR_PERIOD, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

export type UcRow = {
  trackerId: string;
  name: string;
  /** UC's subject option: its text and code (two options are both called "Computer Science"). null = left for the student. */
  discipline: { area: string; text: string; value: string } | null;
  honors: "AP" | "IB" | "HL" | "NH";
  /** One per grade box of the school's term system. null = left blank (reported). */
  grades: (string | null)[];
  /** For a Language Other Than English course: UC's language option. */
  language: string | null;
};
export type UcSkip = { course: string; field: string; reason: string };
export type UcGradePlan = { schoolName: string; schoolCode?: string; gradeLevel: number; year: string; rows: UcRow[]; skipped: UcSkip[]; warnings: string[] };

const LETTER = /^([A-F])[+-]?$/i;
const byText = (t: string) => UC_DISCIPLINES.find((d) => d.text === t)!;

/** UC's subject for a course: the student's (or AI's) choice when it is one of UC's options, else what the course's category says exactly. */
export function ucDiscipline(c: TranscriptCourse): { area: string; text: string; value: string } | null {
  // A tag from the student or the AI (subject, or the older subSubject): one of UC's own labels. "Computer Science" alone is under both
  // Mathematics and Science, so it only counts with its area: "Computer Science (Science)".
  for (const ov of [c.overrides.uc?.subject, c.overrides.uc?.subSubject]) {
    if (!ov) continue;
    const i = ucDisciplineLabels().findIndex((l) => normalizeName(l) === normalizeName(ov));
    if (i >= 0) return UC_DISCIPLINES[i]!;
  }
  const name = c.name;
  switch (c.subject) {
    case "english":
      return byText(/\b(ESL|ELD)\b/i.test(name) ? "English-ESL/ELD" : "English");
    case "mathematics": {
      const m: Record<string, string> = { algebra_1: "Algebra I", geometry: "Geometry", algebra_2: "Algebra II", precalculus: "Pre-Calculus", calculus: "Calculus", statistics: "Statistics" };
      return c.subSubject && m[c.subSubject] ? byText(m[c.subSubject]!) : null;
    }
    case "science": {
      const m: Record<string, string> = { biology: "Biology/Life Sciences", chemistry: "Chemistry", physics: "Physics", earth_space: "Earth and Space Sciences" };
      return c.subSubject && m[c.subSubject] ? byText(m[c.subSubject]!) : null;
    }
    case "arts": {
      const m: Record<string, string> = { visual: "Visual Arts", music: "Music", theater: "Theater", dance: "Dance", interdisciplinary: "Interdisciplinary Arts" };
      return c.subSubject && m[c.subSubject] ? byText(m[c.subSubject]!) : null;
    }
    case "world_language": {
      // The year of study is in the course name ("Chinese 2", "Spanish III"); without it UC's year can't be told.
      const roman: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };
      const m = name.match(/\b([1-9]|I{1,3}|IV|V|VI)\b(?!.*\b([1-9]|I{1,3}|IV|V|VI)\b)/);
      const n = m ? (roman[m[1]!] ?? Number(m[1])) : null;
      return n ? byText(`Yr ${n >= 4 ? "4+" : n} Lang Other Than English`) : null;
    }
    case "history_social":
      if (/\b(U\.?S\.?|American|United States)\b.*\bHistory\b/i.test(name)) return byText("U.S. History");
      if (/\b(Civics|Government)\b/i.test(name)) return byText("Civics/American Government");
      if (/\bWorld (History|Cultures?)\b|\bGeography\b/i.test(name)) return byText("World History/Cultures/Hist. Geography");
      return null;
    default:
      return null;
  }
}

/**
 * UC's subject when the course's category alone doesn't name one, from what the transcript itself shows, with a warning so the student
 * sees the choice. null = still left for the student.
 * - A language course without a year number ("AP Chinese Language and Culture"): its year is one more than the same language's courses in
 *   earlier school years at this school (Chinese I, Chinese II, then AP Chinese = year 3).
 * - Computer science: UC's college-prep elective for it ("Elective -Math -Computer Science"); UC also lists Computer Science under
 *   Mathematics and Science, which the student can pick instead.
 * - AP Seminar / AP Research (no single subject): "Elective -Interdisciplinary".
 */
export function ucDisciplineFromTranscript(c: TranscriptCourse, mine: readonly TranscriptCourse[]): { discipline: UcRow["discipline"]; warning: string } | null {
  if (c.subject === "world_language" && c.languageName.trim()) {
    const before = mine.filter((x) => x.subject === "world_language" && normalizeName(x.languageName) === normalizeName(c.languageName) && x.academicYear < c.academicYear);
    const years = new Set(before.map((x) => x.academicYear)).size;
    const n = years + 1;
    const text = `Yr ${n >= 4 ? "4+" : n} Lang Other Than English`;
    return { discipline: byText(text), warning: `${c.name}: entered as "${text}" (year ${n} of ${c.languageName} on your transcript); change it on UC if your school counts it differently` };
  }
  if (c.subject === "computer_science") {
    return { discipline: byText("Elective -Math -Computer Science"), warning: `${c.name}: entered as the college-prep elective "Elective -Math -Computer Science"; on UC you can pick Computer Science under Mathematics or Science instead` };
  }
  if (/\bAP\s+(Seminar|Research)\b/i.test(c.name)) {
    return { discipline: byText("Elective -Interdisciplinary"), warning: `${c.name}: entered as the college-prep elective "Elective -Interdisciplinary"` };
  }
  return null;
}

/** A printed grade in UC's words: + and - dropped, whole numbers as printed. null = UC can't take it (Pass/Fail, decimals, other marks). */
export function ucGrade(printed: string): string | null {
  const g = printed.trim();
  const letter = g.match(LETTER);
  if (letter) return letter[1]!.toUpperCase();
  if (/^\d{1,3}$/.test(g) && Number(g) <= 100) return String(Number(g));
  return null;
}

function honorsOf(school: TranscriptSchool, c: TranscriptCourse, warnings: string[]): UcRow["honors"] {
  const ov = c.overrides.uc?.level?.toUpperCase();
  if (ov === "AP" || ov === "IB" || ov === "HL" || ov === "NH") return ov;
  if (c.level === "ap") return "AP";
  if (c.level === "ib" || c.level === "ib_hl" || c.level === "ib_sl") return "IB";
  // An honors course is HL wherever the school is (a real application from a school in Taiwan lists its Honors courses as HL); UC
  // itself decides which honors courses get extra weight.
  if (c.level === "honors" || c.level === "high_honors") {
    if (!isNonUs(school)) warnings.push(`${c.name}: marked HL; UC counts honors only for courses on the school's UC-approved honors list`);
    return "HL";
  }
  return "NH";
}

/** One plan per (high school, grade level 9-12), in grade order. */
export function buildUcPlans(schools: TranscriptSchool[], courses: TranscriptCourse[]): UcGradePlan[] {
  const out: UcGradePlan[] = [];
  for (const school of schools) {
    if (school.kind !== "high_school") continue;
    const boxes = TERMS_FOR_PERIOD[school.defaultPeriod].filter((t) => school.defaultPeriod === "full_year" || t !== "FY");
    const mine = courses.filter((c) => c.schoolId === school.id).sort((a, b) => (a.gradeLevel ?? 0) - (b.gradeLevel ?? 0) || a.sortOrder - b.sortOrder);
    const plans = new Map<number, UcGradePlan>();
    for (const c of mine) {
      const gl = c.gradeLevel;
      if (gl == null || gl < 9 || gl > 12) continue; // 7th/8th grade has its own page (math and languages only, no grades)
      let plan = plans.get(gl);
      if (!plan) {
        plan = { schoolName: school.name, schoolCode: school.schoolCode, gradeLevel: gl, year: `${c.academicYear} - ${c.academicYear + 1}`, rows: [], skipped: [], warnings: [] };
        plans.set(gl, plan);
      }
      const skip = (field: string, reason: string) => plan!.skipped.push({ course: c.name, field, reason });
      if (c.isCollege) {
        skip("course", "college course: enter it under Colleges attended while in high school");
        continue;
      }
      // A UC subject the student (or AI) chose wins over the category: e.g. a "career technical" course listed as Computer Science.
      if (!ucDiscipline(c) && (c.subject === "business" || c.subject === "pe_health" || c.subject === "career_technical")) {
        skip("course", "not an A-G course: UC says to leave it out here (it may go under Activities & awards > Other coursework)");
        continue;
      }
      let discipline = ucDiscipline(c);
      if (!discipline) {
        const guess = ucDisciplineFromTranscript(c, mine);
        if (guess) {
          discipline = guess.discipline;
          plan.warnings.push(guess.warning);
        }
      }
      // Home economics, counseling, defence education and the like have no A-G area: UC says to leave them out, like PE.
      if (!discipline && c.subject === "other") {
        skip("course", "not an A-G subject: UC says to leave it out here (it may go under Activities & awards > Other coursework)");
        continue;
      }
      if (!discipline) skip("Subject Area/Course Category", "UC's subject could not be told from the course; pick it on UC (or set it for UC in the tracker)");
      const grades = boxes.map((code): string | null => {
        if (c.period !== school.defaultPeriod) return null;
        const t = c.terms.find((x) => x.term === code) ?? (code === "FY" && c.finalGrade ? { term: "FY" as const, grade: c.finalGrade, status: "graded" as const } : undefined);
        if (!t || t.status === "none") return UC_GRADE_CODES.notTaken;
        if (t.status === "in_progress") return UC_GRADE_CODES.inProgress;
        if (t.status === "planned") return UC_GRADE_CODES.planned;
        const g = ucGrade(t.grade);
        if (g == null) skip(`${code} grade`, t.grade.trim() ? `"${t.grade}" is not a grade UC takes (no Pass/Fail or decimals for A-G); enter it by hand` : "the grade is missing in the tracker");
        return g;
      });
      if (c.period !== school.defaultPeriod) skip("grades", `the course is on a ${c.period.replace("_", " ")} schedule but the school's term system is ${school.defaultPeriod.replace("_", " ")}: enter its grades by hand`);
      if (grades.some((g, i) => g && /^[A-F]$/.test(g) && /[+-]$/.test((c.terms.find((t) => t.term === boxes[i])?.grade ?? "").trim()))) {
        plan.warnings.push(`${c.name}: UC drops + and -, so the grade is entered without them`);
      }
      const language = c.subject === "world_language"
        ? (UC_LANGUAGES.find((l) => normalizeName(l) === normalizeName(c.languageName)) ?? (c.languageName.trim() ? "Other Language" : null))
        : null;
      if (c.subject === "world_language" && !language) skip("language", "the language is not set in the tracker; pick it on UC");
      plan.rows.push({ trackerId: c.id, name: c.name, discipline, honors: honorsOf(school, c, plan.warnings), grades, language });
    }
    out.push(...[...plans.values()].sort((a, b) => a.gradeLevel - b.gradeLevel));
  }
  return out;
}
