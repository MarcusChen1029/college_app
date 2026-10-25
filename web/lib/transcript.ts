// The student's standardized transcript: schools and their courses, in our own superset format.
// Grades are always stored exactly as printed (never converted). The limits and enums mirror the check
// constraints in supabase/migrations/0030_transcript.sql, so keep the two in step. Private to the student:
// no teacher RPC, roster or AI context pack reads it.

export const PERIOD_TYPES = ["full_year", "semester", "trimester", "quarter"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];
export const TERM_CODES = ["FY", "S1", "S2", "T1", "T2", "T3", "Q1", "Q2", "Q3", "Q4"] as const;
export type TermCode = (typeof TERM_CODES)[number];
export const TERM_STATUSES = ["graded", "in_progress", "planned", "none"] as const;
export type TermStatus = (typeof TERM_STATUSES)[number];
export const GRADE_SCALES = ["letter_plus_minus", "letter", "percent_100", "gpa_decimal", "ib_7", "a_level", "gcse_9_1", "pass_fail", "narrative", "other"] as const;
export type GradeScale = (typeof GRADE_SCALES)[number];
export const CREDIT_UNITS = ["carnegie", "semester_hours", "quarter_hours", "other", "not_listed"] as const;
export type CreditUnit = (typeof CREDIT_UNITS)[number];
export const SCHOOL_KINDS = ["high_school", "college", "other"] as const;
export type SchoolKind = (typeof SCHOOL_KINDS)[number];
export const CURRICULA = ["us", "ib", "a_level", "igcse", "other"] as const;
export type Curriculum = (typeof CURRICULA)[number];
export const SOURCES = ["manual", "ai_import", "mcp"] as const;
export type Source = (typeof SOURCES)[number];
export const LEVELS = [
  "regular", "accelerated", "advanced", "honors", "high_honors", "ap", "ib_hl", "ib_sl", "ib", "pre_ib",
  "a_level", "gcse_igcse", "college_prep", "dual_enrollment", "enriched", "gifted", "intensive", "regents", "other", "none",
] as const;
export type Level = (typeof LEVELS)[number];
export const SUBJECTS = ["english", "mathematics", "science", "history_social", "world_language", "arts", "computer_science", "business", "pe_health", "career_technical", "other"] as const;
export type Subject = (typeof SUBJECTS)[number];

/** Second level of the category. Finer than any one system on purpose: arts keeps performing arts apart from visual arts. */
export const SUB_SUBJECTS: Record<Subject, readonly string[]> = {
  english: [],
  mathematics: ["algebra_1", "geometry", "algebra_2", "precalculus", "calculus", "statistics", "other"],
  science: ["biology", "chemistry", "physics", "earth_space", "integrated", "other"],
  history_social: [],
  world_language: ["other"],
  arts: ["visual", "music", "theater", "dance", "interdisciplinary"],
  computer_science: [],
  business: [],
  pe_health: [],
  career_technical: [],
  other: [],
};

export const SYSTEM_KEYS = ["common_app", "stars", "csu", "uc"] as const;
export type SystemKey = (typeof SYSTEM_KEYS)[number];
export const OVERRIDE_FIELDS = ["level", "subject", "subSubject", "period", "credit"] as const;
export type OverrideField = (typeof OVERRIDE_FIELDS)[number];
export type Overrides = Partial<Record<SystemKey, Partial<Record<OverrideField, string>>>>;

/** Which term codes a course may carry for each period type. */
export const TERMS_FOR_PERIOD: Record<PeriodType, readonly TermCode[]> = {
  full_year: ["FY"],
  semester: ["S1", "S2", "FY"],
  trimester: ["T1", "T2", "T3", "FY"],
  quarter: ["Q1", "Q2", "Q3", "Q4", "FY"],
};

