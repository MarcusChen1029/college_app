// Cal State Apply (CSU), High School Coursework. Course types and the C, D, E, G area names are from Liaison's
// Cal State Apply help center; the A, B and F area names and the term-system wording are not on the pages researched.
import { LEVELS, PERIOD_TYPES, SUBJECTS } from "../transcript.ts";
import { isNonUs, none, table, unverified, verified, type SystemMap } from "./types.ts";

const HELP = "https://help.liaisonedu.com/Cal_State_Apply_Applicant_Help_Center/Filling_Out_Your_Cal_State_Apply_Application/Cal_State_Apply_Academic_History";
const COURSEWORK = `${HELP}/03_High_School_Coursework`;
const AG = `${HELP}/07_A-G_Matching`;
const AREA_NOTE = "This area's name was not on the Cal State Apply pages researched";
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
      history_social: unverified("A – History / Social Science", AREA_NOTE, AG),
      english: unverified("B – English", AREA_NOTE, AG),
      mathematics: verified("C – Mathematics", AG),
      science: verified("D – Science (D1 Biological, D2 Physical)", AG),
      world_language: verified("E – Language Other Than English (LOTE)", AG),
      arts: unverified("F – Visual and Performing Arts", AREA_NOTE, AG),
      computer_science: unverified("G – College-Preparatory Elective", "Computer science may count under another area", AG),
      business: unverified("G – College-Preparatory Elective", "Only A-G approved courses count", AG),
      pe_health: unverified("G – College-Preparatory Elective", "Only A-G approved courses count", AG),
      career_technical: unverified("G – College-Preparatory Elective", "Only A-G approved courses count", AG),
      other: verified("G – College-Preparatory Elective", AG),
    },
    unverified(null),
  ),
  subSubject: (subject, sub) => {
    if (subject !== "science") return none();
    if (sub === "biology") return verified("D1 – Biological Science", AG);
    if (sub === "chemistry" || sub === "physics") return verified("D2 – Physical Science", AG);
    if (sub === "earth_space") return unverified("D2 – Physical Science", "Earth and space science may be matched differently", AG);
    return unverified(null, "Choose D1 or D2 when matching", AG);
  },
  period: table(
    PERIOD_TYPES,
    { full_year: unverified("Year"), semester: unverified("Semester"), trimester: unverified("Trimester"), quarter: unverified("Quarter") },
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
