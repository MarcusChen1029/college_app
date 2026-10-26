// The fill run, free of chrome.* so it can be tested with a fake driver. panel.ts wires it to the real tab (chrome-driver.ts) and the DOM.

import {
  buildCgPlan,
  buildCurrentYearPlan,
  type CgGradeKey,
  type CgGradePlan,
  type CurrentYearPlan,
  type Skipped,
} from "../../web/lib/commonapp-fill.ts";
import type { TranscriptResult } from "./auth.ts";
import type { PageResult } from "./commonapp/dom.ts";
import { GRADE_LABEL } from "./commonapp/pages.ts";

export type Target = CgGradeKey | "current";
export type FillMode = "replace" | "keep";

/** One Common App page at a time. Every method rejects with an Error whose message is a sentence for the student. */
export type Driver = {
  open(target: Target): Promise<void>;
  inspect(target: Target): Promise<{ existing: string[] }>;
  fill(target: Target, mode: FillMode): Promise<PageResult>;
};

/** `stoppedOnPage`: the Common App page itself reported a stop (its stoppedReason), as opposed to a driver error or a Stop between steps.
 *  `changes`: what the page changed besides the courses (PageResult.notes). */
export type ReportItem = { target: Target; filled: number; blanks: Skipped[]; note?: string; changes?: string[]; stoppedOnPage?: boolean };

/** Shown next to each "Open … on Common App" link after a stop: following it reloads the tab, which drops an open dialog's unsaved rows. */
export const OPEN_RELOADS_NOTE = "Opening reloads the page: anything not yet saved in an open popup is discarded.";

/** Only a Courses & Grades page that stopped by itself can have a dialog left open with unsaved rows; every other stop leaves nothing to save. */
export function needsSaveGuidance(item: ReportItem): boolean {
  return item.stoppedOnPage === true && item.target !== "current";
}

export const GRADE_ORDER: CgGradeKey[] = ["9", "10", "11", "12", "other"];
export const CURRENT_LABEL = "Current year courses";
export const TICK_REMINDER = "On each grade, tick 'I have reported all of my courses for this grade' yourself.";
export const STOP_GUIDANCE = "Nothing was saved for this grade yet. Press X on Common App to keep what was filled, or reload the page to discard it.";

export const STATUS = {
  signedOut: "Sign in again",
  studentsOnly: "This extension is for student accounts. Sign in with a student account.",
  network: "Could not load your transcript. Check your connection and try again.",
  nothing: "Nothing to fill: tick at least one item.",
  done: "Done",
  stopped: "Stopped",
} as const;

