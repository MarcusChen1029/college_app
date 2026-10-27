// Business rules for the Connect AI tools. Pure functions on plain data: no Supabase, no React,
// no server-only imports, so node --test can run them. tools.ts does the reading and writing and
// calls these to decide what is allowed; they mirror what the website itself enforces.
//
// Excluded on purpose: saved logins (the profile's portals and each college's portal_* columns).
// Nothing in lib/mcp reads, returns or writes them, and the profile patch below rejects them.

import {
  CA_ACTIVITY_TYPES,
  CA_LIMITS,
  GRADES,
  HONOR_LEVELS,
  newCaActivity,
  newCaHonor,
  newUcEntry,
  UC_AWARD_LEVELS,
  UC_CATEGORY_KEYS,
  UC_LIMITS,
  type ActivityData,
  type CaActivity,
  type CaHonor,
  type UcEntry,
} from "../activities.ts";
import { hasDecision, isSubmitted } from "../application.ts";
import { CHECKLIST, ENGLISH_PLANS, ESSAY_STATUSES, isDone, newEssay, progress, safeLink, TEST_PLANS, type Checklist, type Essay } from "../checklist.ts";
import type { StudentProfile } from "../fit.ts";
import { daysUntil } from "../format.ts";
import { canAddMore, getPlan } from "../plans.ts";
import { cleanRegions, isRegion } from "../regions.ts";
import { DEFAULT_OPTIONS, EMPTY_HEADER, type ResumeHeader, type ResumeSettings, type ResumeSource } from "../resume.ts";
import { ACT_SCALE, ENGLISH_TEST_KEYS, ENGLISH_TESTS, parseScore, SAT_SCALE, satTotal, type EnglishScore, type ScoreScale, type SectionScores, type TestDetails } from "../scores.ts";
import type { Status } from "../student-rows.ts";
import { isPlanMonth, TEST_CHOICES, withPlanned, withTestChoice, type TestChoice } from "../test-plan.ts";
import type { Deadline } from "../types.ts";

export type Check<T> = { ok: true; value: T; warnings: string[] } | { ok: false; error: string };
const ok = <T,>(value: T, warnings: string[] = []): Check<T> => ({ ok: true, value, warnings });
const fail = (error: string): Check<never> => ({ ok: false, error });

// ── Senior gate ──

export const isSenior = (plan: string | null | undefined) => getPlan(plan).key === "senior";

export const seniorOnlyMessage = (origin: string) => `Connect AI is a Senior plan feature. The student can upgrade at ${origin}/pricing.`;

// ── Adding colleges, plans, statuses ──

/** The statuses the AI may set: what the website lets students pick, plus Results' decisions. */
export const AI_STATUSES = ["in_progress", "submitted", "admitted", "deferred", "waitlisted", "rejected", "enrolled", "withdrawn"] as const satisfies readonly Status[];
export type AiStatus = (typeof AI_STATUSES)[number];

/** `plan` must be an application plan (ED, EA, RD…) the college offers; null clears it. */
export function checkPlanKey(plan: string | null, offered: string[] | null | undefined): Check<string | null> {
  if (plan == null) return ok(null);
  const list = offered ?? [];
  if (!list.includes(plan)) return fail(`This college doesn't offer "${plan}". Offered plans: ${list.length ? list.join(", ") : "none published"}.`);
  return ok(plan);
}

export function checkAddCollege(input: { studentPlan: string | null | undefined; listedSlugs: string[]; slug: string; offeredPlans: string[] | null | undefined; plan?: string | null }): Check<{ plan: string | null }> {
  if (input.listedSlugs.includes(input.slug)) return fail(`${input.slug} is already on the student's list.`);
  if (!canAddMore(input.studentPlan, input.listedSlugs.length)) {
    return fail(`The list is full for the ${getPlan(input.studentPlan).name} plan (${input.listedSlugs.length} colleges).`);
  }
  const plan = checkPlanKey(input.plan ?? null, input.offeredPlans);
  return plan.ok ? ok({ plan: plan.value }) : plan;
}

