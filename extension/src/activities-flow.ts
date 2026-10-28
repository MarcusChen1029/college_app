// The Common App activities / honors run, free of chrome.* so it can be tested with a fake driver and fake questions. panel.ts wires it to
// the real tab (chrome-driver.ts createCaDriver) and renders the questions and the report.
//
// The owner's rule (spec §5.2): the page is empty -> fill every tracker item in tracker order, no question. It has entries -> ask whether to
// replace all of them (the question and the final report both name what is removed); No -> the student ticks which tracker items to add, at
// most as many as the page has room for. A full page runs nothing. Nothing is typed that the plan marks blocked, and the page is read back
// afterwards: the portal drops values it dislikes without any message.

import {
  buildCaPagePlan,
  CA_PAGE_LIMIT,
  itemLabel,
  keepRoom,
  readBackMismatches,
  replacedNote,
  type CaPage,
  type CaPagePlan,
  type PlanProblem,
} from "../../web/lib/activities-fill.ts";
import type { ActivityData } from "../../web/lib/activities.ts";
import type { CaPageResult } from "./commonapp/activities.ts";
import type { FillMode } from "./messages.ts";

export type Decision = { mode: "replace" } | { mode: "keep"; pickIds: string[] };

export type AskUi = {
  /** "Common App already has N ...": true = replace them all. May reject (Stop pressed): the run ends, nothing changed. */
  askReplace(existing: string[], incoming: number): Promise<boolean>;
  /** The toggle list: at most `max` may be on. Returns the ids switched on. */
  pick(items: { id: string; label: string }[], max: number): Promise<string[]>;
};

/** One Common App page. Every method rejects with an Error whose message is a sentence for the student. */
export type CaDriver = {
  inspect(): Promise<string[]>;
  fill(plan: CaPagePlan, mode: FillMode, existing: number): Promise<CaPageResult>;
  /** Navigates back to the page (a fresh load; nothing is dirty after Continue). */
  reopen(): Promise<void>;
  read(): Promise<Record<string, string | string[]>[]>;
  /** The tab's current Common App path. */
  path(): Promise<string>;
};

export type ActivitiesReport = {
  /** Labels of the tracker items written to the portal, in order. */
  filled: string[];
  /** replacedNote(...) when the old entries were replaced, else null. */
  replaced: string | null;
  blocked: PlanProblem[];
  blanks: PlanProblem[];
  /** Tracker items chosen for the fill that did not get onto the page (no room, or the run stopped first). */
  notAdded: string[];
  mismatches: string[];
  /** Why the run ended early (a problem the student must look at); null = it ran to the end. */
  stopped: string | null;
  /** Things the page changed besides the entries ("Answered ... Yes", "Removed Activity 3 ..."). */
  notes: string[];
  /** A plain result that is not a problem: a full page, nothing chosen, nothing in the tracker. */
  note: string | null;
};

export const STOPPED = "Stopped. Nothing was changed on Common App.";
export const SIGNED_OUT = "Common App signed you out. Sign in again; nothing after this point was saved.";

/** A page the activities filler fills: Common App's Activities or Honors, or UC's Activities & awards list (uc/activities-run.ts). */
export type ActPage = CaPage | "uc";

/** UC's list holds at most 20 entries (portal-dom.md §7). */
export const UC_PAGE_LIMIT = 20;
export const PAGE_LIMIT: Record<ActPage, number> = { ...CA_PAGE_LIMIT, uc: UC_PAGE_LIMIT };

const NOUN: Record<ActPage, { one: string; many: string }> = {
  activities: { one: "activity", many: "activities" },
  honors: { one: "honor", many: "honors" },
  uc: { one: "activity or award", many: "activities and awards" },
};
export const noun = (page: ActPage, n: number) => (n === 1 ? NOUN[page].one : NOUN[page].many);
export const portalOf = (page: ActPage): "Common App" | "UC" => (page === "uc" ? "UC" : "Common App");

/** The Replace question. */
export function askReplaceText(page: ActPage, existing: number, incoming: number): string {
  return `${portalOf(page)} already has ${existing} ${noun(page, existing)}. Replace ${existing === 1 ? "it" : "all of them"} with the ${incoming} in your tracker?`;
}

export function fullText(page: ActPage, existing: number): string {
  return `This page is full (${existing} of ${PAGE_LIMIT[page]}). Nothing can be added.`;
}

