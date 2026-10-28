// Side panel section for the UC application, like Common App's: tick the grades, press "Fill selected", and the extension opens each
// grade's "Enter courses & grades" page itself, adds the courses not there yet and saves with UC's own "Save & continue". Courses
// already on UC are left alone. Works from any UC page.

import { schoolOnPage } from "../../../web/lib/school-match.ts";
import type { UcGradePlan } from "../../../web/lib/uc-fill.ts";
import { autoView, type AutoReport, type NeedsYou } from "../auto-view.ts";
import { SITE_ORIGINS } from "../sites.ts";
import { afterReload, navigate, sendTo } from "../tab-wait.ts";
import { h } from "../ui.ts";
import { runUcPlans, type UcGradeReport, type UcTab } from "./run.ts";

/** The plan for the open page: its grade level, and the school whose name the page shows when there are several. */
export function ucPlanForPage(plans: UcGradePlan[], grade: number, pageText: string): UcGradePlan | null {
  const same = plans.filter((p) => p.gradeLevel === grade);
  if (same.length <= 1) return same[0] ?? null;
  // UC shows "School code: 694132" on the page; names are compared word by word.
  return schoolOnPage(same, pageText, (p) => ({ name: p.schoolName, code: p.schoolCode }));
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Why each named course of the plan needs the student (from the plan's notes on it). */
const why = (plan: UcGradePlan, names: readonly string[]): NeedsYou[] =>
  names.map((course) => ({
    course,
    why: plan.skipped.filter((s) => s.course === course && s.field !== "course").map((s) => s.reason).join("; ") || "a box UC requires has no value in the tracker",
  }));

/** The courses the filler will leave out of this grade because they need the student (same test as fillUcPage). */
export function ucNeedsYou(plan: UcGradePlan): NeedsYou[] {
  return why(plan, plan.rows.filter((r) => !r.discipline || r.grades.some((g) => g == null) || (r.language === null && r.discipline.area === "Language Other Than English")).map((r) => r.name));
}

const gradeTitle = (p: UcGradePlan, schools: number) => `${p.gradeLevel}th grade (${p.year})${schools > 1 ? `, ${p.schoolName}` : ""}`;

export function ucReport(r: UcGradeReport, schools: number): AutoReport {
  const done: string[] = [];
  if (r.added.length) done.push(`Added ${plural(r.added.length, "course")} and saved.`);
  if (r.skippedExisting) done.push(`${plural(r.skippedExisting, "course")} already on UC left alone.`);
  if (!done.length && !r.problem && !r.left.length) done.push("Nothing new to add.");
  return {
    title: gradeTitle(r.plan, schools),
    done,
    problems: r.problem ? [r.problem] : [],
    left: why(r.plan, r.left),
  };
}

export function ucAutoView(plans: UcGradePlan[], tabId: number): HTMLElement {
  const items = plans.filter((p) => p.rows.length);
  const schools = new Set(items.map((p) => p.schoolName)).size;
  const tab: UcTab = {
    send: (m) => sendTo(tabId, m),
    go: (path) => navigate(tabId, `${SITE_ORIGINS.uc[0]}${path}`, "UC", "uc"),
    afterReload: () => afterReload(tabId, "UC"),
  };
  const warnings = items.flatMap((p) => p.warnings);
  const skipped = items.flatMap((p) => p.skipped);
  return autoView({
    title: "Add your courses to UC",
    intro: "Tick the grades, then Fill selected. The extension opens each grade's Enter courses & grades page in this tab, adds the courses that are not there yet and saves. Nothing is removed or submitted.",
    pending: items.map((p) => ({ title: gradeTitle(p, schools), left: ucNeedsYou(p) })),
    items: items.map((p) => ({ plan: p, label: `${p.gradeLevel}th grade (${p.year})${schools > 1 ? ` at ${p.schoolName}` : ""}: ${plural(p.rows.length, "course")}` })),
    run: async (chosen, shouldStop, progress) => {
      const { reports, stopped } = await runUcPlans(chosen, tab, shouldStop, progress);
      return { reports: reports.map((r) => ucReport(r, schools)), stopped };
    },
    footer: [
      warnings.length ? h("ul", { class: "warnings" }, ...[...new Set(warnings)].map((w) => h("li", {}, w))) : false,
      skipped.length ? h("details", {}, h("summary", {}, `Not added automatically (${skipped.length})`), h("ul", {}, ...skipped.map((s) => h("li", {}, `${s.course}: ${s.field}: ${s.reason}`)))) : false,
    ],
  });
}
