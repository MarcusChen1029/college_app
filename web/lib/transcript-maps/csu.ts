// Cal State Apply (CSU), High School Coursework. Course types, Term Type options and A-G area names were read on a live Cal State Apply
// test account (2026-10-27, docs/superpowers/research/2026-10-27-portal-dom.md §2); the help center and the Freshman Application Guide agree.
import { LEVELS, PERIOD_TYPES, SUBJECTS } from "../transcript.ts";
import { isNonUs, none, table, unverified, verified, type SystemMap } from "./types.ts";

const HELP = "https://help.liaisonedu.com/Cal_State_Apply_Applicant_Help_Center/Filling_Out_Your_Cal_State_Apply_Application/Cal_State_Apply_Academic_History";
const COURSEWORK = `${HELP}/03_High_School_Coursework`;
const AG = `${HELP}/07_A-G_Matching`;
const GUIDE = "https://www.calstate.edu/apply/freshman/Documents/cal-state-apply-freshman-application-guide.pdf";
const LIVE = "https://calstate.cas.myliaison.com/applicant/my-application";
const IB = verified("International Baccalaureate", COURSEWORK);

export const CSU_MAP: SystemMap = {
  id: "csu",
  label: "Cal State Apply",
  level: table(
    LEVELS,
    {
      ap: verified("Advanced Placement", COURSEWORK, "+1 GPA point"),
      ib_hl: IB,
      ib_sl: IB,
      ib: IB,
      honors: verified("Honors", COURSEWORK, "Only CSU-approved honors courses get the +1 point"),
      high_honors: unverified("Honors", "Only CSU-approved honors courses get the +1 point", COURSEWORK),
    },
    verified("None", COURSEWORK, "Course Type None (standard)"),
  ),
  subject: table(
    SUBJECTS,
    {
      history_social: verified("A – History / Social Science", LIVE),
      english: verified("B – English", LIVE),
      mathematics: verified("C – Mathematics", LIVE),
      science: unverified(null, "Choose D1 (biological) or D2 (physical) science", GUIDE),
      world_language: verified("E – Language Other than English", LIVE),
      arts: verified("F – Visual & Performing Arts", LIVE),
      computer_science: unverified("G – College-Preparatory Elective", "Computer science may count under another area", AG),
      business: unverified("G – College-Preparatory Elective", "Only A-G approved courses count", AG),
      pe_health: unverified("G – College-Preparatory Elective", "Only A-G approved courses count", AG),
      career_technical: unverified("G – College-Preparatory Elective", "Only A-G approved courses count", AG),
      other: verified("G – College-Preparatory Elective", LIVE),
    },
    unverified(null),
  ),
  subjectFor: (subject, sub) => {
    if (subject !== "science") return null;
    if (sub === "biology") return verified("D1 – Biological Science", LIVE);
    if (sub === "chemistry" || sub === "physics") return verified("D2 – Physical Science", LIVE);
    if (sub === "earth_space") return unverified("D2 – Physical Science", "Earth and space science may be matched differently", GUIDE);
    return unverified(null, "Choose D1 (biological) or D2 (physical) science", GUIDE);
  },
  subjectList: {
    options: [
      "A – History / Social Science", "B – English", "C – Mathematics", "D1 – Biological Science", "D2 – Physical Science",
      "E – Language Other than English", "F – Visual & Performing Arts", "G – College-Preparatory Elective",
    ],
    verified: true,
    note: "Biology and life science are D1; chemistry, physics and earth science are D2. Music, art, dance and theater are all F. Anything else that counts is G.",
  },
  subSubject: () => none("Cal State Apply has no sub-category under an A-G area"),
  period: table(
    PERIOD_TYPES,
    { full_year: verified("Full Year", LIVE), semester: verified("Semester", LIVE), trimester: verified("Trimester", LIVE), quarter: verified("Quarter", LIVE) },
    unverified(null),
  ),
  rules: (school, course) => {
    const out: string[] = [];
    if (isNonUs(school)) out.push("Applicants who attended only foreign high schools skip course entry on Cal State Apply; type grades as printed if you do enter them.");
    if (school.kind === "college" || course.isCollege) out.push("College courses go in the College Coursework section, not High School Coursework.");
    if (course.terms.some((t) => t.gradeWeighted)) out.push("Enter the grade shown on the transcript; Cal State Apply computes its own GPA.");
    if (course.terms.some((t) => t.status === "in_progress" || t.status === "planned")) out.push("Mark in-progress terms In Progress and later terms Planned.");
    if (course.isRepeat) out.push("Report only the highest grade for a repeated course.");
    return out;
  },
};
