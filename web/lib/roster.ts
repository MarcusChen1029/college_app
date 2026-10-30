// Teacher-side view models: parsing the teacher_roster / teacher_student / teacher_deadlines RPC results
// (migration 0022) and computing the roster's progress numbers and "needs attention" flags.

import { upgradeActivities, type ActivityData } from "./activities.ts";
import { progress, type Checklist } from "./checklist.ts";
import type { PersonalEssays } from "./personal-essays";
import type { TestDetails } from "./scores";

export type RosterCollege = {
  slug: string;
  name: string;
  status: string;
  plan: string | null;
  checklist: Checklist;
  /** yyyy-mm-dd of the next application/priority deadline that still applies, or null. */
  nextDeadline: string | null;
};

export type RosterStudent = {
  studentId: string;
  displayName: string;
  email: string;
  linkedAt: string;
  classIds: string[];
  satTotal: number | null;
  actComposite: number | null;
  gpaUnweighted: number | null;
  isInternational: boolean;
  lastActive: string | null;
  colleges: RosterCollege[];
};

export type DetailCollege = {
  slug: string;
  name: string;
  custom: boolean;
  status: string;
  plan: string | null;
  checklist: Checklist;
  addedAt: string;
  updatedAt: string;
  deadlines: { dueDate: string; kind: string; label: string; plan: string | null }[];
};

export type StudentDetail = {
  studentId: string;
  displayName: string;
  email: string;
  linkedAt: string;
  shareEssays: boolean;
  classes: { id: string; name: string }[];
  profile: {
    satTotal: number | null;
    actComposite: number | null;
    gpaUnweighted: number | null;
    englishTestKey: string | null;
    englishScore: number | null;
    intendedCategory: string | null;
    isInternational: boolean;
    needsAid: boolean;
    targetRegions: string[];
    testDetails: TestDetails;
    /** College slugs the student is considering but hasn't put on their list. */
    interested: string[];
    updatedAt: string | null;
  };
  activities: ActivityData;
  /** null when the student doesn't share essays with this teacher. */
  essays: PersonalEssays | null;
  colleges: DetailCollege[];
};

export type UpcomingDeadline = {
  studentId: string;
  studentName: string;
  collegeName: string;
  collegeSlug: string;
  dueDate: string;
  kind: string;
  label: string;
  status: string;
};

// ───────── parsing (the server shape is trusted, but nulls are normalised) ─────────

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): Raw => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Raw) : {});

export function parseRosterRow(r: Raw): RosterStudent {
  return {
    studentId: String(r.student_id),
    displayName: str(r.display_name) ?? "Student",
    email: str(r.email) ?? "",
    linkedAt: str(r.linked_at) ?? "",
    classIds: arr<string>(r.class_ids),
    satTotal: num(r.sat_total),
    actComposite: num(r.act_composite),
    gpaUnweighted: num(r.gpa_unweighted),
    isInternational: r.is_international === true,
    lastActive: str(r.last_active),
    colleges: arr<Raw>(r.colleges).map((c) => ({
      slug: String(c.slug),
      name: str(c.name) ?? "College",
      status: str(c.status) ?? "in_progress",
      plan: str(c.plan),
      checklist: obj(c.checklist) as Checklist,
      nextDeadline: str(c.next_deadline),
    })),
  };
}

export function parseStudentDetail(raw: unknown): StudentDetail {
  const r = obj(raw);
  const p = obj(r.profile);
  return {
    studentId: String(r.student_id),
    displayName: str(r.display_name) ?? "Student",
    email: str(r.email) ?? "",
    linkedAt: str(r.linked_at) ?? "",
    shareEssays: r.share_essays !== false,
    classes: arr<Raw>(r.classes).map((c) => ({ id: String(c.id), name: str(c.name) ?? "" })),
    profile: {
      satTotal: num(p.sat_total),
      actComposite: num(p.act_composite),
      gpaUnweighted: num(p.gpa_unweighted),
      englishTestKey: str(p.english_test_key),
      englishScore: num(p.english_score),
      intendedCategory: str(p.intended_category),
      isInternational: p.is_international === true,
      needsAid: p.needs_aid === true,
      targetRegions: arr<string>(p.target_regions),
      testDetails: obj(p.test_details) as TestDetails,
      interested: arr<string>(p.interested),
      updatedAt: str(p.updated_at),
    },
    activities: upgradeActivities(r.activities), // teacher_student passes the stored jsonb through, in whatever format it is in
    essays: r.essays == null ? null : (obj(r.essays) as PersonalEssays),
    colleges: arr<Raw>(r.colleges).map((c) => ({
      slug: String(c.slug),
      name: str(c.name) ?? "College",
      custom: c.custom === true,
      status: str(c.status) ?? "in_progress",
      plan: str(c.plan),
      checklist: obj(c.checklist) as Checklist,
      addedAt: str(c.added_at) ?? "",
      updatedAt: str(c.updated_at) ?? "",
      deadlines: arr<Raw>(c.deadlines).map((d) => ({
        dueDate: String(d.due_date),
        kind: str(d.kind) ?? "other",
        label: str(d.label) ?? "Deadline",
        plan: str(d.plan),
      })),
    })),
  };
}