/** Interested colleges are kept apart from the list: a listed college can't also be "interested". */
export function checkSetInterested(input: { interested: string[]; listedSlugs: string[]; slug: string; value: boolean }): Check<string[]> {
  const has = input.interested.includes(input.slug);
  if (input.value) {
    if (input.listedSlugs.includes(input.slug)) return fail(`${input.slug} is already on the student's list, so it can't also be marked interested.`);
    return ok(has ? input.interested : [...input.interested, input.slug]);
  }
  return ok(input.interested.filter((s) => s !== input.slug));
}

const missingItems = (c: Checklist) => CHECKLIST.filter(([k]) => !isDone(k, c)).map(([, label]) => label);

/**
 * Same transitions as the website. Submitted needs a complete checklist; decisions (and withdrawn) need the
 * application submitted first; going back to in progress is not possible once a decision is recorded.
 */
export function checkStatusChange(from: Status, to: AiStatus, checklist: Checklist): Check<Status> {
  if (to === from) return ok(from);
  if (to === "in_progress") {
    if (hasDecision(from)) return fail(`A decision (${from}) is already recorded. Set the status to "submitted" first if it was entered by mistake.`);
    return ok(to);
  }
  if (to === "submitted") {
    if (isSubmitted(from)) return ok(to);
    if (progress(checklist).missing > 0) return fail(`Can't mark as submitted yet. Checklist items not done: ${missingItems(checklist).join(", ")}.`);
    return ok(to);
  }
  if (!isSubmitted(from)) return fail(`Record "${to}" only after the application is submitted (current status: ${from}).`);
  return ok(to);
}

const isEd = (plan: string | null) => plan === "ED" || plan === "ED2";

/** Early Decision is binding, so a second ED/ED2 choice gets the same warning My list shows. */
export function edWarnings(entries: { slug: string; plan: string | null }[], changedSlug: string): string[] {
  const changed = entries.find((e) => e.slug === changedSlug);
  if (!changed || !isEd(changed.plan)) return [];
  const others = entries.filter((e) => e.slug !== changedSlug && isEd(e.plan));
  return others.length ? [`Early Decision is binding: the student now has ED at more than one college (${[changed, ...others].map((e) => e.slug).join(", ")}). They can only apply ED to one school per round.`] : [];
}

export const NOTES_MAX = 4000;

// ── Checklist and essays ──

export const CHECKLIST_BOOLEANS = ["recommendations", "transcript", "test_scores", "english_test", "no_essays"] as const;
const TEST_PLAN_KEYS: readonly string[] = TEST_PLANS.map(([k]) => k);
const ENGLISH_PLAN_KEYS: readonly string[] = ENGLISH_PLANS.map(([k]) => k);
const ESSAY_STATUS_KEYS: readonly string[] = ESSAY_STATUSES.map(([k]) => k);

export type ChecklistPatch = Partial<Record<(typeof CHECKLIST_BOOLEANS)[number], boolean>> & { test_plan?: string | null; english_plan?: string | null };

