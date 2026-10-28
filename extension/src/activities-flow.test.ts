import assert from "node:assert/strict";
import { test } from "node:test";
import type { CaPagePlan } from "../../web/lib/activities-fill.ts";
import { newCaActivity, newCaHonor, type ActivityData, type CaActivity, type CaHonor } from "../../web/lib/activities.ts";
import type { FillMode } from "./messages.ts";
import {
  SIGNED_OUT,
  SIGNED_OUT_SAVED,
  SIGNED_OUT_UNSURE,
  STOPPED,
  askReplaceText,
  decide,
  fullText,
  runCaPage,
  type AskUi,
  type CaDriver,
} from "./activities-flow.ts";
import type { CaPageResult } from "./commonapp/activities.ts";

const act = (id: string, over: Partial<CaActivity> = {}): CaActivity => ({
  ...newCaActivity(),
  id,
  type: "Robotics",
  description: `Built robot ${id}.`,
  organization: `Team ${id}`,
  leadership: false,
  grades: ["10", "11"],
  timing: "school",
  hoursPerWeek: 10,
  weeksPerYear: 30,
  continueInCollege: "yes",
  ...over,
});
const honor = (id: string, title = `Award ${id}`): CaHonor => ({ ...newCaHonor(), id, title, grades: ["11"], levels: ["school"] });
const data = (activities: CaActivity[], honors: CaHonor[] = []): ActivityData => ({ version: 2, commonApp: { activities, honors }, uc: [] });
const acts = (n: number) => Array.from({ length: n }, (_, i) => act(`a${i + 1}`));

type FakeOpts = {
  existing?: string[];
  /** path() answers in order; the last one repeats. */
  paths?: string[];
  fillResult?: (plan: CaPagePlan, mode: FillMode, existing: number) => CaPageResult;
  /** What the page shows after the fill, per slot of the whole page; default = exactly what was sent. */
  shown?: (plan: CaPagePlan, firstSlot: number) => Record<string, string | string[]>[];
};

function fake(opts: FakeOpts = {}) {
  const calls: string[] = [];
  let sent: CaPagePlan | null = null;
  let firstSlot = 1;
  let n = 0;
  const driver: CaDriver = {
    async inspect() {
      calls.push("inspect");
      return opts.existing ?? [];
    },
    async fill(plan, mode, existing) {
      calls.push(`fill:${mode}:${existing}:${plan.slots.length}`);
      sent = plan;
      firstSlot = mode === "keep" ? existing + 1 : 1;
      return opts.fillResult?.(plan, mode, existing) ?? { filled: plan.slots.length, blanks: [], ...(plan.slots.length ? { firstSlot } : {}) };
    },
    async reopen() {
      calls.push("reopen");
    },
    async read() {
      calls.push("read");
      if (opts.shown) return opts.shown(sent!, firstSlot);
      const rows: Record<string, string | string[]>[] = Array.from({ length: firstSlot - 1 }, () => ({}));
      for (const slot of sent!.slots) {
        const row: Record<string, string | string[]> = {};
        for (const a of slot.answers) if (a.value !== null) row[a.question] = a.value;
        rows.push(row);
      }
      return rows;
    },
    async path() {
      const paths = opts.paths ?? ["/common/7/232"];
      const p = paths[Math.min(n, paths.length - 1)]!;
      n++;
      return p;
    },
  };
  return { driver, calls };
}

function fakeUi(answers: { replace?: boolean; pick?: (items: { id: string; label: string }[], max: number) => string[] } = {}) {
  const log: string[] = [];
  const ui: AskUi = {
    async askReplace(existing, incoming) {
      log.push(`askReplace:${existing.length}:${incoming}`);
      return answers.replace ?? false;
    },
    async pick(items, max) {
      log.push(`pick:${items.length}:${max}`);
      return answers.pick ? answers.pick(items, max) : items.slice(0, max).map((i) => i.id);
    },
  };
  return { ui, log };
}

