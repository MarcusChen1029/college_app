export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("en-US"));
export const fmtPct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `${Number(n).toFixed(digits)}%`);
export const fmtUsd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(Number(n)).toLocaleString("en-US")}`);
export const fmtScore = (n: number | null | undefined) => (n == null ? "—" : String(Number(n)));

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function daysUntil(iso: string, today = new Date()) {
  const [y, m, d] = iso.split("-").map(Number);
  const due = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / 86_400_000);
}

export const TEST_POLICY: Record<string, string> = {
  required: "Test required",
  recommended: "Test recommended",
  optional: "Test optional",
  flexible: "Test flexible",
  blind: "Test blind",
};

export const ENGLISH_POLICY: Record<string, string> = {
  required_nonnative: "Required for non-native speakers",
  required_all_international: "Required for all international applicants",
  recommended: "Recommended",
  not_required: "Not required",
};

export const ENGLISH_STATUS: Record<string, string> = {
  required_option: "Accepted (meets requirement)",
  recommended_option: "Accepted",
  accepted: "Supplementary only",
  not_accepted: "Not accepted",
};

export const INTL_AID: Record<string, string> = {
  need_blind_full_need: "Need-blind, meets full need",
  need_aware_full_need: "Need-aware, meets full need",
  need_aware_limited: "Need-aware, limited aid",
  merit_only: "Merit aid only",
  none: "No institutional aid",
};

export const IMPORTANCE: Record<string, string> = {
  very_important: "Very important",
  important: "Important",
  considered: "Considered",
  not_considered: "Not considered",
};

export const FACTOR: Record<string, string> = {
  rigor: "Rigor of HS record",
  class_rank: "Class rank",
  gpa: "Academic GPA",
  test_scores: "Test scores",
  essay: "Essay",
  recommendations: "Recommendations",
  interview: "Interview",
  extracurriculars: "Extracurriculars",
  talent_ability: "Talent / ability",
  character: "Character",
  first_generation: "First generation",
  alumni_relation: "Alumni relation",
  geographic_residence: "Geography",
  state_residency: "State residency",
  religious_affiliation: "Religious affiliation",
  volunteer_work: "Volunteer work",
  work_experience: "Work experience",
  demonstrated_interest: "Demonstrated interest",
};

export const ADMIT_MODEL: Record<string, string> = {
  direct_major: "Admitted directly to the major",
  school_college: "Admitted to a school / college",
  undeclared_open: "Admitted to the university; choose major later",
  pre_major_competitive: "Pre-major; competitive entry later",
};

export const TRANSFER: Record<string, string> = {
  open: "Open",
  moderate: "Moderate",
  hard: "Hard",
  very_hard: "Very hard",
  not_possible: "Not possible",
};

export const PLATFORM: Record<string, string> = {
  common_app: "Common App",
  coalition: "Coalition",
  uc_app: "UC Application",
  questbridge: "QuestBridge",
  own: "School's own application",
};

export const INTERVIEW: Record<string, string> = {
  not_offered: "Not offered",
  optional_informational: "Optional (informational)",
  optional_evaluative: "Optional (evaluative)",
  required: "Required",
  by_invitation: "By invitation / when available",
};