export function targetLabel(target: Target): string {
  return target === "current" ? CURRENT_LABEL : GRADE_LABEL[target];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Runs the targets in order. Asks Replace/Keep only for a page that already has courses. Any problem on a page (a thrown error or the
 * page's own stoppedReason) ends the whole run: later pages are not touched, because the student has to look at this one first.
 */
export async function runFill(
  targets: Target[],
  driver: Driver,
  ask: (target: Target, existingCount: number) => Promise<FillMode>,
  shouldStop: () => boolean,
): Promise<{ items: ReportItem[]; stopped: boolean }> {
  const items: ReportItem[] = [];
  for (const target of targets) {
    if (shouldStop()) return { items, stopped: true };
    try {
      // Stop is re-checked after every await: it may have been pressed during navigation, inspect or the Replace/Keep prompt.
      await driver.open(target);
      if (shouldStop()) return { items, stopped: true };
      const { existing } = await driver.inspect(target);
      if (shouldStop()) return { items, stopped: true };
      const mode = existing.length > 0 ? await ask(target, existing.length) : "keep";
      if (shouldStop()) return { items, stopped: true };
      const result = await driver.fill(target, mode);
      const changes = result.notes?.length ? { changes: result.notes } : {};
      if (result.stoppedReason) {
        items.push({ target, filled: result.filled, blanks: result.blanks, ...changes, note: result.stoppedReason, stoppedOnPage: true });
        return { items, stopped: true };
      }
      items.push({ target, filled: result.filled, blanks: result.blanks, ...changes });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      items.push({ target, filled: 0, blanks: [], note: `Stopped: ${reason}` });
      return { items, stopped: true };
    }
  }
  return { items, stopped: false };
}

export type Plans = { cg: Map<CgGradeKey, CgGradePlan>; current: CurrentYearPlan | null };
export type Offer = { target: Target; label: string; count: number };

export function buildPlans(schools: Parameters<typeof buildCgPlan>[0], courses: Parameters<typeof buildCgPlan>[1]): Plans {
  const cg = new Map<CgGradeKey, CgGradePlan>();
  for (const plan of buildCgPlan(schools, courses)) cg.set(plan.grade, plan);
  return { cg, current: buildCurrentYearPlan(schools, courses) };
}

/** What the panel offers: a plan with no rows (all its courses in progress or planned, or every course skipped) is not offered. */
export function offersFor(plans: Plans): Offer[] {
  const offers: Offer[] = [];
  for (const grade of GRADE_ORDER) {
    const plan = plans.cg.get(grade);
    if (plan && plan.rows.length > 0) offers.push({ target: grade, label: GRADE_LABEL[grade], count: plan.rows.length });
  }
  if (plans.current && plans.current.rows.length > 0) offers.push({ target: "current", label: CURRENT_LABEL, count: plans.current.rows.length });
  return offers;
}

export function offerText(offer: Offer): string {
  return `${offer.label} (${plural(offer.count, "course", "courses")})`;
}

export type FillOutcome =
  | { ok: false; status: string; reason: "signed_out" | "students_only" | "network" | "nothing" }
  | { ok: true; status: string; items: ReportItem[]; stopped: boolean; warnings: string[] };

/**
 * Loads the transcript fresh, then runs the ticked targets that are still offered. A signed-out or failed load never reaches `run`.
 * `makeDriver` gets the plans so the driver can send each page its plan.
 */
export async function startFill(
  load: () => Promise<TranscriptResult>,
  run: typeof runFill,
  opts: {
    targets: Target[];
    makeDriver: (plans: Plans) => Driver;
    ask: (target: Target, existingCount: number) => Promise<FillMode>;
    shouldStop: () => boolean;
  },
): Promise<FillOutcome> {
  let loaded: TranscriptResult;
  try {
    loaded = await load();
  } catch {
    loaded = { ok: false, reason: "network" };
  }
  if (!loaded.ok) {
    const status = loaded.reason === "signed_out" ? STATUS.signedOut : loaded.reason === "students_only" ? STATUS.studentsOnly : STATUS.network;
    return { ok: false, status, reason: loaded.reason };
  }
  const plans = buildPlans(loaded.schools, loaded.courses);
  const offered = new Set(offersFor(plans).map((o) => o.target));
  const targets = [...GRADE_ORDER, "current" as const].filter((t) => opts.targets.includes(t) && offered.has(t));
  if (targets.length === 0) return { ok: false, status: STATUS.nothing, reason: "nothing" };

  const warnings: string[] = [];
  for (const t of targets) if (t !== "current") for (const w of plans.cg.get(t)?.warnings ?? []) warnings.push(`${GRADE_LABEL[t]}: ${w}`);

  const { items, stopped } = await run(targets, opts.makeDriver(plans), opts.ask, opts.shouldStop);
  return { ok: true, status: stopped ? STATUS.stopped : STATUS.done, items, stopped, warnings };
}

/** "Filled 12 courses" (or "Filled 1 course"). */
export function filledText(item: ReportItem): string {
  return `Filled ${plural(item.filled, "course", "courses")}`;
}

/** One line per box left blank, with the reason. */
export function blankText(b: Skipped): string {
  const what = [b.course, b.field].filter(Boolean).join(": ");
  return what ? `${what} left blank: ${b.reason}` : b.reason;
}

export function askText(target: Target, existingCount: number): string {
  return `${targetLabel(target)} already ${existingCount === 1 ? "has 1 course" : `has ${existingCount} courses`} on Common App.`;
}
