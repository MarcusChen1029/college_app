import assert from "node:assert/strict";
import { test } from "node:test";
import { splitMerge, splitPasswords } from "./plan-merge.ts";

const e = (slug: string, addedAt: string) => ({ slug, addedAt });
const slugs = (xs: readonly { slug: string }[]) => xs.map((x) => x.slug);

test("only as many local colleges as fit are inserted: the oldest ones; the rest stay local", () => {
  const missing = [e("d", "2026-03-04T00:00:00.000Z"), e("a", "2026-01-01T00:00:00.000Z"), e("c", "2026-02-03T00:00:00.000Z"), e("b", "2026-01-02T00:00:00.000Z")];
  const split = splitMerge(3, missing, 5);
  assert.deepEqual(slugs(split.insert), ["a", "b"]);
  assert.deepEqual(slugs(split.keep), ["c", "d"]);
});

test("an account that is already full takes none; every local college is kept", () => {
  const missing = [e("b", "2026-01-02T00:00:00.000Z"), e("a", "2026-01-01T00:00:00.000Z")];
  assert.deepEqual(splitMerge(5, missing, 5), { insert: [], keep: [missing[1], missing[0]] });
  assert.deepEqual(splitMerge(7, missing, 5), { insert: [], keep: [missing[1], missing[0]] }); // over the limit already
});

test("no limit (the pass): everything is inserted, oldest first", () => {
  const missing = [e("b", "2026-01-02T00:00:00.000Z"), e("a", "2026-01-01T00:00:00.000Z"), e("c", "2026-01-03T00:00:00.000Z")];
  const split = splitMerge(40, missing, null);
  assert.deepEqual(slugs(split.insert), ["a", "b", "c"]);
  assert.deepEqual(split.keep, []);
});

test("ordered by addedAt; equal addedAt keeps the input order", () => {
  const t = "2026-05-05T05:05:05.000Z";
  const missing = [e("x", t), e("early", "2026-01-01T00:00:00.000Z"), e("y", t), e("z", t)];
  const split = splitMerge(0, missing, 3);
  assert.deepEqual(slugs(split.insert), ["early", "x", "y"]);
  assert.deepEqual(slugs(split.keep), ["z"]);
});

test("returns the same objects with every field, and leaves the input alone", () => {
  const missing = [{ slug: "b", addedAt: "2026-01-02", notes: "keep me", rowId: "r2" }, { slug: "a", addedAt: "2026-01-01", notes: "", rowId: "r1" }];
  const before = JSON.stringify(missing);
  const split = splitMerge(4, missing, 5);
  assert.equal(split.insert[0], missing[1]);
  assert.equal(split.keep[0], missing[0]);
  assert.equal(split.keep[0].notes, "keep me");
  assert.equal(JSON.stringify(missing), before);
  assert.deepEqual(splitMerge(0, [], 5), { insert: [], keep: [] });
});

test("a kept college's own portal password stays in the browser; every other password may move", () => {
  const listed = "11111111-1111-4111-8111-111111111111";
  const keptInst = "22222222-2222-4222-8222-222222222222";
  const keptRow = "33333333-3333-4333-8333-333333333333";
  const keep = [
    { institutionId: keptInst },
    { custom: { name: "My school" }, rowId: keptRow, institutionId: "" }, // a typed-in college: its slot is the row id
  ];
  const pw = (slot: string) => ({ slot, password: `pw-${slot}` });
  const passwords = [pw(`college:${listed}`), pw(`college:${keptInst}`), pw("system:common_app"), pw(`college:${keptRow}`), pw("custom:abc")];
  const split = splitPasswords(keep, passwords);
  assert.deepEqual(split.stay.map((p) => p.slot), [`college:${keptInst}`, `college:${keptRow}`]);
  assert.deepEqual(split.movable.map((p) => p.slot), [`college:${listed}`, "system:common_app", "custom:abc"]);
  assert.equal(split.stay.length + split.movable.length, passwords.length); // nothing dropped
  assert.deepEqual(splitPasswords([], passwords), { movable: passwords, stay: [] });
});