test("an empty page is filled with every tracker item in order, and nobody is asked", async () => {
  const { driver, calls } = fake();
  const { ui, log } = fakeUi();
  const report = await runCaPage("activities", data(acts(3)), driver, ui);
  assert.deepEqual(log, []);
  assert.deepEqual(calls, ["inspect", "fill:keep:0:3", "reopen", "read"]);
  assert.deepEqual(report.filled, ["Team a1", "Team a2", "Team a3"]);
  assert.equal(report.replaced, null);
  assert.deepEqual(report.mismatches, []);
  assert.equal(report.stopped, null);
});

test("4 existing + Yes: replaces all, and the report repeats the names that were removed", async () => {
  const { driver, calls } = fake({ existing: ["Old A", "Old B", "Old C", "Old D"] });
  const { ui, log } = fakeUi({ replace: true });
  const report = await runCaPage("activities", data(acts(2)), driver, ui);
  assert.deepEqual(log, ["askReplace:4:2"]);
  assert.ok(calls.includes("fill:replace:4:2"));
  assert.equal(report.replaced, "Replaced the 4 activities that were already on Common App: Old A, Old B, Old C, Old D.");
  assert.deepEqual(report.filled, ["Team a1", "Team a2"]);
});

test("1 existing + Yes reads naturally in the singular", async () => {
  const { driver } = fake({ existing: ["Old A"] });
  const { ui } = fakeUi({ replace: true });
  const report = await runCaPage("activities", data(acts(1)), driver, ui);
  assert.equal(report.replaced, "Replaced the 1 activity that was already on Common App: Old A.");
  const honors = await runCaPage("honors", data([], [honor("h1")]), fake({ existing: ["Old award"] }).driver, fakeUi({ replace: true }).ui);
  assert.equal(honors.replaced, "Replaced the 1 honor that was already on Common App: Old award.");
});

test("No + 7 items + 4 existing: the toggle list allows 6, only the picked ones are sent, after the existing entries", async () => {
  const { driver, calls } = fake({ existing: ["E1", "E2", "E3", "E4"] });
  const { ui, log } = fakeUi({ pick: () => ["a2", "a5"] });
  const report = await runCaPage("activities", data(acts(7)), driver, ui);
  assert.deepEqual(log, ["askReplace:4:7", "pick:7:6"]);
  assert.ok(calls.includes("fill:keep:4:2"));
  assert.deepEqual(report.filled, ["Team a2", "Team a5"]);
  assert.equal(report.replaced, null);
});

