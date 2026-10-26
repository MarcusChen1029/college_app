// University of California Academic History (fall 2027 entry). Honors codes, A-G areas, grade rules and the IP/PL/NO
// codes are from UC's Quick Reference Guide (Aug 2026) and counselor conference decks. Exact dropdown strings for
// term and grading systems are only in secondary sources, so those stay unverified.
import { LEVELS, PERIOD_TYPES, SUBJECTS, type Term } from "../transcript.ts";
import { none, table, unverified, verified, type SystemMap } from "./types.ts";
import { ucDisciplineLabels } from "./uc-lists.ts";

const QRG = "https://admission.universityofcalifornia.edu/counselors/_files/documents/quick-reference-guide-to-uc-admissions.pdf";
const LIVE = "https://apply.universityofcalifornia.edu/my-application/";
const DAVIS = "https://www.ucdavis.edu/admissions/undergraduate/first-year/application-tips";
const IB = verified("IB", QRG);
const NH_NOTE = "Flag UC-approved honors courses only";
const NOT_AG = "Not an A-G subject; it may go under Other coursework in Activities & awards";

const LETTER_SIGN = /^([A-F])[+-]$/i;
const PASS_FAIL = /^(p|np|cr|nc|pass|fail|credit|no credit)$/i;
const allGrades = (c: { terms: Term[]; finalGrade: string | null }) => [...c.terms.map((t) => t.grade), c.finalGrade ?? ""].filter(Boolean);

export const UC_MAP: SystemMap = {
  id: "uc",
  label: "UC",
  level: table(
    LEVELS,
    {
      ap: verified("AP", QRG),
      ib_hl: IB,
      ib_sl: IB,
      ib: IB,
      honors: unverified("HL", "Only if the course is on the school's UC-approved honors list", QRG),
      dual_enrollment: verified("CL", DAVIS, "College course: enter it under Colleges attended"),
      high_honors: unverified("NH", NH_NOTE, QRG),
      advanced: unverified("NH", NH_NOTE, QRG),
      accelerated: unverified("NH", NH_NOTE, QRG),
      a_level: unverified("NH", "UC gives honors weight only to AP and IB for non-California students", QRG),
    },
    verified("NH", QRG, "Not honors"),
  ),
  // UC's "Subject Area/Course Category" is a course category, not an A-G letter (read live 2026-10-27). It follows from our sub-category
  // where that is one-to-one (subjectFor); otherwise it is left for the student or the AI tag.
  subject: table(
    SUBJECTS,
    {
      english: verified("English", LIVE),
      history_social: unverified(null, "U.S. History, Civics/American Government or World History/Cultures/Hist. Geography: depends on the course", LIVE),
      world_language: unverified(null, "\"Yr 1-4+ Lang Other Than English\" by year of study", LIVE),
      computer_science: unverified(null, "Computer Science is under Mathematics or Science, depending on the school", LIVE),
      other: unverified(null, "A College-Prep Elective category, depending on the course", LIVE),
      business: none(NOT_AG),
      pe_health: none(NOT_AG),
      career_technical: none(NOT_AG),
    },
    unverified(null, "Depends on the course", LIVE),
  ),
  subjectFor: (subject, sub) => {
    const m: Record<string, Record<string, string>> = {
      mathematics: { algebra_1: "Algebra I", geometry: "Geometry", algebra_2: "Algebra II", precalculus: "Pre-Calculus", calculus: "Calculus", statistics: "Statistics" },
      science: { biology: "Biology/Life Sciences", chemistry: "Chemistry", physics: "Physics", earth_space: "Earth and Space Sciences" },
      arts: { visual: "Visual Arts", music: "Music", theater: "Theater", dance: "Dance", interdisciplinary: "Interdisciplinary Arts" },
    };
    if (!m[subject]) return null;
    const v = sub ? m[subject]![sub] : undefined;
    return v ? verified(v, LIVE) : unverified(null, "Depends on the course", LIVE);
  },
  subjectList: {
    // UC's own "Subject Area/Course Category" options (read live 2026-10-27); a tag here becomes the course's UC subject.
    options: ucDisciplineLabels(),
    verified: true,
    note: "Pick UC's own course category. A language course is \"Yr N Lang Other Than English\" by its year of study; Computer Science counts under Mathematics or Science, so say which. PE, business and career-technical courses are not A-G: leave them out for UC.",
  },
  subSubject: (subject, sub) => {
    const POLICY = "A discipline in UC's policy; the application may not ask for it";
    if (subject === "arts") {
      const d: Record<string, string> = { visual: "Visual Arts", music: "Music", theater: "Theater", dance: "Dance", interdisciplinary: "Interdisciplinary Arts" };
      return sub && d[sub] ? verified(d[sub], QRG, POLICY) : none();
    }
    if (subject === "mathematics") {
      const d: Record<string, string> = { algebra_1: "Algebra I or Math I", geometry: "Geometry or Math II", algebra_2: "Algebra II or Math III", precalculus: "Precalculus", calculus: "Calculus" };
      return sub && d[sub] ? verified(d[sub], QRG, POLICY) : unverified("Other Advanced Math", POLICY, QRG);
    }
    if (subject === "science") {
      const d: Record<string, string> = { biology: "Biology/Life Sciences", chemistry: "Chemistry", physics: "Physics", earth_space: "Earth & Space Sciences", integrated: "Integrated Science" };
      return sub && d[sub] ? verified(d[sub], QRG, POLICY) : unverified(null, POLICY, QRG);
    }
    return none();
  },
  period: table(
    PERIOD_TYPES,
    { full_year: unverified("Full year"), semester: unverified("Semester"), trimester: unverified("Trimester"), quarter: unverified("Quarter") },
    unverified(null),
  ),
  termGrade: (t) => (t.status === "in_progress" ? "IP" : t.status === "planned" ? "PL" : t.status === "none" ? "NO" : t.grade.replace(LETTER_SIGN, "$1")),
  noCredit: "UC has no per-course credit field",
  rules: (_school, course) => {
    const out: string[] = [];
    const grades = allGrades(course);
    if (grades.some((g) => LETTER_SIGN.test(g))) out.push("UC ignores + and -: a B+ is entered as B.");
    if (course.scale === "pass_fail" || grades.some((g) => PASS_FAIL.test(g))) out.push("UC does not accept Pass/Fail grades for A-G courses.");
    if (course.isCollege) out.push("Enter this under Colleges attended, not in the high school section.");
    if (course.isSummer) out.push("Tick the summer box for this grade level.");
    if (course.subject === "pe_health" || course.subject === "career_technical" || course.subject === "business") out.push("Not reportable as A-G; it may go under Other coursework in Activities & awards.");
    if (course.isRepeat) out.push("Report both the original course and the repeat.");
    return out;
  },
};
