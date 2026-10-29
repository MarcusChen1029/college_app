// The fill plan for the Common App "Activities and experiences" and "Honors" pages: every question of every slot, in the portal's own
// words. Pure data in, pure data out; the extension types it in (Task 10). Portal facts: docs/superpowers/research/2026-10-27-portal-dom.md
// §6 (Activities) and §8 (Honors). The portal silently drops a value that fails a front-end check, so anything it would drop is
// reported as `blocked` here and never planned; the extension reads the page back afterwards (`readBackMismatches`).

import {
  CA_CONTINUE,
  CA_LIMITS,
  CA_TIMING,
  GRADES,
  HONOR_LEVELS,
  caActivityIssues,
  caHonorIssues,
  caVisibleQuestions,
  type ActivityData,
  type CaActivity,
  type CaHonor,
  type Grade,
  type HonorLevel,
  type Issue,
} from "./activities.ts";

export type CaPage = "activities" | "honors";
export const CA_PAGE_LIMIT: Record<CaPage, number> = { activities: CA_LIMITS.activities, honors: CA_LIMITS.honors };

/**
 * One question of one slot. `question` is the portal's label text to find (contains-match, case-insensitive, inside the slot).
 * `value` null = clear the question (hidden, or the student has not answered it). Dates are "Month YYYY"; checks are the
 * portal's checkbox labels.
 */
export type CaAnswer = { question: string; kind: "select" | "text" | "radio" | "checks" | "date"; value: string | string[] | null };
/** `answers` covers EVERY question of the slot, in reveal order, because a re-added slot may still hold old answers. */
export type CaSlotPlan = { sourceId: string; label: string; answers: CaAnswer[] };
export type PlanProblem = { label: string; reasons: string[] };
/** `blocked`: the portal would reject or cut the item, so it is not planned. `blanks`: planned, but these questions need an answer. */
export type CaPagePlan = { page: CaPage; slots: CaSlotPlan[]; blocked: PlanProblem[]; blanks: PlanProblem[] };

type Spec = { question: string; kind: CaAnswer["kind"]; name: string };

// Activities: all 14 questions of a slot in reveal order (a subset is visible at a time: caVisibleQuestions).
const ACTIVITY_SPECS: Partial<Record<keyof CaActivity, Spec>> = {
  type: { question: "Activity or experience type", kind: "select", name: "Activity type" },
  sport: { question: "Sport/team", kind: "select", name: "Sport/team" },
  description: { question: "Describe this activity", kind: "text", name: "Description" },
  organization: { question: "Organization or group", kind: "text", name: "Organization or group" },
  leadership: { question: "specific position or leadership role", kind: "radio", name: "Leadership role" },
  position: { question: "What was your role?", kind: "text", name: "Role" },
  grades: { question: "When did you participate?", kind: "checks", name: "When you took part" },
  timing: { question: "Time of year", kind: "radio", name: "Time of year" },
  afterStart: { question: "Start date", kind: "date", name: "Start date" },
  stillParticipating: { question: "still participating", kind: "radio", name: "Still participating" },
  afterEnd: { question: "End date", kind: "date", name: "End date" },
  hoursPerWeek: { question: "Hours spent per week", kind: "text", name: "Hours spent per week" },
  weeksPerYear: { question: "Weeks spent per year", kind: "text", name: "Weeks spent per year" },
  continueInCollege: { question: "participating in this activity in college", kind: "radio", name: "Plan to continue in college" },
};
const ACTIVITY_ORDER = Object.keys(ACTIVITY_SPECS) as (keyof CaActivity)[];

const HONOR_SPECS: Partial<Record<keyof CaHonor, Spec>> = {
  title: { question: "title", kind: "text", name: "Title" },
  grades: { question: "Grade level", kind: "checks", name: "Grade level" },
  levels: { question: "Level(s) of recognition", kind: "checks", name: "Level of recognition" },
};
const HONOR_ORDER = Object.keys(HONOR_SPECS) as (keyof CaHonor)[];

/** Every question of one slot on `page`, in reveal order: the same `question` / `kind` pairs a plan's answers carry (the extension reads them back). */
export function caQuestions(page: CaPage): { question: string; kind: CaAnswer["kind"] }[] {
  const specs: Spec[] = page === "activities" ? ACTIVITY_ORDER.map((k) => ACTIVITY_SPECS[k]!) : HONOR_ORDER.map((k) => HONOR_SPECS[k]!);
  return specs.map(({ question, kind }) => ({ question, kind }));
}

