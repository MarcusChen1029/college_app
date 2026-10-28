// Activities and honors as entered on the 2026-27 Common App (10 activities + 5 honors) and the
// UC application (20 entries across six categories). Option lists, limits and ranges are the
// portals' own (recorded from live accounts in docs/superpowers/research/2026-10-27-portal-dom.md
// §6-§8); every stored value must be accepted by the portal unchanged, so the validators below
// check exactly what the portals check. Students should still read the live form.

export type Grade = "9" | "10" | "11" | "12" | "PG"; // PG = "After graduating high school" (Common App) / "After 12th grade" (UC)
export const GRADES: Grade[] = ["9", "10", "11", "12", "PG"];

/** "YYYY-MM", e.g. "2026-09". */
export type YearMonth = string;

// ── Common App ──

export const CA_LIMITS = { activities: 10, honors: 5, position: 50, organization: 100, description: 150, honorTitle: 100 } as const;

// Labels exactly as the portal shows them (choice group 125), in display order.
export const CA_ACTIVITY_TYPES: readonly string[] = [
  "Academic",
  "Art",
  "Athletics (other)",
  "Athletics (JV or varsity)",
  "Career readiness or practicums",
  "Community service or volunteer work",
  "Computer or technology",
  "Cultural",
  "Dance",
  "Debate or speech",
  "Employment or work (paid)",
  "Environmental",
  "Family responsibilities",
  "Foreign language",
  "Hobby",
  "Internship",
  "Journalism or publishing",
  "LGBT+",
  "Music",
  "Religious",
  "Research",
  "Robotics",
  "R.O.T.C. or military",
  "School spirit",
  "Science or math",
  "Social justice or organizing",
  "Student government or politics",
  "Study abroad or foreign exchange",
  "Theater or drama",
  "Other",
];

/** The two types that also ask for a sport/team. */
export const CA_ATHLETIC_TYPES: readonly string[] = ["Athletics (other)", "Athletics (JV or varsity)"];

// Sports (choice group 128), in display order. "Rock climbing, Bouldering" is ONE label.
export const CA_SPORTS: readonly string[] = [
  "Archery",
  "Badminton",
  "Baseball",
  "Basketball",
  "Bowling",
  "Boxing",
  "Cheerleading",
  "Cricket",
  "Cross-country",
  "Diving",
  "Equestrian",
  "Fencing",
  "Field Hockey",
  "Figure Skating",
  "Football",
  "Football (non-tackle)",
  "Golf",
  "Gymnastics",
  "Handball",
  "Ice Hockey",
  "Indoor Track",
  "Judo",
  "Lacrosse",
  "Other Sport",
  "Outdoor Track",
  "Racquetball",
  "Rifle",
  "Rock climbing, Bouldering",
  "Rodeo",
  "Rowing (Crew)",
  "Rugby",
  "Sailing",
  "Skiing",
  "Skin Diving",
  "Soccer",
  "Softball",
  "Squash",
  "Swim",
  "Sync. swimming",
  "Table Tennis",
  "Tennis",
  "Track and field",
  "Triathlon",
  "Ultimate Frisbee",
  "Volleyball",
  "Water polo",
  "Weight lifting",
  "Wrestling",
];

/** "During high school: Time of year". */
export type CaTiming = "school" | "break" | "all";
export const CA_TIMING: Record<CaTiming, string> = { school: "During the school year", break: "During school break", all: "All year" };

export type CaContinue = "yes" | "no" | "not_sure";
export const CA_CONTINUE: Record<CaContinue, string> = { yes: "Yes", no: "No", not_sure: "Not sure" };

export type HonorLevel = "school" | "state_regional" | "national" | "international";
export const HONOR_LEVELS: Record<HonorLevel, string> = { school: "School", state_regional: "State/Regional", national: "National", international: "International" };

export type CaActivity = {
  id: string;
  type: string; // one of CA_ACTIVITY_TYPES
  sport: string; // one of CA_SPORTS; only for the athletics types
  leadership: boolean | null; // "Did you have a specific position or leadership role?"
  position: string; // "What was your role?"; only when leadership is true
  organization: string;
  description: string;
  grades: Grade[];
  timing: CaTiming | null; // required when any of 9-12 is ticked
  afterStart: YearMonth | null; // required when PG is ticked
  stillParticipating: boolean | null; // required when PG is ticked
  afterEnd: YearMonth | null; // required when PG is ticked and stillParticipating is false
  hoursPerWeek: number | null;
  weeksPerYear: number | null;
  continueInCollege: CaContinue | null;
  /** Old value with no exact new home, kept as plain text and never sent to a portal. */
  legacy?: string;
};

