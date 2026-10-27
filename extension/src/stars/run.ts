// Runs one STARS school year: adds every planned course that is not on the page yet, one Save Course at a time. Each save reloads the
// page, so the panel drives the loop and checks after every reload that the course is in STARS's table. Free of chrome.* for tests.

import { schoolOnPage } from "../../../web/lib/school-match.ts";
import { starsRowsToAdd, starsScaleFor, type StarsPagePlan } from "../../../web/lib/stars-fill.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";

export type StarsTab = {
  send(msg: AssistMessage): Promise<AssistResponse | null>;
  /** Resolves once the tab has reloaded after a save and its content script answers again. */
  afterSave(): Promise<void>;
};
export type StarsRunResult = { added: string[]; skippedExisting: number; stopped: string | null };

const upper = (s: string) => s.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ");

async function page(tab: StarsTab): Promise<{ year: number | null; kind: "intl" | "us" | null; existing: string[]; errors?: string[] }> {
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
    return { added, skippedExisting: 0, stopped: (e as Error).message };
  }
  if (state.year !== plan.endYear || state.kind !== plan.kind) return { added, skippedExisting: 0, stopped: `Open the ${plan.endYear - 1}-${String(plan.endYear % 100).padStart(2, "0")} coursework page on STARS first.` };
  const todo = starsRowsToAdd(plan.rows, state.existing);
  const skippedExisting = plan.rows.length - todo.length;
  for (const [i, row] of todo.entries()) {
    if (shouldStop()) return { added, skippedExisting, stopped: "Stopped." };
    progress(`Adding ${row.name} (${i + 1} of ${todo.length})...`);
    const scale = starsScaleFor(row, picked);
    const r = await tab.send({ type: "starsFill", row, scale, language });
    if (r?.type !== "starsFill") return { added, skippedExisting, stopped: "The STARS page stopped responding. Reload it and try again." };
    if (!r.ok) return { added, skippedExisting, stopped: `${row.name}: ${r.error}. Nothing was saved for it; fix it on STARS or in the tracker, then run again.` };
    if (!r.saved) return { added, skippedExisting, stopped: `${row.name} is filled in but not saved: choose ${r.blanks.join(", ")} on STARS and press Save Course, then run again.` };
    try {
      await tab.afterSave();
      state = await page(tab);
    } catch (e) {
      // No reload: STARS refused the save on the page. Its own message says why.
      const errors = (await page(tab).catch(() => null))?.errors ?? [];
      return { added, skippedExisting, stopped: `${row.name}: ${errors.length ? `STARS says: ${errors.join("; ")}` : (e as Error).message}` };
    }
    if (!state.existing.some((n) => upper(n) === upper(row.name))) {
      return { added, skippedExisting, stopped: `STARS did not save ${row.name}. Check the page for a message (a required box may be empty).` };
    }
    added.push(row.name);
  }
  return { added, skippedExisting, stopped: null };
}
