// The fill plan for the UC "Activities & awards" add/edit form (#addActivitiesForm): every box of each entry by its element id, in reveal
// order (the category first, grades before the after-12th selects, a work grade's tick before its school/summer boxes, "still working"
// before the dates). Pure data in, pure data out; the extension types it in. Portal facts: docs/superpowers/research/2026-10-27-portal-dom.md §7.
// UC cuts over-long text on keyup and before submit instead of rejecting it, so anything UC would cut or reject is `blocked` here and never
// typed. Only fields UC shows for the entry are planned (ucVisibleQuestions), so a stored value for a hidden question is never sent.
// The `legacy` note and ids are never read.

import type { PlanProblem } from "./activities-fill.ts";
import {
  GRADES,
  UC_CATEGORIES,
  UC_EDPREP_OTHER,
  UC_EDPREP_PROGRAMS,
  ucEntryIssues,
  ucVisibleQuestions,
  type Grade,
  type Issue,
  type UcAwardLevel,
  type UcCategory,
  type UcEntry,
} from "./activities.ts";

/**
 * One box to set. `id` is the element id; for a radio it is the group's name and `value` the option's value (award type A/O, still working
 * N/Y). Checks are set to `true`; a check that is not planned is left untouched. Select and text values are what the portal takes.
 */
export type UcFieldSet = { id: string; kind: "text" | "select" | "check" | "radio"; value: string | boolean };

export type UcFormCategory = "Award" | "EdPrep" | "ExtraCurr" | "OtherCourse" | "Volunteer" | "WorkExp";

/** `expect`: what the list page's read-only section should show afterwards, keyed by its `p.subsectionheader` text (see UcFormPlan note below). */
export type UcFormPlan = { sourceId: string; label: string; category: UcFormCategory; fields: UcFieldSet[]; expect: Record<string, string[]> };

type Form = {
  type: UcFormCategory;
  /** Capitalised, for the grade ids: is<Prefix><9th|...>. */
  prefix: string;
  /** For the hours, weeks and after-12th ids: <lower>HoursPerWeek, <lower>YearsAfter12. */
  lower: string;
  name: string;
  extra?: string;
  jobTitle?: string;
  description: string;
  yearsAfter: string;
  monthsAfter: string;
};

const FORMS: Record<UcCategory, Form> = {
  award: { type: "Award", prefix: "Award", lower: "award", name: "awardName", extra: "awardRequirements", description: "awardAchievement", yearsAfter: "", monthsAfter: "" },
  edprep: { type: "EdPrep", prefix: "EdPrep", lower: "edPrep", name: "edPrep_other", description: "edPrepDescription", yearsAfter: "edPrepYearsAfter12", monthsAfter: "edPrepMonthsAfter12" },
  extracurricular: { type: "ExtraCurr", prefix: "ExtraCurr", lower: "extraCurr", name: "extraCurName", description: "extraCurrDescription", yearsAfter: "extraCurrYearsAfter12", monthsAfter: "extraCurrMonthsAfter12" },
  coursework: { type: "OtherCourse", prefix: "OtherCourse", lower: "otherCourse", name: "otherCourseName", description: "otherCourseDescription", yearsAfter: "otherCourseYearsAfter12", monthsAfter: "otherCourseMonthsAfter12" },
  volunteer: { type: "Volunteer", prefix: "Volunteer", lower: "volunteer", name: "volunteerOrg", extra: "volunteerOrgDesc", description: "volunteerDescription", yearsAfter: "volunteerYearsAfter12", monthsAfter: "volunteerMonthsAfter12" },
  work: { type: "WorkExp", prefix: "WorkExp", lower: "workExp", name: "workExpName", extra: "workExpDesc", jobTitle: "workExpPosTitle", description: "workExpPosDesc", yearsAfter: "workExpAfter12thYears", monthsAfter: "workExpAfter12thMonths" },
};

/** The grade part of the ids (and "10th grade" on the list page). */
const GRADE_ID: Record<Grade, string> = { "9": "9th", "10": "10th", "11": "11th", "12": "12th", PG: "After12th" };
const AWARD_LEVEL_ID: Record<UcAwardLevel, string> = {
  school: "isAwardLevelSchool",
  city: "isAwardLevelCity",
  state: "isAwardLevelState",
  regional: "isAwardLevelRegion",
  national: "isAwardLevelNational",
  international: "isAwardLevelIntl",
};
const AWARD_LEVEL_ORDER: UcAwardLevel[] = ["school", "city", "state", "regional", "national", "international"];

