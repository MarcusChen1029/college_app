// Common App URLs the filler visits, recorded on the test account (docs/superpowers/research/2026-10-27-commonapp-dom.md §1.1, §2.1).

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
