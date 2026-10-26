// UT Austin "Academic Coursework Entry Form" (MyStatus), required only for applicants from non-Texas high schools.
// UT's FAQ names five principal areas plus an optional Other; the form's own dropdown strings, levels and terms are behind a login.
import { LEVELS, PERIOD_TYPES, SUBJECTS } from "../transcript.ts";
import { none, table, unverified, verified, type SystemMap } from "./types.ts";

const FAQ = "https://admissions.utexas.edu/apply/frequently-asked-questions/";

export const UT_SUBJECTS = ["English", "Mathematics", "Science", "Social Studies", "Language Other Than English", "Other"] as const;

export const UT_MAP: SystemMap = {
  id: "ut",
  label: "UT Austin",
  level: table(LEVELS, {}, unverified(null, "UT's form levels are behind a login", FAQ)),
  subject: table(
    SUBJECTS,
    {
      english: verified("English", FAQ),
      mathematics: verified("Mathematics", FAQ),
      science: verified("Science", FAQ),
      history_social: verified("Social Studies", FAQ),
      world_language: verified("Language Other Than English", FAQ),
    },
    verified("Other", FAQ, "Other coursework is optional"),
  ),
  subjectList: { options: UT_SUBJECTS, verified: true, note: "Five principal areas; \"Other\" coursework is optional." },
  subSubject: () => none("UT's form has no documented sub-category"),
  period: table(PERIOD_TYPES, {}, unverified(null, "UT's term options are behind a login", FAQ)),
  rules: (_school, course) => {
    const out: string[] = [];
    if (course.terms.some((t) => t.status === "in_progress" || t.status === "planned")) out.push("UT's form takes completed courses only; leave in-progress and planned courses out.");
    if (course.isSummer) out.push("Enter summer courses under the grade level before or after.");
    if (course.credit == null) out.push("If the transcript shows no credit, UT counts a year-long course as 1 credit and a semester course as 0.5.");
    return out;
  },
};
