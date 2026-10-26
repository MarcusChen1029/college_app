import assert from "node:assert/strict";
import { test } from "node:test";
import { runUntilFailure } from "./sequence.ts";

test("runUntilFailure runs every step when all succeed", async () => {
  const ran: number[] = [];
  const ok = await runUntilFailure([async () => (ran.push(1), true), async () => (ran.push(2), true)]);
  assert.equal(ok, true);
  assert.deepEqual(ran, [1, 2]);
});

test("runUntilFailure stops at the first failed step and skips the rest", async () => {
  const ran: number[] = [];
  const ok = await runUntilFailure([async () => (ran.push(1), true), async () => (ran.push(2), false), async () => (ran.push(3), true)]);
  assert.equal(ok, false);
  assert.deepEqual(ran, [1, 2]);
});
