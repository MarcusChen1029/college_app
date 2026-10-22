// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeRegions, defaultRegion } from "./regions.ts";

test("activeRegions keeps the chosen regions in the student's order", () => {
  assert.deepEqual(activeRegions(["GB", "US"]), ["GB", "US"]);
});

test("activeRegions drops unknown codes and repeats", () => {
  assert.deepEqual(activeRegions(["AU", "XX", "AU", "CA"]), ["AU", "CA"]);
});

test("activeRegions offers every region while none is chosen", () => {
  assert.deepEqual(activeRegions(undefined), ["US", "GB", "CA", "AU"]);
  assert.deepEqual(activeRegions([]), ["US", "GB", "CA", "AU"]);
  assert.deepEqual(activeRegions(["XX"]), ["US", "GB", "CA", "AU"]);
});

test("the first active region matches defaultRegion", () => {
  for (const targets of [undefined, [], ["CA", "US"], ["XX", "GB"]]) assert.equal(activeRegions(targets)[0], defaultRegion(targets));
});