/** Empty page -> keep everything, no question. Entries -> ask; No -> toggles capped at the room (none when the page is full). */
export async function decide(existing: string[], items: { id: string; label: string }[], limit: number, ui: AskUi): Promise<Decision> {
  if (existing.length === 0) return { mode: "keep", pickIds: items.map((i) => i.id) };
  if (await ui.askReplace(existing, items.length)) return { mode: "replace" };
  const max = Math.max(0, limit - existing.length);
  if (max === 0) return { mode: "keep", pickIds: [] };
  const picked = new Set(await ui.pick(items, max));
  // Tracker order, only known ids, never more than the room (the toggle list enforces it, this keeps the run safe if it did not).
  return { mode: "keep", pickIds: items.filter((i) => picked.has(i.id)).map((i) => i.id).slice(0, max) };
}

const isLogin = (path: string) => path.startsWith("/login");

/** A run that ended before anything could be written. */
export function emptyReport(over: Partial<ActivitiesReport> = {}): ActivitiesReport {
  return { filled: [], replaced: null, blocked: [], blanks: [], notAdded: [], mismatches: [], stopped: null, notes: [], note: null, ...over };
}

/**
 * `shouldStop`: the Stop button's flag. It is checked before every step that could change the page (the question, the fill), so a Stop
 * pressed while the page is still being checked ends the run before anything is asked or typed.
 */
export async function runCaPage(
  page: CaPage,
  data: ActivityData,
  driver: CaDriver,
  ui: AskUi,
  shouldStop: () => boolean = () => false,
): Promise<ActivitiesReport> {
  const all = page === "activities" ? data.commonApp.activities : data.commonApp.honors;
  const items = all.map((x) => ({ id: x.id, label: itemLabel(page, x) }));
  const limit = CA_PAGE_LIMIT[page];
  const report = emptyReport();
  const halt = () => {
    if (shouldStop()) throw new Error(STOPPED);
  };
  try {
    halt();
    if (isLogin(await driver.path())) return emptyReport({ stopped: SIGNED_OUT });
    halt();
    const existing = await driver.inspect();
    halt();
    if (isLogin(await driver.path())) return emptyReport({ stopped: SIGNED_OUT });

    if (items.length === 0) return emptyReport({ note: `Your tracker has no ${NOUN[page].many} to add.` });
    const decision = await decide(existing, items, limit, ui);
    halt();
    if (isLogin(await driver.path())) return emptyReport({ stopped: SIGNED_OUT });

    if (decision.mode === "keep" && decision.pickIds.length === 0) {
      return emptyReport({ note: keepRoom(page, existing.length) === 0 ? fullText(page, existing.length) : "You chose nothing to add, so nothing was changed." });
    }
    const plan = buildCaPagePlan(data, page, decision.mode === "keep" ? decision.pickIds : undefined);
    report.blocked = plan.blocked;
    report.blanks = plan.blanks;
    if (plan.slots.length === 0) {
      // Every chosen item is blocked: nothing to type, and Replace must not clear the page.
      report.note = "Nothing was changed on Common App.";
      return report;
    }

    halt();
    const result = await driver.fill(plan, decision.mode, existing.length);
    if (isLogin(await driver.path())) return emptyReport({ stopped: SIGNED_OUT });

    report.filled = plan.slots.slice(0, result.filled).map((s) => s.label);
    report.notAdded = plan.slots.slice(result.filled).map((s) => s.label);
    report.notes = (result.notes ?? []).filter((n) => !n.startsWith("Not added"));
    if (decision.mode === "replace" && result.filled > 0) {
      // A stop before the surplus entries were removed leaves some of the old ones on the page: say so instead of "Replaced all".
      report.replaced = result.stoppedReason
        ? `Overwrote ${Math.min(result.filled, existing.length)} of the ${existing.length} ${noun(page, existing.length)} that ${existing.length === 1 ? "was" : "were"} already on Common App before stopping: ${existing.join(", ")}.`
        : replacedNote("Common App", noun(page, existing.length), existing);
    }
    if (result.stoppedReason) {
      report.stopped = result.stoppedReason;
      return report;
    }

    // Read-back: Continue left the page, so open it fresh and compare the slots this fill wrote.
    if (result.firstSlot !== undefined && result.filled > 0) {
      await driver.reopen();
      if (isLogin(await driver.path())) return emptyReport({ stopped: SIGNED_OUT });
      const shown = (await driver.read()).slice(result.firstSlot - 1);
      report.mismatches = readBackMismatches({ ...plan, slots: plan.slots.slice(0, result.filled) }, shown, result.firstSlot);
    }
    return report;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.stopped = /^Stopped/.test(msg) ? msg : `Stopped: ${msg}`;
    return report;
  }
}
