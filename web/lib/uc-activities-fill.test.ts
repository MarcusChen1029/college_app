import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUcFormPlans, ucItemLabel, ucReadBackMismatches, type UcFieldSet, type UcFormPlan } from "./uc-activities-fill.ts";
import { newUcEntry, type UcEntry } from "./activities.ts";

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

const work = (over: Partial<UcEntry> = {}): UcEntry => ({
  ...newUcEntry("work"),
  id: "w1",
  name: "Corner Cafe",
  jobTitle: "Barista",
  extra: "A small neighbourhood cafe.",
  description: "Made drinks and ran the till.",
  grades: ["11", "12"],
  workHours: { "11": { schoolYear: null, summer: 20 }, "12": { schoolYear: 8, summer: null } },
  stillWorking: false,
  start: "2025-06",
  end: "2026-08",
  ...over,
});

const plan = (e: UcEntry): UcFormPlan => {
  const r = buildUcFormPlans([e]);
  assert.deepEqual(r.blocked, []);
  return r.forms[0]!;
};
const ids = (p: UcFormPlan) => p.fields.map((f) => f.id);
const get = (p: UcFormPlan, id: string): UcFieldSet => p.fields.find((f) => f.id === id)!;

test("extracurricular, grades 10/11, 5.5 h, 30 wk: ids in reveal order and the list-page read-back", () => {
  const p = plan(club());
  assert.equal(p.category, "ExtraCurr");
  assert.equal(p.sourceId, "x1");
  assert.deepEqual(p.fields, [
    { id: "typeofactivity", kind: "select", value: "ExtraCurr" },
    { id: "extraCurName", kind: "text", value: "Robotics Club" },
    { id: "extraCurrDescription", kind: "text", value: "Built and drove a competition robot." },
    { id: "isExtraCurr10th", kind: "check", value: true },
    { id: "isExtraCurr11th", kind: "check", value: true },
    { id: "extraCurrHoursPerWeek", kind: "text", value: "5.5" },
    { id: "extraCurrWeeksPerYear", kind: "text", value: "30" },
  ]);
  assert.deepEqual(p.expect["Time you spent"], ["5.5 hours per week", "30.0 weeks per year"]);
  assert.deepEqual(p.expect["Name of the activity"], ["Robotics Club"]);
  assert.deepEqual(p.expect["What you did"], ["Built and drove a competition robot."]);
  assert.deepEqual(p.expect["When you did it"], ["10th grade", "11th grade"]);
});

test("award: both ticked levels, academic type, no hours and no after-12th selects", () => {
  const p = plan(award({ grades: ["11", "PG"], afterYears: 2, afterMonths: 3 }));
  assert.equal(p.category, "Award");
  assert.deepEqual(ids(p), [
    "typeofactivity", "awardName", "isAwardLevelState", "isAwardLevelNational", "awardType", "isAward11th", "isAwardAfter12th", "awardRequirements", "awardAchievement",
  ]);
  assert.equal(get(p, "isAwardLevelState").value, true);
  assert.equal(get(p, "isAwardLevelNational").value, true);
  assert.equal(get(p, "isAwardLevelSchool"), undefined);
  assert.deepEqual(get(p, "awardType"), { id: "awardType", kind: "radio", value: "A" });
  assert.equal(get(p, "awardRequirements").value, "Top 3 of the state finalists.");
  assert.equal(get(p, "awardAchievement").value, "Presented a water-quality project.");
});

test("award: non-academic is O and every level has its own id", () => {
  const p = plan(award({ awardType: "non_academic", awardLevels: ["school", "city", "state", "regional", "national", "international"] }));
  assert.equal(get(p, "awardType").value, "O");
  for (const id of ["isAwardLevelSchool", "isAwardLevelCity", "isAwardLevelState", "isAwardLevelRegion", "isAwardLevelNational", "isAwardLevelIntl"]) assert.equal(get(p, id).value, true, id);
});