export const PERIOD_LABEL: Record<PeriodType, string> = { full_year: "Full year", semester: "Semester", trimester: "Trimester", quarter: "Quarter" };
export const TERM_LABEL: Record<TermCode, string> = { FY: "Final / year", S1: "Semester 1", S2: "Semester 2", T1: "Trimester 1", T2: "Trimester 2", T3: "Trimester 3", Q1: "Quarter 1", Q2: "Quarter 2", Q3: "Quarter 3", Q4: "Quarter 4" };
export const TERM_STATUS_LABEL: Record<TermStatus, string> = { graded: "Graded", in_progress: "In progress", planned: "Planned", none: "Not taken" };
export const SCALE_LABEL: Record<GradeScale, string> = {
  letter_plus_minus: "Letters with +/-",
  letter: "Letters",
  percent_100: "Percent (0-100)",
  gpa_decimal: "Decimal (e.g. 3.7)",
  ib_7: "IB 7-point",
  a_level: "A-level (A*-E)",
  gcse_9_1: "GCSE 9-1",
  pass_fail: "Pass / fail",
  narrative: "Narrative",
  other: "Other (state the maximum)",
};
export const UNIT_LABEL: Record<CreditUnit, string> = { carnegie: "Carnegie units", semester_hours: "Semester hours", quarter_hours: "Quarter hours", other: "Other", not_listed: "Not listed on transcript" };
export const KIND_LABEL: Record<SchoolKind, string> = { high_school: "High school", college: "College", other: "Other" };
export const CURRICULUM_LABEL: Record<Curriculum, string> = { us: "US", ib: "IB", a_level: "A-level", igcse: "IGCSE", other: "Other" };
export const LEVEL_LABEL: Record<Level, string> = {
  regular: "Regular / standard", accelerated: "Accelerated", advanced: "Advanced", honors: "Honors", high_honors: "High honors", ap: "AP",
  ib_hl: "IB HL", ib_sl: "IB SL", ib: "IB (level unknown)", pre_ib: "Pre-IB", a_level: "A-level / AS / AICE", gcse_igcse: "GCSE / IGCSE",
  college_prep: "College prep", dual_enrollment: "Dual enrollment", enriched: "Enriched", gifted: "Gifted", intensive: "Intensive", regents: "Regents", other: "Other", none: "None / N/A",
};
export const SUBJECT_LABEL: Record<Subject, string> = {
  english: "English", mathematics: "Mathematics", science: "Science", history_social: "History / social science", world_language: "World language",
  arts: "Arts", computer_science: "Computer science", business: "Business", pe_health: "PE / health", career_technical: "Career-technical", other: "Other",
};
export const SUB_SUBJECT_LABEL: Record<string, string> = {
  algebra_1: "Algebra I", geometry: "Geometry", algebra_2: "Algebra II", precalculus: "Precalculus", calculus: "Calculus", statistics: "Statistics",
  biology: "Biology", chemistry: "Chemistry", physics: "Physics", earth_space: "Earth & space", integrated: "Integrated science",
  visual: "Visual arts", music: "Music", theater: "Theater", dance: "Dance", interdisciplinary: "Interdisciplinary arts", other: "Other",
};

export const LIMITS = { schoolName: 200, courseName: 200, grade: 40, notes: 500, credit: 100, short: 100 } as const;

export type Term = { term: TermCode; grade: string; gradeWeighted?: string; status: TermStatus };

export type TranscriptSchool = {
  id: string;
  name: string;
  country: string;
  kind: SchoolKind;
  curriculum: Curriculum;
  defaultScale: GradeScale;
  defaultPeriod: PeriodType;
  firstYear: number | null;
  lastYear: number | null;
  /** The cumulative GPA exactly as printed on the transcript, or empty. */
  printedGpa: string;
  printedGpaScale: string;
  gpaWeighted: boolean | null;
  classRank: string;
  notes: string;
  createdAt: string;
};
export type SchoolInput = Omit<TranscriptSchool, "id" | "createdAt">;

