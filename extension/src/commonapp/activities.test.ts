import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCaPagePlan, readBackMismatches, type CaPagePlan } from "../../../web/lib/activities-fill.ts";
import { newCaActivity, newCaHonor, type CaActivity, type CaHonor } from "../../../web/lib/activities.ts";
import { fillCaPage, inspectCaPage, readCaPage } from "./activities.ts";
import { requestStop, TIMING } from "./dom.ts";
import { fakeActivities, type FakeValue } from "./fake-activities.ts";

Object.assign(TIMING, { stepMs: 2, panelMs: 150, valueMs: 150, pageMs: 150, saveMs: 150 });

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
const plan = (items: CaActivity[]): CaPagePlan => buildCaPagePlan({ version: 2, commonApp: { activities: items, honors: [] }, uc: [] }, "activities");
const honorPlan = (items: CaHonor[]): CaPagePlan => buildCaPagePlan({ version: 2, commonApp: { activities: [], honors: items }, uc: [] }, "honors");

/** Answers an older entry left in a slot. */
const OLD = (k: number): Record<string, FakeValue> => ({
  "Activity or experience type": "Art",
  "Describe this activity": `Old description ${k}`,
  "Organization or group": `Old club ${k}`,
  "specific position or leadership role": "No",
  "When did you participate?": ["9th grade"],
  "Time of year": "All year",
  "Hours spent per week": "2",
  "Weeks spent per year": "10",
  "participating in this activity in college": "No",
});
const count = (log: string[], entry: string) => log.filter((l) => l === entry).length;

test("replace: 2 items over 3 entries -> slots 1-2 rewritten, slot 3 removed through the confirm, Continue pressed once", async () => {
  const fake = fakeActivities({ count: 3, slots: { 1: OLD(1), 2: OLD(2), 3: OLD(3) } });
  const p = plan([act("a"), act("b", { type: "Athletics (JV or varsity)", sport: "Soccer", leadership: true, position: "Captain" })]);
  const result = await fillCaPage(fake.doc, p, "replace", 3);
  assert.equal(result.stoppedReason, undefined);
  assert.equal(result.filled, 2);
  const shown = readCaPage(fake.doc, "activities");
  assert.equal(shown.length, 2);
  assert.deepEqual(readBackMismatches(p, shown), []);
  assert.equal(shown[1]!["Sport/team"], "Soccer");
  assert.deepEqual(fake.log.filter((l) => /^(remove|confirm)/.test(l)), ["remove:3", "confirm:remove"]);
  assert.equal(count(fake.log, "continue"), 1);
  assert.equal(fake.count(), 2);
});

test("keep: 1 entry + 2 picks -> slots 2-3 added and filled, slot 1 untouched", async () => {
  const fake = fakeActivities({ count: 1, slots: { 1: OLD(1) } });
  const before = readCaPage(fake.doc, "activities")[0];
  const p = plan([act("a"), act("b")]);
  const result = await fillCaPage(fake.doc, p, "keep", 1);
  assert.equal(result.stoppedReason, undefined);
  assert.equal(result.filled, 2);
  const shown = readCaPage(fake.doc, "activities");
  assert.equal(shown.length, 3);
  assert.deepEqual(shown[0], before);
  assert.deepEqual(readBackMismatches(p, shown.slice(1)), []);
  assert.deepEqual(fake.log.filter((l) => l.startsWith("set:1:") || l.startsWith("clear:1:")), []);
  assert.deepEqual(fake.log.filter((l) => l.startsWith("add:")), ["add:2", "add:3"]);
  assert.ok(!fake.log.some((l) => l.startsWith("remove")));
  assert.equal(count(fake.log, "continue"), 1);
});