test("picked items are sent in tracker order and never more than the room", async () => {
  const { driver, calls } = fake({ existing: ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"] });
  const { ui } = fakeUi({ pick: () => ["a5", "a3", "a1"] });
  const report = await runCaPage("activities", data(acts(5)), driver, ui);
  assert.ok(calls.includes("fill:keep:8:2"));
  assert.deepEqual(report.filled, ["Team a1", "Team a3"]);
});

test("a full page: No means nothing is picked, nothing is filled, and the report says the page is full", async () => {
  const existing = Array.from({ length: 10 }, (_, i) => `E${i + 1}`);
  const { driver, calls } = fake({ existing });
  const { ui, log } = fakeUi();
  const report = await runCaPage("activities", data(acts(3)), driver, ui);
  assert.deepEqual(log, ["askReplace:10:3"]);
  assert.deepEqual(calls, ["inspect"]);
  assert.equal(report.note, "This page is full (10 of 10). Nothing can be added.");
  assert.equal(fullText("honors", 5), "This page is full (5 of 5). Nothing can be added.");
  assert.deepEqual(report.filled, []);
  assert.equal(report.stopped, null);
});

test("picking nothing fills nothing", async () => {
  const { driver, calls } = fake({ existing: ["E1"] });
  const { ui } = fakeUi({ pick: () => [] });
  const report = await runCaPage("activities", data(acts(2)), driver, ui);
  assert.deepEqual(calls, ["inspect"]);
  assert.equal(report.note, "You chose nothing to add, so nothing was changed.");
});

test("an empty tracker fills nothing and says so", async () => {
  const { driver, calls } = fake({ existing: ["E1"] });
  const { ui, log } = fakeUi({ replace: true });
  const report = await runCaPage("honors", data(acts(2)), driver, ui);
  assert.deepEqual(calls, ["inspect"]);
  assert.deepEqual(log, []);
  assert.equal(report.note, "Your tracker has no honors to add.");
});

test("a read-back difference is listed, numbered by the portal's slot", async () => {
  const { driver } = fake({
    existing: ["E1", "E2", "E3"],
    shown: (plan, first) => {
      const rows: Record<string, string | string[]>[] = Array.from({ length: first - 1 }, () => ({}));
      for (const slot of plan.slots) {
        const row: Record<string, string | string[]> = {};
        for (const a of slot.answers) if (a.value !== null) row[a.question] = a.question === "Hours spent per week" ? "" : a.value;
        rows.push(row);
      }
      return rows;
    },
  });
  const { ui } = fakeUi({ pick: () => ["a1"] });
  const report = await runCaPage("activities", data(acts(2)), driver, ui);
  assert.deepEqual(report.mismatches, ['Activity 4: Hours spent per week shows "" (sent "10")']);
  assert.equal(report.stopped, null);
});

test("blocked and blank items are reported; a blocked item is not filled", async () => {
  const { driver } = fake();
  const { ui } = fakeUi();
  const items = [act("a1"), act("a2", { description: "x".repeat(151) }), act("a3", { hoursPerWeek: null })];
  const report = await runCaPage("activities", data(items), driver, ui);
  assert.deepEqual(report.filled, ["Team a1", "Team a3"]);
  assert.deepEqual(report.blocked.map((x) => x.label), ["Team a2"]);
  assert.deepEqual(report.blanks.map((x) => x.label), ["Team a3"]);
  assert.match(report.blanks[0]!.reasons[0]!, /needs an answer/);
});

test("a page stop is reported, nothing is read back, and the unwritten items are listed as not added", async () => {
  const { driver, calls } = fake({
    fillResult: (plan) => ({ filled: 1, blanks: [], firstSlot: 1, stoppedReason: "Common App's page changed (no Continue button)." }),
  });
  const { ui } = fakeUi();
  const report = await runCaPage("activities", data(acts(3)), driver, ui);
  assert.equal(report.stopped, "Common App's page changed (no Continue button).");
  assert.deepEqual(report.filled, ["Team a1"]);
  assert.deepEqual(report.notAdded, ["Team a2", "Team a3"]);
  assert.ok(!calls.includes("reopen"));
  assert.deepEqual(report.mismatches, []);
});

test("the page's notes are kept, except the not-added line the report builds itself", async () => {
  const { driver } = fake({
    fillResult: (plan) => ({ filled: plan.slots.length, blanks: [], firstSlot: 1, notes: ['Answered "Would you like to report any activities?" Yes.', "Not added, because Common App holds at most 10 activities: X."] }),
  });
  const report = await runCaPage("activities", data(acts(1)), driver, fakeUi().ui);
  assert.deepEqual(report.notes, ['Answered "Would you like to report any activities?" Yes.']);
});

test("signed out before anything: stopped with the sign-in text, nothing filled", async () => {
  const { driver, calls } = fake({ paths: ["/login"] });
  const report = await runCaPage("activities", data(acts(2)), driver, fakeUi().ui);
  assert.equal(report.stopped, SIGNED_OUT);
  assert.equal(SIGNED_OUT, "Common App signed you out. Sign in again; nothing after this point was saved.");
  assert.deepEqual(report.filled, []);
  assert.ok(!calls.some((c) => c.startsWith("fill")));
});

test("signed out mid-run (after inspect): no fill, stopped with the sign-in text", async () => {
  const { driver, calls } = fake({ existing: ["E1"], paths: ["/common/7/232", "/login/signin"] });
  const report = await runCaPage("activities", data(acts(2)), driver, fakeUi({ replace: true }).ui);
  assert.equal(report.stopped, SIGNED_OUT);
  assert.deepEqual(report.filled, []);
  assert.equal(report.replaced, null);
  assert.ok(!calls.some((c) => c.startsWith("fill")));
});

test("signed out when the question was answered (path call 3): no fill, stopped with the sign-in text", async () => {
  const { driver, calls } = fake({ paths: ["/common/7/232", "/common/7/232", "/login"] });
  const report = await runCaPage("activities", data(acts(2)), driver, fakeUi().ui);
  assert.equal(report.stopped, SIGNED_OUT);
  assert.deepEqual(report.filled, []);
  assert.ok(!calls.some((c) => c.startsWith("fill")));
});

test("signed out right after a fill that pressed Continue (path call 4): what Continue saved stays listed, not checked, no read-back", async () => {
  const { driver, calls } = fake({ existing: ["Old A"], paths: ["/common/7/232", "/common/7/232", "/common/7/232", "/login"] });
  const report = await runCaPage("activities", data(acts(2)), driver, fakeUi({ replace: true }).ui);
  assert.equal(report.stopped, SIGNED_OUT_SAVED);
  assert.equal(SIGNED_OUT_SAVED, "Common App signed you out. Saved by Continue, but not checked: sign in again and look at the page.");
  assert.deepEqual(report.filled, ["Team a1", "Team a2"]);
  assert.equal(report.replaced, "Replaced the 1 activity that was already on Common App: Old A.");
  assert.ok(calls.includes("fill:replace:1:2"));
  assert.ok(!calls.includes("reopen"));
  assert.ok(!calls.includes("read"));
});

test("signed out when the page is reopened for the read-back (path call 5): what Continue saved stays listed, no read", async () => {
  const { driver, calls } = fake({ paths: ["/common/7/232", "/common/7/232", "/common/7/232", "/common/7/232", "/login"] });
  const report = await runCaPage("activities", data(acts(2)), driver, fakeUi().ui);
  assert.equal(report.stopped, SIGNED_OUT_SAVED);
  assert.deepEqual(report.filled, ["Team a1", "Team a2"]);
  assert.deepEqual(report.mismatches, []);
  assert.ok(calls.includes("fill:keep:0:2"));
  assert.ok(calls.includes("reopen"));
  assert.ok(!calls.includes("read"));
});

test("the read-back fails after Continue: what was saved stays listed and the report says it was not checked", async () => {
  const { driver } = fake();
  driver.read = async () => {
    throw new Error("The Activities and experiences page did not finish loading. Wait until it shows, then press Fill again.");
  };
  const report = await runCaPage("activities", data(acts(2)), driver, fakeUi().ui);
  assert.deepEqual(report.filled, ["Team a1", "Team a2"]);
  assert.match(report.stopped!, /^Saved by Continue, but not checked: The Activities and experiences page did not finish loading\./);
});

test("the fill was sent but no answer came back: everything it could have written is under unsure, never filled or not added", async () => {
  const { driver } = fake({ existing: ["E1", "E2"] });
  driver.fill = async () => {
    throw new Error("The Common App page stopped responding");
  };
  const report = await runCaPage("activities", data(acts(2)), driver, fakeUi({ pick: () => ["a1", "a2"] }).ui);
  assert.deepEqual(report.filled, []);
  assert.deepEqual(report.notAdded, []);
  assert.deepEqual(report.unsure, ["Team a1 (possibly saved)", "Team a2 (possibly saved)"]);
  assert.match(report.stopped!, /^Stopped: The Common App page stopped responding\. Common App may have saved part of this \("Add another" saves the page\)/);
});

test("the fill was sent but no answer came back in a replace: the old entries may have been overwritten; signed out says so", async () => {
  const { driver } = fake({ existing: ["Old A", "Old B"], paths: ["/common/7/232", "/common/7/232", "/common/7/232", "/login"] });
  driver.fill = async () => {
    throw new Error("The Common App page stopped responding");
  };
  const report = await runCaPage("activities", data(acts(1)), driver, fakeUi({ replace: true }).ui);
  assert.deepEqual(report.unsure, ["Team a1 (possibly saved)", "Old A (possibly overwritten)", "Old B (possibly overwritten)"]);
  assert.equal(report.replaced, null);
  assert.equal(report.stopped, SIGNED_OUT_UNSURE);
  assert.equal(SIGNED_OUT_UNSURE, "Common App signed you out during the fill. Sign in again and look at the page: part of this may have been saved.");
});

test("a fill refused before it was sent (Stop pressed at the last look) is a plain stop, nothing unsure", async () => {
  const { driver } = fake();
  driver.fill = async () => {
    throw new Error(STOPPED);
  };
  const report = await runCaPage("activities", data(acts(2)), driver, fakeUi().ui);
  assert.equal(report.stopped, STOPPED);
  assert.equal(report.unsure, undefined);
});

test("a fill that stopped before Continue and then found the sign-in page: the typed entries are only possibly saved", async () => {
  const { driver } = fake({
    paths: ["/common/7/232", "/common/7/232", "/common/7/232", "/login"],
    fillResult: () => ({ filled: 1, blanks: [], firstSlot: 1, stoppedReason: "Common App's page changed (no Continue button)." }),
  });
  const report = await runCaPage("activities", data(acts(2)), driver, fakeUi().ui);
  assert.equal(report.stopped, SIGNED_OUT_UNSURE);
  assert.deepEqual(report.filled, []);
  assert.deepEqual(report.unsure, ["Team a1 (possibly saved)"]);
  assert.deepEqual(report.notAdded, ["Team a2"]);
});

// ── Item 3: the Replace question counts only what will be written ──

test("Replace question: blocked items are not counted, they are named with their reasons, and the toggle list shows them disabled", async () => {
  const items = [act("a1"), act("a2", { description: "x".repeat(151) }), act("a3")];
  const seen: { incoming?: number; blocked?: string[]; picks?: { id: string; blocked?: string[] }[] } = {};
  const ui: AskUi = {
    async askReplace(_existing, incoming, blocked) {
      seen.incoming = incoming;
      seen.blocked = (blocked ?? []).map((b) => b.label);
      return false;
    },
    async pick(list) {
      seen.picks = list.map((i) => ({ id: i.id, ...(i.blocked ? { blocked: i.blocked } : {}) }));
      return ["a2", "a3"]; // a blocked id is never sent even if the list returned it
    },
  };
  const { driver, calls } = fake({ existing: ["E1"] });
  const report = await runCaPage("activities", data(items), driver, ui);
  assert.equal(seen.incoming, 2);
  assert.deepEqual(seen.blocked, ["Team a2"]);
  assert.deepEqual(seen.picks!.map((p) => p.id), ["a1", "a2", "a3"]);
  assert.ok(seen.picks![1]!.blocked![0]!.startsWith("Description:"));
  assert.ok(calls.includes("fill:keep:1:1"));
  assert.deepEqual(report.filled, ["Team a3"]);
  assert.deepEqual(report.blocked.map((b) => b.label), ["Team a2"]);
  assert.deepEqual(report.notChosen, ["Team a1"]);
});

test("every tracker item blocked: no Replace question at all, nothing is filled", async () => {
  const { driver, calls } = fake({ existing: ["E1"] });
  const { ui, log } = fakeUi({ replace: true });
  const report = await runCaPage("activities", data([act("a1", { hoursPerWeek: 500 })]), driver, ui);
  assert.deepEqual(log, []);
  assert.deepEqual(calls, ["inspect"]);
  assert.equal(report.note, "Nothing was changed on Common App.");
  assert.equal(report.blocked.length, 1);
});

test("question text names how many can be sent when some cannot", () => {
  assert.equal(askReplaceText("activities", 4, 5, 2), "Common App already has 4 activities. Replace all of them with the 5 from your tracker that can be sent?");
  assert.equal(askReplaceText("uc", 1, 3, 1), "UC already has 1 activity or award. Replace it with the 3 from your tracker that can be sent?");
});

test("a keep run names the tracker items that were not chosen; a replace or empty-page run names none", async () => {
  const keep = await runCaPage("activities", data(acts(3)), fake({ existing: ["E1"] }).driver, fakeUi({ pick: () => ["a2"] }).ui);
  assert.deepEqual(keep.notChosen, ["Team a1", "Team a3"]);
  const empty = await runCaPage("activities", data(acts(3)), fake().driver, fakeUi().ui);
  assert.equal(empty.notChosen, undefined);
  const replace = await runCaPage("activities", data(acts(3)), fake({ existing: ["E1"] }).driver, fakeUi({ replace: true }).ui);
  assert.equal(replace.notChosen, undefined);
});

test("a driver error becomes the stopped sentence", async () => {
  const { driver } = fake();
  driver.inspect = async () => {
    throw new Error("The Common App page did not answer");
  };
  const report = await runCaPage("activities", data(acts(1)), driver, fakeUi().ui);
  assert.equal(report.stopped, "Stopped: The Common App page did not answer");
});

test("a rejected question (Stop pressed) ends the run before anything is changed", async () => {
  const { driver, calls } = fake({ existing: ["E1"] });
  const ui: AskUi = {
    async askReplace() {
      throw new Error("Stopped. Nothing was changed on Common App.");
    },
    async pick() {
      return [];
    },
  };
  const report = await runCaPage("activities", data(acts(1)), driver, ui);
  assert.equal(report.stopped, "Stopped. Nothing was changed on Common App.");
  assert.ok(!calls.some((c) => c.startsWith("fill")));
});

test("decide: no existing entries -> keep everything, no question", async () => {
  const { ui, log } = fakeUi();
  const items = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
  assert.deepEqual(await decide([], items, 10, ui), { mode: "keep", pickIds: ["a", "b"] });
  assert.deepEqual(log, []);
});

test("decide: Yes -> replace; No -> toggles capped at the room; full -> no toggles", async () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: `i${i}`, label: `L${i}` }));
  const yes = fakeUi({ replace: true });
  assert.deepEqual(await decide(["x"], items, 10, yes.ui), { mode: "replace" });
  const no = fakeUi({ pick: () => ["i1", "i0", "zzz"] });
  assert.deepEqual(await decide(["x", "y", "z", "w"], items, 10, no.ui), { mode: "keep", pickIds: ["i0", "i1"] });
  assert.deepEqual(no.log, ["askReplace:4:7", "pick:7:6"]);
  const full = fakeUi();
  assert.deepEqual(await decide(Array(10).fill("x"), items, 10, full.ui), { mode: "keep", pickIds: [] });
  assert.deepEqual(full.log, ["askReplace:10:7"]);
});

