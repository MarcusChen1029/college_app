// Common App "Courses & Grades" (first-year). Levels, schedules, credits and the 20-option Subject list are from Common App's own 2026-27
// data catalogs (linked from the Data-catalogs support article). Only the Grading Scale dropdown labels are still unpublished.
import { LEVELS, PERIOD_TYPES, SUBJECTS, type Subject } from "../transcript.ts";
import { none, table, unverified, verified, type MapEntry, type SystemMap } from "./types.ts";

const DECK = "https://www.commonapp.org/files/webinar_decks/Academic-Record-Reporting.pdf";
const CATALOG = "https://appsupport.commonapp.org/applicantsupport/s/article/Data-catalogs";
const IB = verified("International Baccalaureate (IB)", CATALOG, "Common App does not distinguish HL and SL");
const NA = verified("N/A", CATALOG);

/** The Subject dropdown, in Common App's own order. One flat list: no sub-categories. */
export const COMMON_APP_SUBJECTS = [
  "Pre-Algebra", "Algebra", "Geometry", "Trigonometry", "Pre-Calculus", "Calculus", "Math (Other)",
  "Biology", "Chemistry", "Physics", "Earth/Environmental Science", "Science (Other)",
  "English", "History/Social Science", "Foreign/World Language", "Physical Education/Health", "Art (Visual or Performing)",
  "Computer Science", "Religion", "Other/Elective",
] as const;

const S = (value: string, note?: string): MapEntry => verified(value, CATALOG, note);
const MATH: Record<string, string> = { pre_algebra: "Pre-Algebra", algebra_1: "Algebra", algebra_2: "Algebra", geometry: "Geometry", trigonometry: "Trigonometry", precalculus: "Pre-Calculus", calculus: "Calculus" };
const SCIENCE: Record<string, string> = { biology: "Biology", chemistry: "Chemistry", physics: "Physics", earth_space: "Earth/Environmental Science" };

export const COMMON_APP_MAP: SystemMap = {
  id: "common_app",
  label: "Common App",
  level: table(
    LEVELS,
    {
      regular: verified("Regular/Standard", CATALOG),
      accelerated: verified("Accelerated", CATALOG),
      advanced: verified("Advanced", CATALOG),
      honors: verified("Honors", CATALOG),
      high_honors: verified("High Honors", CATALOG),
      ap: verified("Advanced Placement (AP)", CATALOG),
      ib_hl: IB,
      ib_sl: IB,
      ib: IB,
      pre_ib: verified("Pre-IB", CATALOG),
      a_level: verified("AS/A-level/International A-level, Cambridge AICE", CATALOG, "One option"),
      gcse_igcse: verified("GCSE, IGCSE", CATALOG, "One option"),
      college_prep: verified("College Prep", CATALOG),
      dual_enrollment: verified("Dual Enrollment", CATALOG),
      enriched: verified("Enriched", CATALOG),
      gifted: verified("Gifted", CATALOG),
      intensive: verified("Intensive", CATALOG),
      regents: verified("Regents", CATALOG),
      other: NA,
      none: NA,
    },
    unverified(null),
  ),
  subject: table(
    SUBJECTS,
    {
      english: S("English"),
      mathematics: S("Math (Other)", "Common App splits math by course; pick the sub-subject to get Algebra, Geometry, Calculus ..."),
      science: S("Science (Other)", "Common App splits science by course; pick the sub-subject to get Biology, Chemistry, Physics ..."),
      history_social: S("History/Social Science"),
      world_language: S("Foreign/World Language"),
      arts: S("Art (Visual or Performing)", "One option for visual art, music, dance and theater"),
      computer_science: S("Computer Science"),
      pe_health: S("Physical Education/Health"),
      business: S("Other/Elective"),
      career_technical: S("Other/Elective"),
      other: S("Other/Elective"),
    },
    S("Other/Elective"),
  ),
  subjectFor: (subject: Subject, sub: string | null) => {
    if (subject === "mathematics") return S(sub ? MATH[sub] ?? "Math (Other)" : "Math (Other)");
    if (subject === "science") return S(sub ? SCIENCE[sub] ?? "Science (Other)" : "Science (Other)");
    return null;
  },
  subjectList: {
    options: COMMON_APP_SUBJECTS,
    verified: true,
    note: "One flat list with no sub-categories: music, dance, theater and visual art are all \"Art (Visual or Performing)\". Math and science are split by course, each with an \"(Other)\" option. Business, career-technical and anything else that is not listed go in \"Other/Elective\"; religion has its own option.",
  },
  subSubject: () => none("Common App's Subject list has no sub-category"),
  period: table(
    PERIOD_TYPES,
    {
      semester: verified("Semester", DECK),
      trimester: verified("Trimester", DECK),
      quarter: verified("Quarterly", DECK),
      full_year: verified("Yearly", DECK),
    },
    unverified(null),
  ),
  rules: (_school, course) => {
    const out: string[] = [];
    const graded = course.terms.some((t) => t.status === "graded" && t.grade);
    if (!graded && !course.finalGrade) out.push("Common App needs at least one grade for each course; leave a term blank only if the transcript shows none.");
    if (course.credit == null && course.creditUnit !== "not_listed") out.push("Common App needs at least one credit for each course; tick N/A if the transcript lists no credit.");
    if (!course.terms.length && course.finalGrade) out.push("Enter the term grades if the transcript shows them; Common App wants one grade per term.");
    return out;
  },
};
