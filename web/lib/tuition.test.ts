// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { estimatedTuition, fmtMoney, fmtMoneyShort, programFeeRange, withinBudget } from "./tuition.ts";

const us = { country_code: "US", control: "public", tuition_usd: 12000, tuition_out_of_state_usd: 40000, tuition_intl_usd: 45000 };

test("international: the international rate wins", () => {
  const t = estimatedTuition(us, true);
  assert.equal(t.amount, 45000);
  assert.equal(t.basis, "intl");
  assert.equal(t.currency, "USD");
});

test("international at a public with no intl rate: out-of-state", () => {
  const t = estimatedTuition({ ...us, tuition_intl_usd: null }, true);
  assert.equal(t.amount, 40000);
  assert.equal(t.basis, "out_of_state");
});

test("international: otherwise the published rate; flagged when a public may be quoting in-state", () => {
  const priv = estimatedTuition({ ...us, control: "private_nonprofit", tuition_intl_usd: null, tuition_out_of_state_usd: null, tuition_usd: 60000 }, true);
  assert.deepEqual([priv.amount, priv.basis, priv.maybeLow], [60000, "published", false]);
  const pub = estimatedTuition({ ...us, tuition_intl_usd: null, tuition_out_of_state_usd: null }, true);
  assert.deepEqual([pub.amount, pub.basis, pub.maybeLow], [12000, "published", true]);
  // A private college's out-of-state column (if any) is never used.
  const privOos = estimatedTuition({ ...us, control: "private_nonprofit", tuition_intl_usd: null, tuition_out_of_state_usd: 70000, tuition_usd: 60000 }, true);
  assert.equal(privOos.amount, 60000);
});

test("domestic: the published (in-state) rate, with out-of-state as a second figure for publics", () => {
  const t = estimatedTuition(us, false);
  assert.deepEqual([t.amount, t.basis, t.outOfState], [12000, "in_state", 40000]);
  const priv = estimatedTuition({ ...us, control: "private_nonprofit", tuition_usd: 60000, tuition_out_of_state_usd: null }, false);
  assert.deepEqual([priv.amount, priv.basis, priv.outOfState], [60000, "published", null]);
});

test("missing figures stay missing, never zero", () => {
  const none = { ...us, tuition_usd: null, tuition_out_of_state_usd: null, tuition_intl_usd: null };
  assert.equal(estimatedTuition(none, true).amount, null);
  assert.equal(estimatedTuition(none, false).amount, null);
  assert.equal(estimatedTuition(none, true).basis, null);
});

test("non-US colleges use their course fees in their own currency", () => {
  const gb = { country_code: "GB", control: "public", tuition_usd: null, tuition_out_of_state_usd: null, tuition_intl_usd: null };
  const t = estimatedTuition(gb, true, { currency: "GBP", min: 24000, max: 38000 });
  assert.deepEqual([t.amount, t.max, t.currency, t.basis], [24000, 38000, "GBP", "course_fee"]);
  assert.equal(estimatedTuition(gb, true, { currency: "GBP", min: 30000, max: 30000 }).max, null);
  const unknown = estimatedTuition(gb, true, null);
  assert.deepEqual([unknown.amount, unknown.currency], [null, "GBP"]);
});

test("programFeeRange takes the cheapest and dearest course, ignoring missing fees", () => {
  const none = { intl_fee_gbp: null, intl_fee_cad: null, intl_fee_aud: null };
  assert.deepEqual(programFeeRange([{ ...none, intl_fee_gbp: 30000 }, none, { ...none, intl_fee_gbp: 24000 }]), { currency: "GBP", min: 24000, max: 30000 });
  assert.deepEqual(programFeeRange([{ ...none, intl_fee_aud: 54000 }]), { currency: "AUD", min: 54000, max: 54000 });
  assert.equal(programFeeRange([none]), null);
  assert.equal(programFeeRange([]), null);
});

test("withinBudget: known, same currency, at or under the cap", () => {
  const t = estimatedTuition(us, true);
  assert.equal(withinBudget(t, null, "USD"), true);
  assert.equal(withinBudget(t, 45000, "USD"), true);
  assert.equal(withinBudget(t, 40000, "USD"), false);
  assert.equal(withinBudget(t, 50000, "GBP"), false);
  assert.equal(withinBudget({ ...t, amount: null }, 70000, "USD"), false);
  // An in-state figure shown to an international student may be far too low: it never passes a cap.
  assert.equal(withinBudget({ ...t, amount: 12000, maybeLow: true }, 70000, "USD"), false);
});

test("money formatting", () => {
  assert.equal(fmtMoney(58000, "USD"), "$58,000");
  assert.equal(fmtMoney(39500, "GBP"), "£39,500");
  assert.equal(fmtMoney(62000, "CAD"), "CA$62,000");
  assert.equal(fmtMoneyShort(30000, "AUD"), "A$30k");
});