test("question text: grammar for 1 and many, activities and honors", () => {
  assert.equal(askReplaceText("activities", 4, 7), "Common App already has 4 activities. Replace all of them with the 7 in your tracker?");
  assert.equal(askReplaceText("activities", 1, 7), "Common App already has 1 activity. Replace it with the 7 in your tracker?");
  assert.equal(askReplaceText("honors", 2, 1), "Common App already has 2 honors. Replace all of them with the 1 in your tracker?");
  assert.equal(askReplaceText("honors", 1, 3), "Common App already has 1 honor. Replace it with the 3 in your tracker?");
});

// ── Stop ──

/** A driver/ui pair whose Stop flag is flipped by `at`: during inspect, or when the question is answered. */
function stopAt(at: "inspect" | "answer", existing: string[]) {
  let stop = false;
  const { driver, calls } = fake({ existing });
  const realInspect = driver.inspect;
  driver.inspect = async () => {
    const r = await realInspect();
    if (at === "inspect") stop = true;
    return r;
  };
  const log: string[] = [];
  const ui: AskUi = {
    async askReplace() {
      log.push("askReplace");
      if (at === "answer") stop = true;
      return true;
    },
    async pick() {
      log.push("pick");
      return [];
    },
  };
  return { driver, calls, ui, log, shouldStop: () => stop };
}

