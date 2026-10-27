import assert from "node:assert/strict";
import { test } from "node:test";
import { isDone, markSent, onlyEnglishPlan, onlyTestPlan, progress, safeLink, type Essay } from "./checklist.ts";

const essay = (status: Essay["status"]): Essay => ({ id: status, title: "", url: "", status });

test("essays are done only when every essay is final, or none are required", () => {
  assert.equal(isDone("essays", {}), false);
  assert.equal(isDone("essays", { essay_list: [essay("final"), essay("drafting")] }), false);
  assert.equal(isDone("essays", { essay_list: [essay("final"), essay("final")] }), true);
  assert.equal(isDone("essays", { no_essays: true }), true);
});

test("test scores: optional counts as done, SAT/ACT need to be sent", () => {
  assert.equal(isDone("test_scores", { test_plan: "optional" }), true);
  assert.equal(isDone("test_scores", { test_plan: "sat" }), false);
  assert.equal(isDone("test_scores", { test_plan: "act", test_scores: true }), true);
  assert.equal(isDone("test_scores", { test_scores: true }), false);
});

test("english test: not required counts as done, otherwise it must be sent", () => {
  assert.equal(isDone("english_test", { english_plan: "not_required" }), true);
  assert.equal(isDone("english_test", { english_plan: "ielts" }), false);
  assert.equal(isDone("english_test", { english_plan: "toefl", english_test: true }), true);
});

test("progress counts done and missing categories", () => {
  assert.deepEqual(progress({}), { done: 0, total: 5, missing: 5 });
  assert.deepEqual(progress({ transcript: true, no_essays: true, test_plan: "optional" }), { done: 3, total: 5, missing: 2 });
});

test("markSent ticks scores sent and fills an undecided plan from the student's only test", () => {
  assert.deepEqual(markSent({ test_plan: "act" }, "test_scores", "sat"), { test_plan: "act", test_scores: true });
  assert.deepEqual(markSent({}, "test_scores", "sat"), { test_scores: true, test_plan: "sat" });
  assert.deepEqual(markSent({}, "english_test", null), { english_test: true });
  assert.equal(markSent({ test_plan: "optional" }, "test_scores", "sat"), null);
  assert.equal(markSent({ english_plan: "not_required" }, "english_test", "ielts"), null);
  assert.equal(markSent({ test_plan: "sat", test_scores: true }, "test_scores", null), null);
  assert.equal(markSent({ english_test: true }, "english_test", null), null);
  assert.equal(isDone("english_test", markSent({}, "english_test", "toefl")!), true);
});

test("markSent ticks transcript and recommendations unless already ticked", () => {
  assert.deepEqual(markSent({ test_plan: "sat" }, "transcript"), { test_plan: "sat", transcript: true });
  assert.deepEqual(markSent({}, "recommendations"), { recommendations: true });
  assert.equal(markSent({ transcript: true }, "transcript"), null);
  assert.equal(markSent({ recommendations: true }, "recommendations"), null);
});

test("onlyTestPlan / onlyEnglishPlan pick a plan only when there is exactly one test", () => {
  assert.equal(onlyTestPlan(1400, null), "sat");
  assert.equal(onlyTestPlan(null, 30), "act");
  assert.equal(onlyTestPlan(1400, 30), null);
  assert.equal(onlyTestPlan(null, undefined), null);
  assert.equal(onlyEnglishPlan({ toefl_band: { total: 5 } }), "toefl");
  assert.equal(onlyEnglishPlan({ ielts: { total: 7 }, duolingo: { total: null } }), "ielts");
  assert.equal(onlyEnglishPlan({ ielts: { total: 7 }, toefl: { total: 100 } }), null);
  assert.equal(onlyEnglishPlan(undefined), null);
});

test("only http(s) links are clickable", () => {
  assert.equal(safeLink(" https://docs.google.com/document/d/x "), "https://docs.google.com/document/d/x");
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink(""), null);
});
