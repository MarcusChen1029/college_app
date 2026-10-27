// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { choiceWith, planMonthOptions, scoredTests, testChoice, testsToCompare, unusedScores, withPlanned, withTestChoice } from "./test-plan.ts";

test("scoredTests: every test with a score counts when no choice is stored", () => {
  assert.deepEqual(scoredTests({ sat: 1450 }), ["sat"]);
  assert.deepEqual(scoredTests({ sat: 1450, act: 33 }), ["sat", "act"]);
  assert.deepEqual(scoredTests({}), []);
  assert.deepEqual(scoredTests(null), []);
});

test("scoredTests: an explicit choice ignores a stored score the student switched away from", () => {
  assert.deepEqual(scoredTests({ sat: 1450, act: 33, tests: { plan: { using: ["act"] } } }), ["act"]);
  // A chosen test with no score yet is not counted.
  assert.deepEqual(scoredTests({ tests: { plan: { using: ["sat"] } } }), []);
});

test("testsToCompare: falls back to the planned test, then both", () => {
  assert.deepEqual(testsToCompare({ act: 30 }), ["act"]);
  assert.deepEqual(testsToCompare({ tests: { plan: { planned: { test: "act", month: "2026-12" } } } }), ["act"]);
  assert.deepEqual(testsToCompare({}), ["sat", "act"]);
});

// ── The profile form's choice: SAT / ACT / both / planning to take / not taking ──

test("scoredTests: planning to take or not taking uses no stored score", () => {
  assert.deepEqual(scoredTests({ sat: 1450, tests: { plan: { using: [], planned: { test: "act", month: "2026-12" } } } }), []);
  assert.deepEqual(scoredTests({ sat: 1450, act: 33, tests: { plan: { using: [], notTaking: true } } }), []);
  // a remembered planned test next to a chosen test does not hide the chosen test's score
  assert.deepEqual(scoredTests({ sat: 1450, tests: { plan: { using: ["sat"], planned: { test: "act" } } } }), ["sat"]);
});

test("testsToCompare: the chosen test with no score yet, and not taking", () => {
  assert.deepEqual(testsToCompare({ act: 30, tests: { plan: { using: ["sat"], planned: { test: "act" } } } }), ["sat"]);
  assert.deepEqual(testsToCompare({ tests: { plan: { using: [], notTaking: true, planned: { test: "act" } } } }), ["sat", "act"]);
});

test("testChoice: a stored choice wins; with none stored it is read from the scores", () => {
  assert.equal(testChoice({}), null);
  assert.equal(testChoice({ sat: 1400 }), "sat");
  assert.equal(testChoice({ act: 30 }), "act");
  assert.equal(testChoice({ sat: 1400, act: 30 }), "both"); // existing students see "Both" without anything being stored
  assert.equal(testChoice({ sat: 1400, act: 30, tests: { plan: { using: ["act"] } } }), "act");
  assert.equal(testChoice({ sat: 1400, tests: { plan: { using: [], planned: { test: "act" } } } }), "planned");
  assert.equal(testChoice({ sat: 1400, tests: { plan: { using: [], notTaking: true } } }), "none");
});

test("withTestChoice remembers the planned test and clears 'not taking' when another choice is picked", () => {
  const planned = { test: "act" as const, month: "2026-12" };
  const none = withTestChoice({ using: [], planned }, "none");
  assert.deepEqual(none, { using: [], notTaking: true, planned });
  const back = withTestChoice(none, "planned");
  assert.deepEqual(back, { using: [], planned });
  assert.equal(testChoice({ tests: { plan: back } }), "planned");
  assert.deepEqual(withTestChoice(none, "sat"), { using: ["sat"], planned });
  assert.deepEqual(withTestChoice(undefined, "planned"), { using: [], planned: { test: "sat", month: null } });
  assert.deepEqual(withTestChoice(undefined, "both"), { using: ["sat", "act"] });
});

test("withPlanned changes the test or the month without touching the rest", () => {
  const plan = withTestChoice(undefined, "planned");
  assert.deepEqual(withPlanned(plan, { test: "act" }).planned, { test: "act", month: null });
  assert.deepEqual(withPlanned(withPlanned(plan, { month: "2027-03" }), { test: "act" }).planned, { test: "act", month: "2027-03" });
  assert.deepEqual(withPlanned(withPlanned(plan, { month: "2027-03" }), { month: null }).planned, { test: "sat", month: null });
});

test("unusedScores lists saved scores the choice leaves out, and choiceWith brings one back", () => {
  const p = { sat: 1450, act: 33, tests: { plan: { using: ["act" as const] } } };
  assert.deepEqual(unusedScores(p), ["sat"]);
  assert.equal(choiceWith(p, "sat"), "both");
  const planning = { sat: 1450, act: 33, tests: { plan: withTestChoice(undefined, "planned") } };
  assert.deepEqual(unusedScores(planning), ["sat", "act"]);
  assert.equal(choiceWith(planning, "act"), "act");
  assert.deepEqual(unusedScores({ sat: 1450, act: 33 }), []);
});

test("planMonthOptions: 24 months from now, rolling over the year, keeping a saved month outside the range", () => {
  const months = planMonthOptions("2026-11");
  assert.equal(months.length, 24);
  assert.deepEqual(months.slice(0, 3), ["2026-11", "2026-12", "2027-01"]);
  assert.equal(months[23], "2028-10");
  assert.deepEqual(planMonthOptions("2026-11", "2026-05").slice(0, 2), ["2026-05", "2026-11"]);
  assert.deepEqual(planMonthOptions("", "2026-12"), ["2026-12"]); // before the client knows the date
  assert.deepEqual(planMonthOptions("", "garbage"), []);
});