export type CaHonor = { id: string; title: string; grades: Grade[]; levels: HonorLevel[] };

// ── UC ──

export const UC_LIMITS = { entries: 20, name: 60, otherProgramName: 30, description: 350, extra: 250 } as const;

export type UcCategory = "award" | "edprep" | "extracurricular" | "coursework" | "volunteer" | "work";

type UcCategoryForm = {
  label: string;
  name: string; // the question for `name`
  jobTitle?: string; // work only
  extra?: string; // the 250-character box some categories add
  description: string;
  hours: boolean; // hours per week + weeks per year (work uses a per-grade grid instead)
};

export const UC_CATEGORIES: Record<UcCategory, UcCategoryForm> = {
  award: { label: "Award or honor", name: "What's the name of the award or honor?", extra: "What are the eligibility requirements for this award or honor?", description: "What did you do to achieve this award or honor?", hours: false },
  edprep: { label: "Educational preparation program", name: "What was the program name?", description: "Briefly describe the program.", hours: true },
  extracurricular: { label: "Extracurricular activity", name: "What's the name of the activity?", description: "What did you do?", hours: true },
  coursework: { label: "Other coursework", name: "What's the name of the course?", description: "Briefly describe the course.", hours: true },
  volunteer: { label: "Volunteering / community service", name: "What's the name of the organization?", extra: "Please describe the organization, program, school or group.", description: "What did you do?", hours: true },
  work: { label: "Work experience", name: "Where did you work?", jobTitle: "What was your job title?", extra: "Please describe the company or workplace.", description: "What were your job responsibilities?", hours: false },
};
export const UC_CATEGORY_KEYS = Object.keys(UC_CATEGORIES) as UcCategory[];

export type UcAwardLevel = "school" | "city" | "state" | "regional" | "national" | "international";
export const UC_AWARD_LEVELS: Record<UcAwardLevel, string> = {
  school: "School",
  city: "City/Community",
  state: "State",
  regional: "Regional",
  national: "National",
  international: "International",
};

// UC's educational-prep program list (`edPrepId` value + label); "18" = Other, which asks for a name.
export const UC_EDPREP_OTHER = "18";
export const UC_EDPREP_PROGRAMS: readonly { value: string; label: string }[] = [
  { value: "1", label: "ATDP (Academic Talent Development Program)" },
  { value: "181", label: "boost@BerkeleyHaas" },
  { value: "281", label: "California State Summer School for Mathematics and Science (COSMOS)" },
  { value: "2", label: "Cal-SOAP" },
  { value: "3", label: "CAMP (California Alliance for Minority Participation in Science)" },
  { value: "4", label: "CBOP (Career Based Outreach Program)" },
  { value: "201", label: "College Bound Academy Programs" },
  { value: "202", label: "Council of African American Parents (CAAP)" },
  { value: "63", label: "C-STEM" },
  { value: "6", label: "Early Academic Outreach Program (EAOP)" },
  { value: "7", label: "Educational Guidance Center (EGC)" },
  { value: "8", label: "Educational Talent Search" },
  { value: "10", label: "GEAR UP" },
  { value: "11", label: "MESA (Mathematics, Engineering, Science Achievement) including MESA Schools Programs, SUCCESS Through Collaboration and California Community College Program" },
  { value: "12", label: "PDP (Professional Development Program)" },
  { value: "13", label: "Puente Program" },
  { value: "241", label: "UC Links" },
  { value: "65", label: "UC Merced Transfer Initiative Programs" },
  { value: "64", label: "UC Scholars" },
  { value: "203", label: "UCD Sacramento Area Youth Speaks (SAYS)" },
  { value: "161", label: "UCLA Center for Community College Partnerships (CCCP)/SITE" },
  { value: "62", label: "UCLA VIP Scholars Program" },
  { value: "15", label: 'UCSC SAGE (Students Acquiring "A-G" Expectations)' },
  { value: "9", label: "UCSF Internships" },
  { value: "16", label: "Upward Bound" },
  { value: "261", label: "Wonderful Education" },
  { value: UC_EDPREP_OTHER, label: "Other" },
];