/** What a question is called in a "needs an answer" / "UC would cut it" reason: UC's own wording where the category has one. */
function questionName(e: UcEntry, field: string): string {
  const form = UC_CATEGORIES[e.category];
  switch (field) {
    case "name": return e.category === "edprep" ? "Program name" : form.name;
    case "jobTitle": return form.jobTitle ?? "Job title";
    case "extra": return form.extra ?? "Description box";
    case "description": return form.description;
    case "program": return "What was the program name?";
    case "grades": return "When you took part";
    case "hoursPerWeek": return "Hours per week";
    case "weeksPerYear": return "Weeks per year";
    case "afterYears": return "Years after 12th grade";
    case "afterMonths": return "Months after 12th grade";
    case "awardLevels": return "Award level";
    case "awardType": return "Academic or non-academic";
    case "workHours": return "Hours per week for each grade";
    case "stillWorking": return "Still working there";
    case "start": return "Start date";
    case "end": return "End date";
    default: return field;
  }
}

/** "<category label>: <name>" (an educational preparation program from UC's list is named by the program). */
export function ucItemLabel(e: UcEntry): string {
  const form = UC_CATEGORIES[e.category];
  const listed = e.category === "edprep" && e.program !== UC_EDPREP_OTHER ? UC_EDPREP_PROGRAMS.find((p) => p.value === e.program)?.label : undefined;
  return `${form.label}: ${e.name.trim() || listed || "Untitled"}`;
}

const text = (s: string) => s.replace(/\r\n?/g, "\n").trim();
const num = (n: number) => String(n);
/** The stored number exactly as typed ("5.5", "1.25"); a whole number gets the ".0" the list shows ("30.0"). Never rounded: `canon` compares numerically. */
const listed = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

function reasonsOf(e: UcEntry, issues: Issue[], kind: Issue["kind"]): string[] {
  return issues.filter((i) => i.kind === kind).map((i) => (kind === "missing" ? `${questionName(e, i.field)}: needs an answer` : `${questionName(e, i.field)}: ${i.message}`));
}

