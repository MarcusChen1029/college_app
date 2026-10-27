// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  RECOMMEND_THRESHOLD,
  buildEvidence,
  combine,
  recommend,
  scoreField,
  type FieldCompletions,
  type FieldEvidence,
  type MatchCollege,
} from "./field-match.ts";
import type { TierCode } from "./types.ts";

const noFit = { admit_rate: null, intl_admit_rate: null, sat_p25: null, sat_p75: null, act_p25: null, act_p75: null, test_policy: null };

const college = (slug: string, general: TierCode | null, tiers: Record<string, TierCode> = {}, extra: Partial<MatchCollege> = {}): MatchCollege => ({
  slug,
  name: slug,
  country_code: "US",
  general_tier: general,
  tiers,
  ...noFit,
  ...extra,
});

const us = (total: number, grads: FieldEvidence["grads"]): FieldEvidence => ({ total, grads, programFields: [] });

test("Princeton-like: no business tier and 0 business grads -> not offered", () => {
  const c = college("princeton", "S++", { economics: "S", engineering: "A" });
  const s = scoreField(c, us(1324, { engineering: 228 }), "business");
  assert.equal(s.status, "not_offered");
  assert.equal(s.strength, null);
  assert.equal(s.depth, "none");
  assert.equal(s.grads, 0);
});

test("Waterloo-like (non-US, no subject tiers): no data for business, estimated for engineering", () => {
  const c = college("waterloo", "S", {}, { country_code: "CA" });
  const ev: FieldEvidence = { total: null, grads: {}, programFields: ["computer_science", "economics", "engineering"] };
  const biz = scoreField(c, ev, "business");
  assert.equal(biz.status, "no_data");
  assert.equal(biz.depth, "unknown");
  const eng = scoreField(c, ev, "engineering");
  assert.equal(eng.status, "ok");
  assert.equal(eng.confidence, "estimated");
  assert.equal(eng.depth, "established");
  assert.equal(eng.strength, 78); // min(94 - 8, 78)
});

test("Caltech-like: business tier C with 2 grads -> small, capped at 55", () => {
  const c = college("caltech", "S+", { business: "C", engineering: "A" });
  const s = scoreField(c, us(235, { business: 2, engineering: 73 }), "business");
  assert.equal(s.depth, "small");
  assert.equal(s.confidence, "rated");
  assert.equal(s.strength, 55);
  // A strong tier on a tiny program is still capped.
  const strong = scoreField(college("x", "S", { business: "S" }), us(1000, { business: 3 }), "business");
  assert.equal(strong.strength, 55);
});

test("depth none but a direct tier exists -> treated as small", () => {
  const s = scoreField(college("x", "A", { nursing: "B" }), us(1000, {}), "nursing");
  assert.equal(s.status, "ok");
  assert.equal(s.depth, "small");
  assert.equal(s.strength, 55);
});

test("direct tier beats the general tier", () => {
  const s = scoreField(college("x", "S++", { business: "C" }), us(2000, { business: 150 }), "business");
  assert.equal(s.confidence, "rated");
  assert.equal(s.depth, "established");
  assert.equal(s.strength, 58);
  assert.deepEqual(s.tier, [{ category: "business", code: "C", proxy: false }]);
});

test("large program adds 3 to a rated field", () => {
  const s = scoreField(college("x", "B", { engineering: "A" }), us(9000, { engineering: 2413 }), "engineering");
  assert.equal(s.depth, "large");
  assert.equal(s.strength, 88);
  // Share >= 15% is also large.
  assert.equal(scoreField(college("y", "B"), us(100, { engineering: 15 }), "engineering").depth, "large");
});

test("weighted mean of direct tiers; missing ones drop out", () => {
  const both = scoreField(college("x", "A", { pre_med: "S", biology_life_sci: "C" }), us(1000, { pre_med: 100 }), "pre_med");
  assert.equal(both.strength, Math.round(0.7 * 95 + 0.3 * 58));
  const one = scoreField(college("x", "A", { biology_life_sci: "C" }), us(1000, { pre_med: 100 }), "pre_med");
  assert.equal(one.strength, 58);
});