export type TranscriptCourse = {
  id: string;
  schoolId: string;
  /** The calendar year the academic year starts (2025 for 2025-26). */
  academicYear: number;
  gradeLevel: number | null;
  name: string;
  period: PeriodType;
  terms: Term[];
  /** The year/final grade as printed; null when the transcript shows only term grades. */
  finalGrade: string | null;
  scale: GradeScale;
  scaleMax: number | null;
  level: Level;
  credit: number | null;
  creditUnit: CreditUnit;
  subject: Subject;
  subSubject: string | null;
  languageName: string;
  isSummer: boolean;
  isRepeat: boolean;
  isCollege: boolean;
  collegeName: string;
  isWithdrawn: boolean;
  notes: string;
  source: Source;
  overrides: Overrides;
  sortOrder: number;
  createdAt: string;
};
export type CourseInput = Omit<TranscriptCourse, "id" | "createdAt">;

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const newTranscriptId = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const emptySchool = (): SchoolInput => ({
  name: "", country: "", kind: "high_school", curriculum: "us", defaultScale: "letter_plus_minus", defaultPeriod: "semester",
  firstYear: null, lastYear: null, printedGpa: "", printedGpaScale: "", gpaWeighted: null, classRank: "", notes: "",
});

/** The year the current academic year started: Aug-Dec is this calendar year, Jan-Jul is last year. */
const currentAcademicYear = (): number => {
  const d = new Date();
  return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
};

export const emptyCourse = (schoolId: string, school?: Pick<TranscriptSchool, "defaultScale" | "defaultPeriod">): CourseInput => ({
  schoolId, academicYear: currentAcademicYear(), gradeLevel: null, name: "", period: school?.defaultPeriod ?? "semester", terms: [], finalGrade: null,
  scale: school?.defaultScale ?? "letter_plus_minus", scaleMax: null, level: "regular", credit: null, creditUnit: "carnegie", subject: "other", subSubject: null,
  languageName: "", isSummer: false, isRepeat: false, isCollege: false, collegeName: "", isWithdrawn: false, notes: "", source: "manual", overrides: {}, sortOrder: 0,
});

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Reads an optional text field: trimmed, "" when missing, an error when it is not text or is too long. */
function text(v: unknown, max: number, label: string, errors: string[]): string {
  if (v == null) return "";
  // AIs often write grades as bare numbers (95, 4.7); keep them as the text they stand for rather than dropping them.
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  if (typeof v !== "string") {
    errors.push(`${label} must be text.`);
    return "";
  }
  const t = v.trim();
  if (t.length > max) errors.push(`${label} must be ${max} characters or fewer.`);
  return t;
}

/** An optional whole number in [min, max], or null. Accepts numeric strings from form inputs. */
function wholeNumber(v: unknown, min: number, max: number, label: string, errors: string[]): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    errors.push(`${label} must be a whole number from ${min} to ${max}.`);
    return null;
  }
  return n;
}

function choice<T extends string>(list: readonly T[], v: unknown, def: T, label: string, errors: string[]): T {
  if (v == null || v === "") return def;
  if (oneOf(list, v)) return v;
  errors.push(`${label} "${String(v)}" is not one of: ${list.join(", ")}.`);
  return def;
}

