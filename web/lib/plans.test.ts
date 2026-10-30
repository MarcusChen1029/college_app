import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeWindow,
  canAddMore,
  currentEntryYear,
  effectivePlanKey,
  FREE_LIMIT,
  getPlan,
  listLimit,
  offeredEntryYears,
  PASS_PRICE_TWD,
  passWindow,
  PLANS,
  taipeiToday,
  upcomingWindow,
} from "./plans.ts";

test("free holds 5, the pass is unlimited", () => {
  assert.equal(listLimit("free"), 5);
  assert.equal(listLimit("senior"), null);
  assert.equal(listLimit("junior"), 5); // unknown key -> free
  assert.equal(FREE_LIMIT, 5);
});

test("the pass costs 990 TWD and the plan list has only free and senior", () => {
  assert.equal(PASS_PRICE_TWD, 990);
  assert.deepEqual(PLANS.map((p) => [p.key, p.priceTwd]), [["free", 0], ["senior", 990]]);
  assert.equal(getPlan("senior").name, "Admission-year pass");
});

test("unknown or missing plan falls back to free", () => {
  assert.equal(getPlan(undefined).key, "free");
  assert.equal(getPlan(null).key, "free");
  assert.equal(getPlan("platinum").key, "free");
});

test("only the pass gets the full AI context pack, Connect AI and the filler", () => {
  assert.equal(getPlan("free").fullAiContext, false);
  assert.equal(getPlan("senior").fullAiContext, true);
  assert.deepEqual(PLANS.filter((p) => p.connectAi).map((p) => p.key), ["senior"]);
  assert.deepEqual(PLANS.filter((p) => p.filler).map((p) => p.key), ["senior"]);
});

test("canAddMore stops at the limit", () => {
  assert.equal(canAddMore("free", 4), true);
  assert.equal(canAddMore("free", 5), false);
  assert.equal(canAddMore("senior", 500), true);
});

test("entry year flips on Aug 1 (Taipei)", () => {
  assert.equal(currentEntryYear("2026-07-31"), 2026);
  assert.equal(currentEntryYear("2026-08-01"), 2027);
  assert.equal(currentEntryYear("2027-01-01"), 2027);
});

test("offered years: current one not in July", () => {
  assert.deepEqual(offeredEntryYears("2026-10-29"), [2027, 2028, 2029]);
  assert.deepEqual(offeredEntryYears("2027-06-30"), [2027, 2028, 2029]);
  assert.deepEqual(offeredEntryYears("2027-07-01"), [2028, 2029]);
  assert.deepEqual(offeredEntryYears("2027-08-01"), [2028, 2029, 2030]);
});

test("pass window: pre-order starts Jan 1 of the year before entry", () => {
  assert.deepEqual(passWindow(2028, "2026-10-29"), { from: "2027-01-01", until: "2028-07-31" });
  assert.deepEqual(passWindow(2027, "2026-10-29"), { from: "2026-10-29", until: "2027-07-31" });
});

test("activeWindow is inclusive at both ends and handles gaps", () => {
  const w = [
    { entry_year: 2027, from: "2026-10-29", until: "2027-07-31" },
    { entry_year: 2029, from: "2028-01-01", until: "2029-07-31" },
  ];
  assert.equal(activeWindow(w, "2026-10-28"), null);
  assert.equal(activeWindow(w, "2026-10-29")?.entry_year, 2027);
  assert.equal(activeWindow(w, "2027-07-31")?.entry_year, 2027);
  assert.equal(activeWindow(w, "2027-08-01"), null);
  assert.equal(effectivePlanKey(w, "2027-12-31"), "free");
  assert.equal(upcomingWindow(w, "2027-08-01")?.entry_year, 2029);
  assert.equal(effectivePlanKey(w, "2028-01-01"), "senior");
});

test("overlapping windows: activeWindow returns the one that lasts longest, in any order", () => {
  const a = { entry_year: 2027, from: "2026-10-29", until: "2027-07-31" };
  const b = { entry_year: 2028, from: "2027-01-01", until: "2028-07-31" };
  assert.equal(activeWindow([a, b], "2027-03-01")?.entry_year, 2028);
  assert.equal(activeWindow([b, a], "2027-03-01")?.entry_year, 2028);
  assert.equal(activeWindow([a, b], "2026-12-31")?.entry_year, 2027); // b has not started yet
});

test("no windows means free, no active and no upcoming window", () => {
  for (const w of [null, undefined, []]) {
    assert.equal(activeWindow(w, "2027-01-01"), null);
    assert.equal(upcomingWindow(w, "2027-01-01"), null);
    assert.equal(effectivePlanKey(w, "2027-01-01"), "free");
  }
});

test("upcomingWindow takes the earliest future window and ignores one starting today", () => {
  const w = [
    { entry_year: 2029, from: "2028-01-01", until: "2029-07-31" },
    { entry_year: 2028, from: "2027-01-01", until: "2028-07-31" },
  ];
  assert.equal(upcomingWindow(w, "2026-10-29")?.entry_year, 2028);
  assert.equal(upcomingWindow(w, "2027-01-01")?.entry_year, 2029); // 2028's window has started
  assert.equal(upcomingWindow(w, "2028-01-01"), null);
});

test("taipeiToday is UTC+8", () => {
  assert.equal(taipeiToday(new Date("2026-07-31T16:00:00Z")), "2026-08-01");
  assert.equal(taipeiToday(new Date("2026-07-31T15:59:59Z")), "2026-07-31");
});