function fieldsOf(e: UcEntry): UcFieldSet[] {
  const f = FORMS[e.category];
  const out: UcFieldSet[] = [{ id: "typeofactivity", kind: "select", value: f.type }];
  const set = (id: string, kind: UcFieldSet["kind"], value: string | boolean) => void out.push({ id, kind, value });
  const ticked = GRADES.filter((g) => e.grades.includes(g));
  const dateOf = (ym: string | null, month: string, year: string) => {
    const m = ym ? /^(\d{4})-(\d{2})$/.exec(ym) : null;
    if (!m) return;
    set(month, "select", m[2]!);
    set(year, "select", m[1]!);
  };

  for (const q of ucVisibleQuestions(e)) {
    switch (q) {
      case "program":
        if (e.program) set("edPrepId", "select", e.program);
        break;
      case "name":
        if (e.name.trim()) set(f.name, "text", text(e.name));
        break;
      case "extra":
        if (f.extra && e.extra.trim()) set(f.extra, "text", text(e.extra));
        break;
      case "jobTitle":
        if (f.jobTitle && e.jobTitle.trim()) set(f.jobTitle, "text", text(e.jobTitle));
        break;
      case "description":
        if (e.description.trim()) set(f.description, "text", text(e.description));
        break;
      case "awardLevels":
        for (const l of AWARD_LEVEL_ORDER) if (e.awardLevels.includes(l)) set(AWARD_LEVEL_ID[l], "check", true);
        break;
      case "awardType":
        if (e.awardType) set("awardType", "radio", e.awardType === "academic" ? "A" : "O");
        break;
      case "grades":
        for (const g of ticked) set(`is${f.prefix}${GRADE_ID[g]}`, "check", true);
        break;
      case "afterYears":
        if (e.afterYears !== null) set(f.yearsAfter, "select", e.afterYears === "10+" ? "11" : num(e.afterYears));
        break;
      case "afterMonths":
        if (e.afterMonths !== null) set(f.monthsAfter, "select", num(e.afterMonths));
        break;
      case "workHours":
        // Only the grades that are ticked: hours stored for an unticked grade are never sent. A season left empty = "did not work then".
        for (const g of ticked) {
          const h = e.workHours[g];
          if (!h) continue;
          const gid = GRADE_ID[g];
          const stem = g === "PG" ? "workExpAfter12th" : `workExp${gid}`;
          if (h.schoolYear !== null) {
            set(`isWorkExpSchool${gid}`, "check", true);
            set(`${stem}SchoolHoursPerWeek`, "text", num(h.schoolYear));
          }
          if (h.summer !== null) {
            set(`isWorkExpSummer${gid}`, "check", true);
            set(`${stem}SummerHoursPerWeek`, "text", num(h.summer));
          }
        }
        break;
      case "stillWorking":
        if (e.stillWorking !== null) set("isWorkExpCurrWorking", "radio", e.stillWorking ? "Y" : "N");
        break;
      case "start":
        dateOf(e.start, "workExpStartMonth", "workExpStartYear");
        break;
      case "end":
        dateOf(e.end, "workExpEndMonth", "workExpEndYear");
        break;
      case "hoursPerWeek":
        if (e.hoursPerWeek !== null) set(`${f.lower}HoursPerWeek`, "text", num(e.hoursPerWeek));
        break;
      case "weeksPerYear":
        if (e.weeksPerYear !== null) set(`${f.lower}WeeksPerYear`, "text", num(e.weeksPerYear));
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * The list page's read-only section after the save (`p.subsectionheader` -> its `p.description`s). Only the Extracurricular section's
 * headers were seen live (2026-10-28), so only it has the full set.
 * UNVERIFIED for every other category: their headers and wording have not been read off the live list page, so they expect only the entry's
 * name, under the key "activitySubtitle" (the `span.activitySubtitle` of the item, seen live). Task 14's live check extends these.
 * UNVERIFIED too: how a "After 12th grade" row reads under "When you did it", so that grade is left out of the expectation.
 * Hours and weeks: the list shows "5.5 hours per week" / "30.0 weeks per year" (compared as numbers in `ucReadBackMismatches`).
 */
function expectOf(e: UcEntry): Record<string, string[]> {
  const name = e.name.trim();
  if (e.category === "extracurricular") {
    const out: Record<string, string[]> = {};
    if (name) out["Name of the activity"] = [text(e.name)];
    if (e.description.trim()) out["What you did"] = [text(e.description)];
    const when = GRADES.filter((g) => g !== "PG" && e.grades.includes(g)).map((g) => `${GRADE_ID[g]} grade`);
    if (when.length) out["When you did it"] = when;
    if (e.hoursPerWeek !== null && e.weeksPerYear !== null) out["Time you spent"] = [`${listed(e.hoursPerWeek)} hours per week`, `${listed(e.weeksPerYear)} weeks per year`];
    return out;
  }
  // An educational preparation program from UC's list shows the program's label, which is not the stored name: nothing to expect then.
  if (!name || (e.category === "edprep" && e.program !== UC_EDPREP_OTHER)) return {};
  return { activitySubtitle: [text(e.name)] };
}

export function buildUcFormPlans(entries: UcEntry[], pickIds?: string[]): { forms: UcFormPlan[]; blocked: PlanProblem[]; blanks: PlanProblem[] } {
  const items = pickIds ? pickIds.flatMap((id) => entries.filter((x) => x.id === id).slice(0, 1)) : entries;
  const out = { forms: [] as UcFormPlan[], blocked: [] as PlanProblem[], blanks: [] as PlanProblem[] };

  for (const e of items) {
    const label = ucItemLabel(e);
    const issues = ucEntryIssues(e);
    const blocked = reasonsOf(e, issues, "invalid");
    if (blocked.length) {
      out.blocked.push({ label, reasons: blocked });
      continue;
    }
    out.forms.push({ sourceId: e.id, label, category: FORMS[e.category].type, fields: fieldsOf(e), expect: expectOf(e) });
    const blanks = reasonsOf(e, issues, "missing");
    if (blanks.length) out.blanks.push({ label, reasons: blanks });
  }
  return out;
}

// ── Read-back ──

/** Whitespace collapsed, lower-case, and "30.0 weeks per year" == "30 weeks per year" (the list shows decimals the student did not type). */
function canon(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)( (?:hours per week|weeks per year))/g, (_m, n: string, unit: string) => `${Number(n)}${unit}`);
}

/**
 * Compares the list page's section for this item (`shown`: subsectionheader -> descriptions) with `plan.expect`: every expected text must
 * appear under its header (extra shown lines are fine). One message per miss, naming the item.
 */
export function ucReadBackMismatches(plan: UcFormPlan, shown: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [header, wants] of Object.entries(plan.expect)) {
    const got = shown[header] ?? [];
    const have = new Set(got.map(canon));
    for (const want of wants) {
      if (have.has(canon(want))) continue;
      out.push(`${plan.label}: ${header} shows "${got.join(", ")}" (expected "${want}")`);
    }
  }
  return out;
}