test("a re-added slot holding stale answers ends with exactly the plan's answers", async () => {
  // Slot 2 was removed earlier: hidden, but it still holds an athletics entry with a role, an after-graduation date and an organization.
  const stale = { ...OLD(2), "Activity or experience type": "Athletics (other)", "Sport/team": "Golf", "specific position or leadership role": "Yes", "What was your role?": "Captain",
    "When did you participate?": ["12th grade", "After graduating high school"], "Start date": "June 2020", "still participating": "Yes" };
  const fake = fakeActivities({ count: 1, slots: { 1: OLD(1), 2: stale } });
  const p = plan([act("a", { organization: "" })]);
  const result = await fillCaPage(fake.doc, p, "keep", 1);
  assert.equal(result.stoppedReason, undefined);
  const shown = readCaPage(fake.doc, "activities");
  assert.deepEqual(readBackMismatches(p, shown.slice(1)), []);
  assert.equal(fake.raw(2)["Organization or group"], "");
  assert.deepEqual(fake.raw(2)["When did you participate?"], ["10th grade", "11th grade"]);
  assert.equal(shown[1]!["Sport/team"], "");
  assert.equal(shown[1]!["What was your role?"], "");
  assert.equal(shown[1]!["Start date"], "");
  assert.equal(count(fake.log, "continue"), 1);
});

test("a written answer the page marks ng-invalid stops before Continue and names the slot and question", async () => {
  const fake = fakeActivities({ count: 2, slots: { 1: OLD(1), 2: OLD(2) } });
  const p = plan([act("a")]);
  p.slots[0]!.answers.find((a) => a.question === "Hours spent per week")!.value = "200";
  const result = await fillCaPage(fake.doc, p, "keep", 2);
  assert.match(result.stoppedReason ?? "", /Activity 3 "Hours spent per week"/);
  assert.match(result.stoppedReason ?? "", /Continue was not pressed/);
  assert.equal(count(fake.log, "continue"), 0);
});

test("a blank required answer is cleared and does not hold back Continue (it is listed by the plan)", async () => {
  const fake = fakeActivities({ count: 1, slots: { 1: OLD(1) } });
  const p = plan([act("a", { description: "" })]);
  assert.equal(p.blanks.length, 1);
  const result = await fillCaPage(fake.doc, p, "replace", 1);
  assert.equal(result.stoppedReason, undefined);
  assert.equal(fake.raw(1)["Describe this activity"], "");
  assert.equal(count(fake.log, "continue"), 1);
});

test("the gate is answered Yes on an empty page; the sport list picks Soccer by its exact option", async () => {
  const fake = fakeActivities({ count: 0 });
  const p = plan([act("a", { type: "Athletics (JV or varsity)", sport: "Soccer" })]);
  const result = await fillCaPage(fake.doc, p, "replace", 0);
  assert.equal(result.stoppedReason, undefined);
  assert.ok(fake.log.includes("gate:Yes"));
  assert.ok(fake.log.includes("set:1:Sport/team=Soccer"));
  assert.ok(!fake.log.some((l) => l.startsWith("filter:")));
  assert.match((result.notes ?? []).join(" "), /Would you like to report any activities\?/);
});

test("a long list that shows only part of itself: the filler types to filter, then clicks Soccer (never Enter)", async () => {
  const fake = fakeActivities({ count: 1, rendered: 10 });
  const p = plan([act("a", { type: "Athletics (JV or varsity)", sport: "Soccer" })]);
  const result = await fillCaPage(fake.doc, p, "replace", 0);
  assert.equal(result.stoppedReason, undefined);
  assert.ok(fake.log.includes("filter:1:Sport/team=Soccer"));
  assert.equal(readCaPage(fake.doc, "activities")[0]!["Sport/team"], "Soccer");
});

