// UIUC Self-Reported Academic Record (SRAR in myIllini). The Subject and Type dropdowns were read live on the SRAR courses page on
// 2026-10-28 (docs/superpowers/research/2026-10-27-portal-dom.md §5): seven subjects (Technical included) and the full Type list.
// UIUC's SRAR has no credit field and no sub-category; arts, PE and health go under "Other".
import { LEVELS, PERIOD_TYPES, SUBJECTS } from "../transcript.ts";
import { none, table, unverified, verified, type SystemMap } from "./types.ts";

const HELP = "https://www.admissions.illinois.edu/international-baccalaureate-application-help/";
const SRC = HELP;
/** The SRAR courses page itself (behind the myIllini sign-in); what it showed is recorded in portal-dom.md §5. */
const LIVE = "https://myillini.illinois.edu/Apply/Application/FreshmanSRAR";
const LIVE_NOTE = "seen on the live SRAR page 2026-10-28 (docs/superpowers/research/2026-10-27-portal-dom.md §5)";
const OTHER_NOTE = "UIUC has no Fine Arts or PE subject; Religion, Art, Music, Dance, PE, Driver's Ed, Health and Consumer Education go under Other";
const TECH_NOTE = "Technical = Drafting, Engineering, Information Processing, PLTW, Graphic Design, CAD, Web Design (UIUC's help on the page); other career courses are Other";

export const UIUC_SUBJECTS = ["English", "Mathematics", "Science", "Social Science", "Language Other Than English", "Other", "Technical"] as const;

export const UIUC_MAP: SystemMap = {
  id: "uiuc",
  label: "UIUC SRAR",
  level: table(
    LEVELS,
    {
      regular: verified("Regular", LIVE, LIVE_NOTE),
      accelerated: verified("Accelerated", LIVE, LIVE_NOTE),
      advanced: verified("Advanced", LIVE, LIVE_NOTE),
      enriched: verified("Enriched", LIVE, LIVE_NOTE),
      gifted: verified("Gifted", LIVE, LIVE_NOTE),
      college_prep: verified("College Prep", LIVE, LIVE_NOTE),
      ap: verified("AP Course", LIVE, LIVE_NOTE),
      ib_hl: verified("IB HL", LIVE, LIVE_NOTE),
      ib_sl: verified("IB SL", LIVE, LIVE_NOTE),
      honors: verified("Honors", LIVE, LIVE_NOTE),
      high_honors: verified("High Honors", LIVE, LIVE_NOTE),
      none: none("Leave Type as Regular unless the transcript lists one"),
    },
    unverified(null, "UIUC's Type list has no exact match for this level; Regular unless the transcript lists one of UIUC's Types", LIVE),
  ),
  subject: table(
    SUBJECTS,
    {
      english: verified("English", LIVE, "English includes Drama and Speech (UIUC's help on the page)"),
      mathematics: verified("Mathematics", LIVE),
      science: verified("Science", LIVE),
      history_social: verified("Social Science", LIVE),
      world_language: verified("Language Other Than English", LIVE),
      arts: verified("Other", LIVE, OTHER_NOTE),
      computer_science: unverified("Other", "AP Computer Science A / Principles go under Mathematics and Web Design under Technical (UIUC's help); pick the subject per course", LIVE),
      pe_health: verified("Other", LIVE, OTHER_NOTE),
      career_technical: unverified("Technical", TECH_NOTE, LIVE),
      business: unverified("Other", "Business may be Social Science or Other", SRC),
      other: verified("Other", LIVE),
    },
    unverified(null),
  ),
  subjectList: { options: UIUC_SUBJECTS, verified: true, note: `Read live 2026-10-28. ${TECH_NOTE}. Arts, PE, health and religion are "Other"; AP Computer Science is Mathematics.` },
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
    if (course.terms.some((t) => t.status === "in_progress")) out.push("Enter In Progress (the Year 12 page's default) for senior-year courses without a grade.");
    if (course.isRepeat) out.push("Tick Repeated Course.");
    return out;
  },
};
