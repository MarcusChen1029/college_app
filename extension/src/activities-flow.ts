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

/** One tracker item in the toggle list. `blocked`: why the portal would not take it; it is shown disabled with these reasons and cannot be picked. */
export type PickItem = { id: string; label: string; blocked?: string[] };

export type AskUi = {
  /**
   * "Common App already has N ...": true = replace them all. `incoming` counts only what will be written; `blocked` names the tracker items
   * that cannot be sent (with reasons). May reject (Stop pressed): the run ends, nothing changed.
   */
  askReplace(existing: string[], incoming: number, blocked?: PlanProblem[]): Promise<boolean>;
  /** The toggle list: at most `max` may be on; blocked items are shown but cannot be switched on. Returns the ids switched on. */
  pick(items: PickItem[], max: number): Promise<string[]>;
};

/** One Common App page. Every method rejects with an Error whose message is a sentence for the student. */
export type CaDriver = {
  inspect(): Promise<string[]>;
  /** Rejecting with a message starting "Stopped" means nothing was sent; any other rejection may come after the page got the fill. */
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
  /**
   * Entries the run cannot tell about: a press or fill went through (or may have) but no answer or page load came back, or the portal signed
   * out right after it: they may be saved / removed / overwritten. Never also in `filled` or `notAdded`, so a rerun does not add them blindly.
   */
  unsure?: string[];
  /** Keep runs: the sendable tracker items the student did not switch on (spec §5.4). */
  notChosen?: string[];
};

export const STOPPED = "Stopped. Nothing was changed on Common App.";
export const SIGNED_OUT = "Common App signed you out. Sign in again; nothing after this point was saved.";
/** Signed out after Continue had saved the page and moved on: the entries are saved, the read-back did not run. */
export const SIGNED_OUT_SAVED = "Common App signed you out. Saved by Continue, but not checked: sign in again and look at the page.";
/** Signed out while the fill was on the page (before Continue): "Add another" may have saved part of it. */
export const SIGNED_OUT_UNSURE = "Common App signed you out during the fill. Sign in again and look at the page: part of this may have been saved.";

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

/** The Replace question. `incoming` = what will be written; `blocked` = how many tracker items cannot be sent (listed under the question). */
export function askReplaceText(page: ActPage, existing: number, incoming: number, blocked = 0): string {
  const what = blocked > 0 ? `the ${incoming} from your tracker that can be sent` : `the ${incoming} in your tracker`;
  return `${portalOf(page)} already has ${existing} ${noun(page, existing)}. Replace ${existing === 1 ? "it" : "all of them"} with ${what}?`;
}

export function fullText(page: ActPage, existing: number): string {
  return `This page is full (${existing} of ${PAGE_LIMIT[page]}). Nothing can be added.`;
}

/**
 * The toggle-list items from the tracker items and the plan built for all of them: an item the plan did not send is blocked, with the plan's
 * reasons (a plan lists its blocked items in tracker order, so they are matched in order).
 */
export function pickItems(items: { id: string; label: string }[], sentIds: string[], blocked: PlanProblem[]): PickItem[] {
  const sent = new Set(sentIds);
  let k = 0;
  return items.map((i) => (sent.has(i.id) ? i : { ...i, blocked: blocked[k++]?.reasons ?? ["It cannot be sent."] }));
}

/**
 * Empty page -> keep every sendable item, no question. Entries -> ask, counting only sendable items (at most the page limit) and naming the
 * blocked ones; No -> toggles capped at the room (none when the page is full). Callers ask only when at least one item is sendable.
 */
export async function decide(existing: string[], items: PickItem[], limit: number, ui: AskUi): Promise<Decision> {
  const sendable = items.filter((i) => !i.blocked);
  if (existing.length === 0) return { mode: "keep", pickIds: sendable.map((i) => i.id) };
  const blocked = items.flatMap((i) => (i.blocked ? [{ label: i.label, reasons: i.blocked }] : []));
  if (await ui.askReplace(existing, Math.min(sendable.length, limit), blocked)) return { mode: "replace" };
  const max = Math.max(0, limit - existing.length);
  if (max === 0) return { mode: "keep", pickIds: [] };
  const picked = new Set(await ui.pick(items, max));
  // Tracker order, only sendable ids, never more than the room (the toggle list enforces it, this keeps the run safe if it did not).
  return { mode: "keep", pickIds: sendable.filter((i) => picked.has(i.id)).map((i) => i.id).slice(0, max) };
}

/** A keep run: the sendable items the student left off (undefined when there are none; blocked items are reported as blocked). */
export function notChosenOf(items: PickItem[], decision: Decision): string[] | undefined {
  if (decision.mode !== "keep") return undefined;
  const out = items.filter((i) => !i.blocked && !decision.pickIds.includes(i.id)).map((i) => i.label);
  return out.length ? out : undefined;
}

const isLogin = (path: string) => path.startsWith("/login");
/** A message as one sentence ending in a full stop. */
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** A run that ended before anything could be written. */
export function emptyReport(over: Partial<ActivitiesReport> = {}): ActivitiesReport {
  return { filled: [], replaced: null, blocked: [], blanks: [], notAdded: [], mismatches: [], stopped: null, notes: [], note: null, ...over };
}

