// Runs UC grades like Common App's "Fill selected": for each chosen grade it opens the grade page, clicks the school's "Enter courses &
// grades", adds the courses not on the page yet, presses "Save & continue" and checks the saved list. Free of chrome.* for tests.

import type { UcGradePlan } from "../../../web/lib/uc-fill.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import { ucGradePath } from "./nav.ts";

export type UcTab = {
  send(msg: AssistMessage): Promise<AssistResponse | null>;
  /** Opens a UC path in the same tab (a second tab signs UC out) and resolves once its content script answers. */
  go(path: string): Promise<void>;
  /** Resolves after the tab reloads (a click that leaves the page, or Save & continue) and answers again. */
  afterReload(): Promise<void>;
};
export type UcGradeReport = { plan: UcGradePlan; added: string[]; skippedExisting: number; left: string[]; problem: string | null };

const key = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const NO_ANSWER = "The UC page stopped responding. Reload it and try again";

async function oneGrade(plan: UcGradePlan, all: readonly UcGradePlan[], tab: UcTab): Promise<UcGradeReport> {
  const report: UcGradeReport = { plan, added: [], skippedExisting: 0, left: [], problem: null };
  const g = plan.gradeLevel;
  const now = await tab.send({ type: "ucPage" });
  // Already on this grade's course page, and only one school has this grade: no need to go round.
  const here = now?.type === "ucPage" && now.grade === g && all.filter((p) => p.gradeLevel === g).length === 1;
  if (!here) {
    await tab.go(ucGradePath(g));
    const open = await tab.send({ type: "ucOpenClasses", grade: g, schoolName: plan.schoolName, schoolCode: plan.schoolCode });
    if (open?.type !== "ucOpenClasses") return { ...report, problem: NO_ANSWER };
    if (!open.ok) return { ...report, problem: open.error };
    await tab.afterReload();
    const there = await tab.send({ type: "ucPage" });
    if (there?.type !== "ucPage" || there.grade !== g) return { ...report, problem: `UC did not open the ${g}th grade courses page (it may have signed you out)` };
  }
  const r = await tab.send({ type: "ucFill", plan });
  if (r?.type !== "ucFill") return { ...report, problem: NO_ANSWER };
  if (!r.ok) return { ...report, problem: `${r.error}. Nothing was saved` };
  const { added, skippedExisting, left, saving } = r.result;
  Object.assign(report, { added, skippedExisting, left });
  if (saving) {
    await tab.afterReload();
    const after = await tab.send({ type: "ucPage" });
    const names = after?.type === "ucPage" ? after.names.map(key) : [];
    const missing = added.filter((n) => !names.includes(key(n)));
    if (missing.length) report.problem = `UC does not list ${missing.join(", ")} after saving: check the page for a message`;
  }
  return report;
}

/** Every chosen grade in turn. A grade that can't be filled is reported and the run goes on; Stop ends it after the current grade. */
export async function runUcPlans(
  plans: readonly UcGradePlan[],
  tab: UcTab,
  shouldStop: () => boolean,
  progress: (text: string) => void,
): Promise<{ reports: UcGradeReport[]; stopped: boolean }> {
  const reports: UcGradeReport[] = [];
  for (const plan of plans) {
    if (shouldStop()) return { reports, stopped: true };
    progress(`Filling ${plan.gradeLevel}th grade on UC...`);
    try {
      reports.push(await oneGrade(plan, plans, tab));
    } catch (e) {
      reports.push({ plan, added: [], skippedExisting: 0, left: [], problem: (e as Error).message });
    }
  }
  return { reports, stopped: false };
}
