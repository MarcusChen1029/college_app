// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { programApplyVia, programFee } from "./programs.ts";

const none = { intl_fee_gbp: null, intl_fee_cad: null, intl_fee_aud: null };

test("programFee shows the fee in the course's own currency", () => {
  assert.equal(programFee({ ...none, intl_fee_gbp: 39500 }), "£39,500");
  assert.equal(programFee({ ...none, intl_fee_cad: 62000 }), "CA$62,000");
  assert.equal(programFee({ ...none, intl_fee_aud: 54000 }), "A$54,000");
});

test("programFee is null when no fee was found", () => {
  assert.equal(programFee(none), null);
});

test("programApplyVia defaults UK courses to UCAS and leaves others unknown", () => {
  assert.equal(programApplyVia({ apply_via: null }, "GB"), "UCAS");
  assert.equal(programApplyVia({ apply_via: null }, "CA"), null);
  assert.equal(programApplyVia({ apply_via: "OUAC" }, "CA"), "OUAC");
});
