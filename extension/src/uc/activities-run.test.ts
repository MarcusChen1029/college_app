import assert from "node:assert/strict";
import { test } from "node:test";
import { newUcEntry, type ActivityData, type UcEntry } from "../../../web/lib/activities.ts";
import type { UcFormPlan } from "../../../web/lib/uc-activities-fill.ts";
import type { AskUi } from "../activities-flow.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import type { UcListed } from "./activities.ts";
import { runUcActivities, UC_SIGNED_OUT, UC_STOPPED } from "./activities-run.ts";
import type { UcTab } from "./run.ts";

const club = (id: string, over: Partial<UcEntry> = {}): UcEntry => ({
  ...newUcEntry("extracurricular"),
  id,
  name: `Club ${id}`,
  description: `Ran club ${id}.`,
  grades: ["10", "11"],
  hoursPerWeek: 5,
  weeksPerYear: 30,
  ...over,
});
const data = (uc: UcEntry[]): ActivityData => ({ version: 2, commonApp: { activities: [], honors: [] }, uc });
const listed = (n: number): UcListed[] =>
  Array.from({ length: n }, (_, i) => ({ activityId: String(100 + i), category: "ExtraCurr", index: i + 1, name: `Old ${i + 1}`, shown: {} }));

const PATHS = { list: "/my-application/introactivitiesawards", form: "/my-application/addactivityaward", login: "/my-application/login" } as const;

type FakeOpts = {
  items?: UcListed[];
  /** The n-th fill (1-based) answers with this error instead of saving. */
  failFill?: (n: number) => string | null;
  /** After the n-th page load (1-based) UC shows its sign-in page. */
  loginAfterReload?: number;
  /** What the list shows for a saved plan; default = exactly what the plan expects. */
  shown?: (plan: UcFormPlan) => Record<string, string[]>;
  /** The n-th save goes back to the list without the new entry. */
  dropSave?: number;
  onFill?: (n: number) => void;
  /** This press goes through (the entry is saved / deleted) but the wait for its page load fails: "fill:<n>" or "delete:<activityId>". */
  hangOn?: string;
  /** The n-th save lands twice on the list. */
  doubleSave?: number;
};

/**
 * A fake UC tab. Every press is a page load that happens a moment after the answer, like the real portal: a run that starts waiting for
 * the load only after the answer could miss it, so the fake fails such a wait ("missed") instead of letting it pass.
 */
function fakeUc(o: FakeOpts = {}) {
  let page: keyof typeof PATHS = "list";
  let items: UcListed[] = [...(o.items ?? [])];
  let nextId = 9000;
  let reloads = 0;
  let fills = 0;
  let missed = false;
  let waiters: { ok: () => void; fail: (e: Error) => void }[] = [];
  const log: string[] = [];
  // The load lands before the answer reaches the caller (a microtask queued ahead of it), the worst case for a late wait.
  const load = (apply: () => void, press = "") =>
    queueMicrotask(() => {
      apply();
      reloads++;
      if (o.loginAfterReload === reloads) page = "login";
      log.push("reload");
      if (!waiters.length) {
        missed = true;
        log.push("missed");
      }
      const w = waiters;
      waiters = [];
      for (const f of w) {
        if (press && press === o.hangOn) f.fail(new Error("UC did not finish saving (no reload). Check the page for a message"));
        else f.ok();
      }
    });
  const tab: UcTab = {
    async send(msg: AssistMessage): Promise<AssistResponse | null> {
      switch (msg.type) {
        case "ready":
          return { type: "ready", path: PATHS[page] };
        case "ucActList":
          log.push("list");
          return page === "list" ? { type: "ucActList", ok: true, items: items.map((x) => ({ ...x })) } : { type: "ucActList", ok: false, error: "Open UC's Activities & awards list first" };
        case "ucActDelete":
          if (page !== "list") return { type: "ucActDelete", ok: false, error: "Open UC's Activities & awards list first" };
          log.push(`delete:${msg.activityId}`);
          load(() => (items = items.filter((x) => x.activityId !== msg.activityId)), `delete:${msg.activityId}`);
          return { type: "ucActDelete", ok: true };
        case "ucActAdd":
          if (page !== "list") return { type: "ucActAdd", ok: false, error: "Open UC's Activities & awards list first" };
          log.push("add");
          load(() => (page = "form"));
          return { type: "ucActAdd", ok: true };
        case "ucActFill": {
          if (page !== "form") return { type: "ucActFill", ok: false, error: "Open UC's add-activity page first" };
          fills++;
          log.push(`fill:${msg.plan.label}`);
          o.onFill?.(fills);
          const err = o.failFill?.(fills);
          if (err) return { type: "ucActFill", ok: false, error: err };
          const plan = msg.plan;
          const n = fills;
          load(() => {
            page = "list";
            if (o.dropSave === n) return;
            const { activitySubtitle, ...rest } = o.shown?.(plan) ?? plan.expect;
            const name = activitySubtitle?.[0] ?? plan.label.split(": ").slice(1).join(": ");
            items.push({ activityId: String(nextId++), category: plan.category, index: items.length + 1, name, shown: rest });
            if (o.doubleSave === n) items.push({ activityId: String(nextId++), category: plan.category, index: items.length + 1, name, shown: rest });
          }, `fill:${n}`);
          return { type: "ucActFill", ok: true };
        }
        default:
          throw new Error(`unexpected ${msg.type}`);
      }
    },
    async go(path) {
      log.push(`go:${path}`);
      page = "list";
    },
    afterReload() {
      if (missed) return Promise.reject(new Error("the run started waiting after the page had already loaded"));
      return new Promise<void>((ok, fail) => waiters.push({ ok, fail }));
    },
  };
  return { tab, log, items: () => items, fills: () => fills };
}

