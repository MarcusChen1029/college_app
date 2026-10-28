// Share links (migration 0032): a read-only parent view and a public activity portfolio, each opened by a
// secret link /share/<kind>/<token>. Pure helpers only (no Supabase), so node:test can cover them.
// The views come from SECURITY DEFINER RPCs that already return an explicit field list; the normalizers
// below pick those same fields again, so a future server change can't leak an extra field onto the page.

import { upgradeActivities, type ActivityData, type UcCategory } from "./activities.ts";
import { progress, type Checklist } from "./checklist.ts";
import { fmtDate } from "./format.ts";
import type { ResumeHeader, ResumeOptions, ResumeSource } from "./resume.ts";
import { ENGLISH_TEST_KEYS, type EnglishScore, type EnglishTestKey, type SectionScores, type TestDetails } from "./scores.ts";
import type { StudentProfile } from "./fit";
import type { Status } from "./student-rows";

export const SHARE_KINDS = ["parent", "portfolio"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

export const SHARE_KIND_LABEL: Record<ShareKind, string> = { parent: "Parent view", portfolio: "Portfolio" };

/** Tokens are 32 random bytes in base64url without padding: exactly 43 characters. */
export const isShareToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{43}$/.test(t);

export const isShareKind = (k: unknown): k is ShareKind => typeof k === "string" && (SHARE_KINDS as readonly string[]).includes(k);

/** The address to give out, e.g. https://site/share/parent/<token>. Null for a bad origin, kind or token. */
export function shareUrl(origin: string, kind: ShareKind, token: string): string | null {
  if (!isShareKind(kind) || !isShareToken(token)) return null;
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  return `${base.origin}/share/${kind}/${token}`;
}

/** "Never opened" / "Last opened Oct 27, 2026" for the management UI. */
export function lastViewedText(iso: string | null | undefined): string {
  return iso ? `Last opened ${fmtDate(iso.slice(0, 10))}` : "Never opened";
}

// ── small, strict readers ──

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null);
const isoDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

const STATUS_LIST: readonly Status[] = ["researching", "planning", "in_progress", "submitted", "interview", "admitted", "deferred", "waitlisted", "rejected", "withdrawn", "enrolled"];

// ── parent view ──

export type ParentDeadline = { dueDate: string; kind: string; label: string; plan: string | null };
export type ParentCollege = { name: string; custom: boolean; status: Status; plan: string | null; checklist: Checklist; deadlines: ParentDeadline[] };
export type ParentView = {
  student: { name: string | null; school: string | null; gradYear: string | null };
  updatedAt: string | null;
  colleges: ParentCollege[];
  recommenders: { total: number; submitted: number } | null;
  scholarships: { total: number; submitted: number; awarded: number } | null;
};

function parentChecklist(v: unknown): Checklist {
  const c = isObj(v) ? v : {};
  const out: Checklist = {};
  for (const k of ["recommendations", "transcript", "test_scores", "english_test"] as const) if (c[k] === true) out[k] = true;
  if (c.no_essays === true) out.no_essays = true;
  const tp = oneOf(c.test_plan, ["sat", "act", "optional"] as const);
  if (tp) out.test_plan = tp;
  const ep = oneOf(c.english_plan, ["toefl", "ielts", "duolingo", "pte", "cambridge", "not_required"] as const);
  if (ep) out.english_plan = ep;
  // Statuses only; titles and links never reach the page.
  const essays = arr(c.essay_list).flatMap((e, i) => {
    const s = isObj(e) ? oneOf(e.status, ["not_started", "brainstorming", "drafting", "revising", "final"] as const) : null;
    return s ? [{ id: `e${i}`, title: "", url: "", status: s }] : [];
  });
  if (essays.length) out.essay_list = essays;
  return out;
}

function counts<K extends string>(v: unknown, keys: readonly K[]): Record<K, number> | null {
  if (!isObj(v)) return null;
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = num(v[k]) ?? 0;
  return out;
}

/** The parent view from the RPC's jsonb, keeping only the documented fields. Null when the link is not active. */
export function normalizeParentView(raw: unknown): ParentView | null {
  if (!isObj(raw) || raw.kind !== "parent") return null;
  const s = isObj(raw.student) ? raw.student : {};
  return {
    student: { name: strOrNull(s.name), school: strOrNull(s.school), gradYear: strOrNull(s.grad_year) },
    updatedAt: strOrNull(raw.updated_at),
    colleges: arr(raw.colleges).flatMap((c): ParentCollege[] => {
      if (!isObj(c)) return [];
      return [
        {
          name: str(c.name) || "College",
          custom: c.custom === true,
          status: oneOf(c.status, STATUS_LIST) ?? "researching",
          plan: strOrNull(c.plan),
          checklist: parentChecklist(c.checklist),
          deadlines: arr(c.deadlines).flatMap((d): ParentDeadline[] => {
            const due = isObj(d) ? isoDate(d.due_date) : null;
            return isObj(d) && due ? [{ dueDate: due, kind: str(d.kind), label: str(d.label), plan: strOrNull(d.plan) }] : [];
          }),
        },
      ];
    }),
    recommenders: counts(raw.recommenders, ["total", "submitted"] as const),
    scholarships: counts(raw.scholarships, ["total", "submitted", "awarded"] as const),
  };
}

/** What a parent reads for a status (older statuses are folded into the ones students pick today). */
export const PARENT_STATUS_LABEL: Record<Status, string> = {
  researching: "Getting ready",
  planning: "Getting ready",
  in_progress: "Working on it",
  submitted: "Submitted, waiting",
  interview: "Submitted, waiting",
  admitted: "Admitted",
  deferred: "Deferred",
  waitlisted: "Waitlisted",
  rejected: "Not admitted",
  withdrawn: "Withdrawn",
  enrolled: "Committed",
};

