import assert from "node:assert/strict";
import { test } from "node:test";
import { newUcEntry, ucTextLength, type UcEntry } from "../../../web/lib/activities.ts";
import { buildUcFormPlans, type UcFormPlan } from "../../../web/lib/uc-activities-fill.ts";
import { clickUcAdd, deleteUcEntry, fillUcForm, readUcList, UC_ACT_DOM, UC_ACT_TIMING, ucActivitiesPage } from "./activities.ts";
import { fakeUcForm, fakeUcList, type FakeUcItem } from "./fake-activities.ts";

Object.assign(UC_ACT_TIMING, { stepMs: 2, popupMs: 60 });
// The fake DOM has no layout: shown = no ancestor with display:none.
UC_ACT_DOM.visible = (el) => {
  for (let e: Element | null = el; e; e = e.parentElement) if ((e as HTMLElement).style?.display === "none" || (e as HTMLElement).hidden) return false;
  return !!el;
};

const TEST_CLUB: FakeUcItem = {
  activityId: "13836651",
  cat: "ExtraCurr",
  label: "Extracurricular activity",
  name: "Test Club (filler research)",
  shown: {
    "Name of the activity": ["Test Club (filler research)"],
    "What you did": ["Line one", "Line two"],
    "When you did it": ["10th grade", "11th grade"],
    "Time you spent": ["5.5 hours per week", "30.0 weeks per year"],
  },
};
const OTHER: FakeUcItem = { activityId: "13836652", cat: "Volunteer", label: "Volunteer / Community service", name: "Food Bank", shown: { "Name of the organization": ["Food Bank"] } };

const club = (over: Partial<UcEntry> = {}): UcEntry => ({
  ...newUcEntry("extracurricular"),
  id: "x1",
  name: "Robotics Club",
  description: "Built and drove a competition robot.",
  grades: ["10", "11"],
  hoursPerWeek: 5.5,
  weeksPerYear: 30,
  ...over,
});
const work = (over: Partial<UcEntry> = {}): UcEntry => ({
  ...newUcEntry("work"),
  id: "w1",
  name: "Corner Cafe",
  jobTitle: "Barista",
  extra: "A small neighbourhood cafe.",
  description: "Made drinks and ran the till.",
  grades: ["11", "PG"],
  afterYears: 1,
  afterMonths: 6,
  workHours: { "11": { schoolYear: null, summer: 20 }, PG: { schoolYear: 8, summer: null } },
  stillWorking: false,
  start: "2025-06",
  end: "2026-08",
  ...over,
});
const award = (over: Partial<UcEntry> = {}): UcEntry => ({
  ...newUcEntry("award"),
  id: "a1",
  name: "State Science Fair Gold",
  extra: "Top 3 of the state finalists.",
  description: "Presented a water-quality project.",
  grades: ["11"],
  awardLevels: ["state", "national"],
  awardType: "academic",
  ...over,
});
const planOf = (e: UcEntry): UcFormPlan => {
  const r = buildUcFormPlans([e]);
  assert.deepEqual(r.blocked, []);
  return r.forms[0]!;
};
const setField = (p: UcFormPlan, id: string, value: string): UcFormPlan => ({ ...p, fields: p.fields.map((f) => (f.id === id ? { ...f, value } : f)) });
const count = (log: string[], entry: string) => log.filter((l) => l === entry).length;

// ── List page ──

test("readUcList: id, category, index, name and the read-only section of every item", () => {
  const fake = fakeUcList([TEST_CLUB, OTHER]);
  assert.equal(ucActivitiesPage(fake.doc), "list");
  assert.deepEqual(readUcList(fake.doc), [
    { activityId: "13836651", category: "ExtraCurr", index: 1, name: "Test Club (filler research)", shown: TEST_CLUB.shown },
    { activityId: "13836652", category: "Volunteer", index: 2, name: "Food Bank", shown: OTHER.shown },
  ]);
  assert.deepEqual(readUcList(fakeUcList([]).doc), []);
});

test("deleteUcEntry presses that item's Delete, then Yes: never No, never another item, never no_activities", async () => {
  const fake = fakeUcList([TEST_CLUB, OTHER]);
  await deleteUcEntry(fake.doc, "13836652");
  assert.deepEqual(fake.log, ["delete:13836652", "yes:13836652"]);
  assert.deepEqual(fake.items(), ["13836651"]);
});