/** "How many years after 12th grade": 0-10, or 11 on the portal = "10+". */
export type UcAfterYears = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | "10+";
/** Work experience: hours per week during the school year and the summer, for each grade ticked; null = did not work then. */
export type UcWorkHours = Partial<Record<Grade, { schoolYear: number | null; summer: number | null }>>;

export type UcEntry = {
  id: string;
  category: UcCategory;
  name: string; // activity / award / course / organization / workplace; the program name only when program is Other
  jobTitle: string; // work only
  extra: string; // the 250-character box (eligibility, organization or workplace description)
  description: string;
  grades: Grade[];
  hoursPerWeek: number | null;
  weeksPerYear: number | null;
  afterYears: UcAfterYears | null; // required when PG is ticked (not award)
  afterMonths: number | null; // 0-11, same rule
  awardLevels: UcAwardLevel[];
  awardType: "academic" | "non_academic" | null;
  program: string | null; // edprep: a UC_EDPREP_PROGRAMS value
  workHours: UcWorkHours;
  stillWorking: boolean | null;
  start: YearMonth | null;
  end: YearMonth | null; // required when stillWorking is false
  /** Old value with no exact new home, kept as plain text and never sent to a portal. */
  legacy?: string;
  /** Set when the entry was copied from a Common App item, so it isn't copied twice. */
  fromId?: string;
};

export type ActivityData = { version: 2; commonApp: { activities: CaActivity[]; honors: CaHonor[] }; uc: UcEntry[] };

export const EMPTY_ACTIVITIES: ActivityData = { version: 2, commonApp: { activities: [], honors: [] }, uc: [] };

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Nothing the student has not answered is defaulted: unanswered questions are null / "" / [].
export const newCaActivity = (): CaActivity => ({
  id: newId(),
  type: "",
  sport: "",
  leadership: null,
  position: "",
  organization: "",
  description: "",
  grades: [],
  timing: null,
  afterStart: null,
  stillParticipating: null,
  afterEnd: null,
  hoursPerWeek: null,
  weeksPerYear: null,
  continueInCollege: null,
});

export const newCaHonor = (): CaHonor => ({ id: newId(), title: "", grades: [], levels: [] });

export const newUcEntry = (category: UcCategory): UcEntry => ({
  id: newId(),
  category,
  name: "",
  jobTitle: "",
  extra: "",
  description: "",
  grades: [],
  hoursPerWeek: null,
  weeksPerYear: null,
  afterYears: null,
  afterMonths: null,
  awardLevels: [],
  awardType: null,
  program: null,
  workHours: {},
  stillWorking: null,
  start: null,
  end: null,
});

// ── Validation ──
// An issue is "missing" (a required question has no answer) or "invalid" (an answer the portal would
// reject, or silently drop or cut). `field` is the key of CaActivity / CaHonor / UcEntry it belongs to.

export type Issue = { field: string; kind: "missing" | "invalid"; message: string };

/** How UC counts a text box: a line break counts as two characters. */
export function ucTextLength(s: string): number {
  return s.length + (s.match(/\n/g)?.length ?? 0);
}

const DATE_MIN_YEAR = 1926; // the Common App date picker accepts 1926-2027
const DATE_MAX_YEAR = 2027;

function parseYearMonth(s: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

const ymKey = (p: { year: number; month: number }) => p.year * 12 + p.month;

/** Checks a "YYYY-MM" value against a year range; returns an issue message, or null when fine. */
function yearMonthProblem(value: string, minYear: number, maxYear: number): string | null {
  const p = parseYearMonth(value);
  if (!p) return `"${value}" is not a month and year.`;
  if (p.year < minYear || p.year > maxYear) return `The year must be between ${minYear} and ${maxYear} (this is ${p.year}).`;
  return null;
}

function inRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max;
}

type Collector = { issues: Issue[]; missing: (field: string, message: string) => void; invalid: (field: string, message: string) => void };

function collector(): Collector {
  const issues: Issue[] = [];
  return {
    issues,
    missing: (field, message) => void issues.push({ field, kind: "missing", message }),
    invalid: (field, message) => void issues.push({ field, kind: "invalid", message }),
  };
}