test("proxy blend: (proxy + estimate) / 2, partly rated", () => {
  // pre_law uses humanities as a proxy. General A = 84 -> estimate min(76, 70) = 70; humanities S = 95.
  const s = scoreField(college("x", "A", { humanities: "S" }), us(2000, { pre_law: 120 }), "pre_law");
  assert.equal(s.confidence, "partly_rated");
  assert.equal(s.strength, Math.round((95 + 70) / 2));
  assert.deepEqual(s.tier, [{ category: "humanities", code: "S", proxy: true }]);
});

test("estimate only: general points - 8, capped by depth", () => {
  const ev = (n: number) => us(1000, { psychology: n });
  assert.equal(scoreField(college("x", "S++"), ev(5), "psychology").strength, 50); // small cap
  assert.equal(scoreField(college("x", "S++"), ev(100), "psychology").strength, 70); // established cap
  assert.equal(scoreField(college("x", "S++"), ev(400), "psychology").strength, 78); // large cap
  assert.equal(scoreField(college("x", "C"), ev(100), "psychology").strength, 50); // 58 - 8
  assert.equal(scoreField(college("x", "C"), ev(100), "psychology").confidence, "estimated");
});

test("US college with no completions record -> no data unless rated", () => {
  assert.equal(scoreField(college("x", "S"), undefined, "psychology").status, "no_data");
  assert.equal(scoreField(college("x", "S", { business: "A" }), undefined, "business").strength, 85);
});

test("undecided uses the general tier", () => {
  const s = scoreField(college("x", "A+"), undefined, "undecided");
  assert.equal(s.status, "ok");
  assert.equal(s.confidence, "general");
  assert.equal(s.strength, 87);
  assert.equal(scoreField(college("x", null), undefined, "undecided").status, "no_data");
});

test("two-field blend: 0.75 x s1 + 0.25 x (s2 ?? 40); excluded first field stays excluded", () => {
  const c = college("x", "A", { business: "A", economics: "S" });
  const ev = us(2000, { business: 150, economics: 60 });
  const s1 = scoreField(c, ev, "business");
  const s2 = scoreField(c, ev, "economics");
  assert.equal(combine(s1, s2).strength, Math.round(0.75 * 85 + 0.25 * 95));
  assert.equal(combine(s1, null).strength, Math.round(0.75 * 85 + 0.25 * 40));
  const notOffered = scoreField(c, ev, "nursing");
  assert.equal(combine(s1, notOffered).strength, Math.round(0.75 * 85 + 0.25 * 40));
  assert.equal(combine(notOffered, s1).status, "not_offered");
});

test("recommend: buckets from computeFit, threshold, sort order, regions", () => {
  const rate = (admit_rate: number) => ({ admit_rate });
  const colleges = [
    college("reach-a", "S", { business: "A" }, { ...rate(5), name: "Reach A" }),
    college("reach-b", "A", { business: "S" }, { ...rate(12), name: "Reach B" }),
    college("target-a", "B", { business: "B" }, { ...rate(40), name: "Target A" }),
    college("target-b", "A", { business: "B" }, { ...rate(45), name: "Target B" }), // same strength, better general tier
    college("safety", "C", { business: "C" }, { ...rate(80), name: "Safety" }),
    college("weak", "D", { business: "D" }, { ...rate(80), name: "Weak" }),
    college("abroad", "S", { business: "A" }, { country_code: "GB", name: "Abroad" }),
    college("no-biz", "S++", {}, { ...rate(4), name: "No Biz" }),
  ];
  const evidence: Record<string, FieldEvidence> = {
    "reach-a": us(2000, { business: 150 }),
    "reach-b": us(2000, { business: 150 }),
    "target-a": us(2000, { business: 150 }),
    "target-b": us(2000, { business: 150 }),
    safety: us(2000, { business: 150 }),
    weak: us(2000, { business: 150 }),
    "no-biz": us(2000, {}),
  };
  const r = recommend({ colleges, evidence, student: {}, fields: ["business"] });
  const slugs = (l: { college: MatchCollege }[]) => l.map((x) => x.college.slug);
  assert.deepEqual(slugs(r.buckets.reach), ["reach-b", "reach-a"]); // super_reach + reach, strength desc
  assert.deepEqual(slugs(r.buckets.target), ["target-b", "target-a"]);
  assert.deepEqual(slugs(r.buckets.safety), ["safety"]);
  assert.deepEqual(slugs(r.buckets.unknown), ["abroad"]); // no admit rate
  assert.deepEqual(slugs(r.weaker), ["weak"]);
  for (const list of Object.values(r.buckets)) for (const x of list) assert.ok(x.score.strength! >= RECOMMEND_THRESHOLD);
  assert.deepEqual(slugs(r.famousNotForField), ["no-biz"]);
  assert.equal(r.famousNotForField[0].score.status, "not_offered");

  const usOnly = recommend({ colleges, evidence, student: {}, fields: ["business"], regions: ["US"] });
  assert.deepEqual(slugs(usOnly.buckets.unknown), []);
});