test("deleteUcEntry: an unknown id (or part of one) presses nothing", async () => {
  const fake = fakeUcList([TEST_CLUB]);
  await assert.rejects(deleteUcEntry(fake.doc, "1383"), /no activity 1383/);
  await assert.rejects(deleteUcEntry(fake.doc, "999"), /no activity 999/);
  assert.deepEqual(fake.log, []);
  assert.deepEqual(fake.items(), ["13836651"]);
});

test("deleteUcEntry: when UC shows no confirm popup, Yes is not pressed", async () => {
  const fake = fakeUcList([TEST_CLUB]);
  fake.doc.getElementById("mdl")!.querySelector("p")!.textContent = "Something else";
  await assert.rejects(deleteUcEntry(fake.doc, "13836651"), /did not ask to confirm/);
  assert.deepEqual(fake.log, ["delete:13836651"]);
  assert.deepEqual(fake.items(), ["13836651"]);
});

test("clickUcAdd presses only #add_activity", () => {
  const fake = fakeUcList([TEST_CLUB]);
  clickUcAdd(fake.doc);
  assert.deepEqual(fake.log, ["click:add_activity"]);
});

// ── Add form ──

test("fillUcForm (extracurricular): category and its change come first, every box lands, #save is pressed once", () => {
  const fake = fakeUcForm();
  assert.equal(ucActivitiesPage(fake.doc), "form");
  const p = planOf(club());
  assert.deepEqual(fillUcForm(fake.doc, p), { ok: true });
  assert.equal(fake.log[0], "category:ExtraCurr");
  assert.equal(count(fake.log, "save"), 1);
  assert.equal(fake.log.at(-1), "save");
  assert.ok(fake.log.indexOf("type:extraCurName") > 0);
  assert.deepEqual(fake.saved(), {
    activityType: "ExtraCurr",
    extraCurName: "Robotics Club",
    extraCurrDescription: "Built and drove a competition robot.",
    isExtraCurr10th: true,
    isExtraCurr11th: true,
    extraCurrHoursPerWeek: "5.5",
    extraCurrWeeksPerYear: "30",
  });
  assert.equal(fake.saved()!.extraCurName, "Robotics Club");
  assert.equal(fake.saved()!.extraCurrHoursPerWeek, "5.5");
});

test("fillUcForm: the grade is ticked before the after-12th selects (they appear only then)", () => {
  const fake = fakeUcForm();
  const p = planOf(club({ grades: ["10", "PG"], afterYears: 2, afterMonths: 3 }));
  assert.deepEqual(fillUcForm(fake.doc, p), { ok: true });
  const at = (e: string) => fake.log.indexOf(e);
  assert.ok(at("check:isExtraCurrAfter12th") > 0 && at("check:isExtraCurrAfter12th") < at("select:extraCurrYearsAfter12=2"));
  assert.ok(at("select:extraCurrYearsAfter12=2") > 0 && at("select:extraCurrMonthsAfter12=3") > 0);
  assert.equal(fake.saved()!.extraCurrYearsAfter12, "2");
  assert.equal(fake.saved()!.extraCurrMonthsAfter12, "3");
});

test("fillUcForm: a plan that sets a select before its grade is refused (the box is not shown yet), nothing saved", () => {
  const fake = fakeUcForm();
  const p = planOf(club({ grades: ["10", "PG"], afterYears: 2, afterMonths: 3 }));
  const wrong: UcFormPlan = { ...p, fields: [p.fields[0]!, ...p.fields.filter((f) => f.id.endsWith("After12")), ...p.fields.slice(1).filter((f) => !f.id.endsWith("After12"))] };
  const r = fillUcForm(fake.doc, wrong);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /not showing/);
  assert.equal(count(fake.log, "save"), 0);
});