export type ParentSummary = { colleges: number; submitted: number; admitted: number; decisions: number; checklistDone: number; checklistTotal: number };

const SUBMITTED_SET: readonly Status[] = ["submitted", "interview", "admitted", "deferred", "waitlisted", "rejected", "enrolled", "withdrawn"];
const DECIDED_SET: readonly Status[] = ["admitted", "deferred", "waitlisted", "rejected", "enrolled"];

export function parentSummary(v: ParentView): ParentSummary {
  let checklistDone = 0;
  let checklistTotal = 0;
  for (const c of v.colleges) {
    const p = progress(c.checklist);
    checklistDone += p.done;
    checklistTotal += p.total;
  }
  return {
    colleges: v.colleges.length,
    submitted: v.colleges.filter((c) => SUBMITTED_SET.includes(c.status)).length,
    admitted: v.colleges.filter((c) => c.status === "admitted" || c.status === "enrolled").length,
    decisions: v.colleges.filter((c) => DECIDED_SET.includes(c.status)).length,
    checklistDone,
    checklistTotal,
  };
}

/** Every college's upcoming deadlines in one list, soonest first, from `today` (YYYY-MM-DD) on. */
export function parentDeadlines(v: ParentView, today: string): (ParentDeadline & { college: string; status: Status })[] {
  return v.colleges
    .flatMap((c) => c.deadlines.filter((d) => d.dueDate >= today).map((d) => ({ ...d, college: c.name, status: c.status })))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.college.localeCompare(b.college));
}

// ── portfolio ──

export type PortfolioView = {
  header: ResumeHeader; // email, phone and location are always "" (never shared)
  options: ResumeOptions;
  activities: ActivityData;
  profile: StudentProfile; // scores only, and only when the resume shows scores
};

const UC_CATS: readonly UcCategory[] = ["award", "edprep", "extracurricular", "coursework", "volunteer", "work"];

function sectionScores(v: unknown): SectionScores | undefined {
  if (!isObj(v)) return undefined;
  const out: SectionScores = {};
  for (const [k, x] of Object.entries(v)) out[k] = num(x);
  return out;
}

function englishScores(v: unknown, keys: readonly string[]): TestDetails["english"] {
  if (!isObj(v)) return undefined;
  const out: Partial<Record<EnglishTestKey, EnglishScore>> = {};
  for (const k of keys) {
    const e = v[k];
    if (isObj(e)) out[k as EnglishTestKey] = { total: num(e.total), sections: sectionScores(e.sections) ?? {} };
  }
  return out;
}

/** The portfolio from the RPC's jsonb, keeping only the documented fields. */
export function normalizePortfolioView(raw: unknown): PortfolioView | null {
  if (!isObj(raw) || raw.kind !== "portfolio") return null;
  const h = isObj(raw.header) ? raw.header : {};
  const o = isObj(raw.options) ? raw.options : {};
  const a = isObj(raw.activities) ? raw.activities : {};
  const ca = isObj(a.commonApp) ? a.commonApp : {};
  const options: ResumeOptions = {
    source: oneOf(o.source, ["common", "uc", "both"] as readonly ResumeSource[]) ?? "both",
    showHours: o.showHours !== false,
    showScores: o.showScores !== false,
  };

  // portfolio_view returns activities either in the earlier format (before migration 0038: a few chosen keys, `awardLevel`,
  // `fromCommonApp`) or as full 2026-27 entries. upgradeActivities reads both and builds every entry from a fixed key list,
  // so a key we don't know never gets through; the entries it can't use (an unknown UC category) are dropped first.
  const ucRaw = arr(a.uc).flatMap((x): Obj[] => {
    if (!isObj(x) || !oneOf(x.category, UC_CATS)) return [];
    return [x.fromCommonApp === true && !x.fromId ? { ...x, fromId: "common-app" } : x];
  });
  // Entries with the new keys are current even if the payload does not say so (the work job title / workplace swap must not run on them).
  const current = a.version === 2 || ucRaw.some((x) => "awardLevels" in x);
  const upgraded = upgradeActivities({ ...(current ? { version: 2 } : {}), commonApp: { activities: arr(ca.activities), honors: arr(ca.honors) }, uc: ucRaw });
  // `legacy` is the student's private editing note and never leaves their account; hours and the per-grade work grid follow the résumé's "show hours" option.
  const shared = <T extends { hoursPerWeek: number | null; weeksPerYear: number | null; legacy?: string }>(x: T): T => {
    const out = { ...x, hoursPerWeek: options.showHours ? x.hoursPerWeek : null, weeksPerYear: options.showHours ? x.weeksPerYear : null };
    delete out.legacy;
    return out;
  };
  const activities: ActivityData = {
    version: 2,
    commonApp: { activities: upgraded.commonApp.activities.map(shared), honors: upgraded.commonApp.honors },
    uc: upgraded.uc.map((e) => ({ ...shared(e), workHours: options.showHours ? e.workHours : {} })),
  };

  const s = options.showScores && isObj(raw.scores) ? raw.scores : null;
  const profile: StudentProfile = s
    ? { gpa: num(s.gpa), sat: num(s.sat), act: num(s.act), tests: { sat: sectionScores(s.satSections), english: englishScores(s.english, ENGLISH_TEST_KEYS) } }
    : {};

  return {
    header: { fullName: str(h.fullName), school: str(h.school), gradYear: str(h.gradYear), email: "", phone: "", location: "" },
    options,
    activities,
    profile,
  };
}
