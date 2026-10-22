// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { groupByDate, isoOf, monthGrid, monthOf, shiftMonth } from "./calendar.ts";

test("monthGrid covers the month in whole Sunday-first weeks", () => {
  // November 2026 starts on a Sunday and has 30 days: 5 rows, Nov 1 in the first cell, Dec 5 in the last.
  const nov = monthGrid(2026, 10);
  assert.equal(nov.length, 5);
  assert.ok(nov.every((row) => row.length === 7));
  assert.equal(nov[0][0].iso, "2026-11-01");
  assert.equal(nov[4][6].iso, "2026-12-05");
  assert.equal(nov.flat().filter((c) => c.inMonth).length, 30);
});

test("monthGrid pads with the neighbouring months", () => {
  // January 2027 starts on a Friday: the first row begins on Sunday Dec 27.
  const jan = monthGrid(2027, 0);
  assert.equal(jan[0][0].iso, "2026-12-27");
  assert.equal(jan[0][0].inMonth, false);
  assert.equal(jan[0][5].iso, "2027-01-01");
  assert.equal(jan[0][5].inMonth, true);
});

test("monthGrid needs six rows when a 31-day month starts late in the week", () => {
  // May 2027 starts on a Saturday and has 31 days.
  assert.equal(monthGrid(2027, 4).length, 6);
});

test("shiftMonth wraps the year in both directions", () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftMonth({ year: 2026, month: 5 }, 0), { year: 2026, month: 5 });
});

test("isoOf and monthOf round-trip", () => {
  assert.equal(isoOf(2026, 0, 5), "2026-01-05");
  assert.equal(isoOf(2026, 0, 32), "2026-02-01");
  assert.deepEqual(monthOf("2026-11-01"), { year: 2026, month: 10 });
});

test("groupByDate collects items sharing a date", () => {
  const g = groupByDate(
    [
      { id: 1, d: "2026-11-01" },
      { id: 2, d: "2026-11-15" },
      { id: 3, d: "2026-11-01" },
    ],
    (x) => x.d,
  );
  assert.deepEqual(g.get("2026-11-01")?.map((x) => x.id), [1, 3]);
  assert.equal(g.get("2026-11-02"), undefined);
});
