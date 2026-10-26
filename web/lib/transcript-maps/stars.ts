// STARS (Self-reported Transcript and Academic Record System, formerly SRAR/SSAR). Subject areas and course
// lengths are exact values from STARS's own help center; the full Course Level list and the Generic Course Title
// lists were not retrievable, so those stay unverified.
import { LEVELS, PERIOD_TYPES, SUBJECTS } from "../transcript.ts";
import { table, unverified, verified, type SystemMap } from "./types.ts";

const HELP = "https://starsrecord.zendesk.com/hc/en-us/articles";
const SUBJECT_SRC = `${HELP}/37027194180251`;
const LEVEL_SRC = `${HELP}/37036006202523`;
const LENGTH_SRC = `${HELP}/37036235354779`;
const IB = verified("International Baccalaureate (IB)", LEVEL_SRC);
const OTHER_LEVEL = unverified(null, "STARS's full Course Level dropdown could not be retrieved", LEVEL_SRC);

export const STARS_MAP: SystemMap = {
  id: "stars",
  label: "STARS",
  level: table(
    LEVELS,
    {
      regular: verified("Standard", LEVEL_SRC, "The default when no other level applies"),
      honors: verified("Honors", LEVEL_SRC),
      ap: verified("Advanced Placement (AP)", LEVEL_SRC),
      ib_hl: IB,
      ib_sl: IB,
      ib: IB,
      dual_enrollment: verified("Dual Enrollment", LEVEL_SRC, "Needs the college name"),
      college_prep: verified("College Prep", LEVEL_SRC),
      regents: verified("Regents", LEVEL_SRC),
      gifted: verified("Gifted and Talented", LEVEL_SRC),
      other: unverified("Standard", "Assumed; STARS's full list could not be retrieved", LEVEL_SRC),
      none: unverified("Standard", "Assumed; STARS's full list could not be retrieved", LEVEL_SRC),
    },
    OTHER_LEVEL,
  ),
  subject: table(
    SUBJECTS,
    {
      english: verified("English", SUBJECT_SRC),
      mathematics: verified("Mathematics", SUBJECT_SRC),
      science: verified("Science", SUBJECT_SRC),
      history_social: verified("History / Social Studies", SUBJECT_SRC),
      world_language: verified("World Language", SUBJECT_SRC),
      arts: verified("Fine Arts / Music", SUBJECT_SRC),
      computer_science: verified("Computer Science", SUBJECT_SRC),
      business: verified("Business", SUBJECT_SRC),
      pe_health: verified("Physical Education / Health / Gym", SUBJECT_SRC),
      career_technical: unverified("Other Subject Area", "No career-technical area exists in STARS's list", SUBJECT_SRC),
      other: unverified("Other Subject Area", undefined, SUBJECT_SRC),
    },
    unverified(null),
  ),
  subjectList: {
    options: [
      "English", "Mathematics", "Science", "History / Social Studies", "World Language", "Business", "Computer Science",
      "Fine Arts / Music", "Physical Education / Health / Gym", "Other Subject Area",
    ],
    verified: true,
    note: "Psychology and economics go under History / Social Studies. Music, band, choir, art, dance and theater are all \"Fine Arts / Music\". STARS also asks for a Generic Course Title under each subject; those lists are not published.",
  },
  subSubject: () => unverified(null, "STARS's Generic Course Title lists could not be retrieved", SUBJECT_SRC),
  period: table(
    PERIOD_TYPES,
    {
      full_year: verified("Full Year", LENGTH_SRC),
      semester: verified("Semester", LENGTH_SRC),
      trimester: verified("Trimester", LENGTH_SRC),
      quarter: verified("Quarterly", LENGTH_SRC),
    },
    unverified(null),
  ),
  rules: (_school, course) => {
    const out: string[] = [];
    if (course.terms.some((t) => t.gradeWeighted)) out.push("STARS wants the unweighted grade when both are printed.");
    if (course.terms.some((t) => t.status === "in_progress")) out.push("Enter IP (In Progress) for courses without a final grade.");
    return out;
  },
};