function askUi(o: { replace?: boolean; pick?: (items: { id: string }[], max: number) => string[] } = {}) {
  const calls: string[] = [];
  let pickMax: number | null = null;
  const ui: AskUi = {
    async askReplace(existing, incoming) {
      calls.push(`ask:${existing.length}:${incoming}`);
      return o.replace ?? false;
    },
    async pick(items, max) {
      calls.push(`pick:${max}`);
      pickMax = max;
      return o.pick ? o.pick(items, max) : items.map((i) => i.id);
    },
  };
  return { ui, calls, pickMax: () => pickMax };
}

test("an empty list: every tracker entry is added in tracker order, no question, each save confirmed on the list", async () => {
  const uc = fakeUc();
  const ask = askUi();
  const r = await runUcActivities(uc.tab, data([club("a"), club("b")]), ask.ui);
  assert.deepEqual(ask.calls, []);
  assert.equal(r.stopped, null);
  assert.deepEqual(r.filled, ["Extracurricular activity: Club a", "Extracurricular activity: Club b"]);
  assert.deepEqual(uc.items().map((x) => x.name), ["Club a", "Club b"]);
  assert.deepEqual(r.mismatches, []);
  assert.ok(!uc.log.includes("missed"));
  // One fill per entry, each followed by its page load, never a second press.
  assert.deepEqual(uc.log.filter((l) => l !== "list"), ["add", "reload", "fill:Extracurricular activity: Club a", "reload", "add", "reload", "fill:Extracurricular activity: Club b", "reload"]);
});

test("replace: deletes the 3 listed entries (one page load each), then adds 2 in tracker order", async () => {
  const uc = fakeUc({ items: listed(3) });
  const ask = askUi({ replace: true });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b")]), ask.ui);
  assert.deepEqual(ask.calls, ["ask:3:2"]);
  assert.equal(r.stopped, null);
  const presses = uc.log.filter((l) => l !== "list" && l !== "reload");
  assert.deepEqual(presses, ["go:/my-application/introactivitiesawards", "delete:100", "delete:101", "delete:102", "add", "fill:Extracurricular activity: Club a", "add", "fill:Extracurricular activity: Club b"]);
  assert.equal(uc.log.filter((l) => l === "reload").length, 3 + 2 * 2);
  assert.deepEqual(uc.items().map((x) => x.name), ["Club a", "Club b"]);
  assert.deepEqual(r.filled, ["Extracurricular activity: Club a", "Extracurricular activity: Club b"]);
  assert.match(r.replaced!, /^Replaced the 3 activities and awards that were already on UC: Extracurricular activity: Old 1, .*Old 3\.$/);
  assert.ok(!uc.log.includes("missed"));
});

