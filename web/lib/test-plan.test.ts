// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { scoredTests, testsToCompare } from "./test-plan.ts";

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