test("fillUcForm (work): grade ticks, then school/summer boxes, then hours, then the radio, then the dates", () => {
  const fake = fakeUcForm();
  const p = planOf(work());
  assert.deepEqual(fillUcForm(fake.doc, p), { ok: true });
  const at = (e: string) => fake.log.indexOf(e);
  assert.ok(at("check:isWorkExp11th") < at("check:isWorkExpSummer11th"));
  assert.ok(at("check:isWorkExpSummer11th") < at("type:workExp11thSummerHoursPerWeek"));
  assert.ok(at("check:isWorkExpAfter12th") < at("check:isWorkExpSchoolAfter12th"));
  assert.ok(at("radio:isWorkExpCurrWorking=N") < at("select:workExpEndMonth=08"));
  assert.equal(count(fake.log, "save"), 1);
  const s = fake.saved()!;
  assert.equal(s.workExp11thSummerHoursPerWeek, "20");
  assert.equal(s.workExpAfter12thSchoolHoursPerWeek, "8");
  assert.equal(s.isWorkExpCurrWorking, "N");
  assert.equal(s.workExpEndYear, "2026");
  assert.equal(s.workExpStartMonth, "06");
});

test("fillUcForm (award): level checks and the academic radio", () => {
  const fake = fakeUcForm();
  assert.deepEqual(fillUcForm(fake.doc, planOf(award())), { ok: true });
  const s = fake.saved()!;
  assert.equal(s.isAwardLevelState, true);
  assert.equal(s.isAwardLevelNational, true);
  assert.equal(s.isAwardLevelCity, undefined);
  assert.equal(s.awardType, "A");
  assert.equal(s.awardRequirements, "Top 3 of the state finalists.");
});

test("fillUcForm: text UC would cut (350 counted, a line break counts 2) is refused before anything is typed; #save is not pressed", () => {
  const fake = fakeUcForm();
  const text = `${"a".repeat(349)}\n${"b"}`; // 351 characters, counted 352
  assert.equal(ucTextLength(text), 352);
  const r = fillUcForm(fake.doc, setField(planOf(club()), "extraCurrDescription", text));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /would cut/);
  assert.match((r as { error: string }).error, /350/);
  assert.equal(count(fake.log, "save"), 0);
  assert.equal(fake.log.filter((l) => l.startsWith("type:")).length, 0);
  assert.equal(fake.saved(), null);
});

test("fillUcForm: exactly 350 counted characters passes", () => {
  const fake = fakeUcForm();
  const text = `${"a".repeat(174)}\n${"b".repeat(174)}`; // 349 characters + 1 break, counted 350
  assert.equal(ucTextLength(text), 350);
  assert.deepEqual(fillUcForm(fake.doc, setField(planOf(club()), "extraCurrDescription", text)), { ok: true });
  assert.equal(fake.saved()!.extraCurrDescription, text);
});

test("fillUcForm: a page that keeps less than was typed (cut on keyup) is caught on read-back; #save is not pressed", () => {
  const fake = fakeUcForm({ cutAll: 10 });
  const r = fillUcForm(fake.doc, planOf(club()));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /UC changed the .* text/);
  assert.equal(count(fake.log, "save"), 0);
});

test("fillUcForm: a text box longer than its maxlength is refused", () => {
  const fake = fakeUcForm();
  const r = fillUcForm(fake.doc, setField(planOf(club()), "extraCurName", "n".repeat(61)));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /UC allows 60/);
  assert.equal(count(fake.log, "save"), 0);
});

test("fillUcForm: UC's own hours error comes back as the answer (one press of #save), nothing saved", () => {
  const fake = fakeUcForm();
  const r = fillUcForm(fake.doc, setField(planOf(club()), "extraCurrHoursPerWeek", "200"));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /between 1 and 168/);
  assert.match((r as { error: string }).error, /There are some errors below/);
  assert.equal(count(fake.log, "save"), 1);
  assert.equal(fake.saved(), null);
});

test("fillUcForm: a box UC does not show is refused, not saved", () => {
  const fake = fakeUcForm({ hide: ["extraCurrWeeksPerYear"] });
  const r = fillUcForm(fake.doc, planOf(club()));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /not showing/);
  assert.equal(count(fake.log, "save"), 0);
});

test("fillUcForm: not on the add page, or a plan without its category first, presses nothing", () => {
  const list = fakeUcList([TEST_CLUB]);
  const r1 = fillUcForm(list.doc, planOf(club()));
  assert.equal(r1.ok, false);
  assert.match((r1 as { error: string }).error, /Open UC's add-activity page/);
  assert.deepEqual(list.log, []);

  const fake = fakeUcForm();
  const p = planOf(club());
  const r2 = fillUcForm(fake.doc, { ...p, fields: p.fields.slice(1) });
  assert.equal(r2.ok, false);
  assert.match((r2 as { error: string }).error, /does not start with its category/);
  assert.deepEqual(fake.log, []);
});