test("keep with 18 already listed: the toggle list allows 2, and only 2 are added", async () => {
  const uc = fakeUc({ items: listed(18) });
  const ask = askUi({ replace: false });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b"), club("c")]), ask.ui);
  assert.deepEqual(ask.calls, ["ask:18:3", "pick:2"]);
  assert.equal(ask.pickMax(), 2);
  assert.deepEqual(r.filled, ["Extracurricular activity: Club a", "Extracurricular activity: Club b"]);
  assert.equal(uc.items().length, 20);
  assert.ok(!uc.log.some((l) => l.startsWith("delete")));
});

test("a full list (20 of 20) with No: nothing is pressed and the report says the page is full", async () => {
  const uc = fakeUc({ items: listed(20) });
  const ask = askUi({ replace: false });
  const r = await runUcActivities(uc.tab, data([club("a")]), ask.ui);
  assert.equal(r.note, "This page is full (20 of 20). Nothing can be added.");
  assert.deepEqual(uc.log.filter((l) => l !== "list"), []);
});

test("a fill error on the 2nd form stops the run: forms 3+ are not added and listed in notAdded", async () => {
  const uc = fakeUc({ failFill: (n) => (n === 2 ? "Extracurricular activity: Club b: UC did not save it: Please enter a number between 1 and 52." : null) });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b"), club("c"), club("d")]), askUi().ui);
  assert.deepEqual(r.filled, ["Extracurricular activity: Club a"]);
  assert.deepEqual(r.notAdded, ["Extracurricular activity: Club b", "Extracurricular activity: Club c", "Extracurricular activity: Club d"]);
  assert.match(r.stopped!, /between 1 and 52/);
  assert.equal(uc.fills(), 2);
  assert.equal(uc.log.filter((l) => l === "add").length, 2);
});

test("UC's sign-in page after a save's load: what was saved stays listed as added, the entry just saved is possibly saved", async () => {
  // Loads: 1 add, 2 save (Club a), 3 add, 4 save (Club b) -> signed out.
  const uc = fakeUc({ loginAfterReload: 4 });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b"), club("c")]), askUi().ui);
  assert.equal(r.stopped, UC_SIGNED_OUT);
  assert.equal(UC_SIGNED_OUT, "UC signed you out. Sign in again; entries listed as added were saved.");
  assert.deepEqual(r.filled, ["Extracurricular activity: Club a"]);
  assert.deepEqual(r.unsure, ["Extracurricular activity: Club b (possibly saved)"]);
  assert.deepEqual(r.notAdded, ["Extracurricular activity: Club c"]);
  assert.equal(r.note, null);
});

test("UC's sign-in page after the Add press's load: the entry was never typed, so it stays under Not added", async () => {
  // Loads: 1 add (Club a) -> signed out.
  const uc = fakeUc({ loginAfterReload: 1 });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b")]), askUi().ui);
  assert.equal(r.stopped, UC_SIGNED_OUT);
  assert.equal(r.unsure, undefined);
  assert.deepEqual(r.notAdded, ["Extracurricular activity: Club a", "Extracurricular activity: Club b"]);
});

test("Replace question on UC: counts only the entries that can be sent (blank required answers too), names the rest, never offers them", async () => {
  const uc = fakeUc({ items: listed(1) });
  let asked: { incoming: number; blocked: string[] } | null = null;
  let offered: { id: string; blocked?: string[] }[] = [];
  const ui: AskUi = {
    async askReplace(_e, incoming, blocked) {
      asked = { incoming, blocked: (blocked ?? []).map((b) => `${b.label}: ${b.reasons.join("; ")}`) };
      return false;
    },
    async pick(items) {
      offered = items;
      return items.map((i) => i.id); // ticks everything, the blocked ones included: they are still never sent
    },
  };
  const r = await runUcActivities(uc.tab, data([club("a"), club("b", { description: "" }), club("c", { hoursPerWeek: 500 }), club("d")]), ui);
  assert.deepEqual(asked, {
    incoming: 2,
    blocked: ["Extracurricular activity: Club b: UC requires an answer for: What did you do?", "Extracurricular activity: Club c: Hours per week: UC accepts 1 to 168 hours per week."],
  });
  assert.deepEqual(offered.map((i) => [i.id, Boolean(i.blocked)]), [["a", false], ["b", true], ["c", true], ["d", false]]);
  assert.deepEqual(uc.log.filter((l) => l.startsWith("fill:")), ["fill:Extracurricular activity: Club a", "fill:Extracurricular activity: Club d"]);
  assert.deepEqual(r.blocked.map((b) => b.label), ["Extracurricular activity: Club b", "Extracurricular activity: Club c"]);
  assert.deepEqual(r.blanks, []);
  assert.equal(r.notChosen, undefined);
});

