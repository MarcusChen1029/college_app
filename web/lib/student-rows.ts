// Row mapping between the student_profiles / student_colleges tables and the app's types.
// Shared by the browser store (student-store.ts) and the server-side Connect AI tools, so both
// read and write the same shapes. No React and no Supabase client in here.

import type { ActivityData } from "./activities.ts";
import type { Checklist } from "./checklist.ts";
import { customSlug, type CustomCollege } from "./custom-college.ts";
import { cleanStudyFields } from "./fields.ts";
import type { StudentProfile } from "./fit.ts";
import { DEFAULT_PLAN, type PlanKey } from "./plans.ts";
import type { PersonalEssays } from "./personal-essays.ts";
import type { PortalData } from "./portals.ts";
import type { Recommender, RecommenderRole, RecommenderStatus } from "./recommenders.ts";
import type { ResumeSettings } from "./resume.ts";
import type { Scholarship, ScholarshipStatus } from "./scholarships.ts";
import type { TestDetails } from "./scores.ts";
import type { CourseInput, Overrides, SchoolInput, Term, TranscriptCourse, TranscriptSchool } from "./transcript.ts";

export const STATUSES = [
  "researching",
  "planning",
  "in_progress",
  "submitted",
  "interview",
  "admitted",
  "deferred",
  "waitlisted",
  "rejected",
  "withdrawn",
  "enrolled",
] as const;
export type Status = (typeof STATUSES)[number];

export type Portal = { url: string; username: string; password: string };

export type ListEntry = {
  slug: string;
  institutionId: string;
  plan: string | null;
  status: Status;
  notes: string;
  checklist: Checklist;
  portal: Portal;
  /** Yearly financial aid offer in USD, entered by the student. Private to the student: never in a teacher RPC or the AI tools. */
  aidOfferUsd?: number | null;
  addedAt: string;
  /** Set for a college the student added themselves (no institution); rowId is its student_colleges.id. */
  custom?: CustomCollege | null;
  rowId?: string;
};

export type ProfileRow = {
  sat_total: number | null;
  act_composite: number | null;
  gpa_unweighted: number | null;
  gpa_weighted?: number | null; // migration 0037; numeric comes back as a string from some clients
  is_international: boolean;
  target_regions: string[] | null;
  study_fields?: string[] | null;
  reminder_emails: boolean;
  plan: PlanKey;
  test_details: TestDetails | null;
  interested: string[] | null;
  activities: Partial<ActivityData> | null;
  resume: ResumeSettings | null;
  essays: PersonalEssays | null;
  /** Absent when the row was read with PROFILE_COLUMNS_NO_LOGINS. */
  portals?: PortalData | null;
};
export type CollegeRow = {
  id: string;
  institution_id: string | null;
  custom: CustomCollege | null;
  plan_key: string | null;
  status: Status;
  notes: string | null;
  checklist: Checklist | null;
  /** The three portal_* fields are absent when the row was read with COLLEGE_COLUMNS_NO_LOGINS. */
  portal_url?: string | null;
  portal_username?: string | null;
  portal_password?: string | null;
  /** Absent when the row was read with COLLEGE_COLUMNS_NO_LOGINS. */
  aid_offer_usd?: number | null;
  created_at: string;
  institutions: { slug: string } | null;
};

const PROFILE_BASE = "sat_total, act_composite, gpa_unweighted, gpa_weighted, is_international, target_regions, study_fields, reminder_emails, plan, test_details, interested, activities, resume, essays";
const COLLEGE_BASE = "id, custom, institution_id, plan_key, status, notes, checklist, created_at, institutions(slug)";

/** What the website reads (includes the saved logins). */
export const PROFILE_COLUMNS = `${PROFILE_BASE}, portals`;
export const COLLEGE_COLUMNS = "id, custom, institution_id, plan_key, status, notes, checklist, portal_url, portal_username, portal_password, aid_offer_usd, created_at, institutions(slug)";