test("Stop while the page is being checked: no question is shown and fill is never called", async () => {
  const { driver, calls, ui, log, shouldStop } = stopAt("inspect", ["E1", "E2"]);
  const report = await runCaPage("activities", data(acts(2)), driver, ui, shouldStop);
  assert.equal(report.stopped, STOPPED);
  assert.deepEqual(log, []);
  assert.ok(!calls.some((c) => c.startsWith("fill")));
  assert.equal(report.replaced, null);
});

test("Stop on an empty page before the fill: fill is never called", async () => {
  const { driver, calls, ui, shouldStop } = stopAt("inspect", []);
  const report = await runCaPage("activities", data(acts(2)), driver, ui, shouldStop);
  assert.equal(report.stopped, STOPPED);
  assert.deepEqual(calls, ["inspect"]);
});

test("Stop between the answer and the fill: a Yes does not start the Replace", async () => {
  const { driver, calls, ui, log, shouldStop } = stopAt("answer", ["E1"]);
  const report = await runCaPage("activities", data(acts(2)), driver, ui, shouldStop);
  assert.deepEqual(log, ["askReplace"]);
  assert.equal(report.stopped, STOPPED);
  assert.ok(!calls.some((c) => c.startsWith("fill")));
  assert.equal(report.replaced, null);
});

