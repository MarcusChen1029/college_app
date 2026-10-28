import assert from "node:assert/strict";
import { test } from "node:test";
import { html } from "./commonapp/test-dom.ts";
import { caPageForPath } from "./commonapp/pages.ts";
import type { ActivitiesReport } from "./activities-flow.ts";

// ui.ts builds nodes with the global `document`: give it a parsed one before the first call.
(globalThis as { document?: Document }).document = html("<div id=root></div>");
const { createAskUi, reportNodes, reportStatus } = await import("./activities-panel.ts");

const doc = () => (globalThis as unknown as { document: Document }).document;
const items = ["A", "B", "C", "D"].map((l) => ({ id: l.toLowerCase(), label: l }));
const boxes = (root: Element) => [...root.querySelectorAll("input")] as HTMLInputElement[];
const tick = (box: HTMLInputElement, on: boolean) => {
  box.checked = on;
  box.dispatchEvent(new (doc().defaultView as unknown as { Event: typeof Event }).Event("change"));
};

test("the Replace question names what will be removed; the buttons answer it", async () => {
  const prompt = doc().createElement("div");
  const { ui } = createAskUi(prompt, "activities");
  const asked = ui.askReplace(["Old A", "Old B"], 5);
  assert.match(prompt.textContent!, /Common App already has 2 activities\. Replace all of them with the 5 in your tracker\?/);
  assert.match(prompt.textContent!, /Old A/);
  assert.match(prompt.textContent!, /Old B/);
  const [no] = [...prompt.querySelectorAll("button")] as HTMLButtonElement[];
  no!.click();
  assert.equal(await asked, false);
  assert.equal(prompt.children.length, 0);
});

test("the toggle list stops at the room: the remaining toggles are disabled once it is full, and free up again", async () => {
  const prompt = doc().createElement("div");
  const { ui } = createAskUi(prompt, "activities");
  const picked = ui.pick(items, 2);
  assert.match(prompt.textContent!, /Room left on the page: 2 of 2/);
  const [a, b, c, d] = boxes(prompt) as [HTMLInputElement, HTMLInputElement, HTMLInputElement, HTMLInputElement];
  tick(a, true);
  tick(c, true);
  assert.match(prompt.textContent!, /Room left on the page: 0 of 2/);
  assert.equal(b.disabled, true);
  assert.equal(d.disabled, true);
  assert.equal(a.disabled, false);
  tick(a, false);
  assert.equal(b.disabled, false);
  tick(a, true);
  const add = [...prompt.querySelectorAll("button")].find((x) => /Add the chosen/.test(x.textContent!)) as HTMLButtonElement;
  assert.equal(add.disabled, false);
  add.click();
  assert.deepEqual(await picked, ["a", "c"]);
});

test("Stop rejects a pending question and clears it", async () => {
  const prompt = doc().createElement("div");
  const { ui, cancel } = createAskUi(prompt, "honors");
  const asked = ui.askReplace(["X"], 1);
  assert.match(prompt.textContent!, /Common App already has 1 honor\. Replace it with the 1 in your tracker\?/);
  cancel(new Error("Stopped. Nothing was changed on Common App."));
  await assert.rejects(asked, /Nothing was changed/);
  assert.equal(prompt.children.length, 0);
});

const report = (over: Partial<ActivitiesReport> = {}): ActivitiesReport => ({
  filled: [], replaced: null, blocked: [], blanks: [], notAdded: [], mismatches: [], stopped: null, notes: [], note: null, ...over,
});

test("report: filled, replaced, blocked, blanks, not added and mismatches are all shown", () => {
  const r = report({
    filled: ["Robotics", "Chess"],
    replaced: "Replaced the 1 activity that was already on Common App: Old.",
    blocked: [{ label: "Band", reasons: ["Description: too long"] }],
    blanks: [{ label: "Chess", reasons: ["Hours spent per week: needs an answer"] }],
    notAdded: ["Band"],
    mismatches: ['Activity 2: Hours spent per week shows "" (sent "10")'],
  });
  const holder = doc().createElement("div");
  for (const n of reportNodes("activities", r)) if (n) holder.append(n);
  const text = holder.textContent!;
  for (const part of ["Filled 2 activities: Robotics, Chess", "Replaced the 1 activity that was already", "Band", "Description: too long", "needs an answer", "Not added: Band.", 'Activity 2: Hours spent per week shows ""'])
    assert.ok(text.includes(part), part);
  assert.equal(reportStatus("activities", r).warn, true);
  assert.deepEqual(reportStatus("activities", report({ filled: ["A"] })), { text: "Done: 1 activity filled and checked.", warn: false });
  assert.deepEqual(reportStatus("honors", report({ note: "This page is full (5 of 5). Nothing can be added." })), { text: "This page is full (5 of 5). Nothing can be added.", warn: false });
  assert.deepEqual(reportStatus("honors", report({ stopped: "x" })), { text: "Stopped", warn: true });
});

test("caPageForPath knows the two pages and nothing else", () => {
  assert.equal(caPageForPath("/common/7/232"), "activities");
  assert.equal(caPageForPath("/common/4/25/"), "honors");
  assert.equal(caPageForPath("/common/13/55"), null);
  assert.equal(caPageForPath(""), null);
});

test("Stop pressed before any question: a question asked later is refused at once", async () => {
  const prompt = doc().createElement("div");
  const { ui, cancel } = createAskUi(prompt, "activities");
  cancel(new Error("Stopped. Nothing was changed on Common App."));
  await assert.rejects(ui.askReplace(["X"], 2), /Nothing was changed/);
  await assert.rejects(ui.pick(items, 2), /Nothing was changed/);
  assert.equal(prompt.children.length, 0);
});

test("report: a run where every item was blocked headlines the note, not Done", () => {
  const r = report({ note: "Nothing was changed on Common App.", blocked: [{ label: "Band", reasons: ["Description: too long"] }] });
  assert.deepEqual(reportStatus("activities", r), { text: "Nothing was changed on Common App.", warn: false });
});

test("UC: the same question, toggle list and report, worded for UC", async () => {
  const prompt = doc().createElement("div");
  const { ui } = createAskUi(prompt, "uc");
  const asked = ui.askReplace(["Extracurricular activity: Old"], 3);
  assert.match(prompt.textContent!, /UC already has 1 activity or award\. Replace it with the 3 in your tracker\?/);
  assert.match(prompt.textContent!, /would be removed from UC/);
  ([...prompt.querySelectorAll("button")] as HTMLButtonElement[])[0]!.click();
  assert.equal(await asked, false);
  const picked = ui.pick(items, 2);
  assert.match(prompt.textContent!, /already on UC/);
  ([...prompt.querySelectorAll("button")] as HTMLButtonElement[]).find((b) => /Add none/.test(b.textContent!))!.click();
  assert.deepEqual(await picked, []);
  const r: ActivitiesReport = { filled: ["A"], replaced: null, blocked: [{ label: "B", reasons: ["x"] }], blanks: [], notAdded: [], mismatches: ["m"], stopped: null, notes: [], note: null };
  assert.equal(reportStatus("uc", r).text, "Done: 1 activity or award filled, but some things need a look (below).");
  const text = reportNodes("uc", r).map((n) => (typeof n === "object" && n ? (n as Node).textContent : "")).join("|");
  assert.match(text, /UC would not accept these/);
  assert.match(text, /UC shows something different/);
});
