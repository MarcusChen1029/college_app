// Runs UIUC grades like Common App's "Fill selected": the chosen grades are grouped by page (Courses Years 9-11, then Courses Year 12);
// for each page it opens the page in the same tab, checks it is unlocked and shows the tracker's school, adds each grade's rows to that
// school's block, presses Save Progress once and checks the saved list. Free of chrome.* for tests.

import { bestSchoolMatch, schoolOnPage } from "../../../web/lib/school-match.ts";
import { UIUC_PAGE_LABEL, UIUC_PAGE_PATH, type UiucGradePlan, type UiucPage } from "../../../web/lib/uiuc-fill.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import { sameUiucRow, type UiucAdded, type UiucArea, type UiucPageInfo, type UiucPageKind } from "./fill.ts";

export type UiucTab = {
  send(msg: AssistMessage): Promise<AssistResponse | null>;
  /** Opens a myIllini path in the same tab and resolves once its content script answers. */
  go(path: string): Promise<void>;
  /** Resolves after the tab reloads (Save Progress posts the page) and answers again. */
  afterReload(): Promise<void>;
};
export type UiucGradeReport = {
  plan: UiucGradePlan;
  added: UiucAdded[];
  skippedExisting: number;
  left: { course: string; why: string }[];
  problems: string[];
};

const NO_ANSWER = "The myIllini page stopped responding. Reload it and try again";
export const UIUC_LOCKED = "Submit the Education page on myIllini first (check its grading scale), then run again";

/** The school block on the page that is the plan's school (UIUC abbreviates: "Kang Chiao Intl Sch Linkou Cmp"); a sentence when none or several. */
export function uiucAreaFor(plan: Pick<UiucGradePlan, "schoolName" | "schoolCode">, areas: readonly UiucArea[]): number | string {
  const school = { name: plan.schoolName, code: plan.schoolCode ?? null };
  const view = (a: UiucArea) => ({ name: a.name });
  const byName = bestSchoolMatch(areas, school, view);
  if (byName) return areas.indexOf(byName);
  const byText = areas.filter((a) => schoolOnPage([school], a.text, (s) => s) !== null);
  if (byText.length === 1) return areas.indexOf(byText[0]!);
  if (!areas.length) return "myIllini shows no school on this page: check the Education page lists your high school";
  return `myIllini lists ${areas.map((a) => `"${a.name}"`).join(", ")} on this page and the tracker's "${plan.schoolName}" matches ${byText.length ? "more than one" : "none"} of them: check the school's name in the tracker`;
}

const blank = (plan: UiucGradePlan, problem: string): UiucGradeReport => ({ plan, added: [], skippedExisting: 0, left: [], problems: [problem] });
const rowsWord = (n: number) => `${n} row${n === 1 ? "" : "s"}`;
const pageName = (kind: UiucPageKind) => (kind === "lower" || kind === "upper" ? UIUC_PAGE_LABEL[kind] : "the page it was on");
/** Said when the course editor was left holding a course the page did not add (no Save, so the page still counts it as a change). */
export const UIUC_EDITOR_DIRTY = "The course editor on myIllini still holds a course UIUC did not add (see above). If myIllini asks to confirm leaving the page, choose Leave: nothing else is lost";

/** Opens the page; when the tab doesn't leave the page it is on, says why (a "Leave site?" prompt) instead of "signed out". */
async function openPage(page: UiucPage, tab: UiucTab, dirty: boolean): Promise<UiucPageInfo | string> {
  try {
    await tab.go(UIUC_PAGE_PATH[page]);
  } catch (e) {
    const still = await tab.send({ type: "uiucPage" });
    if (still?.type !== "uiucPage") return (e as Error).message;
    return `myIllini stayed on ${pageName(still.page.kind)} and did not open ${UIUC_PAGE_LABEL[page]}: it may be asking you to confirm leaving the page ("Leave site?")${dirty ? ", because its course editor holds a course UIUC did not add" : ""}. Answer it (Leave), check the page, then run again`;
  }
  const open = await tab.send({ type: "uiucPage" });
  if (open?.type !== "uiucPage") return NO_ANSWER;
  if (open.page.kind !== page) return `myIllini did not open ${UIUC_PAGE_LABEL[page]} (it may have signed you out): sign in again, then run again`;
  if (open.page.locked) return UIUC_LOCKED;
  return open.page;
}