test("work: grid only for ticked grades, school/summer boxes only where an answer exists, dates split", () => {
  const e = work({ workHours: { "9": { schoolYear: 4, summer: 4 }, "11": { schoolYear: null, summer: 20 }, "12": { schoolYear: 8, summer: null } } });
  const p = plan(e);
  assert.equal(p.category, "WorkExp");
  assert.deepEqual(ids(p), [
    "typeofactivity", "workExpName", "workExpDesc", "workExpPosTitle", "workExpPosDesc",
    "isWorkExp11th", "isWorkExp12th",
    "isWorkExpSummer11th", "workExp11thSummerHoursPerWeek",
    "isWorkExpSchool12th", "workExp12thSchoolHoursPerWeek",
    "isWorkExpCurrWorking", "workExpStartMonth", "workExpStartYear", "workExpEndMonth", "workExpEndYear",
  ]);
  assert.equal(get(p, "workExp11thSummerHoursPerWeek").value, "20");
  assert.equal(get(p, "workExp12thSchoolHoursPerWeek").value, "8");
  assert.equal(get(p, "isWorkExp9th"), undefined, "an unticked grade's stored hours are never sent");
  assert.equal(get(p, "workExp9thSchoolHoursPerWeek"), undefined);
  assert.deepEqual(get(p, "isWorkExpCurrWorking"), { id: "isWorkExpCurrWorking", kind: "radio", value: "N" });
  assert.deepEqual([get(p, "workExpStartMonth"), get(p, "workExpStartYear")].map((f) => [f.kind, f.value]), [["select", "06"], ["select", "2025"]]);
  assert.deepEqual([get(p, "workExpEndMonth"), get(p, "workExpEndYear")].map((f) => [f.kind, f.value]), [["select", "08"], ["select", "2026"]]);
  assert.ok(!ids(p).includes("workExpHoursPerWeek") && !ids(p).some((i) => /WeeksPerYear/.test(i)), "work has no weeks per year");
});

test("work: still working sends Y and the start date only", () => {
  const p = plan(work({ stillWorking: true, end: "2026-08" }));
  assert.equal(get(p, "isWorkExpCurrWorking").value, "Y");
  assert.ok(get(p, "workExpStartMonth"));
  assert.equal(get(p, "workExpEndMonth"), undefined);
  assert.equal(get(p, "workExpEndYear"), undefined);
});

test("work with PG: the after-12th box, then its own selects, before the hours grid", () => {
  const p = plan(work({ grades: ["12", "PG"], afterYears: 1, afterMonths: 6, workHours: { "12": { schoolYear: 8, summer: null }, PG: { schoolYear: 10, summer: 30 } } }));
  assert.deepEqual(ids(p).slice(5, 16), [
    "isWorkExp12th", "isWorkExpAfter12th", "workExpAfter12thYears", "workExpAfter12thMonths",
    "isWorkExpSchool12th", "workExp12thSchoolHoursPerWeek",
    "isWorkExpSchoolAfter12th", "workExpAfter12thSchoolHoursPerWeek",
    "isWorkExpSummerAfter12th", "workExpAfter12thSummerHoursPerWeek",
    "isWorkExpCurrWorking",
  ]);
  assert.equal(get(p, "workExpAfter12thYears").value, "1");
  assert.equal(get(p, "workExpAfter12thMonths").value, "6");
});

test("PG with 10+ years sends select value 11; months as written", () => {
  const p = plan(club({ grades: ["12", "PG"], afterYears: "10+", afterMonths: 0 }));
  assert.deepEqual(get(p, "extraCurrYearsAfter12"), { id: "extraCurrYearsAfter12", kind: "select", value: "11" });
  assert.deepEqual(get(p, "extraCurrMonthsAfter12"), { id: "extraCurrMonthsAfter12", kind: "select", value: "0" });
  assert.ok(ids(p).indexOf("isExtraCurrAfter12th") < ids(p).indexOf("extraCurrYearsAfter12"));
  assert.ok(ids(p).indexOf("extraCurrMonthsAfter12") < ids(p).indexOf("extraCurrHoursPerWeek"));
});

