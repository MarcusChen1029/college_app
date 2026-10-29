import assert from "node:assert/strict";
import { test } from "node:test";
import { collegeCounts, countFloor, hasSocialProof, nextDeadline, seasonRows, SOCIAL_PROOF, upcomingDeadlines } from "./home-stats.ts";

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

test("seasonRows groups application deadlines by date and plan, from today, best-known names first", () => {
  const colleges = [
    { id: "a", short_name: "Alpha", name: "Alpha U", applicants: 100 },
    { id: "b", short_name: null, name: "Beta College", applicants: 900 },
    { id: "c", short_name: "Gamma", name: "Gamma U", applicants: null },
  ];
  const ds = [
    { institution_id: "a", due_date: "2026-11-01", kind: "application", plan_key: "EA" },
    { institution_id: "b", due_date: "2026-11-01", kind: "application", plan_key: "EA" },
    { institution_id: "c", due_date: "2026-11-01", kind: "application", plan_key: "ED" },
    { institution_id: "a", due_date: "2026-10-01", kind: "application", plan_key: "ED" }, // passed
    { institution_id: "a", due_date: "2026-11-02", kind: "financial_aid", plan_key: "EA" }, // not an application date
    { institution_id: "b", due_date: "2027-01-01", kind: "application", plan_key: null }, // no plan
    { institution_id: "z", due_date: "2026-11-03", kind: "application", plan_key: "RD" }, // unknown college
    { institution_id: "c", due_date: "2027-01-05", kind: "application", plan_key: "RD" },
  ];
  assert.deepEqual(seasonRows(ds, colleges, "2026-10-29", 5), [
    { date: "2026-11-01", plan: "EA", count: 2, names: ["Beta College", "Alpha"] },
    { date: "2026-11-01", plan: "ED", count: 1, names: ["Gamma"] },
    { date: "2027-01-05", plan: "RD", count: 1, names: ["Gamma"] },
  ]);
  assert.equal(seasonRows(ds, colleges, "2026-10-29", 1).length, 1);
  assert.deepEqual(seasonRows(ds, colleges, "2026-10-29", 1, 1)[0].names, ["Beta College"]);
});

test("the social proof block shows only with a number or a quote", () => {
  assert.equal(hasSocialProof({ students: null, quotes: [] }), false);
  assert.equal(hasSocialProof({ students: 12, quotes: [] }), true);
  assert.equal(hasSocialProof({ students: null, quotes: [{ text: "x", who: "y" }] }), true);
  assert.equal(typeof hasSocialProof(SOCIAL_PROOF), "boolean");
});
