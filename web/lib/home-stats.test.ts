import assert from "node:assert/strict";
import { test } from "node:test";
import { collegeCounts, countFloor, hasSocialProof, nextDeadline, SOCIAL_PROOF, upcomingDeadlines } from "./home-stats.ts";

test("countFloor never rounds up", () => {
  assert.equal(countFloor(454), 450);
  assert.equal(countFloor(416), 400);
  assert.equal(countFloor(450), 450);
  assert.equal(countFloor(99), 90);
  assert.equal(countFloor(7), 7);
});

test("collegeCounts splits US from the rest", () => {
  assert.deepEqual(collegeCounts([{ country_code: "US" }, { country_code: "GB" }, { country_code: "US" }]), { total: 3, us: 2, other: 1 });
});

test("deadlines: upcoming includes today, next picks the earliest future one", () => {
  const ds = [
    { institution_id: "a", due_date: "2026-10-01" },
    { institution_id: "a", due_date: "2027-01-01" },
    { institution_id: "a", due_date: "2026-11-01" },
    { institution_id: "b", due_date: "2026-10-29" },
    { institution_id: "b", due_date: null },
  ];
  assert.equal(upcomingDeadlines(ds, "2026-10-29").length, 3);
  assert.equal(nextDeadline(ds, "a", "2026-10-29")?.due_date, "2026-11-01");
  assert.equal(nextDeadline(ds, "b", "2026-10-29")?.due_date, "2026-10-29");
  assert.equal(nextDeadline(ds, "c", "2026-10-29"), null);
});

test("the social proof block shows only with a number or a quote", () => {
  assert.equal(hasSocialProof({ students: null, quotes: [] }), false);
  assert.equal(hasSocialProof({ students: 12, quotes: [] }), true);
  assert.equal(hasSocialProof({ students: null, quotes: [{ text: "x", who: "y" }] }), true);
  assert.equal(typeof hasSocialProof(SOCIAL_PROOF), "boolean");
});