const hasSchoolGrade = (grades: Grade[]) => grades.some((g) => g !== "PG");

export function caActivityIssues(a: CaActivity): Issue[] {
  const c = collector();
  if (!a.type) c.missing("type", "Choose an activity type.");
  else if (!CA_ACTIVITY_TYPES.includes(a.type)) c.invalid("type", `"${a.type}" is not one of the Common App activity types.`);

  if (CA_ATHLETIC_TYPES.includes(a.type)) {
    if (!a.sport) c.missing("sport", "Choose the sport or team.");
    else if (!CA_SPORTS.includes(a.sport)) c.invalid("sport", `"${a.sport}" is not one of the Common App sports.`);
  }

  if (a.leadership === true) {
    if (!a.position.trim()) c.missing("position", "Write your role.");
    else if (a.position.length > CA_LIMITS.position) c.invalid("position", `Common App allows ${CA_LIMITS.position} characters (this has ${a.position.length}).`);
  }
  if (a.organization.length > CA_LIMITS.organization) c.invalid("organization", `Common App allows ${CA_LIMITS.organization} characters (this has ${a.organization.length}).`);

  if (!a.description.trim()) c.missing("description", "Describe the activity.");
  else if (a.description.length > CA_LIMITS.description) c.invalid("description", `Common App allows ${CA_LIMITS.description} characters (this has ${a.description.length}).`);

  if (a.grades.length === 0) c.missing("grades", "Tick when you took part.");
  if (hasSchoolGrade(a.grades) && !a.timing) c.missing("timing", "Choose the time of year.");

  if (a.grades.includes("PG")) {
    let startOk = false;
    if (!a.afterStart) c.missing("afterStart", "Enter the start date after graduating high school.");
    else {
      const problem = yearMonthProblem(a.afterStart, DATE_MIN_YEAR, DATE_MAX_YEAR);
      if (problem) c.invalid("afterStart", problem);
      else startOk = true;
    }
    if (a.stillParticipating === null) c.missing("stillParticipating", "Say whether you are still participating.");
    else if (a.stillParticipating === false) {
      if (!a.afterEnd) c.missing("afterEnd", "Enter the end date.");
      else {
        const problem = yearMonthProblem(a.afterEnd, DATE_MIN_YEAR, DATE_MAX_YEAR);
        if (problem) c.invalid("afterEnd", problem);
        else if (startOk && ymKey(parseYearMonth(a.afterEnd)!) < ymKey(parseYearMonth(a.afterStart!)!)) c.invalid("afterEnd", "The end date is before the start date.");
      }
    }
  }

  if (a.hoursPerWeek === null) c.missing("hoursPerWeek", "Enter the hours per week.");
  else if (!inRange(a.hoursPerWeek, 1, 168)) c.invalid("hoursPerWeek", "Common App accepts 1 to 168 hours per week.");
  if (a.weeksPerYear === null) c.missing("weeksPerYear", "Enter the weeks per year.");
  else if (!inRange(a.weeksPerYear, 1, 52)) c.invalid("weeksPerYear", "Common App accepts 1 to 52 weeks per year.");

  if (a.continueInCollege === null) c.missing("continueInCollege", "Say whether you plan to continue in college.");
  return c.issues;
}

export function caHonorIssues(h: CaHonor): Issue[] {
  const c = collector();
  if (!h.title.trim()) c.missing("title", "Enter the honor title.");
  else if (h.title.length > CA_LIMITS.honorTitle) c.invalid("title", `Common App allows ${CA_LIMITS.honorTitle} characters (this has ${h.title.length}).`);
  if (h.grades.length === 0) c.missing("grades", "Tick the grades.");
  if (h.levels.length === 0) c.missing("levels", "Tick at least one level of recognition.");
  return c.issues;
}

const UC_YEARS: readonly UcAfterYears[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "10+"];

