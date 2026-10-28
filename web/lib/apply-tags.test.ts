import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTags, applyTagsBySlug } from "./apply-tags.ts";
import type { CollegeSupplements } from "./supplements.ts";

const rec = (supplements: CollegeSupplements["supplements"]): CollegeSupplements => ({
  cycle: "2026-27",
  supplements,
  shared_set: null,
  prompts: [],
  intl_finance: null,
  sources: [],
  notes: "",
});

test("no_supplements only for a sourced 'none'", () => {
  assert.deepEqual(applyTags(rec("none"), null), ["no_supplements"]);
  for (const s of ["required", "optional_only", "unknown"] as const) assert.deepEqual(applyTags(rec(s), null), []);
  // Not researched is unknown, never "no essays".
  assert.deepEqual(applyTags(null, null), []);
});

test("no_app_fee only for a published $0 fee", () => {
  assert.deepEqual(applyTags(null, 0), ["no_app_fee"]);
  assert.deepEqual(applyTags(null, "0.00"), ["no_app_fee"]); // numeric columns can arrive as strings
  assert.deepEqual(applyTags(null, 75), []);
  assert.deepEqual(applyTags(null, null), []);
  assert.deepEqual(applyTags(null, undefined), []);
  assert.deepEqual(applyTags(null, ""), []);
});

test("both tags together, and by slug only where there is one", () => {
  assert.deepEqual(applyTags(rec("none"), 0), ["no_supplements", "no_app_fee"]);
  const colleges = [
    { id: "1", slug: "middlebury" },
    { id: "2", slug: "duke" },
    { id: "3", slug: "free-only" },
  ];
  const supp: Record<string, CollegeSupplements> = { middlebury: rec("none"), duke: rec("required") };
  const out = applyTagsBySlug(colleges, (s) => supp[s] ?? null, { "1": 0, "2": 85, "3": 0 });
  assert.deepEqual(out, { middlebury: ["no_supplements", "no_app_fee"], "free-only": ["no_app_fee"] });
});
