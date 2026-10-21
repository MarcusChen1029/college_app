import assert from "node:assert/strict";
import { test } from "node:test";
import { hasDecision, isSubmitted, resultStatus, stage } from "./application.ts";

const complete = { no_essays: true, recommendations: true, transcript: true, test_plan: "optional", english_plan: "not_required" } as const;

test("a college is ready only when every checklist item is done", () => {
  assert.equal(stage("in_progress", {}), "in_progress");
  assert.equal(stage("in_progress", { ...complete, transcript: false }), "in_progress");
  assert.equal(stage("in_progress", complete), "ready");
  assert.equal(stage("planning", complete), "ready");
});

test("submitted and decided colleges count as submitted", () => {
  assert.equal(stage("submitted", {}), "submitted");
  assert.equal(stage("admitted", complete), "submitted");
  assert.equal(isSubmitted("interview"), true);
  assert.equal(isSubmitted("researching"), false);
});

test("decisions vs waiting", () => {
  assert.equal(hasDecision("submitted"), false);
  assert.equal(hasDecision("interview"), false);
  assert.equal(hasDecision("waitlisted"), true);
  assert.equal(resultStatus("interview"), "submitted");
  assert.equal(resultStatus("rejected"), "rejected");
});