export function ucEntryIssues(e: UcEntry): Issue[] {
  const c = collector();
  const form = UC_CATEGORIES[e.category];
  const textBox = (field: "description" | "extra", limit: number, required: boolean) => {
    const value = e[field];
    if (!value.trim()) {
      if (required) c.missing(field, field === "description" ? "Describe it." : "Fill in this box.");
    } else if (ucTextLength(value) > limit) {
      c.invalid(field, `UC allows ${limit} characters, counting each line break as 2 (this counts ${ucTextLength(value)}).`);
    }
  };
  const nameBox = (field: "name" | "jobTitle", limit: number, what: string) => {
    const value = e[field];
    if (!value.trim()) c.missing(field, `Enter ${what}.`);
    else if (value.length > limit) c.invalid(field, `UC allows ${limit} characters (this has ${value.length}).`);
  };

  if (e.category === "edprep") {
    if (!e.program) c.missing("program", "Choose the program.");
    else if (!UC_EDPREP_PROGRAMS.some((p) => p.value === e.program)) c.invalid("program", "That is not one of UC's programs.");
    else if (e.program === UC_EDPREP_OTHER) nameBox("name", UC_LIMITS.otherProgramName, "the program name");
  } else {
    nameBox("name", UC_LIMITS.name, "the name");
  }
  if (e.category === "work") nameBox("jobTitle", UC_LIMITS.name, "the job title");
  if (form.extra) textBox("extra", UC_LIMITS.extra, true);
  textBox("description", UC_LIMITS.description, true);

  if (e.category === "award") {
    if (e.awardLevels.length === 0) c.missing("awardLevels", "Tick at least one level.");
    if (!e.awardType) c.missing("awardType", "Choose academic or non-academic.");
  }
  if (e.grades.length === 0) c.missing("grades", "Tick when you took part.");

  if (form.hours) {
    if (e.hoursPerWeek === null) c.missing("hoursPerWeek", "Enter the hours per week.");
    else if (!inRange(e.hoursPerWeek, 1, 168)) c.invalid("hoursPerWeek", "UC accepts 1 to 168 hours per week.");
    if (e.weeksPerYear === null) c.missing("weeksPerYear", "Enter the weeks per year.");
    else if (!inRange(e.weeksPerYear, 1, 52)) c.invalid("weeksPerYear", "UC accepts 1 to 52 weeks per year.");
  }

  if (e.category !== "award" && e.grades.includes("PG")) {
    if (e.afterYears === null) c.missing("afterYears", "Say how many years after 12th grade.");
    else if (!UC_YEARS.includes(e.afterYears)) c.invalid("afterYears", "Years after 12th grade must be 0 to 10, or 10+.");
    if (e.afterMonths === null) c.missing("afterMonths", "Say how many months after 12th grade.");
    else if (!Number.isInteger(e.afterMonths) || !inRange(e.afterMonths, 0, 11)) c.invalid("afterMonths", "Months must be 0 to 11.");
  }

  if (e.category === "work") {
    // One row per ticked grade; each season left empty means "did not work then", so a grade needs at least one.
    for (const g of GRADES.filter((g) => e.grades.includes(g))) {
      const label = g === "PG" ? "after 12th grade" : `grade ${g}`;
      const h = e.workHours[g];
      if (!h || (h.schoolYear === null && h.summer === null)) {
        c.missing("workHours", `Enter the hours per week for ${label} (school year, summer, or both).`);
        continue;
      }
      for (const [season, value] of [["school year", h.schoolYear], ["summer", h.summer]] as const) {
        if (value !== null && !inRange(value, 1, 168)) c.invalid("workHours", `UC accepts 1 to 168 hours per week (${label}, ${season}).`);
      }
    }
    if (e.stillWorking === null) c.missing("stillWorking", "Say whether you are still working there.");
    let startOk = false;
    if (!e.start) c.missing("start", "Enter when you started.");
    else {
      const problem = yearMonthProblem(e.start, DATE_MIN_YEAR, new Date().getFullYear());
      if (problem) c.invalid("start", problem);
      else startOk = true;
    }
    if (e.stillWorking === false) {
      if (!e.end) c.missing("end", "Enter when you stopped.");
      else {
        const problem = yearMonthProblem(e.end, DATE_MIN_YEAR, DATE_MAX_YEAR);
        if (problem) c.invalid("end", problem);
        else if (startOk && ymKey(parseYearMonth(e.end)!) < ymKey(parseYearMonth(e.start!)!)) c.invalid("end", "The end date is before the start date.");
      }
    }
  }
  return c.issues;
}

