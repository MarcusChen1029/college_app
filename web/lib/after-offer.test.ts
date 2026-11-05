import assert from "node:assert/strict";
import { test } from "node:test";
import raw from "./data/after-offer.json" with { type: "json" };
import { AFTER_OFFER } from "./checklist.ts";
import { afterOfferFacts, stepVariant } from "./after-offer.ts";

type Steps = Record<string, unknown[]>;
const DATA = raw as unknown as Record<string, { steps: Steps } & { variants?: unknown }>;

test("keys in the data are AFTER_OFFER keys", () => {
  for (const country of ["GB", "CA", "AU"] as const) {
    const valid = AFTER_OFFER[country].map(([k]) => k as string);
    for (const key of Object.keys(DATA[country].steps)) assert.ok(valid.includes(key), `${country}.${key}`);
  }
  const unis = DATA.universities as unknown as Record<string, { steps: Steps }>;
  const all = (Object.keys(AFTER_OFFER) as (keyof typeof AFTER_OFFER)[]).flatMap((c) => AFTER_OFFER[c].map(([k]) => k as string));
  for (const [slug, u] of Object.entries(unis)) for (const key of Object.keys(u.steps)) assert.ok(all.includes(key), `${slug}.${key}`);
});

test("university facts come first", () => {
  assert.ok(afterOfferFacts("ubc", "ca_deposit", null)[0].text.includes("3,000"));
  const mcgill = afterOfferFacts("mcgill", "ca_permit_applied", null);
  assert.ok(mcgill[0].text.includes("24,617"));
  assert.ok(mcgill.some((f) => f.text.includes("23,448")));
  assert.ok(mcgill.findIndex((f) => f.text.includes("24,617")) < mcgill.findIndex((f) => f.text.includes("23,448")));
});

test("country facts apply to every university", () => {
  assert.ok(afterOfferFacts("toronto", "ca_permit_applied", null).some((f) => f.text.includes("23,448")));
  assert.ok(afterOfferFacts("ucl", "uk_visa_granted", null).some((f) => /eVisa/.test(f.text)));
});

test("citizenship-only facts", () => {
  assert.ok(afterOfferFacts("ucl", "uk_visa_applied", "TW").some((f) => /TB/.test(f.text)));
  assert.ok(!afterOfferFacts("ucl", "uk_visa_applied", null).some((f) => /TB/.test(f.text)));
  assert.ok(!afterOfferFacts("ucl", "uk_visa_applied", "IN").some((f) => /TB/.test(f.text)));
  assert.ok(afterOfferFacts("ucl", "uk_visa_applied", null).length > 0);
});

test("every fact has a source and a date", () => {
  for (const [slug, key] of [["ubc", "ca_deposit"], ["ucl", "uk_visa_applied"], ["melbourne", "au_deposit_oshc"]] as const) {
    for (const f of afterOfferFacts(slug, key, "TW")) {
      assert.match(f.sourceUrl, /^https:\/\//);
      assert.match(f.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("McGill uses the CAQ variant", () => {
  assert.equal(stepVariant("mcgill", "ca_pal"), "caq");
  assert.equal(stepVariant("ubc", "ca_pal"), null);
  assert.equal(stepVariant("nowhere", "ca_pal"), null);
});

test("unknown slug or key gives []", () => {
  assert.deepEqual(afterOfferFacts("nowhere", "ca_pal", null), []);
  assert.deepEqual(afterOfferFacts("harvard", "ca_pal", "TW"), []);
  assert.deepEqual(afterOfferFacts("ubc", "uk_cas", null), []);
  assert.deepEqual(afterOfferFacts("ubc", "ca_housing", null), []);
});
