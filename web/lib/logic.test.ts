// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFit } from "./fit.ts";
import { estimateGpaPercentiles } from "./gpa.ts";

const mit = { admit_rate: 4.56, intl_admit_rate: null, sat_p25: 1520, sat_p75: 1570, act_p25: 34, act_p75: 35, test_policy: "required" };
const purdue = { admit_rate: 43.43, intl_admit_rate: 22.49, sat_p25: 1220, sat_p75: 1470, act_p25: 28, act_p75: 34, test_policy: "required" };
const berkeley = { admit_rate: 10.51, intl_admit_rate: null, sat_p25: null, sat_p75: null, act_p25: null, act_p75: null, test_policy: "blind" };

test("very selective schools are always a reach", () => {
  assert.equal(computeFit({ sat: 1600 }, mit)?.fit, "super_reach");
  assert.equal(computeFit({ sat: 1600 }, berkeley)?.fit, "reach");
});

test("a score below the 25th percentile at a selective school is a super reach", () => {
  assert.equal(computeFit({ sat: 1100, international: true }, purdue)?.fit, "super_reach");
  assert.equal(computeFit({ sat: 1100 }, { ...mit, admit_rate: 12 })?.fit, "super_reach");
  assert.equal(computeFit({ sat: 1550 }, { ...mit, admit_rate: 12 })?.fit, "reach");
});

test("mid-selectivity school depends on score band", () => {
  assert.equal(computeFit({ sat: 1500 }, purdue)?.fit, "safety");
  assert.equal(computeFit({ sat: 1350 }, purdue)?.fit, "target");
  assert.equal(computeFit({ sat: 1150 }, purdue)?.fit, "reach");
});

test("international applicants use the international admit rate when reported", () => {
  // 22.5% intl rate → 15–30% bucket: within-range score is a reach
  assert.equal(computeFit({ sat: 1350, international: true }, purdue)?.fit, "reach");
  assert.match(computeFit({ sat: 1350, international: true }, purdue)!.reason, /international admit rate/);
});

test("better of SAT/ACT is used", () => {
  assert.equal(computeFit({ sat: 1150, act: 35 }, purdue)?.fit, "safety");
});

test("no admit rate → no fit", () => {
  assert.equal(computeFit({ sat: 1400 }, { ...purdue, admit_rate: null }), null);
});

test("GPA percentile estimate from CDS bands", () => {
  // CMU 2025-26 C11
  const est = estimateGpaPercentiles({ "4.0": 43.9, "3.75-3.99": 41.7, "3.50-3.74": 10.9, "3.25-3.49": 2.2, "3.00-3.24": 1.0, "2.50-2.99": 0.3 });
  assert.ok(est);
  assert.ok(est.p25 >= 3.75 && est.p25 < 4, `p25 ${est.p25}`);
  assert.equal(est.p75, 4);
  assert.ok(est.p25 <= est.p50 && est.p50 <= est.p75);
});

test("GPA estimate refuses incomplete distributions", () => {
  assert.equal(estimateGpaPercentiles({ "4.0": 40 }), null);
  assert.equal(estimateGpaPercentiles(null), null);
});