test("a stopped Replace is worded as partial; a complete one as replaced", async () => {
  const stopped = fake({
    existing: ["A", "B", "C", "D"],
    fillResult: () => ({ filled: 2, blanks: [], firstSlot: 1, stoppedReason: "Stopped." }),
  });
  const r1 = await runCaPage("activities", data(acts(2)), stopped.driver, fakeUi({ replace: true }).ui);
  assert.equal(r1.replaced, "Overwrote 2 of the 4 activities that were already on Common App before stopping: A, B, C, D.");
  assert.equal(r1.stopped, "Stopped.");
});

test("a replace that stopped on a problem in slot 1: nothing counts as filled, but the report still says an old entry was overwritten", async () => {
  const { driver } = fake({
    existing: ["A", "B", "C"],
    fillResult: () => ({ filled: 0, written: 1, blanks: [], firstSlot: 1, stoppedReason: 'Activity 1 "Hours spent per week" is marked not valid on the page.' }),
  });
  const r = await runCaPage("activities", data(acts(2)), driver, fakeUi({ replace: true }).ui);
  assert.deepEqual(r.filled, []);
  assert.deepEqual(r.notAdded, ["Team a1", "Team a2"]);
  assert.equal(r.replaced, "Overwrote 1 of the 3 activities that were already on Common App before stopping: A, B, C.");
});

test("every chosen item blocked: nothing was changed, and the report says so", async () => {
  const { driver, calls } = fake({ existing: ["E1"] });
  const bad = [act("a1", { description: "x".repeat(151) })];
  const report = await runCaPage("activities", data(bad), driver, fakeUi({ replace: true }).ui);
  assert.equal(report.note, "Nothing was changed on Common App.");
  assert.equal(report.blocked.length, 1);
  assert.deepEqual(report.filled, []);
  assert.ok(!calls.some((c) => c.startsWith("fill")));
});
