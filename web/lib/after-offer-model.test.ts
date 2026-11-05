// After-offer steps for UK, Canada and Australia (US stays byte-for-byte intlSteps).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AFTER_OFFER, US_CONTEXT, afterOfferSteps, intlSteps, isCommitted, progress, visaNeeded,
  type Checklist, type CollegeContext, type CountryCode,
} from "./checklist.ts";

const ctx = (country: CountryCode): CollegeContext => ({ ...US_CONTEXT, country });
const keys = (c: Checklist, status: string, country: CountryCode, citizenship?: string | null) =>
  afterOfferSteps(c, status, ctx(country), { international: true, citizenship }).map((s) => s.key);

test("US ignores citizenship", () => {
  for (const cz of [undefined, null, "US", "TW"]) for (const st of ["planning", "admitted", "enrolled"])
    assert.deepEqual(afterOfferSteps({}, st, US_CONTEXT, { international: true, citizenship: cz }), intlSteps({}, st, { international: true }));
});

test("GB before and after reply", () => {
  assert.deepEqual(keys({ uk_offer: "conditional" }, "admitted", "GB"), ["uk_conditions_met", "uk_place_confirmed", "uk_deposit", "uk_accommodation"]);
  assert.deepEqual(keys({ uk_offer: "unconditional" }, "admitted", "GB"), ["uk_place_confirmed", "uk_deposit", "uk_accommodation"]);
  assert.deepEqual(keys({ uk_offer: "conditional", uk_reply: "insurance" }, "admitted", "GB"), ["uk_conditions_met", "uk_place_confirmed", "uk_deposit", "uk_accommodation"]);
  assert.deepEqual(keys({ uk_offer: "conditional", uk_reply: "firm" }, "admitted", "GB"),
    ["uk_conditions_met", "uk_place_confirmed", "uk_deposit", "uk_cas", "uk_visa_applied", "uk_visa_granted", "uk_accommodation"]);
  assert.deepEqual(keys({ uk_reply: "decline" }, "admitted", "GB"), []);
  assert.deepEqual(keys({}, "planning", "GB"), []);
});

test("unset citizenship shows visa steps", () => assert.ok(keys({ uk_reply: "firm" }, "admitted", "GB", null).includes("uk_cas")));

test("own country hides visa steps", () => {
  assert.deepEqual(keys({ uk_reply: "firm" }, "admitted", "GB", "GB"), ["uk_place_confirmed", "uk_deposit", "uk_accommodation"]);
  assert.deepEqual(keys({}, "enrolled", "CA", "CA"), ["ca_offer_accepted", "ca_deposit", "ca_housing"]);
  assert.deepEqual(keys({}, "enrolled", "AU", "AU"), ["au_offer_accepted", "au_deposit_oshc", "au_housing"]);
});

test("CA and AU by status", () => {
  assert.deepEqual(keys({}, "planning", "CA", "TW"), []);
  assert.deepEqual(keys({}, "applied", "AU", "TW"), []);
  assert.deepEqual(keys({}, "admitted", "CA", "TW"), ["ca_offer_accepted", "ca_deposit", "ca_housing"]);
  assert.deepEqual(keys({}, "admitted", "AU", "TW"), ["au_offer_accepted", "au_deposit_oshc", "au_housing"]);
  assert.deepEqual(keys({}, "enrolled", "CA", "TW"), AFTER_OFFER.CA.map(([k]) => k));
  assert.deepEqual(keys({}, "enrolled", "AU", "TW"), AFTER_OFFER.AU.map(([k]) => k));
  assert.equal(AFTER_OFFER.CA.length, 7);
  assert.equal(AFTER_OFFER.AU.length, 6);
});

test("visa steps wait for the committed college", () => {
  assert.ok(!keys({}, "admitted", "GB").includes("uk_cas"));
  assert.ok(!keys({ uk_reply: "insurance" }, "admitted", "GB").includes("uk_cas"));
  assert.ok(!keys({}, "admitted", "CA", "TW").includes("ca_pal"));
  assert.ok(!keys({}, "admitted", "AU", "TW").includes("au_coe"));
});

test("international flag ignored outside US", () => {
  const k = afterOfferSteps({ uk_reply: "firm" }, "admitted", ctx("GB"), { international: false }).map((s) => s.key);
  assert.ok(k.includes("uk_cas"));
  assert.ok(afterOfferSteps({}, "admitted", ctx("CA"), { international: false }).length > 0);
});

test("done reads booleans", () => {
  const steps = afterOfferSteps({ uk_reply: "firm", uk_cas: true }, "admitted", ctx("GB"), { international: true });
  assert.equal(steps.find((s) => s.key === "uk_cas")?.done, true);
  assert.equal(steps.find((s) => s.key === "uk_deposit")?.done, false);
  assert.ok(steps.every((s) => s.when === null));
});

test("invalid stored values read as unset", () => {
  assert.ok(!keys({ uk_reply: "FIRM" as never }, "admitted", "GB").includes("uk_cas"));
  assert.ok(!keys({ uk_offer: 3 as never }, "admitted", "GB").includes("uk_conditions_met"));
  assert.ok(!keys({ uk_offer: "CONDITIONAL" as never }, "admitted", "GB").includes("uk_conditions_met"));
  assert.equal(isCommitted({ uk_reply: "FIRM" as never }, "admitted", "GB"), false);
  assert.ok(keys({ uk_reply: "DECLINE" as never }, "admitted", "GB").length > 0);
});

test("never counts in progress", () => {
  const all: Record<string, boolean> = {};
  for (const list of Object.values(AFTER_OFFER)) for (const [k] of list) all[k] = true;
  for (const country of ["GB", "CA", "AU"] as const) {
    const base: Checklist = { transcript: true };
    assert.deepEqual(progress({ ...base, ...all }, ctx(country)), progress(base, ctx(country)));
  }
});

test("visaNeeded", () => {
  assert.equal(visaNeeded("GB", undefined), true);
  assert.equal(visaNeeded("GB", null), true);
  assert.equal(visaNeeded("GB", "TW"), true);
  assert.equal(visaNeeded("GB", "GB"), false);
  assert.equal(visaNeeded("CA", "CA"), false);
  assert.equal(visaNeeded("AU", "CA"), true);
});

test("isCommitted", () => {
  assert.equal(isCommitted({ uk_reply: "firm" }, "admitted", "GB"), true);
  assert.equal(isCommitted({ uk_reply: "firm" }, "enrolled", "GB"), true);
  assert.equal(isCommitted({ uk_reply: "firm" }, "applied", "GB"), false);
  assert.equal(isCommitted({ uk_reply: "insurance" }, "admitted", "GB"), false);
  assert.equal(isCommitted({}, "enrolled", "GB"), true);
  assert.equal(isCommitted({}, "admitted", "CA"), false);
  assert.equal(isCommitted({}, "enrolled", "CA"), true);
  assert.equal(isCommitted({}, "enrolled", "US"), true);
});