test("without PG no after-12th selects are sent even if stored", () => {
  const p = plan(club({ afterYears: 3, afterMonths: 2 }));
  assert.ok(!ids(p).some((i) => /After12$/.test(i) || /After12th/.test(i)));
});

test("349 characters plus one line break (counted 351) is blocked, never planned", () => {
  const r = buildUcFormPlans([club({ description: `${"a".repeat(175)}\n${"b".repeat(174)}` })]);
  assert.equal(r.forms.length, 0);
  assert.equal(r.blocked.length, 1);
  assert.equal(r.blocked[0]!.label, "Extracurricular activity: Robotics Club");
  assert.ok(r.blocked[0]!.reasons.some((x) => /350/.test(x)));
});

test("exactly 350 counted characters (348 letters + one line break counted twice) is allowed", () => {
  const r = buildUcFormPlans([club({ description: `${"a".repeat(174)}\n${"b".repeat(174)}` })]);
  assert.equal(r.blocked.length, 0);
  assert.equal(r.forms.length, 1);
});

test("a name over 60 characters and an Other program name over 30 are blocked", () => {
  const long = buildUcFormPlans([club({ name: "x".repeat(61) })]);
  assert.equal(long.blocked.length, 1);
  const other = buildUcFormPlans([{ ...newUcEntry("edprep"), id: "e9", program: "18", name: "y".repeat(31), description: "d", grades: ["10"], hoursPerWeek: 2, weeksPerYear: 4 }]);
  assert.equal(other.blocked.length, 1);
  assert.ok(other.blocked[0]!.reasons.some((x) => /30/.test(x)));
});

test("the 250-character extra box is checked too", () => {
  const r = buildUcFormPlans([award({ extra: "e".repeat(251) })]);
  assert.equal(r.blocked.length, 1);
  assert.ok(r.blocked[0]!.reasons.some((x) => /250/.test(x)));
});

test("edprep Other: edPrepId 18 and edPrep_other; a listed program sends only the id", () => {
  const base = { ...newUcEntry("edprep"), id: "e1", description: "A summer program.", grades: ["10"] as UcEntry["grades"], hoursPerWeek: 20, weeksPerYear: 4 };
  const other = plan({ ...base, program: "18", name: "Local Maker Camp" });
  assert.deepEqual(other.fields.slice(0, 3), [
    { id: "typeofactivity", kind: "select", value: "EdPrep" },
    { id: "edPrepId", kind: "select", value: "18" },
    { id: "edPrep_other", kind: "text", value: "Local Maker Camp" },
  ]);
  const listed = plan({ ...base, id: "e2", program: "10", name: "stale name" });
  assert.deepEqual(listed.fields.slice(0, 2), [{ id: "typeofactivity", kind: "select", value: "EdPrep" }, { id: "edPrepId", kind: "select", value: "10" }]);
  assert.equal(get(listed, "edPrep_other"), undefined);
  assert.equal(get(listed, "edPrepDescription").value, "A summer program.");
  assert.equal(get(listed, "edPrepHoursPerWeek").value, "20");
  assert.equal(get(listed, "edPrepWeeksPerYear").value, "4");
  assert.equal(ucItemLabel({ ...base, program: "10", name: "" }), "Educational preparation program: GEAR UP");
});

