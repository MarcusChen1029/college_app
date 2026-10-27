// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fieldByKey, FIELDS, type FieldDef } from "./fields.ts";
import {
  collegeOutcomes,
  fieldEarnings,
  fieldEarningsFor,
  formatEarnings,
  roundEarnings,
  scorecardUrl,
  type OutcomesData,
} from "./outcomes.ts";

const file: OutcomesData = JSON.parse(readFileSync(new URL("./data/outcomes.json", import.meta.url), "utf8"));

const data: OutcomesData = {
  source: "x",
  source_url: "x",
  released: "2026-10-15",
  files: {},
  measures: {},
  colleges: {
    full: { id: 1, grad: 93, e10: 121957, e6: 97143, f: { "52": [100, 100 * 70000], "52.08": [40, 40 * 90000], "11": [10, 10 * 100000] } },
    sparse: { id: 2, grad: 40 },
  },
};

test("collegeOutcomes: values, and nulls for what Scorecard does not publish", () => {
  assert.deepEqual(collegeOutcomes(data, "full"), { scorecardId: 1, gradRate: 93, earnings10: 121957, earnings6: 97143 });
  assert.deepEqual(collegeOutcomes(data, "sparse"), { scorecardId: 2, gradRate: 40, earnings10: null, earnings6: null });
  assert.equal(collegeOutcomes(data, "nope"), undefined);
});

test("fieldEarnings: a family alone, a series inside it, and no double counting", () => {
  const f = data.colleges.full.f;
  assert.deepEqual(fieldEarnings(f, fieldByKey("business")), { median: 70000, n: 100 });
  assert.deepEqual(fieldEarnings(f, fieldByKey("finance_accounting")), { median: 90000, n: 40 }); // 52.08 (52.03 absent)
  assert.deepEqual(fieldEarnings(f, fieldByKey("computer_science")), { median: 100000, n: 10 });
  // A family listed next to one of its own series counts once.
  const both: FieldDef = { key: "business", area: "business", cips: ["52", "52.08"], tiers: [], keywords: null };
  assert.deepEqual(fieldEarnings(f, both), { median: 70000, n: 100 });
});

test("fieldEarnings: an exclude is subtracted exactly, so the rest keeps its own average", () => {
  // visual_arts_design = family 50 minus 50.03/50.05/50.09. 50: 100 grads at 50k average, 50.09: 60 grads at 40k.
  const f: OutcomesData["colleges"][string]["f"] = { "50": [100, 5_000_000], "50.09": [60, 2_400_000] };
  assert.deepEqual(fieldEarnings(f, fieldByKey("visual_arts_design")), { median: 65000, n: 40 }); // (5.0M - 2.4M) / 40
  assert.deepEqual(fieldEarnings(f, fieldByKey("performing_arts")), { median: 40000, n: 60 });
});

test("fieldEarnings: nothing published or everything excluded gives null, never 0", () => {
  assert.equal(fieldEarnings(undefined, fieldByKey("business")), null);
  assert.equal(fieldEarnings({}, fieldByKey("business")), null);
  assert.equal(fieldEarnings({ "50": [60, 2_400_000], "50.09": [60, 2_400_000] }, fieldByKey("visual_arts_design")), null);
  assert.equal(fieldEarnings({ "52": [10, 700000] }, fieldByKey("undecided")), null);
});

test("fieldEarningsFor: only fields with a figure", () => {
  const out = fieldEarningsFor(data, "full");
  assert.deepEqual(Object.keys(out).sort(), ["business", "computer_science", "finance_accounting"]);
  assert.deepEqual(fieldEarningsFor(data, "sparse"), {});
  assert.deepEqual(fieldEarningsFor(data, "nope"), {});
});

test("formatting: earnings to the nearest $1,000, link to the school's Scorecard page", () => {
  assert.equal(roundEarnings(121957), 122000);
  assert.equal(roundEarnings(37551), 38000);
  assert.equal(formatEarnings(121957), "$122,000");
  assert.equal(formatEarnings(98499), "$98,000");
  assert.equal(scorecardUrl(166027), "https://collegescorecard.ed.gov/school/?166027");
});

test("outcomes.json: shape, no zeros, slugs are the inner slugs of data/colleges", () => {
  assert.equal(file.released, "2026-10-15");
  assert.match(file.source_url, /^https:\/\/collegescorecard\.ed\.gov\//);
  const slugs = Object.keys(file.colleges);
  assert.ok(slugs.length > 400);
  for (const s of ["carnegie-mellon", "georgia-tech", "uc-berkeley", "harvard"]) assert.ok(file.colleges[s], s);
  for (const s of ["cmu", "gatech", "berkeley"]) assert.equal(file.colleges[s], undefined, `${s} is a file name, not a slug`);
  const fieldKeys = new Set(FIELDS.flatMap((f) => [...f.cips, ...(f.exclude ?? [])]));
  for (const [slug, r] of Object.entries(file.colleges)) {
    assert.ok(Number.isInteger(r.id) && r.id > 0, slug);
    if (r.grad !== undefined) assert.ok(r.grad > 0 && r.grad <= 100, `${slug} grad`);
    for (const k of ["e10", "e6"] as const) if (r[k] !== undefined) assert.ok(r[k]! > 1000, `${slug} ${k}`);
    for (const [p, [n, sum]] of Object.entries(r.f ?? {}) as [string, [number, number]][]) {
      assert.ok(fieldKeys.has(p), `${slug} unknown prefix ${p}`);
      assert.ok(n > 0 && sum > 0, `${slug} ${p}`);
    }
  }
});

test("outcomes.json: a well-known college reads back sensibly", () => {
  const h = collegeOutcomes(file, "harvard");
  assert.ok(h && h.gradRate !== null && h.gradRate >= 90);
  assert.ok(h.earnings10 !== null && h.earnings10 > 80000);
  const cs = fieldEarnings(file.colleges.harvard.f, fieldByKey("computer_science"));
  assert.ok(cs === null || cs.median > 40000);
});