test("an option the list does not have is reported and Continue is not pressed", async () => {
  const fake = fakeActivities({ count: 1 });
  const p = plan([act("a", { type: "Athletics (JV or varsity)", sport: "Soccer" })]);
  p.slots[0]!.answers.find((a) => a.question === "Sport/team")!.value = "Quidditch";
  const result = await fillCaPage(fake.doc, p, "replace", 0);
  assert.match(result.stoppedReason ?? "", /Activity 1 "Sport\/team": "Quidditch" is not in Common App's list/);
  assert.equal(count(fake.log, "continue"), 0);
});

test("after-graduation dates are typed as Month YYYY", async () => {
  const fake = fakeActivities({ count: 1 });
  const p = plan([act("a", { grades: ["12", "PG"], afterStart: "2025-09", stillParticipating: false, afterEnd: "2026-06" })]);
  const result = await fillCaPage(fake.doc, p, "replace", 0);
  assert.equal(result.stoppedReason, undefined);
  assert.ok(fake.log.includes("set:1:Start date=September 2025"));
  assert.equal(fake.raw(1)["Start date"], "September 2025");
  assert.equal(fake.raw(1)["End date"], "June 2026");
  assert.equal(fake.raw(1)["still participating"], "No");
  assert.deepEqual(readBackMismatches(p, readCaPage(fake.doc, "activities")), []);
});

test("Stop mid-fill ends the run without pressing Continue", async () => {
  const fake = fakeActivities({ count: 1 });
  let first = true;
  fake.doc.addEventListener("input", () => {
    if (first) requestStop();
    first = false;
  });
  const result = await fillCaPage(fake.doc, plan([act("a"), act("b")]), "replace", 0);
  assert.match(result.stoppedReason ?? "", /^Stopped\. Continue was not pressed/);
  assert.equal(count(fake.log, "continue"), 0);
});

test("keep never fills past the page limit: 9 entries + 3 picks -> only the 10th slot, the rest named in a note", async () => {
  const slots = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, OLD(i + 1)]));
  const fake = fakeActivities({ count: 9, slots });
  const result = await fillCaPage(fake.doc, plan([act("a"), act("b"), act("c")]), "keep", 9);
  assert.equal(result.stoppedReason, undefined);
  assert.equal(result.filled, 1);
  assert.equal(fake.count(), 10);
  assert.equal(fake.raw(10)["Organization or group"], "Team a");
  assert.match((result.notes ?? []).join(" "), /Team b, Team c/);
});

test("honors: gate Yes, title and both checkbox lists, Continue on the Honors page", async () => {
  const fake = fakeActivities({ page: "honors", count: 0 });
  const p = honorPlan([{ ...newCaHonor(), id: "h", title: "National Merit Semifinalist", grades: ["11", "12"], levels: ["national"] }]);
  const result = await fillCaPage(fake.doc, p, "replace", 0);
  assert.equal(result.stoppedReason, undefined);
  assert.ok(fake.log.includes("gate:Yes"));
  assert.deepEqual(readBackMismatches(p, readCaPage(fake.doc, "honors")), []);
  assert.deepEqual(fake.raw(1), { title: "National Merit Semifinalist", "Grade level": ["11", "12"], "Level(s) of recognition": ["National"] });
  assert.equal(count(fake.log, "continue"), 1);
});

test("not on the page: nothing is touched", async () => {
  const fake = fakeActivities({ count: 1 });
  (globalThis as { location?: unknown }).location = { pathname: "/common/7/250" };
  const result = await fillCaPage(fake.doc, plan([act("a")]), "replace", 0);
  assert.match(result.stoppedReason ?? "", /^Not on the Activities and experiences page/);
  assert.deepEqual(fake.log, []);
});

test("inspectCaPage names each shown slot with an answer (organization, else the description start); hidden slots do not count", () => {
  const fake = fakeActivities({ count: 3, slots: { 1: OLD(1), 2: { ...OLD(2), "Organization or group": "", "Describe this activity": "Tutored younger students in algebra every week after school" }, 4: OLD(4) } });
  assert.deepEqual(inspectCaPage(fake.doc, "activities"), { existing: ["Old club 1", "Tutored younger students in algebra…"] });
});

test("readCaPage reports hidden questions as empty, even when they hold an old answer", () => {
  const fake = fakeActivities({ count: 1, slots: { 1: { ...OLD(1), "Sport/team": "Golf", "What was your role?": "Captain" } } });
  const [row] = readCaPage(fake.doc, "activities");
  assert.equal(row!["Sport/team"], "");
  assert.equal(row!["What was your role?"], "");
  assert.equal(row!["Organization or group"], "Old club 1");
  assert.deepEqual(row!["When did you participate?"], ["9th grade"]);
  assert.equal(row!["Time of year"], "All year");
  assert.deepEqual(readCaPage(fakeActivities({ gate: "no" }).doc, "activities"), []);
});
