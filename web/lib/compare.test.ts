import assert from "node:assert/strict";
import { test } from "node:test";
import { compareHref, MAX_COMPARE, parseCompare } from "./compare.ts";

test("parseCompare trims, drops blanks and duplicates, and caps at four", () => {
  assert.deepEqual(parseCompare(" mit, ,stanford,mit "), ["mit", "stanford"]);
  assert.deepEqual(parseCompare("a,b,c,d,e"), ["a", "b", "c", "d"]);
  assert.equal(MAX_COMPARE, 4);
});

test("parseCompare reads a missing or repeated param", () => {
  assert.deepEqual(parseCompare(undefined), []);
  assert.deepEqual(parseCompare(["mit", "yale,mit"]), ["mit", "yale"]);
});

test("compareHref drops the query when nothing is picked", () => {
  assert.equal(compareHref([]), "/compare");
  assert.equal(compareHref(["mit", "yale"]), "/compare?c=mit,yale");
});
