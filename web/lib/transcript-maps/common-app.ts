// Common App "Courses & Grades" (first-year). Levels and schedule values are from Common App's Academic Record
// Reporting deck (Nov 2025). The Subject and Grading Scale dropdowns are NOT public, so those stay unverified.
import { LEVELS, PERIOD_TYPES, SUBJECTS } from "../transcript.ts";
import { none, table, unverified, verified, type SystemMap } from "./types.ts";

const DECK = "https://www.commonapp.org/files/webinar_decks/Academic-Record-Reporting.pdf";
const IB = verified("International Baccalaureate (IB)", DECK, "Common App does not distinguish HL and SL");
const NA = verified("N/A", DECK);

const SUBJECT_NOTE = "Common App's Subject dropdown could not be verified from public pages";

export const COMMON_APP_MAP: SystemMap = {
  id: "common_app",
  label: "Common App",
  level: table(
    LEVELS,
    {
      regular: verified("Regular/Standard", DECK),
      accelerated: verified("Accelerated", DECK),
      advanced: verified("Advanced", DECK),
      honors: verified("Honors", DECK),
      high_honors: verified("High Honors", DECK),
      ap: verified("Advanced Placement (AP)", DECK),
      ib_hl: IB,
      ib_sl: IB,
      ib: IB,
      pre_ib: verified("Pre-IB", DECK),
      a_level: unverified("AS/A-level/International A-level, Cambridge AICE", "The deck prints this on two lines; it may be two separate options", DECK),
      gcse_igcse: unverified("GCSE, IGCSE", "The deck prints this on two lines; it may be two separate options", DECK),
      college_prep: verified("College Prep", DECK),
      dual_enrollment: verified("Dual Enrollment", DECK),
      enriched: verified("Enriched", DECK),
      gifted: verified("Gifted", DECK),
      intensive: verified("Intensive", DECK),
      regents: verified("Regents", DECK),
      other: NA,
      none: NA,
    },
    unverified(null),
  ),
  subject: table(
    SUBJECTS,
    {
      english: unverified("English", SUBJECT_NOTE),
      mathematics: unverified("Mathematics", SUBJECT_NOTE),
      science: unverified("Science", SUBJECT_NOTE),
      history_social: unverified("History/Social Science", SUBJECT_NOTE),
      world_language: unverified("Foreign Language", SUBJECT_NOTE),
      arts: unverified("Arts", SUBJECT_NOTE),
      computer_science: unverified("Computer Science", SUBJECT_NOTE),
      business: unverified("Business", SUBJECT_NOTE),
      pe_health: unverified("Physical Education", SUBJECT_NOTE),
    },
    unverified(null, SUBJECT_NOTE),
  ),
  subSubject: () => none("Common App's Subject list has no documented sub-subject"),
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