// ── Upgrading stored data ──
// Anything stored before the 2026-27 format (no `version`) is converted here; v2 data passes through
// unchanged. Rules: docs/superpowers/specs/2026-10-28-activities-filler-design.md §3.1-§3.2. The SQL
// backfill in migration 0038 applies the same rules and is checked against lib/fixtures/activities-v1.json
// -> activities-v2.json, so keep this deterministic: ids and order are kept, nothing random is minted or guessed
// (an entry with no usable id gets `legacy-<list>-<index>`, the index in the stored list).

const OLD_CA_TYPES = new Map<string, string>([
  ["Academic", "Academic"],
  ["Art", "Art"],
  ["Athletics: Club", "Athletics (other)"],
  ["Athletics: JV/Varsity", "Athletics (JV or varsity)"],
  ["Career Oriented", "Career readiness or practicums"],
  ["Community Service (Volunteer)", "Community service or volunteer work"],
  ["Computer/Technology", "Computer or technology"],
  ["Cultural", "Cultural"],
  ["Dance", "Dance"],
  ["Debate/Speech", "Debate or speech"],
  ["Environmental", "Environmental"],
  ["Family Responsibilities", "Family responsibilities"],
  ["Foreign Exchange", "Study abroad or foreign exchange"],
  ["Foreign Language", "Foreign language"],
  ["Internship", "Internship"],
  ["Journalism/Publication", "Journalism or publishing"],
  ["Junior R.O.T.C.", "R.O.T.C. or military"],
  ["LGBT", "LGBT+"],
  ["Music: Instrumental", "Music"],
  ["Music: Vocal", "Music"],
  ["Religious", "Religious"],
  ["Research", "Research"],
  ["Robotics", "Robotics"],
  ["School Spirit", "School spirit"],
  ["Science/Math", "Science or math"],
  ["Social Justice", "Social justice or organizing"],
  ["Student Govt./Politics", "Student government or politics"],
  ["Theater/Drama", "Theater or drama"],
  ["Work (Paid)", "Employment or work (paid)"],
  ["Other Club/Activity", "Other"],
]);

const LEGACY_PREFIX = "From your earlier version: ";

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" ? v : "");
const numberOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const boolOrNull = (v: unknown) => (typeof v === "boolean" ? v : null);
const monthOrNull = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** An own key of `o` (not `constructor`, `toString`...). */
const ownKey = (o: object, k: unknown): k is string => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
/** The stored id, or a deterministic one from the list and the entry's index when it is missing, blank or not a string. */
const idOf = (v: unknown, list: string, i: number) => (typeof v === "string" && v.trim() !== "" ? v : `legacy-${list}-${i}`);
const gradesOf = (v: unknown): Grade[] => listOf(v).filter((g): g is Grade => GRADES.includes(g as Grade));
/** Case-insensitive and whitespace-collapsed, for matching old free text to a program label. */
const collapse = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function caTiming(v: unknown): CaTiming | null {
  if (Array.isArray(v)) {
    const school = v.includes("school");
    const brk = v.includes("break");
    return school && brk ? "all" : school ? "school" : brk ? "break" : null;
  }
  return v === "school" || v === "break" || v === "all" ? v : null;
}

function caContinue(v: unknown): CaContinue | null {
  if (v === true) return "yes";
  if (v === false) return "no";
  return v === "yes" || v === "no" || v === "not_sure" ? v : null;
}

function upgradeCaActivity(r: Raw, i: number): CaActivity {
  const type = text(r.type);
  const position = text(r.position);
  const a: CaActivity = {
    id: idOf(r.id, "ca", i),
    type: OLD_CA_TYPES.get(type) ?? type, // a current label is not an old key, so it passes through
    sport: text(r.sport),
    // The old form had no such question; a role was the only hint. Not answered is null, never false.
    leadership: r.leadership === undefined ? (position.trim() ? true : null) : boolOrNull(r.leadership),
    position,
    organization: text(r.organization),
    description: text(r.description),
    grades: gradesOf(r.grades),
    timing: caTiming(r.timing),
    afterStart: monthOrNull(r.afterStart),
    stillParticipating: boolOrNull(r.stillParticipating),
    afterEnd: monthOrNull(r.afterEnd),
    hoursPerWeek: numberOrNull(r.hoursPerWeek),
    weeksPerYear: numberOrNull(r.weeksPerYear),
    continueInCollege: caContinue(r.continueInCollege),
  };
  if (text(r.legacy)) a.legacy = text(r.legacy);
  return a;
}

