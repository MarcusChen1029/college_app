// UIUC Self-Reported Academic Record (SRAR in myIllini). Subject values are the ones UIUC's own help pages show on course cards
// (screenshots, 2026-05); the open dropdown was never shown, so the list may hold more. UIUC's SRAR has no credit field and no
// sub-category; arts, computer science and PE all go under "Other".
import { LEVELS, PERIOD_TYPES, SUBJECTS } from "../transcript.ts";
import { none, table, unverified, verified, type SystemMap } from "./types.ts";

const HELP = "https://www.admissions.illinois.edu/international-baccalaureate-application-help/";
const SRC = HELP;
const OTHER_NOTE = "UIUC has no Fine Arts, Computer Science or PE subject; they go under Other";

export const UIUC_SUBJECTS = ["English", "Mathematics", "Science", "Social Science", "Language Other Than English", "Other"] as const;

export const UIUC_MAP: SystemMap = {
  id: "uiuc",
  label: "UIUC SRAR",
  level: table(
    LEVELS,
    {
      regular: verified("Regular", SRC),
      advanced: verified("Advanced", SRC),
      enriched: verified("Enriched", SRC),
      ap: unverified("AP", "Shown as \"AP\" / \"AP Course\" on a low-resolution screenshot", SRC),
      ib_hl: verified("IB HL", SRC),
      ib_sl: verified("IB SL", SRC),
      honors: unverified("Honors", "UIUC's tutorial mentions honors; not seen on an official screenshot", SRC),
      none: none("Leave Type empty unless the transcript lists one"),
    },
    unverified(null, "UIUC's full Type list is not published; choose a Type only if the transcript lists it", SRC),
  ),
  subject: table(
    SUBJECTS,
    {
      english: verified("English", SRC),
      mathematics: verified("Mathematics", SRC),
      science: verified("Science", SRC),
      history_social: verified("Social Science", SRC),
      world_language: verified("Language Other Than English", SRC),
      arts: verified("Other", SRC, OTHER_NOTE),
      computer_science: verified("Other", SRC, OTHER_NOTE),
      pe_health: verified("Other", SRC, OTHER_NOTE),
      career_technical: verified("Other", SRC, OTHER_NOTE),
      business: unverified("Other", "Business may be Social Science or Other", SRC),
      other: verified("Other", SRC),
    },
    unverified(null),
  ),
  subjectList: { options: UIUC_SUBJECTS, verified: true, note: "Arts, computer science, PE and everything that is not one of the five core subjects are \"Other\"." },
  subSubject: () => none("UIUC has no sub-category"),
  period: table(
    PERIOD_TYPES,
    {
      full_year: verified("All Year", SRC),
      semester: verified("1st Semester / 2nd Semester", SRC, "Enter one row per semester"),
      trimester: unverified(null, "Trimester labels are not published; enter one row per trimester", SRC),
      quarter: unverified(null, "Quarter labels are not published; enter one row per quarter", SRC),
    },
    unverified(null),
  ),
  noCredit: "UIUC's SRAR has no credit field",
  rules: (_school, course) => {
    const out: string[] = [];
    if (course.terms.length > 0 && course.finalGrade) out.push("UIUC wants every semester, trimester or quarter grade listed separately; do not list a final grade.");
    if (course.terms.some((t) => t.status === "in_progress")) out.push("Enter IP (In Progress) for senior-year courses without a grade.");
    if (course.isRepeat) out.push("Tick Repeated Course.");
    return out;
  },
};