/**
 * `shouldStop`: the Stop button's flag. It is checked before every step that could change the page (the question, the fill), so a Stop
 * pressed while the page is still being checked ends the run before anything is asked or typed.
 *
 * Once the fill was sent the report never forgets it: a fill that came back keeps `filled` / `replaced` whatever happens next (a sign-in page
 * or a failed read-back says "Saved by Continue, but not checked"); a fill that was sent but never answered (the content script went away
 * mid-fill) lists what it could have written under `unsure`, because "Add another" saves the page.
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
  /** Whether the tab shows the sign-in page after the fill; a tab that does not answer counts as signed in (the report says what it knows). */
  const signedOut = async () => {
    try {
      return isLogin(await driver.path());
    } catch {
      return false;
    }
  };
  try {
    halt();
    if (isLogin(await driver.path())) return emptyReport({ stopped: SIGNED_OUT });
    halt();
    const existing = await driver.inspect();
    halt();
    if (isLogin(await driver.path())) return emptyReport({ stopped: SIGNED_OUT });

    if (items.length === 0) return emptyReport({ note: `Your tracker has no ${NOUN[page].many} to add.` });
    // The plan for every item first: the question counts only what will be written and names what cannot be sent.
    const full = buildCaPagePlan(data, page);
    report.blocked = full.blocked;
    if (full.slots.length === 0) {
      // Every item is blocked: nothing to type, nothing to ask, and Replace must not clear the page.
      report.note = "Nothing was changed on Common App.";
      return report;
    }
    const choices = pickItems(items, full.slots.map((s) => s.sourceId), full.blocked);
    const decision = await decide(existing, choices, limit, ui);
    halt();
    if (isLogin(await driver.path())) return emptyReport({ stopped: SIGNED_OUT, blocked: full.blocked });

    if (decision.mode === "keep" && decision.pickIds.length === 0) {
      report.note = keepRoom(page, existing.length) === 0 ? fullText(page, existing.length) : "You chose nothing to add, so nothing was changed.";
      return report;
    }
    const plan = decision.mode === "keep" ? buildCaPagePlan(data, page, decision.pickIds) : full;
    report.blanks = plan.blanks;
    const notChosen = notChosenOf(choices, decision);
    if (notChosen) report.notChosen = notChosen;
    if (plan.slots.length === 0) {
      report.note = "Nothing was changed on Common App.";
      return report;
    }

    halt();
    let result: CaPageResult;
    try {
      result = await driver.fill(plan, decision.mode, existing.length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/^Stopped/.test(msg)) throw e; // refused before it was sent: nothing was typed
      // Sent, but no answer came back: the page may hold (and "Add another" may have saved) any of it.
      const room = decision.mode === "replace" ? limit : keepRoom(page, existing.length);
      report.unsure = [
        ...plan.slots.slice(0, room).map((s) => `${s.label} (possibly saved)`),
        ...(decision.mode === "replace" ? existing.map((name) => `${name} (possibly overwritten)`) : []),
      ];
      report.notAdded = plan.slots.slice(room).map((s) => s.label);
      report.stopped = (await signedOut())
        ? SIGNED_OUT_UNSURE
        : `Stopped: ${sentence(msg)} Common App may have saved part of this ("Add another" saves the page): look at the page before running again.`;
      return report;
    }

    report.filled = plan.slots.slice(0, result.filled).map((s) => s.label);
    report.notAdded = plan.slots.slice(result.filled).map((s) => s.label);
    report.notes = (result.notes ?? []).filter((n) => !n.startsWith("Not added"));
    /** Slots typed into, including one that then had a problem: a replace overwrote that many old entries. */
    const wrote = Math.max(result.written ?? 0, result.filled);
    if (decision.mode === "replace" && wrote > 0) {
      // A stop before the surplus entries were removed leaves some of the old ones on the page: say so instead of "Replaced all".
      report.replaced = result.stoppedReason
        ? `Overwrote ${Math.min(wrote, existing.length)} of the ${existing.length} ${noun(page, existing.length)} that ${existing.length === 1 ? "was" : "were"} already on Common App before stopping: ${existing.join(", ")}.`
        : replacedNote("Common App", noun(page, existing.length), existing);
    }
    if (result.stoppedReason) {
      report.stopped = result.stoppedReason;
      if (await signedOut()) {
        // Continue was not pressed and the tab is signed out: only what "Add another" saved survived, and the run cannot tell which.
        report.unsure = [
          ...plan.slots.slice(0, wrote).map((s) => `${s.label} (possibly saved)`),
          ...(report.replaced ? existing.map((name) => `${name} (possibly overwritten)`) : []),
        ];
        report.filled = [];
        report.notAdded = plan.slots.slice(wrote).map((s) => s.label);
        report.replaced = null;
        report.stopped = SIGNED_OUT_UNSURE;
      }
      return report;
    }

    // Continue saved the page and moved on: from here on `filled` / `replaced` stay, whatever the read-back finds.
    try {
      if (await signedOut()) {
        report.stopped = SIGNED_OUT_SAVED;
        return report;
      }
      // Read-back: Continue left the page, so open it fresh and compare the slots this fill wrote.
      if (result.firstSlot !== undefined && result.filled > 0) {
        await driver.reopen();
        if (await signedOut()) {
          report.stopped = SIGNED_OUT_SAVED;
          return report;
        }
        const shown = (await driver.read()).slice(result.firstSlot - 1);
        report.mismatches = readBackMismatches({ ...plan, slots: plan.slots.slice(0, result.filled) }, shown, result.firstSlot);
      }
    } catch (e) {
      report.stopped = `Saved by Continue, but not checked: ${sentence(e instanceof Error ? e.message : String(e))} Look at the page.`;
    }
    return report;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.stopped = /^Stopped/.test(msg) ? msg : `Stopped: ${msg}`;
    return report;
  }
}