test("coursework and volunteer use their own ids", () => {
  const course = plan({ ...newUcEntry("coursework"), id: "c1", name: "Intro Logic", description: "Online logic course.", grades: ["12"], hoursPerWeek: 3, weeksPerYear: 12 });
  assert.deepEqual(ids(course), ["typeofactivity", "otherCourseName", "otherCourseDescription", "isOtherCourse12th", "otherCourseHoursPerWeek", "otherCourseWeeksPerYear"]);
  assert.equal(get(course, "typeofactivity").value, "OtherCourse");
  const vol = plan({ ...newUcEntry("volunteer"), id: "v1", name: "Food Bank", extra: "A local food bank.", description: "Packed boxes.", grades: ["9", "PG"], afterYears: 0, afterMonths: 4, hoursPerWeek: 2, weeksPerYear: 40 });
  assert.deepEqual(ids(vol), [
    "typeofactivity", "volunteerOrg", "volunteerOrgDesc", "volunteerDescription", "isVolunteer9th", "isVolunteerAfter12th", "volunteerYearsAfter12", "volunteerMonthsAfter12",
    "volunteerHoursPerWeek", "volunteerWeeksPerYear",
  ]);
  assert.equal(get(vol, "typeofactivity").value, "Volunteer");
});

test("the legacy note and ids are never sent", () => {
  const p = plan(club({ legacy: "From your earlier version: secret", fromId: "ca-77" }));
  const dump = JSON.stringify(p.fields);
  assert.ok(!dump.includes("secret") && !dump.includes("ca-77") && !dump.includes("x1"));
});

test("missing answers: the form is planned without them and listed in blanks", () => {
  const r = buildUcFormPlans([club({ hoursPerWeek: null, grades: [] })]);
  assert.equal(r.blocked.length, 0);
  assert.equal(r.forms.length, 1);
  assert.ok(!r.forms[0]!.fields.some((f) => f.id === "extraCurrHoursPerWeek"));
  assert.equal(r.blanks.length, 1);
  assert.equal(r.blanks[0]!.label, "Extracurricular activity: Robotics Club");
  assert.ok(r.blanks[0]!.reasons.every((x) => x.endsWith("needs an answer")));
  assert.equal(r.blanks[0]!.reasons.length, 2);
});

test("pickIds selects and orders entries; unknown ids are ignored", () => {
  const a = club({ id: "a" });
  const b = club({ id: "b", name: "Chess" });
  const r = buildUcFormPlans([a, b], ["b", "zzz", "a"]);
  assert.deepEqual(r.forms.map((f) => f.sourceId), ["b", "a"]);
  assert.deepEqual(buildUcFormPlans([a, b]).forms.map((f) => f.sourceId), ["a", "b"]);
});

test("ucItemLabel is '<category label>: <name>'", () => {
  assert.equal(ucItemLabel(club()), "Extracurricular activity: Robotics Club");
  assert.equal(ucItemLabel(work()), "Work experience: Corner Cafe");
});

test("read-back: matching list-page text passes, whitespace, case and decimals are tolerated", () => {
  const p = plan(club({ description: "Line one.\nLine two.", hoursPerWeek: 10 }));
  const shown = {
    "Name of the activity": ["robotics club"],
    "What you did": ["Line one. Line two."],
    "When you did it": ["10th grade", "11th grade"],
    "Time you spent": ["10.0 hours per week", "30.0 weeks per year"],
  };
  assert.deepEqual(ucReadBackMismatches(p, shown), []);
});

test("read-back: a changed value, a missing grade and a missing section are each reported with the item's label", () => {
  const p = plan(club());
  const out = ucReadBackMismatches(p, { "Name of the activity": ["Robotics Clu"], "When you did it": ["10th grade"], "Time you spent": ["5.5 hours per week", "30.0 weeks per year"] });
  assert.equal(out.length, 3);
  assert.ok(out[0]!.startsWith("Extracurricular activity: Robotics Club: "));
  assert.ok(out.some((m) => m.includes("Name of the activity")));
  assert.ok(out.some((m) => m.includes("11th grade")));
  assert.ok(out.some((m) => m.includes("What you did")));
});

test("expectations for sections not yet seen live stay minimal (the name only)", () => {
  assert.deepEqual(Object.keys(plan(award()).expect), ["activitySubtitle"]);
  assert.deepEqual(Object.keys(plan(work()).expect), ["activitySubtitle"]);
  assert.deepEqual(plan(work()).expect["activitySubtitle"], ["Corner Cafe"]);
});
