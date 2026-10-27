// Side panel section for UIUC's Self-Reported Academic Record (myIllini), like UC's: tick the grades, press "Fill selected", and the
// extension opens Courses Years 9-11 / Year 12 in this tab itself, adds the course rows not there yet and saves with Save Progress.
// Rows already on myIllini are left alone; nothing is removed or submitted. Works from any myIllini page.

import { UIUC_PAGE_LABEL, type UiucGradePlan } from "../../../web/lib/uiuc-fill.ts";
import { autoView, type AutoReport, type NeedsYou } from "../auto-view.ts";
import { SITE_ORIGINS } from "../sites.ts";
import { afterReload, navigate, sendTo } from "../tab-wait.ts";
import { h } from "../ui.ts";
import { runUiucPlans, type UiucGradeReport, type UiucTab } from "./run.ts";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** One line per course: its terms that need the student share one reason ("Web Design (1st Semester, 2nd Semester)"). */
export function groupLeft(left: readonly { course: string; why: string }[]): NeedsYou[] {
  const out: { name: string; terms: string[]; why: string }[] = [];
  for (const x of left) {
    const m = x.course.match(/^(.*) \(([^()]*)\)$/);
    const [name, term] = m ? [m[1]!, m[2]!] : [x.course, ""];
    const same = out.find((o) => o.name === name && o.why === x.why);
    if (same) same.terms.push(term);
    else out.push({ name, terms: [term], why: x.why });
  }
  return out.map((o) => ({ course: o.terms.filter(Boolean).length ? `${o.name} (${o.terms.filter(Boolean).join(", ")})` : o.name, why: o.why }));
}

/** The rows the filler will leave for the student, before the run (same test as fillUiucArea). */
export function uiucNeedsYou(plan: UiucGradePlan): NeedsYou[] {
  return groupLeft(plan.rows.flatMap((r) => (r.blocked ? [{ course: `${r.name} (${r.termLabel})`, why: r.blocked }] : [])));
}

const gradeTitle = (p: UiucGradePlan, schools: number) => `${p.gradeLevel}th grade (${p.year})${schools > 1 ? `, ${p.schoolName}` : ""}`;

export function uiucReport(r: UiucGradeReport, schools: number): AutoReport {
  const done: string[] = [];
  if (r.added.length) done.push(`Added ${plural(r.added.length, "course row")} and saved.`);
  if (r.skippedExisting) done.push(`${plural(r.skippedExisting, "row")} already on myIllini left alone.`);
  if (!done.length && !r.problems.length && !r.left.length) done.push("Nothing new to add.");
  return { title: gradeTitle(r.plan, schools), done, problems: r.problems, left: groupLeft(r.left) };
}

export function uiucAutoView(plans: UiucGradePlan[], tabId: number): HTMLElement {
  const items = plans.filter((p) => p.rows.length);
  const schools = new Set(items.map((p) => p.schoolName)).size;
  const tab: UiucTab = {
    send: (m) => sendTo(tabId, m),
    go: (path) => navigate(tabId, `${SITE_ORIGINS.uiuc[0]}${path}`, "myIllini"),
    afterReload: () => afterReload(tabId, "myIllini"),
  };
  const warnings = items.flatMap((p) => p.warnings);
  const skipped = plans.flatMap((p) => p.skipped);
  return autoView({
    title: "Add your courses to UIUC",
    intro:
      "Tick the grades, then Fill selected. The extension opens Courses Years 9-11 and Courses Year 12 in this tab, adds the course rows that are not there yet (one per term grade) and saves with Save Progress. Nothing is removed or submitted; press Submit Page and, after checking, I'm done yourself.",
    pending: items.map((p) => ({ title: gradeTitle(p, schools), left: uiucNeedsYou(p) })),
    items: items.map((p) => ({
      plan: p,
      label: `${p.gradeLevel}th grade (${p.year})${schools > 1 ? ` at ${p.schoolName}` : ""}: ${plural(p.rows.length, "course row")}, on ${UIUC_PAGE_LABEL[p.page]}`,
    })),
    run: async (chosen, shouldStop, progress) => {
      const { reports, stopped } = await runUiucPlans(chosen, tab, shouldStop, progress);
      return { reports: reports.map((r) => uiucReport(r, schools)), stopped };
    },
    footer: [
      h("p", { class: "note" }, "Left for you on myIllini: the Education page (your school's grading scale, then Submit Page; the courses pages stay locked until then) and Other Academic Information (your highest language level)."),
      warnings.length ? h("ul", { class: "warnings" }, ...[...new Set(warnings)].map((w) => h("li", {}, w))) : false,
      skipped.length ? h("details", {}, h("summary", {}, `Not added automatically (${skipped.length})`), h("ul", {}, ...skipped.map((s) => h("li", {}, `${s.course}: ${s.field}: ${s.reason}`)))) : false,
    ],
  });
}