function upgradeCaHonor(r: Raw, i: number): CaHonor {
  return {
    id: idOf(r.id, "honor", i),
    title: text(r.title),
    grades: gradesOf(r.grades),
    levels: listOf(r.levels).filter((l): l is HonorLevel => ownKey(HONOR_LEVELS, l)),
  };
}

/** The UC program an old free-text name stands for: its full label, the text in its last "( )", or the name before its first " (". */
function ucProgramFor(name: string): string | null {
  const key = collapse(name);
  if (!key) return null;
  for (const p of UC_EDPREP_PROGRAMS) {
    if (p.value === UC_EDPREP_OTHER) continue; // "Other" is the fallback, not a match
    const keys = [p.label, /\(([^()]*)\)[^()]*$/.exec(p.label)?.[1], p.label.split(" (")[0]];
    if (keys.some((k) => k && collapse(k) === key)) return p.value;
  }
  return null;
}

const UC_YEARS_LIST: readonly unknown[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "10+"];

function workHoursOf(v: unknown): UcWorkHours {
  const out: UcWorkHours = {};
  if (!isRecord(v)) return out;
  for (const g of GRADES) {
    const h = v[g];
    if (isRecord(h)) out[g] = { schoolYear: numberOrNull(h.schoolYear), summer: numberOrNull(h.summer) };
  }
  return out;
}

/** `v1`: the entry is in the earlier shape, where work kept the job title in `name` and the employer in `organization`. */
function upgradeUcEntry(r: Raw, i: number, v1: boolean): UcEntry {
  const category = UC_CATEGORY_KEYS.includes(r.category as UcCategory) ? (r.category as UcCategory) : "extracurricular";
  const level = r.awardLevel;
  const e: UcEntry = {
    id: idOf(r.id, "uc", i),
    category,
    name: text(r.name),
    jobTitle: text(r.jobTitle),
    extra: text(r.extra),
    description: text(r.description),
    grades: gradesOf(r.grades),
    hoursPerWeek: numberOrNull(r.hoursPerWeek),
    weeksPerYear: numberOrNull(r.weeksPerYear),
    afterYears: UC_YEARS_LIST.includes(r.afterYears) ? (r.afterYears as UcAfterYears) : null,
    afterMonths: numberOrNull(r.afterMonths),
    // Old entries held one level; current ones hold a list.
    awardLevels: Array.isArray(r.awardLevels)
      ? r.awardLevels.filter((l): l is UcAwardLevel => ownKey(UC_AWARD_LEVELS, l))
      : ownKey(UC_AWARD_LEVELS, level)
        ? [level as UcAwardLevel]
        : [],
    awardType: r.awardType === "academic" || r.awardType === "non_academic" ? r.awardType : null,
    program: typeof r.program === "string" && r.program !== "" ? r.program : null,
    workHours: workHoursOf(r.workHours),
    stillWorking: boolOrNull(r.stillWorking),
    start: monthOrNull(r.start),
    end: monthOrNull(r.end),
  };
  const notes = text(r.legacy) ? [text(r.legacy)] : [];
  if (v1 && category === "work") {
    e.jobTitle = text(r.name);
    e.name = text(r.organization);
    // The old hours have no matching question (UC asks per grade); keep them as a note rather than guess a grid.
    const hours = [e.hoursPerWeek !== null && `${e.hoursPerWeek} hours/week`, e.weeksPerYear !== null && `${e.weeksPerYear} weeks/year`].filter(Boolean);
    if (hours.length) notes.push(`${LEGACY_PREFIX}${hours.join(", ")}`);
    e.hoursPerWeek = null;
    e.weeksPerYear = null;
  } else if (v1) {
    if (category === "edprep") {
      const old = text(r.name).trim();
      const program = ucProgramFor(old);
      if (program) [e.program, e.name] = [program, ""];
      else if (!old) [e.program, e.name] = [null, ""]; // nothing to go on: left for the student
      else if (ucTextLength(old) <= UC_LIMITS.otherProgramName) [e.program, e.name] = [UC_EDPREP_OTHER, old];
      else {
        [e.program, e.name] = [UC_EDPREP_OTHER, ""]; // too long for UC's Other box
        notes.push(`${LEGACY_PREFIX}${old}`);
      }
    }
    // Only work had an employer question, but the old MCP tool accepted `organization` on any category.
    if (text(r.organization).trim()) notes.push(`${LEGACY_PREFIX}organization ${text(r.organization)}`);
  }
  if (notes.length) e.legacy = notes.join("; ");
  if (text(r.fromId)) e.fromId = text(r.fromId);
  return e;
}