export function validateSchool(i: Partial<Record<keyof SchoolInput, unknown>>): Validated<SchoolInput> {
  const errors: string[] = [];
  const name = text(i.name, LIMITS.schoolName, "School name", errors);
  if (!name) errors.push("Enter the school's name.");
  const value: SchoolInput = {
    name,
    country: text(i.country, LIMITS.short, "Country", errors),
    kind: choice(SCHOOL_KINDS, i.kind, "high_school", "School kind", errors),
    curriculum: choice(CURRICULA, i.curriculum, "us", "Curriculum", errors),
    defaultScale: choice(GRADE_SCALES, i.defaultScale, "letter_plus_minus", "Grade scale", errors),
    defaultPeriod: choice(PERIOD_TYPES, i.defaultPeriod, "semester", "Period", errors),
    firstYear: wholeNumber(i.firstYear, 1990, 2100, "First year", errors),
    lastYear: wholeNumber(i.lastYear, 1990, 2100, "Last year", errors),
    printedGpa: text(i.printedGpa, LIMITS.grade, "GPA", errors),
    printedGpaScale: text(i.printedGpaScale, LIMITS.grade, "GPA scale", errors),
    gpaWeighted: typeof i.gpaWeighted === "boolean" ? i.gpaWeighted : null,
    classRank: text(i.classRank, LIMITS.short, "Class rank", errors),
    notes: text(i.notes, LIMITS.notes, "Notes", errors),
  };
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

function terms(v: unknown, period: PeriodType, errors: string[]): Term[] {
  if (v == null) return [];
  if (!Array.isArray(v)) {
    errors.push("Terms must be a list.");
    return [];
  }
  const out: Term[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    const t = (raw ?? {}) as Record<string, unknown>;
    if (!oneOf(TERM_CODES, t.term)) {
      errors.push(`Term "${String(t.term)}" is not one of: ${TERM_CODES.join(", ")}.`);
      continue;
    }
    if (!TERMS_FOR_PERIOD[period].includes(t.term)) errors.push(`Term ${t.term} doesn't belong to a ${period.replace("_", " ")} course.`);
    if (seen.has(t.term)) errors.push(`Term ${t.term} is listed twice.`);
    seen.add(t.term);
    const status = choice(TERM_STATUSES, t.status, "graded", "Term status", errors);
    const grade = text(t.grade, LIMITS.grade, `Grade for ${t.term}`, errors);
    const weighted = text(t.gradeWeighted, LIMITS.grade, `Weighted grade for ${t.term}`, errors);
    out.push(weighted ? { term: t.term, grade, gradeWeighted: weighted, status } : { term: t.term, grade, status });
  }
  return out;
}

function overrides(v: unknown): Overrides {
  const out: Overrides = {};
  if (!v || typeof v !== "object") return out;
  for (const sys of SYSTEM_KEYS) {
    const o = (v as Record<string, unknown>)[sys];
    if (!o || typeof o !== "object") continue;
    const fields: Partial<Record<OverrideField, string>> = {};
    for (const f of OVERRIDE_FIELDS) {
      const val = (o as Record<string, unknown>)[f];
      if (typeof val === "string" && val.trim() && val.length <= LIMITS.short) fields[f] = val.trim();
    }
    if (Object.keys(fields).length) out[sys] = fields;
  }
  return out;
}

export function validateCourse(i: Partial<Record<keyof CourseInput, unknown>>): Validated<CourseInput> {
  const errors: string[] = [];
  const name = text(i.name, LIMITS.courseName, "Course name", errors);
  if (!name) errors.push("Enter the course name.");
  const schoolId = typeof i.schoolId === "string" ? i.schoolId : "";
  if (!schoolId) errors.push("Choose a school.");
  const period = choice(PERIOD_TYPES, i.period, "semester", "Period", errors);
  const subject = choice(SUBJECTS, i.subject, "other", "Subject", errors);
  const sub = typeof i.subSubject === "string" && i.subSubject.trim() ? i.subSubject.trim() : null;
  if (sub && !SUB_SUBJECTS[subject].includes(sub)) errors.push(`Sub-subject "${sub}" doesn't belong to ${subject}.`);
  const academicYear = wholeNumber(i.academicYear, 1990, 2100, "Academic year", errors);
  if (academicYear == null) errors.push("Enter the academic year.");
  let credit: number | null = null;
  if (i.credit != null && i.credit !== "") {
    const n = typeof i.credit === "string" ? Number(i.credit) : i.credit;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > LIMITS.credit) errors.push(`Credit must be a number from 0 to ${LIMITS.credit}.`);
    else credit = n;
  }
  let scaleMax: number | null = null;
  if (i.scaleMax != null && i.scaleMax !== "") {
    const n = typeof i.scaleMax === "string" ? Number(i.scaleMax) : i.scaleMax;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) errors.push("The scale maximum must be a positive number.");
    else scaleMax = n;
  }
  const finalGrade = text(i.finalGrade, LIMITS.grade, "Final grade", errors) || null;
  const value: CourseInput = {
    schoolId,
    academicYear: academicYear ?? 0,
    gradeLevel: wholeNumber(i.gradeLevel, 5, 13, "Grade level", errors),
    name,
    period,
    terms: terms(i.terms, period, errors),
    finalGrade,
    scale: choice(GRADE_SCALES, i.scale, "letter_plus_minus", "Grade scale", errors),
    scaleMax,
    level: choice(LEVELS, i.level, "regular", "Course level", errors),
    credit,
    creditUnit: choice(CREDIT_UNITS, i.creditUnit, "carnegie", "Credit unit", errors),
    subject,
    subSubject: sub,
    languageName: text(i.languageName, LIMITS.short, "Language", errors),
    isSummer: i.isSummer === true,
    isRepeat: i.isRepeat === true,
    isCollege: i.isCollege === true,
    collegeName: text(i.collegeName, LIMITS.schoolName, "College name", errors),
    isWithdrawn: i.isWithdrawn === true,
    notes: text(i.notes, LIMITS.notes, "Notes", errors),
    source: choice(SOURCES, i.source, "manual", "Source", errors),
    overrides: overrides(i.overrides),
    sortOrder: wholeNumber(i.sortOrder, 0, 100000, "Sort order", errors) ?? 0,
  };
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/** in_progress if any term is; planned if there are terms and every one is planned; otherwise graded. */
export function courseStatus(c: Pick<CourseInput, "terms" | "finalGrade">): "graded" | "in_progress" | "planned" {
  if (c.terms.some((t) => t.status === "in_progress")) return "in_progress";
  if (c.terms.length > 0 && c.terms.every((t) => t.status === "planned")) return "planned";
  return "graded";
}