/** What server-side code acting for an AI must read: explicit columns that leave the saved logins out. */
export const PROFILE_COLUMNS_NO_LOGINS = PROFILE_BASE;
export const COLLEGE_COLUMNS_NO_LOGINS = COLLEGE_BASE;

/** A tab left open can hold old data (an AI may have changed it). Reload when the tab is used again, at most every 30 s, never mid-save. */
export const REFRESH_MIN_MS = 30_000;
export const shouldRefresh = (x: { signedIn: boolean; now: number; lastLoad: number; savesInFlight: number; loading: boolean }) =>
  x.signedIn && x.savesInFlight === 0 && !x.loading && x.now - x.lastLoad >= REFRESH_MIN_MS;

export const toProfile = (r: ProfileRow): StudentProfile => ({
  sat: r.sat_total,
  act: r.act_composite,
  gpa: r.gpa_unweighted != null ? Number(r.gpa_unweighted) : null,
  gpaWeighted: r.gpa_weighted != null ? Number(r.gpa_weighted) : null,
  international: r.is_international,
  targetRegions: r.target_regions ?? [],
  studyFields: cleanStudyFields(r.study_fields),
  reminderEmails: r.reminder_emails,
  plan: r.plan,
  tests: r.test_details ?? {},
  interested: r.interested ?? [],
  activities: r.activities ?? {},
  resume: r.resume ?? {},
  essays: r.essays ?? {},
  portals: r.portals ?? {},
});
export const fromProfile = (userId: string, p: StudentProfile) => ({
  user_id: userId,
  sat_total: p.sat ?? null,
  act_composite: p.act ?? null,
  gpa_unweighted: p.gpa ?? null,
  gpa_weighted: p.gpaWeighted ?? null,
  is_international: !!p.international,
  target_regions: p.targetRegions ?? [],
  study_fields: cleanStudyFields(p.studyFields),
  reminder_emails: p.reminderEmails ?? true,
  plan: p.plan ?? DEFAULT_PLAN,
  test_details: p.tests ?? {},
  interested: p.interested ?? [],
  activities: p.activities ?? {},
  resume: p.resume ?? {},
  essays: p.essays ?? {},
  portals: p.portals ?? {},
});
export const toEntry = (r: CollegeRow): ListEntry => ({
  slug: r.custom ? customSlug(r.id) : (r.institutions?.slug ?? ""),
  institutionId: r.institution_id ?? "",
  custom: r.custom,
  rowId: r.id,
  plan: r.plan_key,
  status: r.status,
  notes: r.notes ?? "",
  checklist: r.checklist ?? {},
  portal: { url: r.portal_url ?? "", username: r.portal_username ?? "", password: r.portal_password ?? "" },
  aidOfferUsd: r.aid_offer_usd ?? null,
  addedAt: r.created_at,
});
/** A row of the recommenders table (migration 0026). Private to the student: read only by the browser store, never by teacher or AI code. */
export type RecommenderRow = {
  id: string;
  name: string;
  role: RecommenderRole;
  subject_or_note: string | null;
  requested_on: string | null;
  due_on: string | null;
  status: RecommenderStatus;
  created_at: string;
};
export const RECOMMENDER_COLUMNS = "id, name, role, subject_or_note, requested_on, due_on, status, created_at";
export const toRecommender = (r: RecommenderRow): Recommender => ({
  id: r.id,
  name: r.name,
  role: r.role,
  note: r.subject_or_note ?? "",
  requestedOn: r.requested_on,
  dueOn: r.due_on,
  status: r.status,
  createdAt: r.created_at,
});
/** The writable columns (no created_at / updated_at: the database keeps those). */
export const recommenderColumns = (r: Recommender) => ({
  name: r.name,
  role: r.role,
  subject_or_note: r.note || null,
  requested_on: r.requestedOn,
  due_on: r.dueOn,
  status: r.status,
});
export const fromRecommender = (userId: string, r: Recommender) => ({ id: r.id, user_id: userId, ...recommenderColumns(r) });