const ACTIVITY_GRADE_LABEL: Record<Grade, string> = { "9": "9th grade", "10": "10th grade", "11": "11th grade", "12": "12th grade", PG: "After graduating high school" };
const HONOR_GRADE_LABEL: Record<Grade, string> = { "9": "9", "10": "10", "11": "11", "12": "12", PG: "Post-graduate" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The portal types at most this many characters into hours / weeks (the input's maxlength). */
const TYPED_NUMBER_MAX = 5;

const yesNo = (v: boolean | null) => (v === null ? null : v ? "Yes" : "No");
const textOrNull = (s: string) => (s.trim() ? s : null);
/** "2025-09" -> "September 2025"; null for anything else. */
function monthYear(v: string | null): string | null {
  const m = v === null ? null : /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}
/** A number as it is typed into the portal: no trailing zeros ("5.5", "10"). */
const typed = (n: number | null) => (n === null ? null : String(n));
const checksOrNull = (labels: string[]) => (labels.length ? labels : null);

function activityValue(a: CaActivity, key: keyof CaActivity): CaAnswer["value"] {
  switch (key) {
    case "type": return textOrNull(a.type);
    case "sport": return textOrNull(a.sport);
    case "description": return textOrNull(a.description);
    case "organization": return textOrNull(a.organization);
    case "leadership": return yesNo(a.leadership);
    case "position": return textOrNull(a.position);
    case "grades": return checksOrNull(GRADES.filter((g) => a.grades.includes(g)).map((g) => ACTIVITY_GRADE_LABEL[g]));
    case "timing": return a.timing ? CA_TIMING[a.timing] : null;
    case "afterStart": return monthYear(a.afterStart);
    case "stillParticipating": return yesNo(a.stillParticipating);
    case "afterEnd": return monthYear(a.afterEnd);
    case "hoursPerWeek": return typed(a.hoursPerWeek);
    case "weeksPerYear": return typed(a.weeksPerYear);
    case "continueInCollege": return a.continueInCollege ? CA_CONTINUE[a.continueInCollege] : null;
    default: return null; // id, legacy: never sent
  }
}

function honorValue(h: CaHonor, key: keyof CaHonor): CaAnswer["value"] {
  switch (key) {
    case "title": return textOrNull(h.title);
    case "grades": return checksOrNull(GRADES.filter((g) => h.grades.includes(g)).map((g) => HONOR_GRADE_LABEL[g]));
    case "levels": return checksOrNull((Object.keys(HONOR_LEVELS) as HonorLevel[]).filter((l) => h.levels.includes(l)).map((l) => HONOR_LEVELS[l]));
    default: return null;
  }
}

export function itemLabel(page: CaPage, item: CaActivity | CaHonor): string {
  if (page === "honors") return (item as CaHonor).title.trim() || "Untitled honor";
  const a = item as CaActivity;
  return a.organization.trim() || a.type || "Untitled activity";
}

export function keepRoom(page: CaPage, existing: number): number {
  return Math.max(0, CA_PAGE_LIMIT[page] - existing);
}

/** `what` is the noun already in the right number for `names.length` ("activity" for 1, "activities" for 2). */
export function replacedNote(portal: "Common App" | "UC", what: string, names: string[]): string {
  return `Replaced the ${names.length} ${what} that ${names.length === 1 ? "was" : "were"} already on ${portal}: ${names.join(", ")}.`;
}

/** Hours / weeks that pass the range check but would need more than 5 typed characters (e.g. 10.1234): the portal drops those. */
function typedLengthIssues(a: CaActivity): Issue[] {
  const out: Issue[] = [];
  for (const key of ["hoursPerWeek", "weeksPerYear"] as const) {
    const n = a[key];
    if (n === null || !Number.isFinite(n)) continue;
    const s = String(n);
    if (s.length > TYPED_NUMBER_MAX) out.push({ field: key, kind: "invalid", message: `"${s}" is longer than the ${TYPED_NUMBER_MAX} characters Common App accepts here.` });
  }
  return out;
}

function reasonsOf(issues: Issue[], kind: Issue["kind"], specs: Partial<Record<string, Spec>>): string[] {
  return issues
    .filter((i) => i.kind === kind)
    .map((i) => {
      const name = specs[i.field]?.name ?? i.field;
      return kind === "missing" ? `${name}: needs an answer` : `${name}: ${i.message}`;
    });
}

export function buildCaPagePlan(data: ActivityData, page: CaPage, pickIds?: string[]): CaPagePlan {
  const all: (CaActivity | CaHonor)[] = page === "activities" ? data.commonApp.activities : data.commonApp.honors;
  const items = pickIds ? pickIds.flatMap((id) => all.filter((x) => x.id === id).slice(0, 1)) : all;
  const plan: CaPagePlan = { page, slots: [], blocked: [], blanks: [] };

  for (const item of items) {
    const label = itemLabel(page, item);
    const issues = page === "activities" ? [...caActivityIssues(item as CaActivity), ...typedLengthIssues(item as CaActivity)] : caHonorIssues(item as CaHonor);
    const blocked = reasonsOf(issues, "invalid", page === "activities" ? ACTIVITY_SPECS : HONOR_SPECS);
    if (blocked.length) {
      plan.blocked.push({ label, reasons: blocked });
      continue;
    }

    let answers: CaAnswer[];
    if (page === "activities") {
      const a = item as CaActivity;
      const visible = new Set(caVisibleQuestions(a));
      answers = ACTIVITY_ORDER.map((key) => {
        const spec = ACTIVITY_SPECS[key]!;
        return { question: spec.question, kind: spec.kind, value: visible.has(key) ? activityValue(a, key) : null };
      });
    } else {
      const h = item as CaHonor;
      answers = HONOR_ORDER.map((key) => {
        const spec = HONOR_SPECS[key]!;
        return { question: spec.question, kind: spec.kind, value: honorValue(h, key) };
      });
    }
    plan.slots.push({ sourceId: item.id, label, answers });

    const blanks = reasonsOf(issues, "missing", page === "activities" ? ACTIVITY_SPECS : HONOR_SPECS);
    if (blanks.length) plan.blanks.push({ label, reasons: blanks });
  }
  return plan;
}

// ── Read-back ──

const clean = (s: string) => s.replace(/\r\n?/g, "\n").trim();

/** "September 2025", "09/2025" or "2025-09" -> "2025-09"; anything else is returned cleaned, lower-cased. */
function dateKey(s: string): string {
  const t = clean(s);
  const named = /^([A-Za-z]+)\s+(\d{4})$/.exec(t);
  if (named) {
    const i = MONTHS.findIndex((m) => m.toLowerCase() === named[1]!.toLowerCase());
    if (i >= 0) return `${named[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  const slash = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (slash) return `${slash[2]}-${slash[1]!.padStart(2, "0")}`;
  return t.toLowerCase();
}

function normalize(kind: CaAnswer["kind"], v: string | string[] | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => clean(x).toLowerCase()).filter(Boolean).sort().join("\u0000");
  if (kind === "date") return dateKey(v);
  return kind === "text" ? clean(v) : clean(v).toLowerCase();
}

const show = (v: string | string[] | null | undefined) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : v);

/** The shown value for a question: the exact key, else a key (the portal's full label) that contains it, ignoring case. */
function shownFor(shown: Record<string, string | string[]>, question: string): string | string[] | undefined {
  if (question in shown) return shown[question];
  const q = question.toLowerCase();
  const key = Object.keys(shown).find((k) => k.toLowerCase().includes(q));
  return key === undefined ? undefined : shown[key];
}

/**
 * Compares what the portal shows after the fill (`shown[i]` = slot i, keyed by question) with what the plan sent, e.g.
 * `Activity 2: Hours spent per week shows "" (sent "10")`. A cleared question must show nothing.
 * `shown[0]` is portal slot `firstSlot` (default 1), so messages name the portal's slot when a Keep fill started after existing entries.
 */
export function readBackMismatches(plan: CaPagePlan, shown: Record<string, string | string[]>[], firstSlot = 1): string[] {
  const noun = plan.page === "activities" ? "Activity" : "Honors";
  const out: string[] = [];
  plan.slots.forEach((slot, i) => {
    const row = shown[i];
    const n = firstSlot + i;
    if (!row) {
      out.push(`${noun} ${n}: not found on the page`);
      return;
    }
    for (const ans of slot.answers) {
      const got = shownFor(row, ans.question);
      if (normalize(ans.kind, got) === normalize(ans.kind, ans.value)) continue;
      const sent = ans.value === null ? "nothing" : `"${show(ans.value)}"`;
      out.push(`${noun} ${n}: ${ans.question} shows "${show(got)}" (sent ${sent})`);
    }
  });
  return out;
}