export function patchChecklist(current: Checklist, patch: Record<string, unknown>): Check<Checklist> {
  const next: Checklist = { ...current };
  for (const [key, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if ((CHECKLIST_BOOLEANS as readonly string[]).includes(key)) {
      if (typeof v !== "boolean") return fail(`${key} must be true or false.`);
      (next as Record<string, unknown>)[key] = v;
    } else if (key === "test_plan") {
      if (v !== null && !(typeof v === "string" && TEST_PLAN_KEYS.includes(v))) return fail(`test_plan must be one of: ${TEST_PLAN_KEYS.join(", ")}, or null.`);
      next.test_plan = v as Checklist["test_plan"];
    } else if (key === "english_plan") {
      if (v !== null && !(typeof v === "string" && ENGLISH_PLAN_KEYS.includes(v))) return fail(`english_plan must be one of: ${ENGLISH_PLAN_KEYS.join(", ")}, or null.`);
      next.english_plan = v as Checklist["english_plan"];
    } else {
      return fail(`Unknown checklist field "${key}". Allowed: ${[...CHECKLIST_BOOLEANS, "test_plan", "english_plan"].join(", ")}. Essays use add_essay / update_essay.`);
    }
  }
  return ok(next);
}

export const ESSAY_TITLE_MAX = 200;

type EssayFields = { title?: unknown; url?: unknown; status?: unknown };

// A new essay needs a title; an existing one may be cleared back to untitled, as the website allows.
function essayFields(f: EssayFields, allowBlankTitle: boolean): Check<Partial<Omit<Essay, "id">>> {
  const out: Partial<Omit<Essay, "id">> = {};
  if (f.title !== undefined) {
    if (typeof f.title !== "string" || (!allowBlankTitle && !f.title.trim())) return fail("Essay title can't be empty.");
    if (f.title.trim().length > ESSAY_TITLE_MAX) return fail(`Essay title is limited to ${ESSAY_TITLE_MAX} characters.`);
    out.title = f.title.trim();
  }
  if (f.url !== undefined) {
    if (typeof f.url !== "string") return fail("Essay url must be a string.");
    const link = f.url.trim() === "" ? "" : safeLink(f.url);
    if (link == null) return fail("Essay url must start with http:// or https:// (or be empty).");
    out.url = link;
  }
  if (f.status !== undefined) {
    if (typeof f.status !== "string" || !ESSAY_STATUS_KEYS.includes(f.status)) return fail(`Essay status must be one of: ${ESSAY_STATUS_KEYS.join(", ")}.`);
    out.status = f.status as Essay["status"];
  }
  return ok(out);
}

/** Adding an essay also clears "no essays", since the student evidently has one. */
export function addEssay(current: Checklist, fields: EssayFields): Check<{ checklist: Checklist; essay: Essay }> {
  if (typeof fields.title !== "string") return fail("Essay title is required.");
  const f = essayFields(fields, false);
  if (!f.ok) return f;
  const essay: Essay = { ...newEssay(), ...f.value };
  return ok({ checklist: { ...current, no_essays: false, essay_list: [...(current.essay_list ?? []), essay] }, essay });
}

/** There is deliberately no delete: the AI can add and update essays, never remove them. */
export function updateEssay(current: Checklist, id: string, fields: EssayFields): Check<{ checklist: Checklist; essay: Essay }> {
  const list = current.essay_list ?? [];
  const existing = list.find((e) => e.id === id);
  if (!existing) return fail(`No essay with id "${id}". Use get_applications to see the essay ids.`);
  const f = essayFields(fields, true);
  if (!f.ok) return f;
  const essay = { ...existing, ...f.value };
  return ok({ checklist: { ...current, essay_list: list.map((e) => (e.id === id ? essay : e)) }, essay });
}

// ── Activities ──

export const ACTIVITY_KINDS = ["common_app_activity", "common_app_honor", "uc_entry"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

type Spec = (v: unknown, name: string) => Check<unknown>;

const text = (max: number): Spec => (v, name) => (typeof v === "string" ? (v.length <= max ? ok(v) : fail(`${name} is limited to ${max} characters (got ${v.length}).`)) : fail(`${name} must be text.`));
const oneOf = (allowed: readonly string[], nullable = false): Spec => (v, name) =>
  (nullable && v === null) || (typeof v === "string" && allowed.includes(v)) ? ok(v) : fail(`${name} must be one of: ${allowed.join(", ")}${nullable ? ", or null" : ""}.`);
const listOf = (allowed: readonly string[]): Spec => (v, name) =>
  Array.isArray(v) && v.every((x) => typeof x === "string" && allowed.includes(x)) ? ok([...new Set(v)]) : fail(`${name} must be a list drawn from: ${allowed.join(", ")}.`);
const numberOrNull = (min: number, max: number): Spec => (v, name) =>
  v === null || (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max) ? ok(v) : fail(`${name} must be a number from ${min} to ${max}, or null.`);
const boolOrNull: Spec = (v, name) => (v === null || typeof v === "boolean" ? ok(v) : fail(`${name} must be true, false or null.`));

const CA_ACTIVITY_SPEC: Record<string, Spec> = {
  type: oneOf(CA_ACTIVITY_TYPES),
  position: text(CA_LIMITS.position),
  organization: text(CA_LIMITS.organization),
  description: text(CA_LIMITS.description),
  grades: listOf(GRADES),
  timing: listOf(["school", "break"]),
  hoursPerWeek: numberOrNull(0, 168),
  weeksPerYear: numberOrNull(0, 52),
  continueInCollege: boolOrNull,
};
const CA_HONOR_SPEC: Record<string, Spec> = { title: text(CA_LIMITS.honorTitle), grades: listOf(GRADES), levels: listOf(Object.keys(HONOR_LEVELS)) };
const UC_SPEC: Record<string, Spec> = {
  name: text(UC_LIMITS.name),
  organization: text(UC_LIMITS.name),
  extra: text(UC_LIMITS.extra),
  description: text(UC_LIMITS.description),
  grades: listOf(GRADES),
  hoursPerWeek: numberOrNull(0, 168),
  weeksPerYear: numberOrNull(0, 52),
  awardLevel: oneOf(Object.keys(UC_AWARD_LEVELS), true),
  awardType: oneOf(["academic", "non_academic"], true),
};

const SPECS: Record<ActivityKind, Record<string, Spec>> = { common_app_activity: CA_ACTIVITY_SPEC, common_app_honor: CA_HONOR_SPEC, uc_entry: UC_SPEC };

/** Checks every given field against the kind's spec; unknown fields are an error so typos aren't silently dropped. */
function checkFields(kind: ActivityKind, fields: Record<string, unknown>, extra: Record<string, Spec> = {}): Check<Record<string, unknown>> {
  const spec = { ...SPECS[kind], ...extra };
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const s = spec[key];
    if (!s) return fail(`Unknown field "${key}" for ${kind}. Allowed: ${Object.keys(spec).join(", ")}.`);
    const r = s(v, key);
    if (!r.ok) return r;
    out[key] = r.value;
  }
  return ok(out);
}

export const normalizeActivities = (a: Partial<ActivityData> | null | undefined): ActivityData => ({
  commonApp: { activities: a?.commonApp?.activities ?? [], honors: a?.commonApp?.honors ?? [] },
  uc: a?.uc ?? [],
});

const LIMIT_OF: Record<ActivityKind, { max: number; label: string }> = {
  common_app_activity: { max: CA_LIMITS.activities, label: "Common App activities" },
  common_app_honor: { max: CA_LIMITS.honors, label: "Common App honors" },
  uc_entry: { max: UC_LIMITS.entries, label: "UC entries" },
};

type Item = CaActivity | CaHonor | UcEntry;
const itemsOf = (d: ActivityData, kind: ActivityKind): Item[] => (kind === "common_app_activity" ? d.commonApp.activities : kind === "common_app_honor" ? d.commonApp.honors : d.uc);
function withItems(d: ActivityData, kind: ActivityKind, items: Item[]): ActivityData {
  if (kind === "common_app_activity") return { ...d, commonApp: { ...d.commonApp, activities: items as CaActivity[] } };
  if (kind === "common_app_honor") return { ...d, commonApp: { ...d.commonApp, honors: items as CaHonor[] } };
  return { ...d, uc: items as UcEntry[] };
}

export function addActivity(current: Partial<ActivityData> | null | undefined, kind: ActivityKind, fields: Record<string, unknown>): Check<{ data: ActivityData; item: Item }> {
  const data = normalizeActivities(current);
  const items = itemsOf(data, kind);
  const { max, label } = LIMIT_OF[kind];
  if (items.length >= max) return fail(`The ${label} list is full (${max}). Delete or update an existing one instead.`);
  const f = checkFields(kind, fields, kind === "uc_entry" ? { category: oneOf(UC_CATEGORY_KEYS) } : {});
  if (!f.ok) return f;
  let item: Item;
  if (kind === "common_app_activity") {
    item = { ...newCaActivity(), ...f.value };
    if (!(item as CaActivity).organization && !(item as CaActivity).position) return fail("A Common App activity needs an organization or a position.");
  } else if (kind === "common_app_honor") {
    item = { ...newCaHonor(), ...f.value };
    if (!(item as CaHonor).title.trim()) return fail("A Common App honor needs a title.");
  } else {
    if (typeof f.value.category !== "string") return fail(`A UC entry needs a category: ${UC_CATEGORY_KEYS.join(", ")}.`);
    item = { ...newUcEntry(f.value.category as UcEntry["category"]), ...f.value };
    if (!(item as UcEntry).name.trim()) return fail("A UC entry needs a name.");
  }
  return ok({ data: withItems(data, kind, [...items, item]), item });
}

export function updateActivity(current: Partial<ActivityData> | null | undefined, kind: ActivityKind, id: string, fields: Record<string, unknown>): Check<{ data: ActivityData; item: Item }> {
  const data = normalizeActivities(current);
  const items = itemsOf(data, kind);
  const existing = items.find((i) => i.id === id);
  if (!existing) return fail(`No ${kind} with id "${id}". Use get_activities to see the ids.`);
  const f = checkFields(kind, fields);
  if (!f.ok) return f;
  const item = { ...existing, ...f.value } as Item;
  return ok({ data: withItems(data, kind, items.map((i) => (i.id === id ? item : i))), item });
}

export function deleteActivity(current: Partial<ActivityData> | null | undefined, kind: ActivityKind, id: string): Check<{ data: ActivityData; removed: Item }> {
  const data = normalizeActivities(current);
  const items = itemsOf(data, kind);
  const removed = items.find((i) => i.id === id);
  if (!removed) return fail(`No ${kind} with id "${id}". Use get_activities to see the ids.`);
  return ok({ data: withItems(data, kind, items.filter((i) => i.id !== id)), removed });
}

// ── Profile and resume ──

/** Fields the AI may never change, with the reason to tell it. */
const PROFILE_FORBIDDEN: Record<string, string> = {
  plan: "The subscription plan can only be changed by the student on the Pricing page.",
  reminderEmails: "The reminder-email setting can only be changed by the student on the website.",
  portals: "Saved logins are private and not available to AI.",
  portal: "Saved logins are private and not available to AI.",
};

const section = (scale: ScoreScale, key: string, v: unknown, label: string): Check<number | null> => {
  if (v === null) return ok(null);
  const s = scale.sections.find((x) => x.key === key);
  if (!s) return fail(`${label}: unknown section "${key}". Sections: ${scale.sections.map((x) => x.key).join(", ")}.`);
  const n = typeof v === "number" ? parseScore(String(v), s) : null;
  return n == null ? fail(`${label} ${key} must be a number from ${s.min} to ${s.max} in steps of ${s.step}, or null.`) : ok(n);
};

function applySections(label: string, scale: ScoreScale, current: SectionScores | undefined, patch: unknown): Check<SectionScores> {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return fail(`${label} sections must be an object like { ${scale.sections[0].key}: 700 }.`);
  const next: SectionScores = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const r = section(scale, k, v, label);
    if (!r.ok) return r;
    next[k] = r.value;
  }
  return ok(next);
}