test("recommend: famous-but-not list keeps A or better, sorted by general tier, max 8", () => {
  const tiers: TierCode[] = ["A", "S", "A+", "S++", "B++", "A++", "S+", "A", "S", "A+"];
  const colleges = tiers.map((t, i) => college(`c${i}`, t, {}, { name: `College ${i}` }));
  const evidence = Object.fromEntries(colleges.map((c) => [c.slug, us(1000, {})]));
  const r = recommend({ colleges, evidence, student: {}, fields: ["business"] });
  assert.equal(r.famousNotForField.length, 8);
  assert.ok(!r.famousNotForField.some((x) => x.college.general_tier === "B++"));
  assert.deepEqual(
    r.famousNotForField.map((x) => x.college.general_tier),
    ["S++", "S+", "S", "S", "A++", "A+", "A+", "A"],
  );
  // A famous college below the threshold (not just excluded) is listed too.
  const low = recommend({ colleges: [college("low", "S", { business: "D" })], evidence: { low: us(1000, { business: 100 }) }, student: {}, fields: ["business"] });
  assert.deepEqual(low.weaker.map((x) => x.college.slug), ["low"]);
  assert.deepEqual(low.famousNotForField.map((x) => x.college.slug), ["low"]);
});

test("recommend: a second field shifts the order", () => {
  const colleges = [
    college("biz-only", "A", { business: "A" }, { admit_rate: 50, name: "Biz Only" }),
    college("biz-econ", "A", { business: "A", economics: "S" }, { admit_rate: 50, name: "Biz Econ" }),
  ];
  const evidence = { "biz-only": us(2000, { business: 150 }), "biz-econ": us(2000, { business: 150, economics: 60 }) };
  const r = recommend({ colleges, evidence, student: {}, fields: ["business", "economics"] });
  assert.deepEqual(r.buckets.target.map((x) => x.college.slug), ["biz-econ", "biz-only"]);
});

// Real data (web/lib/data/field-completions.json, IPEDS 2023-24) with the colleges' real tiers.
const data: FieldCompletions = JSON.parse(readFileSync(new URL("./data/field-completions.json", import.meta.url), "utf8"));

test("real data: Princeton and Harvard have no business major", () => {
  for (const slug of ["princeton", "harvard"]) {
    const s = scoreField(college(slug, "S++"), buildEvidence(data, slug), "business");
    assert.equal(s.status, "not_offered", slug);
  }
});

test("real data: Caltech business is small and capped; Purdue engineering is large", () => {
  const caltech = scoreField(college("caltech", "S+", { business: "C" }), buildEvidence(data, "caltech"), "business");
  assert.equal(caltech.depth, "small");
  assert.ok(caltech.strength! <= 55);
  const purdue = scoreField(college("purdue", "A", { engineering: "S" }), buildEvidence(data, "purdue"), "engineering");
  assert.equal(purdue.depth, "large");
  assert.ok(purdue.grads! > 2000);
});

test("real data: Waterloo has no business evidence but does have engineering", () => {
  const ev = buildEvidence(data, "waterloo");
  assert.ok(ev);
  assert.equal(ev.total, null);
  const c = college("waterloo", "S", {}, { country_code: "CA" });
  assert.equal(scoreField(c, ev, "business").status, "no_data");
  assert.equal(scoreField(c, ev, "engineering").status, "ok");
  assert.equal(buildEvidence(data, "no-such-college"), undefined);
});
