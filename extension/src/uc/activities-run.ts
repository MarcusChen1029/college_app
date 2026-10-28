// The UC "Activities & awards" run across page loads, free of chrome.* so it can be tested with a fake tab. panel.ts wires it to the real
// tab (uc/panel.ts ucTab) and draws the question, the toggle list and the report (the same ones as Common App's, activities-panel.ts).
//
// The owner's rule (spec §5.2), limit 20: the list is empty -> add every tracker entry in tracker order, no question. It has entries -> ask
// whether to replace all of them; Yes -> delete each listed entry (Delete, then Yes; one page load each), then add; No -> the student
// ticks which tracker entries to add, at most 20 minus what is listed. A full list runs nothing.
//
// Every UC button is a full page load (portal-dom.md §7), and only the student's original tab may be driven (a second tab signs UC out), so
// each step is: start waiting for the load, press, wait. Each fill is sent exactly once; after its load the list is read and the new entry
// must be on it, or the run stops. Stop is honoured before every press, never between a press and its load. A sign-in page after any load
// ends the run with UC_SIGNED_OUT. The `legacy` note is never sent (buildUcFormPlans never reads it); #no_activities and any submit other
// than #save are never pressed (uc/activities.ts).

import { UC_CATEGORIES, type ActivityData, type UcCategory } from "../../../web/lib/activities.ts";
import { replacedNote } from "../../../web/lib/activities-fill.ts";
import { buildUcFormPlans, ucItemLabel, ucReadBackMismatches, type UcFormCategory, type UcFormPlan } from "../../../web/lib/uc-activities-fill.ts";
import { decide, emptyReport, fullText, noun, UC_PAGE_LIMIT, type ActivitiesReport, type AskUi } from "../activities-flow.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import type { UcListed } from "./activities.ts";
import type { UcTab } from "./run.ts";

/** UC's Activities & awards list page, where the panel offers the fill. */
export const UC_ACTIVITIES_PATH = "/my-application/introactivitiesawards";

export const UC_SIGNED_OUT = "UC signed you out. Sign in again; entries listed as added were saved.";
export const UC_STOPPED = "Stopped. Nothing was changed on UC.";
const UC_STOPPED_PART = "Stopped. What is listed as added or removed below was saved on UC; nothing else was changed.";
const NO_ANSWER = "The UC page stopped responding. Reload it and check the Activities & awards list before running again";

const CATEGORY_OF: Record<UcFormCategory, UcCategory> = {
  Award: "award",
  EdPrep: "edprep",
  ExtraCurr: "extracurricular",
  OtherCourse: "coursework",
  Volunteer: "volunteer",
  WorkExp: "work",
};

/** How a listed entry is named in the question and the report, like ucItemLabel: "<category label>: <name>". */
export function ucListedLabel(x: UcListed): string {
  const cat = CATEGORY_OF[x.category as UcFormCategory];
  return `${cat ? UC_CATEGORIES[cat].label : "Activity"}: ${x.name || `entry ${x.index}`}`;
}

const isSignIn = (path: string) => /\/login(\/|$|\?)/i.test(path) || /logout/i.test(path);

/** A message as one sentence ending in a full stop. */
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** Ends the run; `notAdded` is set from where the run was when it was thrown. */
class RunStop extends Error {}

/**
 * `shouldStop`: the panel's Stop flag, checked before every press. `progress`: a status line for the panel.
 * The report's `filled` lists only entries UC's list showed after their save.
 */
