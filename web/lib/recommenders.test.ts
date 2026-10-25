import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyRecommender, isIsoDate, recommenderTone, sortRecommenders, validateRecommender, RECOMMENDER_LIMITS, type Recommender } from "./recommenders.ts";

const today = new Date(2026, 9, 25); // 2026-10-25, local

const rec = (o: Partial<Recommender>): Recommender => ({ id: "x", createdAt: "2026-10-01T00:00:00Z", ...emptyRecommender(), name: "Ms. Lee", ...o });

test("isIsoDate accepts real dates only", () => {
  assert.equal(isIsoDate("2026-10-25"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("10/25/2026"), false);
  assert.equal(isIsoDate(null), false);
});

test("validateRecommender trims and defaults", () => {
  const r = validateRecommender({ ...emptyRecommender(), name: "  Mr. Cho ", note: " AP Chem ", dueOn: "" });
  assert.deepEqual(r, { ok: true, value: { name: "Mr. Cho", role: "teacher", note: "AP Chem", requestedOn: null, dueOn: null, status: "to_ask" } });
});

test("validateRecommender mirrors the DB checks", () => {
  const base = emptyRecommender();
  assert.equal(validateRecommender({ ...base, name: "   " }).ok, false);
  assert.equal(validateRecommender({ ...base, name: "a".repeat(RECOMMENDER_LIMITS.name + 1) }).ok, false);
  assert.equal(validateRecommender({ ...base, name: "A", note: "n".repeat(RECOMMENDER_LIMITS.note + 1) }).ok, false);
  assert.equal(validateRecommender({ ...base, name: "A", role: "parent" }).ok, false);
  assert.equal(validateRecommender({ ...base, name: "A", status: "done" }).ok, false);
  assert.equal(validateRecommender({ ...base, name: "A", requestedOn: "2026-13-01" }).ok, false);
  assert.equal(validateRecommender({ ...base, name: "A", requestedOn: "2026-10-20", dueOn: "2026-10-19" }).ok, false);
  assert.equal(validateRecommender({ ...base, name: "A", requestedOn: "2026-10-20", dueOn: "2026-10-20" }).ok, true);
});

test("tone: urgent within 7 days or overdue unless submitted", () => {
  assert.equal(recommenderTone(rec({ status: "asked", dueOn: "2026-11-01" }), today), "urgent"); // 7 days
  assert.equal(recommenderTone(rec({ status: "to_ask", dueOn: "2026-10-01" }), today), "urgent"); // overdue
  assert.equal(recommenderTone(rec({ status: "in_progress", dueOn: "2026-11-02" }), today), "soon"); // 8 days
  assert.equal(recommenderTone(rec({ status: "submitted", dueOn: "2026-10-26" }), today), "done");
  assert.equal(recommenderTone(rec({ status: "thanked", dueOn: "2026-10-01" }), today), "done");
});

test("tone: without a near due date it follows progress", () => {
  assert.equal(recommenderTone(rec({ status: "to_ask" }), today), "neutral");
  assert.equal(recommenderTone(rec({ status: "asked", dueOn: "2027-01-01" }), today), "progress");
  assert.equal(recommenderTone(rec({ status: "submitted" }), today), "done");
});

test("sort: outstanding by due date (none last), finished at the bottom", () => {
  const items = [
    rec({ name: "Done", status: "submitted", dueOn: "2026-10-01" }),
    rec({ name: "NoDate", status: "asked" }),
    rec({ name: "Later", status: "asked", dueOn: "2026-12-01" }),
    rec({ name: "Soon", status: "to_ask", dueOn: "2026-11-01" }),
    rec({ name: "Thanks", status: "thanked" }),
  ];
  assert.deepEqual(sortRecommenders(items).map((r) => r.name), ["Soon", "Later", "NoDate", "Done", "Thanks"]);
  assert.equal(items[0].name, "Done", "input is not mutated");
});
