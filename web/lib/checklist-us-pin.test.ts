// Pins today's US checklist behaviour before the country checklist model is added.
// Never edit this file afterwards: US progress, "Ready" and the international steps must stay byte-for-byte the same.
import assert from "node:assert/strict";
import { test } from "node:test";
import { stage } from "./application.ts";
import { CHECKLIST, intlSteps, progress, type Checklist } from "./checklist.ts";

const EMPTY: Checklist = {};
const ALL_DONE: Checklist = { no_essays: true, recommendations: true, transcript: true, test_plan: "sat", test_scores: true, english_plan: "toefl", english_test: true };
const PARTIAL: Checklist = {
  essay_list: [
    { id: "a", title: "", url: "", status: "final" },
    { id: "b", title: "", url: "", status: "drafting" },
  ],
  transcript: true,
  test_plan: "optional",
  english_plan: "not_required",
};
const WITH_NEW_KEYS = { recommendations: true, ucas_ps: true, admissions_test: true, extra_steps: { x: true }, course: "economics" } as unknown as Checklist;

test("US progress is pinned", () => {
  assert.equal(JSON.stringify(progress(EMPTY)), '{"done":0,"total":5,"missing":5}');
  assert.equal(JSON.stringify(progress(ALL_DONE)), '{"done":5,"total":5,"missing":0}');
  assert.equal(JSON.stringify(progress(PARTIAL)), '{"done":3,"total":5,"missing":2}');
  assert.equal(JSON.stringify(progress(WITH_NEW_KEYS)), '{"done":1,"total":5,"missing":4}');
});

test("CHECKLIST is pinned", () =>
  assert.deepEqual(
    CHECKLIST.map(([k, l]) => `${k}:${l}`),
    ["essays:Essays", "recommendations:Recommendations", "transcript:Transcript sent", "test_scores:Test scores", "english_test:English test"],
  ));

test("intlSteps is pinned", () => {
  assert.deepEqual(intlSteps({}, "planning", { international: false }), []);
  assert.deepEqual(intlSteps({}, "planning", { international: true }).map((s) => s.key), ["intl_finances"]);
  assert.deepEqual(intlSteps({}, "admitted", { international: true }).map((s) => s.key), ["intl_finances", "i20"]);
  assert.deepEqual(intlSteps({}, "enrolled", { international: true }).map((s) => s.key), ["intl_finances", "i20", "passport", "sevis_fee", "visa_interview"]);
});

test("stage is pinned", () => {
  assert.equal(stage("in_progress", ALL_DONE), "ready");
  assert.equal(stage("planning", EMPTY), "in_progress");
  assert.equal(stage("submitted", EMPTY), "submitted");
});