function total(scale: ScoreScale, v: unknown, label: string): Check<number | null> {
  if (v === null) return ok(null);
  const n = typeof v === "number" ? parseScore(String(v), scale) : null;
  return n == null ? fail(`${label} must be a number from ${scale.min} to ${scale.max} in steps of ${scale.step}, or null.`) : ok(n);
}

/** Validates a profile patch with the score scales and returns the merged profile. */
export function applyProfilePatch(profile: StudentProfile, patch: Record<string, unknown>): Check<StudentProfile> {
  let next: StudentProfile = { ...profile, tests: { ...profile.tests } };
  const tests = (): TestDetails => next.tests as TestDetails;
  for (const [key, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (PROFILE_FORBIDDEN[key]) return fail(PROFILE_FORBIDDEN[key]);
    switch (key) {
      case "gpa": {
        if (v !== null && !(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 4)) return fail("gpa must be a number from 0 to 4 (unweighted, 4.0 scale), or null.");
        next.gpa = v as number | null;
        break;
      }
      case "gpaWeighted": {
        if (v !== null && !(typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 6)) return fail("gpaWeighted must be a number from 0 to 6 (as printed on the transcript), or null.");
        next.gpaWeighted = v as number | null;
        break;
      }
      case "testChoice": {
        if (!TEST_CHOICES.includes(v as TestChoice)) return fail(`testChoice must be one of: ${TEST_CHOICES.join(", ")}. "planned" = will take a test but has no score yet; "none" = not taking one (test-optional).`);
        tests().plan = withTestChoice(tests().plan, v as TestChoice);
        break;
      }
      case "plannedTest": {
        if (v !== "sat" && v !== "act") return fail('plannedTest must be "sat" or "act".');
        tests().plan = withPlanned(tests().plan, { test: v });
        break;
      }
      case "plannedMonth": {
        if (v !== null && !isPlanMonth(v)) return fail("plannedMonth must be YYYY-MM (e.g. 2026-12), or null when the month isn't known.");
        tests().plan = withPlanned(tests().plan, { month: v });
        break;
      }
      case "sat":
      case "act": {
        const r = total(key === "sat" ? SAT_SCALE : ACT_SCALE, v, key.toUpperCase());
        if (!r.ok) return r;
        next[key] = r.value;
        break;
      }
      case "satSections":
      case "actSections": {
        const isSat = key === "satSections";
        const r = applySections(isSat ? "SAT" : "ACT", isSat ? SAT_SCALE : ACT_SCALE, tests()[isSat ? "sat" : "act"], v);
        if (!r.ok) return r;
        tests()[isSat ? "sat" : "act"] = r.value;
        // Like the website: both SAT sections fill in the total, unless the patch sets it explicitly.
        if (isSat && patch.sat === undefined && satTotal(r.value) != null) next.sat = satTotal(r.value);
        break;
      }
      case "english": {
        if (v === null || typeof v !== "object" || Array.isArray(v)) return fail("english must be an object keyed by test, e.g. { ielts: { total: 7.5, sections: { reading: 8 }, date: \"2026-09-01\" } }.");
        const english = { ...tests().english };
        for (const [testKey, score] of Object.entries(v)) {
          if (!(ENGLISH_TEST_KEYS as string[]).includes(testKey)) return fail(`Unknown English test "${testKey}". Tests: ${ENGLISH_TEST_KEYS.join(", ")}.`);
          const k = testKey as keyof typeof ENGLISH_TESTS;
          if (score === null) {
            delete english[k];
            continue;
          }
          if (typeof score !== "object" || Array.isArray(score)) return fail(`english.${testKey} must be an object with total, sections and/or date, or null to remove it.`);
          const s = score as { total?: unknown; sections?: unknown; date?: unknown };
          const merged: EnglishScore = { total: null, sections: {}, ...english[k] };
          if (s.total !== undefined) {
            const r = total(ENGLISH_TESTS[k], s.total, `english.${testKey}.total`);
            if (!r.ok) return r;
            merged.total = r.value;
          }
          if (s.sections !== undefined) {
            const r = applySections(`english.${testKey}`, ENGLISH_TESTS[k], merged.sections, s.sections);
            if (!r.ok) return r;
            merged.sections = r.value;
          }
          if (s.date !== undefined) {
            if (s.date !== null && !(typeof s.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.date))) return fail(`english.${testKey}.date must be YYYY-MM-DD or null.`);
            merged.date = s.date as string | null;
          }
          english[k] = merged;
        }
        tests().english = english;
        break;
      }
      case "international": {
        if (typeof v !== "boolean") return fail("international must be true or false.");
        next.international = v;
        break;
      }
      case "targetRegions": {
        if (!Array.isArray(v) || !v.every(isRegion)) return fail("targetRegions must be a list of region codes: US, GB, CA, AU.");
        next.targetRegions = cleanRegions(v);
        break;
      }
      default:
        return fail(`Can't change "${key}". Allowed: gpa, gpaWeighted, sat, act, satSections, actSections, testChoice, plannedTest, plannedMonth, english, international, targetRegions.`);
    }
  }
  next = { ...next };
  return ok(next);
}

