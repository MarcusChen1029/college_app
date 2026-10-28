// Common App URLs the filler visits, recorded on the test account (docs/superpowers/research/2026-10-27-commonapp-dom.md §1.1, §2.1).

import type { CaPage } from "../../../web/lib/activities-fill.ts";
import type { CgGradeKey } from "../../../web/lib/commonapp-fill.ts";

export type FillTarget = CgGradeKey | "current";

export const COMMONAPP_ORIGIN = "https://apply.commonapp.org";

/** Courses & Grades grade pages (each has the "Add/Edit <grade>" button #addCG that opens the dialog). */
export const CG_GRADE_PATH: Record<CgGradeKey, string> = {
  "9": "/common/13/55",
  "10": "/common/13/56",
  "11": "/common/13/57",
  "12": "/common/13/58",
  other: "/common/13/59",
};
/** The C&G intro ("I can access a copy of my transcript"): never answered by the filler (Ruling L). */
export const CG_INTRO_PATH = "/common/13/54";
/** Where /common/13* redirects while Education has no saved school. */
export const CG_NOT_REQUIRED_PATH = "/common/13/not-required";
/** Education > Current or Most Recent Year Courses. */
export const CURRENT_YEAR_PATH = "/common/4/24";

/** Activities and experiences; Education > Honors (docs/superpowers/research/2026-10-27-portal-dom.md §6, §8). */
export const CA_ACTIVITIES_PATH = "/common/7/232";
export const CA_HONORS_PATH = "/common/4/25";

/** Per page: the gate question ("Would you like to report any ...?", Yes = `#option_ques_<gate>_2371-input`), the "Add another" counter
 *  question (slots are `ca-add-another-sub-group#subGroup<counter>_*`, legend "<noun> N"), its add button and the Continue button. */
export const CA_PAGE_FACTS: Record<CaPage, { path: string; gate: number; counter: number; add: string; cont: string; noun: string; what: string }> = {
  activities: { path: CA_ACTIVITIES_PATH, gate: 1788, counter: 1020, add: "addQues1020", cont: "sectionContinue232", noun: "Activity", what: "activities" },
  honors: { path: CA_HONORS_PATH, gate: 1970, counter: 1971, add: "addQues1971", cont: "sectionContinue25", noun: "Honors", what: "honors" },
};
/** The gate's Yes choice (the same choice id on both pages). */
export const CA_GATE_YES = 2371;

export const GRADE_LABEL: Record<CgGradeKey, string> = { "9": "9th grade", "10": "10th grade", "11": "11th grade", "12": "12th grade", other: "Other Courses" };

/** Grade pages that first ask "Do you have ... courses ... with grades?" (Yes/No radios option_ques_<id>_*) before the Add button shows (Ruling K). */
export const CG_YES_NO_QUESTION: Partial<Record<CgGradeKey, number>> = { "12": 1927, other: 1933 };

export function targetUrl(target: FillTarget): string {
  return COMMONAPP_ORIGIN + (target === "current" ? CURRENT_YEAR_PATH : CG_GRADE_PATH[target]);
}

/** The page's path without a trailing slash ("" outside a browser). */
export function currentPath(): string {
  const p = (globalThis as { location?: { pathname?: string } }).location?.pathname ?? "";
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}