/**
 * Reads stored activities in any shape (earlier format, current format, `{}`, null) and returns the
 * current one. Never throws; missing values become null / "" / [] so the validators never see
 * `undefined`. Upgrading already-current data changes nothing.
 */
export function upgradeActivities(raw: unknown): ActivityData {
  const src = isRecord(raw) ? raw : {};
  const v1 = src.version !== 2;
  const commonApp = isRecord(src.commonApp) ? src.commonApp : {};
  return {
    version: 2,
    commonApp: {
      activities: listOf(commonApp.activities).flatMap((r, i) => (isRecord(r) ? [upgradeCaActivity(r, i)] : [])),
      honors: listOf(commonApp.honors).flatMap((r, i) => (isRecord(r) ? [upgradeCaHonor(r, i)] : [])),
    },
    uc: listOf(src.uc).flatMap((r, i) => (isRecord(r) ? [upgradeUcEntry(r, i, v1)] : [])),
  };
}

// ── Common App → UC drafts ──

const CA_TO_UC_LEVEL: Record<HonorLevel, UcAwardLevel> = { school: "school", state_regional: "state", national: "national", international: "international" };

/** Pick the UC category a Common App activity most likely belongs in. */
function ucCategoryFor(type: string): UcCategory {
  if (type === "Employment or work (paid)" || type === "Internship") return "work";
  if (type === "Community service or volunteer work") return "volunteer";
  return "extracurricular";
}

/**
 * UC drafts for Common App items not copied yet, in Common App order (activities, then honors).
 * Text is carried over as a starting point; the UC boxes are longer, so students should expand it.
 * Questions UC asks that Common App does not (work dates and hours, award type) stay blank.
 */
export function ucDraftsFromCommonApp(data: ActivityData): UcEntry[] {
  const copied = new Set(data.uc.map((e) => e.fromId).filter(Boolean));
  const fromActivities = data.commonApp.activities
    .filter((a) => !copied.has(a.id) && (a.organization || a.position || a.description))
    .map((a): UcEntry => {
      const category = ucCategoryFor(a.type);
      if (category === "work") {
        // UC work asks for the workplace and the job title separately, and hours per grade instead of per week.
        return {
          ...newUcEntry(category),
          name: a.organization.slice(0, UC_LIMITS.name),
          jobTitle: a.position.slice(0, UC_LIMITS.name),
          description: a.description.slice(0, UC_LIMITS.description),
          grades: a.grades,
          fromId: a.id,
        };
      }
      return {
        ...newUcEntry(category),
        name: (a.organization || a.position).slice(0, UC_LIMITS.name),
        description: [a.position, a.description].filter(Boolean).join(" — ").slice(0, UC_LIMITS.description),
        grades: a.grades,
        hoursPerWeek: a.hoursPerWeek,
        weeksPerYear: a.weeksPerYear,
        fromId: a.id,
      };
    });
  const fromHonors = data.commonApp.honors
    .filter((h) => !copied.has(h.id) && h.title)
    .map((h): UcEntry => {
      // UC splits State and Regional, so State/Regional is copied as State and flagged rather than ticking both.
      const levels = (Object.keys(UC_AWARD_LEVELS) as UcAwardLevel[]).filter((l) => h.levels.some((hl) => CA_TO_UC_LEVEL[hl] === l));
      const e: UcEntry = { ...newUcEntry("award"), name: h.title.slice(0, UC_LIMITS.name), grades: h.grades, awardLevels: levels, fromId: h.id };
      if (h.levels.includes("state_regional")) e.legacy = "Check the level: Common App's State/Regional was copied as State.";
      return e;
    });
  return [...fromActivities, ...fromHonors];
}

/** Moves item i one place up (-1) or down (+1); returns the same array if it can't move. */
export function move<T>(items: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
