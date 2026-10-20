import assert from "node:assert/strict";
import { test } from "node:test";
import { isDone, progress, safeLink, type Essay } from "./checklist.ts";

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
  assert.deepEqual(progress({}), { done: 0, total: 8, missing: 8 });
  assert.deepEqual(progress({ transcript: true, no_essays: true, test_plan: "optional" }), { done: 3, total: 8, missing: 5 });
});

test("only http(s) links are clickable", () => {
  assert.equal(safeLink(" https://docs.google.com/document/d/x "), "https://docs.google.com/document/d/x");
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink(""), null);
});