export async function runUcActivities(
  tab: UcTab,
  data: ActivityData,
  ui: AskUi,
  shouldStop: () => boolean = () => false,
  progress: (text: string) => void = () => {},
): Promise<ActivitiesReport> {
  const items = data.uc.map((e) => ({ id: e.id, label: ucItemLabel(e) }));
  const report = emptyReport();
  /** Something on UC changed (an entry removed or added): a stop can no longer say "nothing was changed". */
  let changed = false;
  /** Forms not yet confirmed on the list; what is left of them when the run ends is `notAdded`. */
  let pending: UcFormPlan[] = [];
  let deleted: string[] = [];
  let existingLabels: string[] = [];

  const halt = () => {
    if (shouldStop()) throw new RunStop(changed ? UC_STOPPED_PART : UC_STOPPED);
  };
  const ask = async <T extends AssistResponse["type"]>(msg: AssistMessage & { type: T }): Promise<Extract<AssistResponse, { type: T }>> => {
    const r = await tab.send(msg);
    if (r?.type !== msg.type) throw new RunStop(`Stopped: ${sentence(NO_ANSWER)}`);
    return r as Extract<AssistResponse, { type: T }>;
  };
  const signedIn = async () => {
    const r = await tab.send({ type: "ready" });
    if (r?.type === "ready" && isSignIn(r.path)) throw new RunStop(UC_SIGNED_OUT);
  };
  const list = async (when: string): Promise<UcListed[]> => {
    const r = await ask({ type: "ucActList" });
    if (!r.ok) throw new RunStop(`Stopped: ${when}: ${sentence(r.error)}`);
    return r.items;
  };
  /**
   * One press that leaves the page: the wait for the load starts BEFORE the press (the load can begin before the answer is back), and is
   * awaited only when the press went through. `press` returns an error sentence when nothing was pressed.
   */
  const pressAndLoad = async (press: () => Promise<string | null>) => {
    const loaded = tab.afterReload();
    loaded.catch(() => {}); // not awaited when the press failed
    const error = await press();
    if (error) throw new RunStop(`Stopped: ${sentence(error)}`);
    await loaded;
    await signedIn();
  };

  try {
    halt();
    await signedIn();
    halt();
    const before = await list("open UC's Activities & awards list");
    existingLabels = before.map(ucListedLabel);
    if (items.length === 0) return emptyReport({ note: "Your tracker has no UC activities or awards to add." });

    const decision = await decide(existingLabels, items, UC_PAGE_LIMIT, ui);
    halt();
    if (decision.mode === "keep" && decision.pickIds.length === 0) {
      return emptyReport({ note: before.length >= UC_PAGE_LIMIT ? fullText("uc", before.length) : "You chose nothing to add, so nothing was changed." });
    }

    const plan = buildUcFormPlans(data.uc, decision.mode === "keep" ? decision.pickIds : undefined);
    report.blocked = plan.blocked;
    report.blanks = plan.blanks;
    if (plan.forms.length === 0) {
      // Every chosen entry is blocked: nothing to type, and Replace must not empty the list.
      report.note = "Nothing was changed on UC.";
      return report;
    }
    const room = UC_PAGE_LIMIT - (decision.mode === "replace" ? 0 : before.length);
    pending = plan.forms.slice(0, room);
    report.notAdded = plan.forms.slice(room).map((f) => f.label);

    if (decision.mode === "replace") {
      for (const x of before) {
        halt();
        progress(`Removing ${ucListedLabel(x)} from UC...`);
        await pressAndLoad(async () => {
          const r = await ask({ type: "ucActDelete", activityId: x.activityId });
          return r.ok ? null : r.error;
        });
        changed = true;
        deleted.push(ucListedLabel(x));
      }
      const left = (await list("after removing the old entries")).filter((y) => before.some((x) => x.activityId === y.activityId));
      if (left.length) throw new RunStop(`Stopped: UC still lists ${left.map(ucListedLabel).join(", ")} after deleting ${left.length === 1 ? "it" : "them"}. Nothing was added.`);
    }

    const known = new Set((await list("before adding")).map((x) => x.activityId));
    const added: { plan: UcFormPlan; activityId: string }[] = [];
    while (pending.length) {
      const form = pending[0]!;
      halt();
      progress(`Adding ${form.label} (${added.length + 1} of ${added.length + pending.length})...`);
      await pressAndLoad(async () => {
        const r = await ask({ type: "ucActAdd" });
        return r.ok ? null : r.error;
      });
      halt(); // the add page is open and nothing is typed yet: stopping here changes nothing
      // From here to the list check there is no Stop: the fill is sent once and its load is always waited for.
      await pressAndLoad(async () => {
        const r = await tab.send({ type: "ucActFill", plan: form });
        if (r?.type !== "ucActFill") throw new RunStop(`Stopped: ${form.label}: UC did not answer after Save & continue, so it is not known whether it was saved. Check UC's list before running again.`);
        return r.ok ? null : r.error;
      });
      const now = await list(`${form.label}: UC did not go back to the list after Save & continue (check the page for a message)`);
      const fresh = now.filter((x) => !known.has(x.activityId));
      for (const x of now) known.add(x.activityId);
      if (fresh.length === 0) throw new RunStop(`Stopped: UC does not list ${form.label} after saving: check the page for a message.`);
      changed = true;
      added.push({ plan: form, activityId: fresh[fresh.length - 1]!.activityId });
      report.filled.push(form.label);
      pending.shift();
    }

    // Read-back: what UC's list shows for each added entry, against what was entered.
    const shown = await list("for the read-back");
    for (const a of added) {
      const x = shown.find((y) => y.activityId === a.activityId);
      if (!x) report.mismatches.push(`${a.plan.label}: no longer on UC's list`);
      else report.mismatches.push(...ucReadBackMismatches(a.plan, { ...x.shown, activitySubtitle: [x.name] }));
    }
    if (deleted.length) report.replaced = replacedNote("UC", noun("uc", deleted.length), deleted);
    return report;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.stopped = e instanceof RunStop ? msg : /^Stopped/.test(msg) ? msg : `Stopped: ${msg}`;
    report.notAdded = [...pending.map((f) => f.label), ...report.notAdded];
    if (deleted.length) {
      const n = existingLabels.length;
      report.replaced =
        deleted.length === n
          ? replacedNote("UC", noun("uc", n), deleted)
          : `Removed ${deleted.length} of the ${n} ${noun("uc", n)} that ${n === 1 ? "was" : "were"} already on UC before stopping: ${deleted.join(", ")}.`;
    }
    return report;
  }
}