export const normalizeName = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** Identity of a course for de-duplication: the same school, year, name and period are the same course. */
export const courseKey = (schoolName: string, c: Pick<CourseInput, "academicYear" | "name" | "period"> & Partial<Pick<CourseInput, "isSummer" | "isRepeat">>): string =>
  [normalizeName(schoolName), c.academicYear, normalizeName(c.name), c.period, c.isSummer ? "summer" : "", c.isRepeat ? "repeat" : ""].join("|");

type Data = { schools: TranscriptSchool[]; courses: TranscriptCourse[] };

/**
 * Merges what was saved on this device (local) into the account (remote) on first sign-in. Remote wins on id and on
 * course key; local-only items come back in toInsert* with their school remapped onto the remote school of the same name.
 */
export function mergeTranscripts(local: Data, remote: Data): Data & { toInsertSchools: TranscriptSchool[]; toInsertCourses: TranscriptCourse[] } {
  const schools = [...remote.schools];
  const courses = [...remote.courses];
  const toInsertSchools: TranscriptSchool[] = [];
  const toInsertCourses: TranscriptCourse[] = [];
  const remap = new Map<string, string>();
  for (const s of local.schools) {
    if (schools.some((r) => r.id === s.id)) continue;
    const same = schools.find((r) => normalizeName(r.name) === normalizeName(s.name));
    if (same) {
      remap.set(s.id, same.id);
      continue;
    }
    schools.push(s);
    toInsertSchools.push(s);
  }
  const nameOf = (id: string) => schools.find((s) => s.id === id)?.name ?? "";
  const keys = new Set(courses.map((c) => courseKey(nameOf(c.schoolId), c)));
  for (const c of local.courses) {
    if (courses.some((r) => r.id === c.id)) continue;
    const schoolId = remap.get(c.schoolId) ?? c.schoolId;
    const key = courseKey(nameOf(schoolId), c);
    if (keys.has(key)) continue;
    keys.add(key);
    const next = { ...c, schoolId };
    courses.push(next);
    toInsertCourses.push(next);
  }
  return { schools, courses, toInsertSchools, toInsertCourses };
}
