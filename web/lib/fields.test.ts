// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { en } from "./i18n/en.ts";
import { zhTW } from "./i18n/zh-TW.ts";
import { fromProfile, toProfile } from "./student-rows.ts";
import { FIELD_AREAS, FIELDS, TIER_CATEGORIES, cipContains, cleanStudyFields, fieldByKey, fieldGrads, programFields, referencedCips } from "./fields.ts";

const cipsFile: string[] = JSON.parse(readFileSync(new URL("./fields-cips.json", import.meta.url), "utf8"));

test("27 directions plus undecided, unique keys, known areas", () => {
  const keys = FIELDS.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.length, 28);
  assert.ok(keys.includes("undecided"));
  for (const f of FIELDS) assert.ok(FIELD_AREAS.includes(f.area), f.key);
  for (const a of FIELD_AREAS) assert.ok(FIELDS.some((f) => f.area === a), a);
});

test("every CIP a field uses is in fields-cips.json, and the file lists nothing else", () => {
  for (const f of FIELDS) {
    for (const c of [...f.cips, ...(f.exclude ?? [])]) assert.ok(cipsFile.includes(c), `${f.key} ${c}`);
    for (const c of [...f.cips, ...(f.exclude ?? [])]) assert.match(c, /^\d\d(\.\d\d)?$/);
  }
  assert.deepEqual(cipsFile, referencedCips());
  assert.deepEqual(cipsFile, [...cipsFile].sort());
});

test("excludes sit inside a listed family", () => {
  for (const f of FIELDS) for (const ex of f.exclude ?? []) assert.ok(f.cips.some((c) => c !== ex && cipContains(c, ex)), `${f.key} ${ex}`);
});

test("mapped tier categories exist", () => {
  for (const f of FIELDS) for (const t of f.tiers) assert.ok((TIER_CATEGORIES as readonly string[]).includes(t.category), `${f.key} ${t.category}`);
});

test("every field but undecided has CIPs and course keywords", () => {
  for (const f of FIELDS) {
    if (f.key === "undecided") continue;
    assert.ok(f.cips.length > 0, f.key);
    assert.ok(f.keywords, f.key);
  }
});

test("cipContains: families contain their series, not neighbours", () => {
  assert.ok(cipContains("52", "52.08"));
  assert.ok(cipContains("52.08", "52.08"));
  assert.ok(!cipContains("5", "52.08"));
  assert.ok(!cipContains("52.08", "52.09"));
  assert.ok(!cipContains("52", "05.02"));
});

test("fieldGrads sums families and series without double counting", () => {
  const cip = { "52": 1000, "52.08": 200, "52.03": 100, "52.09": 50 };
  assert.equal(fieldGrads(cip, fieldByKey("business")), 1000);
  assert.equal(fieldGrads(cip, fieldByKey("finance_accounting")), 300);
  assert.equal(fieldGrads(cip, fieldByKey("hospitality")), 50);
  // A family listed next to one of its own series counts once.
  assert.equal(fieldGrads(cip, { key: "business", area: "business", cips: ["52", "52.08"], tiers: [], keywords: null }), 1000);
});

test("fieldGrads subtracts excluded series and never goes negative", () => {
  assert.equal(fieldGrads({ "51": 500, "51.38": 300, "51.11": 20 }, fieldByKey("health_sciences")), 180);
  assert.equal(fieldGrads({ "40": 63, "40.06": 8, "27": 29 }, fieldByKey("math_physical")), 84);
  assert.equal(fieldGrads({ "45": 258, "45.06": 124, "45.10": 58 }, fieldByKey("social_sciences")), 76);
  assert.equal(fieldGrads({ "50": 19, "50.09": 7 }, fieldByKey("visual_arts_design")), 12);
  assert.equal(fieldGrads({ "50": 19, "50.09": 7 }, fieldByKey("performing_arts")), 7);
  assert.equal(fieldGrads({ "51.38": 10 }, fieldByKey("health_sciences")), 0);
  assert.equal(fieldGrads({}, fieldByKey("business")), 0);
});

test("programFields classifies non-US course names", () => {
  const has = (name: string, key: string) => assert.ok(programFields(name).includes(key as never), `${name} -> ${key}: ${programFields(name)}`);
  const lacks = (name: string, key: string) => assert.ok(!programFields(name).includes(key as never), `${name} !-> ${key}`);
  has("Computer Science (BCS or BMath)", "computer_science");
  has("Computing Science BSc (Major)", "computer_science");
  has("Bachelor of Science (Computing and Software Systems major)", "computer_science");
  has("Bachelor of Information Technology", "computer_science");
  has("Mechanical Engineering BASc", "engineering");
  has("Smith Engineering, general (common) first year (QE)", "engineering");
  has("Economics BA (via Honours Arts)", "economics");
  has("Bachelor of Commerce (Economics major)", "business");
  has("Economics and Management", "business");
  has("Bachelor of Accounting", "finance_accounting");
  has("Medicine MBChB (6-year programme)", "pre_med");
  has("MBBS", "pre_med");
  has("Law LLB", "pre_law");
  has("Nursing BSc", "nursing");
  has("Psychology BSc", "psychology");
  has("Architecture BA", "architecture");
  has("Music BMus", "performing_arts");
  has("Data Science BSc", "data_science");
  has("Mathematics and Economics BSc", "math_physical");
  // Faculty/admission-group wording must not create fields.
  lacks("Computer Science (BSc, Faculty of Science: Physical, Earth, Math & Computer Sciences group)", "math_physical");
  lacks("Economics HBA (Faculty of Arts & Science, St. George; Social Sciences admission category)", "social_sciences");
  lacks("Economics BA (via Honours Arts)", "visual_arts_design");
  lacks("Computer Science (BCS or BMath)", "business");
  assert.deepEqual(programFields("Underwater basket weaving"), []);
});

test("every direction, area and tier category has a label in English and Traditional Chinese", () => {
  const keys = [
    ...FIELDS.map((f) => `match.field.${f.key}`),
    ...FIELD_AREAS.map((a) => `match.area.${a}`),
    ...TIER_CATEGORIES.map((c) => `match.tierCat.${c}`),
  ];
  for (const k of keys) {
    for (const [locale, dict] of [["en", en], ["zh-TW", zhTW]] as const) {
      const v = (dict as Record<string, string>)[k];
      assert.ok(typeof v === "string" && v.trim() !== "", `${locale} ${k}`);
    }
    assert.notEqual((zhTW as Record<string, string>)[k], (en as Record<string, string>)[k], `${k} is not translated`);
  }
});

test("cleanStudyFields keeps known directions only, no repeats, at most 2", () => {
  assert.deepEqual(cleanStudyFields(["business", "nope", "business", "economics", "pre_law"]), ["business", "economics"]);
  assert.deepEqual(cleanStudyFields(["undecided", "pre_med"]), ["pre_med"]);
  assert.deepEqual(cleanStudyFields(null), []);
  assert.deepEqual(cleanStudyFields("business"), []);
});

test("study directions round-trip through the profile row mapping", () => {
  const row = { sat_total: null, act_composite: null, gpa_unweighted: null, is_international: false, target_regions: [], study_fields: ["pre_law", "bogus", "business", "economics"], reminder_emails: true, plan: "free", test_details: null, interested: null, activities: null, resume: null, essays: null } as const;
  const profile = toProfile(row as never);
  assert.deepEqual(profile.studyFields, ["pre_law", "business"]);
  assert.deepEqual(fromProfile("u1", profile).study_fields, ["pre_law", "business"]);
  assert.deepEqual(toProfile({ ...row, study_fields: undefined } as never).studyFields, []);
});
