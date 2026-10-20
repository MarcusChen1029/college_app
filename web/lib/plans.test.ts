import assert from "node:assert/strict";
import { test } from "node:test";
import { canAddMore, getPlan, listLimit } from "./plans.ts";

test("plan limits: free 3, junior 10, senior unlimited", () => {
  assert.equal(listLimit("free"), 3);
  assert.equal(listLimit("junior"), 10);
  assert.equal(listLimit("senior"), null);
});

test("unknown or missing plan falls back to free", () => {
  assert.equal(getPlan(undefined).key, "free");
  assert.equal(getPlan("platinum").key, "free");
});

test("canAddMore stops at the limit", () => {
  assert.equal(canAddMore("free", 2), true);
  assert.equal(canAddMore("free", 3), false);
  assert.equal(canAddMore("junior", 9), true);
  assert.equal(canAddMore("junior", 10), false);
  assert.equal(canAddMore("senior", 500), true);
});