/** A row of the scholarships table (migration 0027). Private to the student: read only by the browser store, never by teacher or AI code. */
export type ScholarshipRow = {
  id: string;
  name: string;
  provider: string | null;
  amount_usd: number | null;
  deadline: string | null;
  url: string | null;
  status: ScholarshipStatus;
  notes: string | null;
  created_at: string;
};
export const SCHOLARSHIP_COLUMNS = "id, name, provider, amount_usd, deadline, url, status, notes, created_at";
export const toScholarship = (r: ScholarshipRow): Scholarship => ({
  id: r.id,
  name: r.name,
  provider: r.provider ?? "",
  amountUsd: r.amount_usd,
  deadline: r.deadline,
  url: r.url ?? "",
  status: r.status,
  notes: r.notes ?? "",
  createdAt: r.created_at,
});
/** The writable columns (no created_at / updated_at: the database keeps those). */
export const scholarshipColumns = (s: Scholarship) => ({
  name: s.name,
  provider: s.provider || null,
  amount_usd: s.amountUsd,
  deadline: s.deadline,
  url: s.url || null,
  status: s.status,
  notes: s.notes || null,
});
export const fromScholarship = (userId: string, s: Scholarship) => ({ id: s.id, user_id: userId, ...scholarshipColumns(s) });

/** Which student_colleges row an entry is: by id for a custom college, by institution otherwise. */
export const rowKey = (e: ListEntry) => (e.custom ? { column: "id", value: e.rowId ?? "" } : { column: "institution_id", value: e.institutionId });
export const portalColumns = (p: Portal) => ({
  portal_url: p.url || null,
  portal_username: p.username || null,
  portal_password: p.password || null,
});
export const fromEntry = (userId: string, e: ListEntry) => ({
  user_id: userId,
  ...(e.custom ? { id: e.rowId, custom: e.custom } : {}),
  institution_id: e.institutionId || null,
  plan_key: e.plan,
  status: e.status,
  notes: e.notes || null,
  checklist: e.checklist,
  ...portalColumns(e.portal),
  aid_offer_usd: e.aidOfferUsd ?? null,
});

/** A row of the transcript_schools table (migration 0030). Private to the student: read only by the browser store and the student's own MCP tools. */
export type TranscriptSchoolRow = {
  id: string;
  name: string;
  country: string | null;
  kind: TranscriptSchool["kind"];
  curriculum: TranscriptSchool["curriculum"];
  default_scale: TranscriptSchool["defaultScale"];
  default_period: TranscriptSchool["defaultPeriod"];
  first_year: number | null;
  last_year: number | null;
  printed_gpa: string | null;
  printed_gpa_scale: string | null;
  gpa_weighted: boolean | null;
  class_rank: string | null;
  school_code: string | null;
  notes: string | null;
  created_at: string;
};
export const TRANSCRIPT_SCHOOL_COLUMNS =
  "id, name, country, kind, curriculum, default_scale, default_period, first_year, last_year, printed_gpa, printed_gpa_scale, gpa_weighted, class_rank, school_code, notes, created_at";
export const toTranscriptSchool = (r: TranscriptSchoolRow): TranscriptSchool => ({
  id: r.id,
  name: r.name,
  country: r.country ?? "",
  kind: r.kind,
  curriculum: r.curriculum,
  defaultScale: r.default_scale,
  defaultPeriod: r.default_period,
  firstYear: r.first_year,
  lastYear: r.last_year,
  printedGpa: r.printed_gpa ?? "",
  printedGpaScale: r.printed_gpa_scale ?? "",
  gpaWeighted: r.gpa_weighted,
  classRank: r.class_rank ?? "",
  schoolCode: r.school_code ?? "",
  notes: r.notes ?? "",
  createdAt: r.created_at,
});
/** The writable columns (no id / created_at / updated_at). */
export const transcriptSchoolColumns = (s: SchoolInput) => ({
  name: s.name,
  country: s.country,
  kind: s.kind,
  curriculum: s.curriculum,
  default_scale: s.defaultScale,
  default_period: s.defaultPeriod,
  first_year: s.firstYear,
  last_year: s.lastYear,
  printed_gpa: s.printedGpa,
  printed_gpa_scale: s.printedGpaScale,
  gpa_weighted: s.gpaWeighted,
  class_rank: s.classRank,
  // The column's check allows null or a real code, never "".
  school_code: s.schoolCode || null,
  notes: s.notes,
});
export const fromTranscriptSchool = (userId: string, s: TranscriptSchool) => ({ id: s.id, user_id: userId, ...transcriptSchoolColumns(s) });