export function parseUpcomingDeadline(r: Raw): UpcomingDeadline {
  return {
    studentId: String(r.student_id),
    studentName: str(r.student_name) ?? "Student",
    collegeName: str(r.college_name) ?? "College",
    collegeSlug: String(r.college_slug),
    dueDate: String(r.due_date),
    kind: str(r.kind) ?? "other",
    label: str(r.label) ?? "Deadline",
    status: str(r.status) ?? "in_progress",
  };
}

// ───────── roster numbers and flags ─────────

/** Statuses where the student is still working on the application. */
const ACTIVE = new Set(["researching", "planning", "in_progress"]);
export const isActiveCollege = (c: { status: string }) => ACTIVE.has(c.status);

export const SOON_DAYS = 14;
export const ESSAY_DAYS = 30;
export const INACTIVE_DAYS = 30;

/** Whole calendar days from today (local) to a yyyy-mm-dd date; negative when past. */
export function daysUntil(date: string, now: Date): number {
  const [y, m, d] = date.split("-").map(Number);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

export function nextDeadline(s: RosterStudent, now: Date): { date: string; collegeName: string; days: number } | null {
  let best: { date: string; collegeName: string; days: number } | null = null;
  for (const c of s.colleges) {
    if (!isActiveCollege(c) || !c.nextDeadline) continue;
    const days = daysUntil(c.nextDeadline, now);
    if (days < 0) continue;
    if (!best || days < best.days) best = { date: c.nextDeadline, collegeName: c.name, days };
  }
  return best;
}

/** Checklist items done / total across the colleges the student is still working on. */
export function checklistSummary(s: RosterStudent): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const c of s.colleges) {
    if (!isActiveCollege(c)) continue;
    const p = progress(c.checklist);
    done += p.done;
    total += p.total;
  }
  return { done, total };
}

const essaysNotStarted = (c: Checklist) => !c.no_essays && (c.essay_list ?? []).every((e) => e.status === "not_started");

export type FlagKey = "no_colleges" | "deadline_soon" | "essay_not_started" | "no_scores" | "inactive";
/** `detail` is the English sentence (tests and exports read it); `college` and `due` (yyyy-mm-dd) let a view write the date
 *  in the reader's own format instead of the ISO date the sentence carries. */
export type Flag = { key: FlagKey; label: string; detail: string; college?: string; due?: string };

/** How urgent each flag is; used to rank students so one imminent deadline outranks a pile of minor flags. */
export const FLAG_SEVERITY: Record<FlagKey, number> = { deadline_soon: 5, essay_not_started: 4, no_colleges: 3, inactive: 2, no_scores: 1 };

export function worstSeverity(flags: readonly Flag[]): number {
  return flags.reduce((max, f) => Math.max(max, FLAG_SEVERITY[f.key]), 0);
}

/** The viewer's own calendar day as yyyy-mm-dd, sent to the server so "today" matches the teacher's clock. */
export function localDate(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Reasons a teacher may want to check in with this student, most urgent first. */
export function computeFlags(s: RosterStudent, now: Date): Flag[] {
  const flags: Flag[] = [];
  const active = s.colleges.filter(isActiveCollege);

  const soon = active
    .filter((c) => c.nextDeadline && daysUntil(c.nextDeadline, now) >= 0 && daysUntil(c.nextDeadline, now) <= SOON_DAYS && progress(c.checklist).missing > 0)
    .sort((a, b) => daysUntil(a.nextDeadline!, now) - daysUntil(b.nextDeadline!, now))[0];
  if (soon) {
    const days = daysUntil(soon.nextDeadline!, now);
    flags.push({
      key: "deadline_soon",
      label: "Deadline soon",
      detail: `${soon.name} is due in ${days} day${days === 1 ? "" : "s"} with ${progress(soon.checklist).missing} checklist items open.`,
    });
  }

  const essay = active.find((c) => c.nextDeadline && daysUntil(c.nextDeadline, now) >= 0 && daysUntil(c.nextDeadline, now) <= ESSAY_DAYS && essaysNotStarted(c.checklist));
  if (essay)
    flags.push({ key: "essay_not_started", label: "Essay not started", detail: `Nothing started for ${essay.name}, due ${essay.nextDeadline}.`, college: essay.name, due: essay.nextDeadline! });

  if (s.colleges.length === 0) flags.push({ key: "no_colleges", label: "No colleges yet", detail: "Hasn't added any college to their list." });
  if (s.satTotal == null && s.actComposite == null) flags.push({ key: "no_scores", label: "No test scores", detail: "No SAT or ACT score entered." });

  const since = s.lastActive ?? s.linkedAt;
  if (since) {
    const idle = Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000);
    if (idle > INACTIVE_DAYS) flags.push({ key: "inactive", label: "Inactive", detail: `No changes in ${idle} days.` });
  }
  return flags;
}
