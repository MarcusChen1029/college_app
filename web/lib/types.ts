// Subject tiers are plain S–D; the general tier may also be S++, S+, A++, … D+.
export type TierCode = "S++" | "S+" | "S" | "A++" | "A+" | "A" | "B++" | "B+" | "B" | "C++" | "C+" | "C" | "D++" | "D+" | "D";

export type CollegeSummary = {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  country_code: string;
  state_region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  setting: string | null;
  control: string | null;
  undergrad_enrollment: number | null;
  pct_international_ug: number | null;
  general_tier: TierCode | null;
  cds_year: string | null;
  applicants: number | null;
  admits: number | null;
  admit_rate: number | null;
  ed_admit_rate: number | null;
  intl_admit_rate: number | null;
  gpa_avg: number | null;
  sat_p25: number | null;
  sat_p50: number | null;
  sat_p75: number | null;
  act_p25: number | null;
  act_p50: number | null;
  act_p75: number | null;
  test_policy: string | null;
  english_policy: string | null;
  total_coa_usd: number | null;
  tuition_usd: number | null;
  tuition_out_of_state_usd: number | null;
  tuition_intl_usd: number | null;
  intl_aid_policy: string | null;
  tiers: Record<string, TierCode>;
  plans: string[] | null;
  next_deadline: string | null;
};

export type Source = { id: string; kind: string; title: string | null; url: string; cds_year: string | null; accessed_on: string };

export type AdmissionStats = {
  cds_year: string;
  applicants: number | null;
  admits: number | null;
  enrolled: number | null;
  admit_rate: number | null;
  ed_applicants: number | null;
  ed_admits: number | null;
  ed_admit_rate: number | null;
  intl_applicants: number | null;
  intl_admits: number | null;
  intl_admit_rate: number | null;
  in_state_applicants: number | null;
  in_state_admits: number | null;
  out_state_applicants: number | null;
  out_state_admits: number | null;
  waitlist_offered: number | null;
  waitlist_accepted: number | null;
  waitlist_admitted: number | null;
  pct_submit_sat: number | null;
  pct_submit_act: number | null;
  gpa_avg: number | null;
  pct_reporting_gpa: number | null;
  gpa_distribution: Record<string, number> | null;
  notes: string | null;
  source_id: string | null;
  source_note: string | null;
};

export type Deadline = {
  id: string;
  institution_id: string;
  cycle: string;
  kind: string;
  plan_key: string | null;
  label: string | null;
  due_date: string | null;
  notification_date: string | null;
  notification_note: string | null;
  notes: string | null;
  source_id: string | null;
};

export type EnglishRequirement = {
  test_key: string;
  status: string;
  min_total: number | null;
  recommended_total: number | null;
  min_subscores: Record<string, number> | null;
  notes: string | null;
  source_id: string | null;
};

// A course at a university (UK / UCAS style: apply to a course, grade-based offers).
export type Program = {
  id: string;
  slug: string;
  name: string;
  award: string | null;
  ucas_code: string | null;
  duration_years: number | null;
  a_level_offer: string | null;
  ib_offer: string | null;
  ib_points: number | null;
  required_subjects: string | null;
  admissions_test: string | null;
  interviewed_pct: number | null;
  success_pct: number | null;
  intake: number | null;
  intl_fee_gbp: number | null;
  application_deadline: string | null;
  ielts_overall: number | null;
  ielts_component: number | null;
  toefl_note: string | null;
  english_note: string | null;
  notes: string | null;
  source_url: string;
  retrieved_on: string;
};

export type CollegeDetail = {
  id: string;
  slug: string;
  country_code: string;
  programs: Program[];
  name: string;
  short_name: string | null;
  state_region: string | null;
  city: string | null;
  setting: string | null;
  control: string | null;
  website: string | null;
  admissions_url: string | null;
  undergrad_enrollment: number | null;
  pct_international_ug: number | null;
  student_faculty_ratio: number | null;
  academic_calendar: string | null;
  sources: Source[];
  admission_stats: AdmissionStats[];
  test_score_percentiles: { cds_year: string; test: string; p25: number | null; p50: number | null; p75: number | null; source_id: string | null }[];
  admission_factors: { cds_year: string; factor: string; importance: string }[];
  test_policies: { cycle: string; policy: string; notes: string | null; source_id: string | null }[];
  application_requirements: {
    cycle: string;
    platforms: string[];
    supplemental_essays: string | null;
    teacher_recs: number | null;
    counselor_rec: boolean | null;
    interview: string | null;
    portfolio: string | null;
    app_fee_usd: number | null;
    fee_waiver: boolean | null;
    css_profile_required: boolean | null;
    fafsa_required: boolean | null;
    midyear_report: boolean | null;
    notes: string | null;
    source_id: string | null;
  }[];
  deadlines: Deadline[];
  english_policies: { policy: string; waiver_notes: string | null; source_id: string | null } | null;
  english_requirements: EnglishRequirement[];
  cost_aid: {
    year: string;
    tuition_usd: number | null;
    tuition_out_of_state_usd: number | null;
    tuition_intl_usd: number | null;
    required_fees_usd: number | null;
    intl_extra_fees_usd: number | null;
    room_board_usd: number | null;
    books_usd: number | null;
    other_usd: number | null;
    total_coa_usd: number | null;
    intl_aid_policy: string | null;
    intl_need_aid: boolean | null;
    intl_merit_aid: boolean | null;
    intl_need_aid_awarded: number | null;
    intl_avg_award_usd: number | null;
    meets_full_need: boolean | null;
    merit_scholarships: boolean | null;
    notes: string | null;
    source_id: string | null;
  }[];
  institution_tiers: { category_key: string; tier_code: TierCode; rationale: string | null }[];
  major_admissions: {
    id: string;
    program: string;
    category_key: string | null;
    admit_model: string;
    capped: boolean;
    internal_transfer: string | null;
    notes: string | null;
  }[];
};

export type Lookups = {
  categories: { key: string; label: string; sort_order: number }[];
  tiers: { code: TierCode; sort_order: number; description: string }[];
  plans: { key: string; label: string; binding: boolean }[];
  englishTests: { key: string; name: string; max_score: number | null }[];
};

// Per-college English-test summary for the map card: policy plus minimum totals by test.
export type EnglishSummary = {
  policy: string | null;
  toefl: number | null; // TOEFL iBT, 0–120
  toefl2026: number | null; // TOEFL iBT new 1–6 scale
  ielts: number | null;
  duolingo: number | null;
};

// Estimated SAT total percentiles, summed from the section (ERW + Math) percentiles.
export type SatEstimate = { p25: number; p50: number; p75: number };

// Score-reporting code for one college and test (SAT/ACT/TOEFL use numeric codes; most others pick the school by name).
export type ScoreCodeTest = "sat" | "act" | "toefl" | "ielts" | "duolingo" | "pte";
export type ScoreCode = { institution_id: string; test_key: ScoreCodeTest; code: string | null; notes: string | null; source_url: string | null };