/** One page: fill each grade's rows, then Save Progress once. Reports go into `reports` as they are made, so nothing added is lost on a throw.
 *  Returns whether the editor is left holding a course the page did not add. */
async function onePage(page: UiucPage, plans: readonly UiucGradePlan[], tab: UiucTab, progress: (text: string) => void, dirty: boolean, reports: UiucGradeReport[]): Promise<boolean> {
  const open = await openPage(page, tab, dirty);
  if (typeof open === "string") {
    reports.push(...plans.map((p) => blank(p, open)));
    return dirty;
  }
  const mine: UiucGradeReport[] = [];
  let editorDirty = false;
  for (const plan of plans) {
    const area = uiucAreaFor(plan, open.areas);
    let r: UiucGradeReport;
    if (typeof area === "string") r = blank(plan, area);
    else {
      progress(`Adding ${plan.gradeLevel}th grade courses on myIllini...`);
      const f = await tab.send({ type: "uiucFill", area, rows: plan.rows });
      if (f?.type !== "uiucFill") r = blank(plan, NO_ANSWER);
      else if (!f.ok) r = blank(plan, `${f.error}. Nothing more was added`);
      else {
        const { editorDirty: d, ...result } = f.result;
        editorDirty = d;
        r = { plan, ...result };
      }
    }
    mine.push(r);
    reports.push(r);
  }
  const withAdds = mine.filter((r) => r.added.length);
  if (!withAdds.length) {
    // Nothing new: press nothing. A refused course still sits in the editor; say so on the last grade.
    if (editorDirty) mine[mine.length - 1]!.problems.push(UIUC_EDITOR_DIRTY);
    return editorDirty;
  }
  progress(`Saving ${UIUC_PAGE_LABEL[page]}...`);
  // Wait for the reload BEFORE pressing Save Progress, so a fast reload isn't missed.
  const reloaded = tab.afterReload().then(() => null, (e: unknown) => (e instanceof Error ? e : new Error(String(e))));
  const s = await tab.send({ type: "uiucSave" });
  if (s?.type !== "uiucSave" || !s.ok) {
    const why = s?.type === "uiucSave" && !s.ok ? s.error : NO_ANSWER;
    for (const r of withAdds) r.problems.push(`Added ${rowsWord(r.added.length)} (myIllini saves each one as it is added), but Save Progress was not pressed (${why}): press it yourself`);
    return editorDirty;
  }
  if (await reloaded) {
    for (const r of withAdds) r.problems.push(`Added ${rowsWord(r.added.length)} (myIllini saves each one as it is added), but the page did not reload after Save Progress: check the page before adding anything by hand`);
    return editorDirty;
  }
  const after = await tab.send({ type: "uiucPage" });
  for (const r of withAdds) {
    const area = after?.type === "uiucPage" ? uiucAreaFor(r.plan, after.page.areas) : -1;
    const rows = after?.type === "uiucPage" && typeof area === "number" && area >= 0 ? [...after.page.areas[area]!.rows] : [];
    const missing = r.added.filter((a) => {
      const at = rows.findIndex((x) => sameUiucRow(x, { ...a, grade: null }));
      if (at >= 0) rows.splice(at, 1);
      return at < 0;
    });
    if (missing.length) r.problems.push(`UIUC does not list ${missing.map((m) => m.label).join(", ")} after saving: check the page for a message`);
  }
  return false; // reloaded: the editor is fresh
}

/** Every chosen grade, page by page. A page that can't be filled is reported and the run goes on; Stop ends it after the current page. */
export async function runUiucPlans(
  plans: readonly UiucGradePlan[],
  tab: UiucTab,
  shouldStop: () => boolean,
  progress: (text: string) => void,
): Promise<{ reports: UiucGradeReport[]; stopped: boolean }> {
  const reports: UiucGradeReport[] = [];
  let dirty = false;
  for (const page of ["lower", "upper"] as const) {
    const mine = plans.filter((p) => p.page === page);
    if (!mine.length) continue;
    if (shouldStop()) return { reports, stopped: true };
    progress(`Opening ${UIUC_PAGE_LABEL[page]} on myIllini...`);
    try {
      dirty = await onePage(page, mine, tab, progress, dirty, reports);
    } catch (e) {
      // Keep every report already made (rows added stay reported); only the grades not reached get the error.
      for (const p of mine) if (!reports.some((r) => r.plan === p)) reports.push(blank(p, (e as Error).message));
    }
  }
  return { reports, stopped: false };
}
