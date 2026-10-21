// Activities and honors as entered on the Common App (10 activities + 5 honors) and the
// UC application (20 entries across six categories). Field limits follow the 2026-27 forms as
// described by public application guides; students should still check the live form.

export type Grade = "9" | "10" | "11" | "12" | "PG";
export const GRADES: Grade[] = ["9", "10", "11", "12", "PG"];

// ── Common App ──

export const CA_LIMITS = { activities: 10, honors: 5, position: 50, organization: 100, description: 150, honorTitle: 100 } as const;

export const CA_ACTIVITY_TYPES = [
  "Academic",
  "Art",
  "Athletics: Club",
  "Athletics: JV/Varsity",
  "Career Oriented",
  "Community Service (Volunteer)",
  "Computer/Technology",
  "Cultural",
  "Dance",
  "Debate/Speech",
  "Environmental",
  "Family Responsibilities",
  "Foreign Exchange",
  "Foreign Language",
  "Internship",
  "Journalism/Publication",
  "Junior R.O.T.C.",
  "LGBT",
  "Music: Instrumental",
  "Music: Vocal",
  "Religious",
  "Research",
  "Robotics",
  "School Spirit",
  "Science/Math",
  "Social Justice",
  "Student Govt./Politics",
  "Theater/Drama",
  "Work (Paid)",
  "Other Club/Activity",
] as const;

export type CaTiming = "school" | "break";
export const CA_TIMING: Record<CaTiming, string> = { school: "During school year", break: "During school break" };

export type HonorLevel = "school" | "state_regional" | "national" | "international";
export const HONOR_LEVELS: Record<HonorLevel, string> = { school: "School", state_regional: "State/Regional", national: "National", international: "International" };

export type CaActivity = {
  id: string;
  type: string;
  position: string;
  organization: string;
  description: string;
  grades: Grade[];
  timing: CaTiming[];
  hoursPerWeek: number | null;
  weeksPerYear: number | null;
  continueInCollege: boolean | null;
};

export type CaHonor = { id: string; title: string; grades: Grade[]; levels: HonorLevel[] };

// ── UC ──

export const UC_LIMITS = { entries: 20, name: 60, description: 350, extra: 250 } as const;

export type UcCategory = "award" | "edprep" | "extracurricular" | "coursework" | "volunteer" | "work";

type UcCategoryForm = {
  label: string;
  name: string;
  organization?: string;
  extra?: string; // the 250-character box some categories add
  description: string;
  hours: boolean;
};

export const UC_CATEGORIES: Record<UcCategory, UcCategoryForm> = {
  award: { label: "Award or honor", name: "Name of the award or honor", extra: "Eligibility requirements", description: "What did you do to achieve it?", hours: false },
  edprep: { label: "Educational preparation program", name: "Program name", description: "Program description", hours: true },
  extracurricular: { label: "Extracurricular activity", name: "Activity name", description: "Describe the activity", hours: true },
  coursework: { label: "Other coursework", name: "Course name", description: "Course description", hours: true },
  volunteer: { label: "Volunteering / community service", name: "Organization name", extra: "Describe the organization", description: "Your service and responsibilities", hours: true },
  work: { label: "Work experience", name: "Job title", organization: "Employer", extra: "Describe the employer", description: "Job responsibilities", hours: true },
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

export type UcEntry = {
  id: string;
  category: UcCategory;
  name: string;
  organization: string;
  extra: string;
  description: string;
  grades: Grade[];
  hoursPerWeek: number | null;
  weeksPerYear: number | null;
  awardLevel: UcAwardLevel | null;
  awardType: "academic" | "non_academic" | null;
  /** Set when the entry was copied from a Common App item, so it isn't copied twice. */
  fromId?: string;
};

export type ActivityData = { commonApp: { activities: CaActivity[]; honors: CaHonor[] }; uc: UcEntry[] };

export const EMPTY_ACTIVITIES: ActivityData = { commonApp: { activities: [], honors: [] }, uc: [] };

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const newCaActivity = (): CaActivity => ({
  id: newId(),
  type: "",
  position: "",
  organization: "",
  description: "",
  grades: [],
  timing: [],
  hoursPerWeek: null,
  weeksPerYear: null,
  continueInCollege: null,
});

export const newCaHonor = (): CaHonor => ({ id: newId(), title: "", grades: [], levels: [] });

export const newUcEntry = (category: UcCategory): UcEntry => ({
  id: newId(),
  category,
  name: "",
  organization: "",
  extra: "",
  description: "",
  grades: [],
  hoursPerWeek: null,
  weeksPerYear: null,
  awardLevel: null,
  awardType: null,
});

const CA_TO_UC_LEVEL: Record<HonorLevel, UcAwardLevel> = { school: "school", state_regional: "state", national: "national", international: "international" };

/** Pick the UC category a Common App activity most likely belongs in. */
function ucCategoryFor(type: string): UcCategory {
  if (type === "Work (Paid)" || type === "Internship") return "work";
  if (type === "Community Service (Volunteer)") return "volunteer";
  return "extracurricular";
}

/**
 * UC drafts for Common App items not copied yet, in Common App order (activities, then honors).
 * Text is carried over as a starting point; the UC boxes are longer, so students should expand it.
 */
export function ucDraftsFromCommonApp(data: ActivityData): UcEntry[] {
  const copied = new Set(data.uc.map((e) => e.fromId).filter(Boolean));
  const fromActivities = data.commonApp.activities
    .filter((a) => !copied.has(a.id) && (a.organization || a.position || a.description))
    .map((a): UcEntry => {
      const category = ucCategoryFor(a.type);
      const form = UC_CATEGORIES[category];
      return {
        ...newUcEntry(category),
        name: (category === "work" ? a.position : a.organization || a.position).slice(0, UC_LIMITS.name),
        organization: form.organization ? a.organization : "",
        description: [category === "work" ? "" : a.position, a.description].filter(Boolean).join(" — ").slice(0, UC_LIMITS.description),
        grades: a.grades,
        hoursPerWeek: a.hoursPerWeek,
        weeksPerYear: a.weeksPerYear,
        fromId: a.id,
      };
    });
  const fromHonors = data.commonApp.honors
    .filter((h) => !copied.has(h.id) && h.title)
    .map((h): UcEntry => {
      // UC takes one level; use the highest one ticked.
      const top = [...h.levels].sort((a, b) => Object.keys(HONOR_LEVELS).indexOf(b) - Object.keys(HONOR_LEVELS).indexOf(a))[0];
      return { ...newUcEntry("award"), name: h.title.slice(0, UC_LIMITS.name), grades: h.grades, awardLevel: top ? CA_TO_UC_LEVEL[top] : null, fromId: h.id };
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

