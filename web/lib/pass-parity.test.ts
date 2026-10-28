import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentEntryYear as edgeCurrentEntryYear,
  offeredEntryYears as edgeOfferedEntryYears,
  PASS_PRICE_TWD as edgePassPriceTwd,
  passWindow as edgePassWindow,
  taipeiToday as edgeTaipeiToday,
} from "../../supabase/functions/_shared/pass.ts";
import { currentEntryYear, offeredEntryYears, PASS_PRICE_TWD, passWindow, taipeiToday } from "./plans.ts";

// The web rules (plans.ts) and the Deno copy (_shared/pass.ts, used by the payment functions) are written
// separately; this keeps them in step.

function* days(from: string, to: string): Generator<string> {
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 24 * 60 * 60 * 1000) {
    yield new Date(t).toISOString().slice(0, 10);
  }
}

test("web and edge agree on every day from 2026-06-01 to 2029-08-31", () => {
  let n = 0;
  for (const day of days("2026-06-01", "2029-08-31")) {
    n++;
    assert.equal(edgeCurrentEntryYear(day), currentEntryYear(day), `currentEntryYear ${day}`);
    const offered = offeredEntryYears(day);
    assert.deepEqual(edgeOfferedEntryYears(day), offered, `offeredEntryYears ${day}`);
    for (const y of offered) {
      assert.deepEqual(edgePassWindow(y, day), passWindow(y, day), `passWindow ${y} bought ${day}`);
    }
  }
  assert.equal(n, 1188); // 214 + 365 + 366 + 243 days: the loop really covered the whole range
});

test("web and edge agree on the price", () => {
  assert.equal(edgePassPriceTwd, 990);
  assert.equal(edgePassPriceTwd, PASS_PRICE_TWD);
});

test("web and edge agree on the Taipei date for fixed instants", () => {
  const instants = [
    "2026-01-01T00:00:00Z",
    "2026-07-31T15:59:59Z",
    "2026-07-31T16:00:00Z",
    "2026-10-29T03:30:00Z",
    "2026-12-31T15:59:59Z",
    "2026-12-31T16:00:00Z",
    "2027-07-31T16:00:00Z",
    "2028-02-28T16:00:00Z", // Taipei is already Feb 29, a leap day
    "2028-02-29T16:00:00Z",
    "2029-08-31T23:59:59.999Z",
  ];
  for (const iso of instants) {
    assert.equal(edgeTaipeiToday(new Date(iso)), taipeiToday(new Date(iso)), iso);
  }
  assert.equal(edgeTaipeiToday(new Date("2028-02-28T16:00:00Z")), "2028-02-29");
});
