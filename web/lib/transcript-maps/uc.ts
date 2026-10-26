// University of California Academic History (fall 2027 entry). Honors codes, A-G areas, grade rules and the IP/PL/NO
// codes are from UC's Quick Reference Guide (Aug 2026) and counselor conference decks. Exact dropdown strings for
// term and grading systems are only in secondary sources, so those stay unverified.
import { LEVELS, PERIOD_TYPES, SUBJECTS, type Term } from "../transcript.ts";
import { none, table, unverified, verified, type SystemMap } from "./types.ts";

const QRG = "https://admission.universityofcalifornia.edu/counselors/_files/documents/quick-reference-guide-to-uc-admissions.pdf";
const DAVIS = "https://www.ucdavis.edu/admissions/undergraduate/first-year/application-tips";
const IB = verified("IB", QRG);
const NH_NOTE = "Flag UC-approved honors courses only";
const NOT_AG = "Not an A-G subject; it may go under Other coursework in Activities & awards";
const WORDING = "UC's A-G area names are official, but the exact dropdown wording is not published";
const area = (value: string, note?: string) => unverified(value, note ? `${WORDING}. ${note}` : WORDING, QRG);

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
  subject: table(
    SUBJECTS,
    {
      history_social: area("A – History / social science"),
      english: area("B – English"),
      mathematics: area("C – Mathematics"),
      science: area("D – Science"),
      world_language: area("E – Language other than English"),
      arts: area("F – Visual and performing arts"),
      computer_science: area("G – College-preparatory elective", "Computer science may count under C or D when the school lists it there"),
      other: area("G – College-preparatory elective"),
      business: none(NOT_AG),
      pe_health: none(NOT_AG),
      career_technical: none(NOT_AG),
    },
    unverified(null),
  ),
  subjectList: {
    options: [
      "A – History / social science", "B – English", "C – Mathematics", "D – Science", "E – Language other than English",
      "F – Visual and performing arts", "G – College-preparatory elective",
    ],
    verified: false,
    note: "These are UC's A-G area names; the exact dropdown wording is not published. For visual and performing arts UC's disciplines are Dance, Music, Theater, Visual Arts and Interdisciplinary Arts; for science: Biology/Life Sciences, Chemistry, Physics, Earth & Space Sciences, Integrated Science. PE, business and career-technical courses are not A-G subjects.",
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
