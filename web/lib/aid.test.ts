import assert from "node:assert/strict";
import { test } from "node:test";
import { compareOffers, outOfPocket, parseOffer, type AidRow } from "./aid.ts";

const row = (name: string, offer: number, coa: number | null): AidRow => ({ slug: name.toLowerCase(), name, offer, coa });

test("out of pocket is published cost minus the offer", () => {
  assert.equal(outOfPocket(30_000, 85_000), 55_000);
});

test("out of pocket never goes below zero", () => {
  assert.equal(outOfPocket(90_000, 85_000), 0);
});

test("no published cost means no estimate, not a made-up one", () => {
  assert.equal(outOfPocket(30_000, null), null);
  assert.equal(outOfPocket(30_000, undefined), null);
});

test("sorts by lowest out-of-pocket first and puts unknown costs last", () => {
  const out = compareOffers([row("Zed", 10_000, null), row("Big", 20_000, 80_000), row("Cheap", 40_000, 60_000), row("Alpha", 5_000, null)]);
  assert.deepEqual(out.map((r) => r.name), ["Cheap", "Big", "Alpha", "Zed"]);
  assert.deepEqual(out.map((r) => r.outOfPocket), [20_000, 60_000, null, null]);
});

test("flags an offer larger than the published cost", () => {
  const [a, b] = compareOffers([row("Full", 90_000, 85_000), row("Exact", 85_000, 85_000)]);
  assert.equal(a.outOfPocket, 0);
  assert.ok([a, b].find((r) => r.name === "Full")!.coversAll);
  assert.ok(!([a, b].find((r) => r.name === "Exact")!.coversAll));
});

test("parses typed amounts", () => {
  assert.equal(parseOffer("$45,000"), 45_000);
  assert.equal(parseOffer(" 1200.6 "), 1201);
  assert.equal(parseOffer("0"), 0);
});

test("empty or invalid input is no offer", () => {
  assert.equal(parseOffer(""), null);
  assert.equal(parseOffer("abc"), null);
  assert.equal(parseOffer("-5"), null);
  assert.equal(parseOffer("99999999999"), null);
});