test("a keep run on UC names the tracker entries that were not chosen", async () => {
  const uc = fakeUc({ items: listed(1) });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b"), club("c")]), askUi({ pick: () => ["b"] }).ui);
  assert.deepEqual(r.filled, ["Extracurricular activity: Club b"]);
  assert.deepEqual(r.notChosen, ["Extracurricular activity: Club a", "Extracurricular activity: Club c"]);
});

test("a replace with blank required answers in the tracker: the question counts only the sendable entry, and the blank one is never sent", async () => {
  const uc = fakeUc({ items: listed(2) });
  const ask = askUi({ replace: true });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b", { grades: [] })]), ask.ui);
  assert.deepEqual(ask.calls, ["ask:2:1"]);
  assert.deepEqual(r.filled, ["Extracurricular activity: Club a"]);
  assert.deepEqual(r.blocked, [{ label: "Extracurricular activity: Club b", reasons: ["UC requires an answer for: When you took part"] }]);
  assert.equal(uc.fills(), 1);
});

test("signed out before anything: nothing is asked or pressed", async () => {
  const uc = fakeUc();
  // UC's logout page answers first.
  const tab: UcTab = { ...uc.tab, send: async (m) => (m.type === "ready" ? { type: "ready", path: "/my-application/login/logout" } : uc.tab.send(m)) };
  const ask = askUi();
  const r = await runUcActivities(tab, data([club("a")]), ask.ui);
  assert.equal(r.stopped, UC_SIGNED_OUT);
  assert.deepEqual(ask.calls, []);
  assert.deepEqual(uc.log, []);
});

test("read-back: a difference on UC's list is reported, the run still ends normally", async () => {
  const uc = fakeUc({ shown: (p) => ({ ...p.expect, "Time you spent": ["5.0 hours per week", "3.0 weeks per year"] }) });
  const r = await runUcActivities(uc.tab, data([club("a")]), askUi().ui);
  assert.equal(r.stopped, null);
  assert.deepEqual(r.filled, ["Extracurricular activity: Club a"]);
  assert.equal(r.mismatches.length, 1);
  assert.match(r.mismatches[0]!, /Club a: Time you spent shows .*expected "30\.0 weeks per year"/);
});

test("a save that goes back to the list without the new entry stops the run and says so", async () => {
  const uc = fakeUc({ dropSave: 1 });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b")]), askUi().ui);
  assert.match(r.stopped!, /UC does not list Extracurricular activity: Club a after saving/);
  assert.deepEqual(r.filled, []);
  assert.deepEqual(r.notAdded, ["Extracurricular activity: Club a", "Extracurricular activity: Club b"]);
  assert.equal(uc.log.filter((l) => l === "add").length, 1);
});

test("Stop is honoured before the next step, never between a fill and its page load", async () => {
  let stop = false;
  const uc = fakeUc({ onFill: () => (stop = true) });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b")]), askUi().ui, () => stop);
  // The fill that was sent is waited for and confirmed, then the run stops before pressing Add again.
  assert.deepEqual(r.filled, ["Extracurricular activity: Club a"]);
  assert.deepEqual(r.notAdded, ["Extracurricular activity: Club b"]);
  assert.match(r.stopped!, /^Stopped\./);
  assert.equal(uc.log.filter((l) => l === "add").length, 1);
  assert.ok(uc.log.indexOf("reload", uc.log.indexOf("fill:Extracurricular activity: Club a")) > 0);
});

test("Stop before anything: nothing is pressed and the report says nothing changed", async () => {
  const uc = fakeUc({ items: listed(2) });
  const r = await runUcActivities(uc.tab, data([club("a")]), askUi({ replace: true }).ui, () => true);
  assert.equal(r.stopped, UC_STOPPED);
  assert.equal(UC_STOPPED, "Stopped. Nothing was changed on UC.");
  assert.deepEqual(uc.log.filter((l) => l !== "list"), []);
});

test("Stop during the deletes: the report names what was removed before stopping", async () => {
  const uc = fakeUc({ items: listed(3) });
  const r = await runUcActivities(uc.tab, data([club("a")]), askUi({ replace: true }).ui, () => uc.log.filter((l) => l.startsWith("delete")).length >= 2);
  assert.deepEqual(uc.log.filter((l) => l.startsWith("delete")), ["delete:100", "delete:101"]);
  assert.match(r.stopped!, /^Stopped\./);
  assert.match(r.replaced!, /Removed 2 of the 3 .* before stopping: Extracurricular activity: Old 1, Extracurricular activity: Old 2\./);
  assert.deepEqual(r.notAdded, ["Extracurricular activity: Club a"]);
});

