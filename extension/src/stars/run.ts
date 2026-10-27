// Runs STARS school years: opens each year's coursework page itself, then adds every planned course that is not on the page yet, one
// Save Course at a time. Each save reloads the page, so the panel drives the loop and checks after every reload that the course is in
// STARS's table. Free of chrome.* for tests.

import { bestSchoolMatch, schoolOnPage } from "../../../web/lib/school-match.ts";
import { starsRowsToAdd, starsScaleFor, type StarsPagePlan } from "../../../web/lib/stars-fill.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import type { StarsSchool } from "./nav.ts";

export type StarsTab = {
  send(msg: AssistMessage): Promise<AssistResponse | null>;
  /** Resolves once the tab has reloaded after a save and its content script answers again. */
  afterSave(): Promise<void>;
  /** Opens a STARS path ("/srt/...") in the same tab and resolves once its content script answers. */
  go?(path: string): Promise<void>;
};
/** `left`: courses not tried because a box needs the student (no level, a grade STARS doesn't list, no scale), with why. */
export type StarsRunResult = { added: string[]; skippedExisting: number; stopped: string | null; left: { course: string; why: string }[] };

/** Why a planned course can't be saved without the student, or null when every required box has a value. */
export function starsRowNeeds(plan: StarsPagePlan, row: StarsPagePlan["rows"][number]): string | null {
  const reasons = plan.skipped.filter((s) => s.course === row.name && s.field !== "course").map((s) => `${s.field}: ${s.reason}`);
  const missing = !row.level || row.boxes.some((b) => !b.grade) || (plan.kind === "intl" && !row.scaleOptions.length);
  if (!missing) return null;
  return reasons.length ? reasons.join("; ") : "a required box has no value in the tracker";
}

const upper = (s: string) => s.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ");

async function page(tab: StarsTab): Promise<{ year: number | null; kind: "intl" | "us" | null; existing: string[]; pageText: string; errors?: string[] }> {
  const r = await tab.send({ type: "starsPage" });
  if (r?.type !== "starsPage") throw new Error("The STARS page did not answer. Reload it and try again.");
  return r;
}

/** The plan for the open page: same page kind and school year; when several schools share them, the one whose name the page shows. */
export function planForPage(plans: StarsPagePlan[], page: { year: number | null; kind: "intl" | "us" | null; pageText: string }): StarsPagePlan | null {
  const same = plans.filter((p) => p.kind === page.kind && p.endYear === page.year);
  if (same.length <= 1) return same[0] ?? null;
  return schoolOnPage(same, page.pageText, (p) => ({ name: p.schoolName, code: p.schoolCode }));
}

export async function runStarsYear(plan: StarsPagePlan, picked: readonly string[], language: string | null, tab: StarsTab, shouldStop: () => boolean, progress: (text: string) => void): Promise<StarsRunResult> {
  const added: string[] = [];
  let state: Awaited<ReturnType<typeof page>>;
  try {
    state = await page(tab);
  } catch (e) {
    return { added, skippedExisting: 0, stopped: (e as Error).message, left: [] };
  }
  if (state.year !== plan.endYear || state.kind !== plan.kind) return { added, skippedExisting: 0, stopped: `Open the ${plan.endYear - 1}-${String(plan.endYear % 100).padStart(2, "0")} coursework page on STARS first.`, left: [] };
  const notOnPage = starsRowsToAdd(plan.rows, state.existing);
  const skippedExisting = plan.rows.length - notOnPage.length;
  // Nothing is guessed: a course missing a required box is not tried (it would stop on STARS's form) and is listed for the student.
  const left = notOnPage.flatMap((row) => {
    const why = starsRowNeeds(plan, row);
    return why ? [{ course: row.name, why }] : [];
  });
  const todo = notOnPage.filter((row) => !left.some((l) => l.course === row.name));
  for (const [i, row] of todo.entries()) {
    if (shouldStop()) return { added, skippedExisting, stopped: "Stopped.", left };
    progress(`Adding ${row.name} (${i + 1} of ${todo.length})...`);
    const scale = starsScaleFor(row, picked);
    const r = await tab.send({ type: "starsFill", row, scale, language });
    if (r?.type !== "starsFill") return { added, skippedExisting, stopped: "The STARS page stopped responding. Reload it and try again.", left };
    if (!r.ok) return { added, skippedExisting, stopped: `${row.name}: ${r.error}. Nothing was saved for it; fix it on STARS or in the tracker, then run again.`, left };
    if (!r.saved) return { added, skippedExisting, stopped: `${row.name} is filled in but not saved: choose ${r.blanks.join(", ")} on STARS and press Save Course, then run again.`, left };
    try {
      await tab.afterSave();
      state = await page(tab);
    } catch (e) {
      // No reload: STARS refused the save on the page. Its own message says why.
      const errors = (await page(tab).catch(() => null))?.errors ?? [];
      return { added, skippedExisting, stopped: `${row.name}: ${errors.length ? `STARS says: ${errors.join("; ")}` : (e as Error).message}`, left };
    }
    if (!state.existing.some((n) => upper(n) === upper(row.name))) {
      return { added, skippedExisting, stopped: `STARS did not save ${row.name}. Check the page for a message (a required box may be empty).`, left };
    }
    added.push(row.name);
  }
  return { added, skippedExisting, stopped: null, left };
}