/** A row of the transcript_courses table (migration 0030). numeric columns may arrive as strings. */
export type TranscriptCourseRow = {
  id: string;
  school_id: string;
  academic_year: number;
  grade_level: number | null;
  name: string;
  period_type: TranscriptCourse["period"];
  terms: Term[] | null;
  final_grade: string | null;
  grade_scale: TranscriptCourse["scale"];
  scale_max: number | string | null;
  level: TranscriptCourse["level"];
  credit: number | string | null;
  credit_unit: TranscriptCourse["creditUnit"];
  subject: TranscriptCourse["subject"];
  sub_subject: string | null;
  language_name: string | null;
  is_summer: boolean;
  is_repeat: boolean;
  is_college: boolean;
  college_name: string | null;
  is_withdrawn: boolean;
  notes: string | null;
  source: TranscriptCourse["source"];
  overrides: Overrides | null;
  sort_order: number;
  created_at: string;
};
export const TRANSCRIPT_COURSE_COLUMNS =
  "id, school_id, academic_year, grade_level, name, period_type, terms, final_grade, grade_scale, scale_max, level, credit, credit_unit, subject, sub_subject, language_name, is_summer, is_repeat, is_college, college_name, is_withdrawn, notes, source, overrides, sort_order, created_at";
const num = (v: number | string | null): number | null => (v == null || v === "" ? null : Number(v));
export const toTranscriptCourse = (r: TranscriptCourseRow): TranscriptCourse => ({
  id: r.id,
  schoolId: r.school_id,
  academicYear: r.academic_year,
  gradeLevel: r.grade_level,
  name: r.name,
  period: r.period_type,
  terms: Array.isArray(r.terms) ? r.terms : [],
  finalGrade: r.final_grade || null,
  scale: r.grade_scale,
  scaleMax: num(r.scale_max),
  level: r.level,
  credit: num(r.credit),
  creditUnit: r.credit_unit,
  subject: r.subject,
  subSubject: r.sub_subject || null,
  languageName: r.language_name ?? "",
  isSummer: r.is_summer,
  isRepeat: r.is_repeat,
  isCollege: r.is_college,
  collegeName: r.college_name ?? "",
  isWithdrawn: r.is_withdrawn,
  notes: r.notes ?? "",
  source: r.source,
  overrides: r.overrides ?? {},
  sortOrder: r.sort_order,
  createdAt: r.created_at,
});
/** The writable columns (no id / created_at / updated_at). */
export const transcriptCourseColumns = (c: CourseInput) => ({
  school_id: c.schoolId,
  academic_year: c.academicYear,
  grade_level: c.gradeLevel,
  name: c.name,
  period_type: c.period,
  terms: c.terms,
  final_grade: c.finalGrade,
  grade_scale: c.scale,
  scale_max: c.scaleMax,
  level: c.level,
  credit: c.credit,
  credit_unit: c.creditUnit,
  subject: c.subject,
  sub_subject: c.subSubject,
  language_name: c.languageName,
  is_summer: c.isSummer,
  is_repeat: c.isRepeat,
  is_college: c.isCollege,
  college_name: c.collegeName,
  is_withdrawn: c.isWithdrawn,
  notes: c.notes,
  source: c.source,
  overrides: c.overrides,
  sort_order: c.sortOrder,
});
export const fromTranscriptCourse = (userId: string, c: TranscriptCourse) => ({ id: c.id, user_id: userId, ...transcriptCourseColumns(c) });
