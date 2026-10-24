import assert from "node:assert/strict";
import { test } from "node:test";
import { deadlineText, deadlineTone, essayTone, flagTone, pillTone, resultTone, stageTone } from "./status.ts";

test("deadlineTone: done always wins", () => {
  assert.equal(deadlineTone(3, true), "done");
  assert.equal(deadlineTone(0, true), "done");
  assert.equal(deadlineTone(-2, true), "done");
});
test("deadlineTone: thresholds 7 and 21", () => {
  assert.equal(deadlineTone(-1, false), "urgent");
  assert.equal(deadlineTone(0, false), "urgent");
  assert.equal(deadlineTone(7, false), "urgent");
  assert.equal(deadlineTone(8, false), "soon");
  assert.equal(deadlineTone(21, false), "soon");
  assert.equal(deadlineTone(22, false), "neutral");
});
test("deadlineText", () => {
  assert.equal(deadlineText(0), "today");
  assert.equal(deadlineText(1), "tomorrow");
  assert.equal(deadlineText(9), "9 days");
  assert.equal(deadlineText(-3), "overdue");
});
test("mapping tables", () => {
  assert.equal(resultTone("rejected"), "neutral");
  assert.equal(resultTone("waitlisted"), "soon");
  assert.equal(resultTone("enrolled"), "done");
  assert.equal(resultTone("submitted"), "progress");
  assert.equal(stageTone("ready"), "done");
  assert.equal(stageTone("in_progress"), "progress");
  assert.equal(essayTone("drafting"), "progress");
  assert.equal(essayTone("not_started"), "neutral");
  assert.equal(essayTone("final"), "done");
  assert.equal(flagTone("deadline_soon"), "urgent");
  assert.equal(flagTone("inactive"), "neutral");
  assert.equal(pillTone("red"), "urgent");
  assert.equal(pillTone("zinc"), "neutral");
});