test("blocked entries are never sent; when every entry is blocked a replace removes nothing", async () => {
  const uc = fakeUc({ items: listed(2) });
  const bad = club("a", { hoursPerWeek: 500 });
  const r = await runUcActivities(uc.tab, data([bad]), askUi({ replace: true }).ui);
  assert.equal(r.blocked.length, 1);
  assert.equal(r.note, "Nothing was changed on UC.");
  assert.deepEqual(uc.log.filter((l) => l !== "list"), []);
});

test("an empty tracker: nothing is asked or pressed", async () => {
  const uc = fakeUc({ items: listed(2) });
  const ask = askUi();
  const r = await runUcActivities(uc.tab, data([]), ask.ui);
  assert.equal(r.note, "Your tracker has no UC activities or awards to add.");
  assert.deepEqual(ask.calls, []);
});

test("replace: the list is loaded afresh before the first delete (UC's stale Yes handlers), and each later delete follows a load", async () => {
  const uc = fakeUc({ items: listed(2) });
  await runUcActivities(uc.tab, data([club("a")]), askUi({ replace: true }).ui);
  const firstDelete = uc.log.indexOf("delete:100");
  const go = uc.log.indexOf("go:/my-application/introactivitiesawards");
  assert.ok(go >= 0 && go < firstDelete, uc.log.join(" "));
  assert.equal(uc.log.slice(0, firstDelete).filter((l) => l.startsWith("go:")).length, 1);
  assert.equal(uc.log[uc.log.indexOf("delete:101") - 1], "reload"); // delete:100 -> its load -> delete:101
});

test("replace: a list that changed since the question stops before any delete", async () => {
  const uc = fakeUc({ items: listed(2) });
  const ui: AskUi = { askReplace: async () => (uc.items().pop(), true), pick: async () => [] };
  const r = await runUcActivities(uc.tab, data([club("a")]), ui);
  assert.match(r.stopped!, /changed after the question/);
  assert.ok(!uc.log.some((l) => l.startsWith("delete")));
});

test("a save whose page load never comes back: the entry is listed as possibly saved, not under Not added", async () => {
  const uc = fakeUc({ hangOn: "fill:2" });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b"), club("c")]), askUi().ui);
  assert.deepEqual(r.filled, ["Extracurricular activity: Club a"]);
  assert.deepEqual(r.unsure, ["Extracurricular activity: Club b (possibly saved)"]);
  assert.deepEqual(r.notAdded, ["Extracurricular activity: Club c"]);
  assert.match(r.stopped!, /Club b may have been saved\. Check UC's list before running again\./);
  assert.equal(uc.fills(), 2);
});

test("a delete whose page load never comes back: the entry is listed as possibly removed, not as removed", async () => {
  const uc = fakeUc({ items: listed(3), hangOn: "delete:101" });
  const r = await runUcActivities(uc.tab, data([club("a")]), askUi({ replace: true }).ui);
  assert.deepEqual(r.unsure, ["Extracurricular activity: Old 2 (possibly removed)"]);
  assert.match(r.replaced!, /Removed 1 of the 3 .* before stopping: Extracurricular activity: Old 1\./);
  assert.match(r.stopped!, /Old 2 may have been removed/);
  assert.deepEqual(r.notAdded, ["Extracurricular activity: Club a"]);
  assert.ok(!uc.log.includes("delete:102"));
});

test("one save that shows up twice on the list stops the run as a possible double save", async () => {
  const uc = fakeUc({ doubleSave: 1 });
  const r = await runUcActivities(uc.tab, data([club("a"), club("b")]), askUi().ui);
  assert.deepEqual(r.filled, []);
  assert.deepEqual(r.unsure, ["Extracurricular activity: Club a (possibly saved twice)"]);
  assert.deepEqual(r.notAdded, ["Extracurricular activity: Club b"]);
  assert.match(r.stopped!, /added 2 entries to UC's list, so Extracurricular activity: Club a may have been saved twice/);
  assert.equal(uc.log.filter((l) => l === "add").length, 1);
});