const HEADER_KEYS = Object.keys(EMPTY_HEADER) as (keyof ResumeHeader)[];
const RESUME_SOURCES: readonly ResumeSource[] = ["common", "uc", "both"];

export function applyResumePatch(current: ResumeSettings | null | undefined, patch: { header?: unknown; options?: unknown }): Check<ResumeSettings> {
  const next: ResumeSettings = { header: { ...current?.header }, options: { ...current?.options } };
  const extra = Object.keys(patch).filter((k) => k !== "header" && k !== "options" && (patch as Record<string, unknown>)[k] !== undefined);
  if (extra.length) return fail(`Unknown resume setting "${extra[0]}". Allowed: header, options.`);
  if (patch.header !== undefined) {
    if (patch.header === null || typeof patch.header !== "object" || Array.isArray(patch.header)) return fail("header must be an object.");
    for (const [k, v] of Object.entries(patch.header)) {
      if (v === undefined) continue;
      if (!HEADER_KEYS.includes(k as keyof ResumeHeader)) return fail(`Unknown header field "${k}". Allowed: ${HEADER_KEYS.join(", ")}.`);
      if (typeof v !== "string" || v.length > 200) return fail(`header.${k} must be text of at most 200 characters.`);
      next.header![k as keyof ResumeHeader] = v.trim();
    }
  }
  if (patch.options !== undefined) {
    if (patch.options === null || typeof patch.options !== "object" || Array.isArray(patch.options)) return fail("options must be an object.");
    for (const [k, v] of Object.entries(patch.options)) {
      if (v === undefined) continue;
      if (k === "source") {
        if (typeof v !== "string" || !RESUME_SOURCES.includes(v as ResumeSource)) return fail(`options.source must be one of: ${RESUME_SOURCES.join(", ")}.`);
        next.options!.source = v as ResumeSource;
      } else if (k === "showHours" || k === "showScores") {
        if (typeof v !== "boolean") return fail(`options.${k} must be true or false.`);
        next.options![k] = v;
      } else {
        return fail(`Unknown option "${k}". Allowed: ${Object.keys(DEFAULT_OPTIONS).join(", ")}.`);
      }
    }
  }
  return ok(next);
}

// ── Deadlines ──

export type ListedCollege = { slug: string; name: string; id: string; plan: string | null };
export type UpcomingDeadline = { slug: string; college: string; due_date: string; days: number; kind: string; plan_key: string | null; label: string | null };

/**
 * Dates for listed colleges, soonest first, within `days` days (all future dates when omitted). Same filter as My list:
 * once the student picked a plan, only that plan's application deadline is shown.
 */
export function upcomingDeadlines(listed: ListedCollege[], deadlines: Deadline[], days?: number, today = new Date()): UpcomingDeadline[] {
  return listed
    .flatMap((c) =>
      deadlines
        .filter((d) => d.institution_id === c.id && d.due_date && daysUntil(d.due_date, today) >= 0 && (days == null || daysUntil(d.due_date, today) <= days))
        .filter((d) => d.kind !== "application" || !c.plan || d.plan_key === c.plan)
        .map((d) => ({ slug: c.slug, college: c.name, due_date: d.due_date!, days: daysUntil(d.due_date!, today), kind: d.kind, plan_key: d.plan_key, label: d.label })),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}