const yearText = (endYear: number) => `${endYear - 1}-${String(endYear % 100).padStart(2, "0")}`;
const SIGNED_OUT = /signed you out/i;

/** The plan's school on STARS: the only one, else the one with the school's code, else the one whose name reads the same. */
export function starsSchoolFor(plan: StarsPagePlan, schools: readonly StarsSchool[]): StarsSchool | null {
  if (schools.length === 1) return schools[0]!;
  return bestSchoolMatch(schools, { name: plan.schoolName, code: plan.schoolCode }, (s) => ({ name: s.name, code: s.ceeb }));
}

/** Puts the tab on the plan's coursework page (unless it is already there). null = ready; otherwise why not, for the report. */
export async function openStarsYear(plan: StarsPagePlan, tab: StarsTab, schools: () => Promise<StarsSchool[] | string>): Promise<string | null> {
  const list = await schools();
  if (typeof list === "string") return list;
  const school = starsSchoolFor(plan, list);
  if (!school) return `STARS lists ${list.length ? list.map((s) => s.name).join(", ") : "no schools"} and none of them reads as "${plan.schoolName}": add the school (or its code) on STARS's Enter Schools page, or the school code in the tracker`;
  const now = await page(tab);
  const here = now.year === plan.endYear && now.kind === plan.kind && now.pageText.split("\n", 1)[0]!.trim() === school.ceeb;
  if (!here) {
    if (!tab.go) return `Open the ${yearText(plan.endYear)} coursework page on STARS first`;
    const r = await tab.send({ type: "starsYearPath", ceeb: school.ceeb, year: plan.endYear });
    if (r?.type !== "starsYearPath") return "The STARS page did not answer. Reload it and try again";
    if (!r.path) {
      return r.years.length
        ? `STARS offers ${r.years.map(yearText).join(", ")} for ${school.name}, not ${yearText(plan.endYear)}: check the school's dates on STARS's Enter Schools page`
        : `STARS did not show ${school.name}'s school years (it may have signed you out): open STARS's summary page, then run again`;
    }
    await tab.go(r.path);
    const after = await page(tab);
    if (after.year !== plan.endYear) return `STARS did not open the ${yearText(plan.endYear)} coursework page (it may have signed you out)`;
    if (after.kind !== plan.kind) {
      return `STARS treats ${school.name} as ${after.kind === "us" ? "a US" : "a non-US"} school and the tracker as ${plan.kind === "us" ? "a US" : "a non-US"} one: make the school's country match, then run again`;
    }
  }
  return null;
}

export type StarsYearReport = { plan: StarsPagePlan; result: StarsRunResult };

/**
 * Every chosen year in turn, like Common App's "Fill selected": open the year, add its courses, go on to the next. A year that stops
 * (a box STARS refused, a missing year) is reported and the run goes on; Stop, or STARS signing the student out, ends the run.
 */
export async function runStarsPlans(
  plans: readonly StarsPagePlan[],
  picked: readonly string[],
  language: string | null,
  tab: StarsTab,
  shouldStop: () => boolean,
  progress: (text: string) => void,
): Promise<{ reports: StarsYearReport[]; stopped: boolean }> {
  const reports: StarsYearReport[] = [];
  let schools: Promise<StarsSchool[] | string> | null = null;
  const loadSchools = () =>
    (schools ??= tab.send({ type: "starsSchools" }).then((r) =>
      r?.type !== "starsSchools" ? "The STARS page did not answer. Reload it and try again" : r.ok ? r.schools : r.error,
    ));
  for (const plan of plans) {
    if (shouldStop()) return { reports, stopped: true };
    progress(`Opening ${yearText(plan.endYear)} on STARS...`);
    let problem: string | null;
    try {
      problem = await openStarsYear(plan, tab, loadSchools);
    } catch (e) {
      problem = (e as Error).message;
    }
    if (problem) {
      reports.push({ plan, result: { added: [], skippedExisting: 0, stopped: problem, left: [] } });
      if (SIGNED_OUT.test(problem)) return { reports, stopped: true };
      continue;
    }
    const result = await runStarsYear(plan, picked, plan.kind === "intl" ? language : null, tab, shouldStop, (t) => progress(`${yearText(plan.endYear)}: ${t}`));
    reports.push({ plan, result });
    if (result.stopped === "Stopped.") return { reports, stopped: true };
  }
  return { reports, stopped: false };
}
