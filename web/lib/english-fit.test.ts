// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { collegeEnglishFrom, englishFit, englishOk, hasEnglishScore, type CollegeEnglish } from "./english-fit.ts";

const s = (total: number | null) => ({ total, sections: {} });
const req = (status: string, min: number | null, subscores = false) => ({ status, min, subscores });
const college = (policy: string | null, tests: CollegeEnglish["tests"]): CollegeEnglish => ({ policy, tests });

const typical = college("required_nonnative", {
  TOEFL_IBT: req("required_option", 100),
  TOEFL_IBT_2026: req("required_option", 5),
  IELTS: req("required_option", 7, true),
  DUOLINGO: req("required_option", 125),
});

test("meets: a score at or above the minimum", () => {
  assert.deepEqual(englishFit({ ielts: s(7.5) }, typical), { status: "meets", test: "ielts", score: 7.5, min: 7, subscores: true });
  assert.equal(englishFit({ ielts: s(7) }, typical).status, "meets"); // equal counts
});

test("below: every comparable score is under its minimum; reports the closest one", () => {
  const r = englishFit({ toefl: s(90), ielts: s(6.5) }, typical);
  assert.equal(r.status, "below");
  // TOEFL 90/100 is 10% short, IELTS 6.5/7 is ~7% short: IELTS is the closer one.
  assert.equal(r.test, "ielts");
  assert.equal(r.min, 7);
});

test("meets wins when any one test clears its minimum", () => {
  const r = englishFit({ toefl: s(90), duolingo: s(130) }, typical);
  assert.equal(r.status, "meets");
  assert.equal(r.test, "duolingo");
});

test("not_required: the college needs no English test, whatever the score", () => {
  assert.deepEqual(englishFit({ ielts: s(5) }, college("not_required", {})), { status: "not_required" });
  assert.deepEqual(englishFit(undefined, college("not_required", {})), { status: "not_required" });
});

test("waivable: the college only recommends a test", () => {
  const rec = college("recommended", { TOEFL_IBT: req("recommended_option", 100) });
  assert.deepEqual(englishFit({ toefl: s(95) }, rec), { status: "waivable", test: "toefl", score: 95, min: 100, subscores: false });
  assert.equal(englishFit({ toefl: s(105) }, rec).status, "meets");
  assert.deepEqual(englishFit(undefined, rec), { status: "waivable", reason: "no_score" });
});

test("TOEFL old scale is compared only with the old-scale minimum", () => {
  assert.equal(englishFit({ toefl: s(100) }, typical).status, "meets");
  assert.equal(englishFit({ toefl: s(99) }, typical).status, "below");
});

test("TOEFL band (1-6) is compared only with the band minimum", () => {
  assert.deepEqual(englishFit({ toefl_band: s(5.5) }, typical), { status: "meets", test: "toefl_band", score: 5.5, min: 5, subscores: false });
  assert.equal(englishFit({ toefl_band: s(4.5) }, typical).status, "below");
});

test("never converts between TOEFL scales: old score vs band-only college is unknown (scale_mismatch)", () => {
  const bandOnly = college("required_nonnative", { TOEFL_IBT_2026: req("required_option", 4.5) });
  assert.deepEqual(englishFit({ toefl: s(110) }, bandOnly), { status: "unknown", reason: "scale_mismatch" });
  const oldOnly = college("required_nonnative", { TOEFL_IBT: req("required_option", 80) });
  assert.deepEqual(englishFit({ toefl_band: s(6) }, oldOnly), { status: "unknown", reason: "scale_mismatch" });
});

test("unknown: no score, no college data, not accepted, no minimum, not listed", () => {
  assert.deepEqual(englishFit({}, typical), { status: "unknown", reason: "no_score" });
  assert.deepEqual(englishFit({ ielts: s(null) }, typical), { status: "unknown", reason: "no_score" });
  assert.deepEqual(englishFit({ ielts: s(8) }, undefined), { status: "unknown", reason: "no_data" });
  assert.deepEqual(englishFit({ ielts: s(8) }, college(null, {})), { status: "unknown", reason: "no_data" });
  const noDuo = college("required_nonnative", { DUOLINGO: req("not_accepted", null), IELTS: req("required_option", 6.5) });
  assert.deepEqual(englishFit({ duolingo: s(150) }, noDuo), { status: "unknown", reason: "not_accepted" });
  const supplementOnly = college("required_nonnative", { DUOLINGO: req("accepted", 120) });
  assert.deepEqual(englishFit({ duolingo: s(150) }, supplementOnly), { status: "unknown", reason: "not_accepted" });
  const noMin = college("required_nonnative", { PTE: req("required_option", null) });
  assert.deepEqual(englishFit({ pte: s(70) }, noMin), { status: "unknown", reason: "no_minimum" });
  assert.deepEqual(englishFit({ cambridge: s(190) }, typical), { status: "unknown", reason: "not_listed" });
});

test("a policy with no test rows, or rows with no policy, still work", () => {
  assert.deepEqual(englishFit({ ielts: s(7) }, college("required_nonnative", {})), { status: "unknown", reason: "not_listed" });
  assert.equal(englishFit({ ielts: s(7) }, college(null, { IELTS: req("required_option", 6.5) })).status, "meets");
});

test("collegeEnglishFrom builds the same shape from the college page rows", () => {
  const c = collegeEnglishFrom({ policy: "required_nonnative" }, [
    { test_key: "IELTS", status: "required_option", min_total: 6.5, min_subscores: { each_band: 6 } },
    { test_key: "TOEFL_IBT", status: "required_option", min_total: 90, min_subscores: null },
  ]);
  assert.deepEqual(c, {
    policy: "required_nonnative",
    tests: { IELTS: { status: "required_option", min: 6.5, subscores: true }, TOEFL_IBT: { status: "required_option", min: 90, subscores: false } },
  });
  assert.deepEqual(collegeEnglishFrom(null, []), { policy: null, tests: {} });
});

test("englishOk / hasEnglishScore", () => {
  assert.equal(englishOk({ status: "meets" }), true);
  assert.equal(englishOk({ status: "not_required" }), true);
  assert.equal(englishOk({ status: "waivable" }), false);
  assert.equal(englishOk({ status: "below" }), false);
  assert.equal(englishOk({ status: "unknown" }), false);
  assert.equal(hasEnglishScore({ ielts: s(7) }), true);
  assert.equal(hasEnglishScore({ ielts: s(null) }), false);
  assert.equal(hasEnglishScore(undefined), false);
});
