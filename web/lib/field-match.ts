// Field-aware recommender: how strong a college is for one study direction, and a balanced Reach/Target/Safety list.
// Pure (no React, no Supabase). Spec: docs/superpowers/specs/2026-10-27-field-recommender-design.md, section "Algorithm".
// Overall reputation never stands in for a field: no program -> not offered, no field evidence -> no data.
import { computeFit, type FitInput, type FitResult, type StudentProfile } from "./fit.ts";
import { FIELDS, fieldByKey, fieldGrads, programFields, type FieldKey } from "./fields.ts";
import { tierLetter, tierRank } from "./tiers.ts";
import type { CollegeSummary, TierCode } from "./types.ts";

export type Depth = "none" | "small" | "established" | "large" | "unknown";
export type Confidence = "rated" | "partly_rated" | "estimated" | "general";
export type Bucket = "reach" | "target" | "safety" | "unknown";

/** Points for a subject tier (plain S-D). */
export const SUBJECT_POINTS: Record<"S" | "A" | "B" | "C" | "D", number> = { S: 95, A: 85, B: 72, C: 58, D: 45 };

/** Points for the 15-step general tier; plain letters sit next to the subject points. */
export const GENERAL_POINTS: Record<TierCode, number> = {
  "S++": 100, "S+": 97, S: 94,
  "A++": 90, "A+": 87, A: 84,
  "B++": 79, "B+": 75, B: 71,
  "C++": 66, "C+": 62, C: 58,
  "D++": 53, "D+": 49, D: 45,
};

/** Ceiling for a reputation-based estimate, by program depth. Non-US "established" means a matching course exists. */
export const ESTIMATE_CAP = { small: 50, established: 70, large: 78, non_us_established: 78 } as const;
export const ESTIMATE_DISCOUNT = 8; // estimate = general points - 8, then capped
export const SMALL_CAP = 55; // a tiny program never scores above this
export const LARGE_BONUS = 3; // a rated field with a large program
export const SMALL_GRADS = 10; // fewer graduates a year than this = small
export const LARGE_GRADS = 200; // this many, or LARGE_SHARE of all bachelor's, = large
export const LARGE_SHARE = 0.15;
export const RECOMMEND_THRESHOLD = 55;
export const SECOND_FIELD_WEIGHT = 0.25;
export const SECOND_FIELD_MISSING = 40; // second-field strength when the college has none
export const FAMOUS_MAX = 8;

/** Compact field evidence for one college (the server builds it with buildEvidence). */
export type FieldEvidence = {
  total: number | null; // IPEDS first-major bachelor's total; null for non-US
  grads: Partial<Record<FieldKey, number>>; // zero counts omitted
  programFields: FieldKey[]; // non-US: fields matched by course names
};

/** Shape of web/lib/data/field-completions.json (scripts/build_field_completions.py). */
export type FieldCompletions = {
  source: string;
  source_url: string;
  academic_year: string;
  colleges: Record<string, { total: number; cip: Record<string, number> }>;
  programs: Record<string, string[]>;
};

export type FieldScore = {
  status: "ok" | "not_offered" | "no_data";
  strength: number | null; // 0-100, null unless ok
  confidence: Confidence | null;
  depth: Depth;
  grads: number | null; // first-major bachelor's in the field (US only)
  share: number | null; // grads / total (US only)
  tier: { category: string; code: TierCode; proxy: boolean }[]; // the mapped tiers the college has
};

export type ScoreCollege = Pick<CollegeSummary, "country_code" | "general_tier" | "tiers">;
export type MatchCollege = Pick<CollegeSummary, "slug" | "name" | "country_code" | "general_tier" | "tiers"> & FitInput;
export type Rec<C extends MatchCollege = MatchCollege> = { college: C; score: FieldScore; fit: FitResult | null };

const FIELD_KEYS = FIELDS.map((f) => f.key).filter((k) => k !== "undecided");

/** Per-slug evidence from the completions file; undefined when the file has nothing for the slug. */
export function buildEvidence(data: FieldCompletions, slug: string, fields: FieldKey[] = FIELD_KEYS): FieldEvidence | undefined {
  const us = data.colleges[slug];
  const names = data.programs[slug];
  if (!us && !names) return undefined;
  const grads: Partial<Record<FieldKey, number>> = {};
  if (us) {
    for (const key of fields) {
      const def = fieldByKey(key);
      if (!def.cips.length) continue;
      const n = fieldGrads(us.cip, def);
      if (n > 0) grads[key] = n;
    }
  }
  const matched = new Set((names ?? []).flatMap(programFields));
  return {
    total: us ? us.total : null,
    grads,
    programFields: FIELD_KEYS.filter((k) => fields.includes(k) && matched.has(k)),
  };
}

const round = (n: number) => Math.round(n);

function weightedMean(parts: { points: number; weight: number }[]): number | null {
  const w = parts.reduce((s, p) => s + p.weight, 0);
  return w > 0 ? parts.reduce((s, p) => s + p.points * p.weight, 0) / w : null;
}

function noScore(status: "not_offered" | "no_data", depth: Depth, grads: number | null, share: number | null, tier: FieldScore["tier"]): FieldScore {
  return { status, strength: null, confidence: null, depth, grads, share, tier };
}

export function scoreField(college: ScoreCollege, evidence: FieldEvidence | undefined, field: FieldKey): FieldScore {
  const general = college.general_tier ? GENERAL_POINTS[college.general_tier] : null;
  if (field === "undecided") {
    if (general == null) return noScore("no_data", "unknown", null, null, []);
    return { status: "ok", strength: general, confidence: "general", depth: "unknown", grads: null, share: null, tier: [] };
  }
  const def = fieldByKey(field);

  // 1. Depth
  const isUS = college.country_code === "US";
  let depth: Depth = "unknown";
  let grads: number | null = null;
  let share: number | null = null;
  if (isUS) {
    if (evidence && evidence.total != null) {
      grads = evidence.grads[field] ?? 0;
      share = evidence.total > 0 ? grads / evidence.total : null;
      if (grads === 0) depth = "none";
      else if (grads < SMALL_GRADS) depth = "small";
      else if (grads >= LARGE_GRADS || (share != null && share >= LARGE_SHARE)) depth = "large";
      else depth = "established";
    }
  } else if (evidence?.programFields.includes(field)) {
    depth = "established";
  }

  // 2-3. Tiers the college has for this field
  const tier: FieldScore["tier"] = [];
  const direct: { points: number; weight: number }[] = [];
  const proxy: { points: number; weight: number }[] = [];
  for (const t of def.tiers) {
    const code = college.tiers?.[t.category];
    if (!code) continue;
    tier.push({ category: t.category, code, proxy: !!t.proxy });
    (t.proxy ? proxy : direct).push({ points: SUBJECT_POINTS[tierLetter(code)], weight: t.weight });
  }
  const directMean = weightedMean(direct);
  const proxyMean = weightedMean(proxy);

  if (depth === "none") {
    if (directMean == null) return noScore("not_offered", depth, grads, share, tier);
    depth = "small"; // the tier says a program exists; IPEDS files it under another code
  }

  const capSmall = (n: number) => (depth === "small" ? Math.min(SMALL_CAP, n) : n);

  if (directMean != null) {
    const s = depth === "large" ? Math.min(100, directMean + LARGE_BONUS) : capSmall(directMean);
    return { status: "ok", strength: round(s), confidence: "rated", depth, grads, share, tier };
  }
  if (depth === "unknown") return noScore("no_data", depth, grads, share, tier);

  // Reputation-based estimate; a missing general tier counts as the lowest (D).
  const cap = depth === "established" && !isUS ? ESTIMATE_CAP.non_us_established : ESTIMATE_CAP[depth];
  const estimate = Math.min((general ?? GENERAL_POINTS.D) - ESTIMATE_DISCOUNT, cap);
  if (proxyMean != null) {
    return { status: "ok", strength: round(capSmall((proxyMean + estimate) / 2)), confidence: "partly_rated", depth, grads, share, tier };
  }
  return { status: "ok", strength: round(estimate), confidence: "estimated", depth, grads, share, tier };
}

/**
 * Blend a second direction into the first: 0.75 x s1 + 0.25 x (s2 ?? 40). Pass the second field's score (null or
 * not ok counts as 40). A college that is not offered / has no data in the first field stays that way.
 */
export function combine(s1: FieldScore, s2: FieldScore | null): FieldScore {
  if (s1.status !== "ok" || s1.strength == null) return s1;
  const second = s2?.status === "ok" && s2.strength != null ? s2.strength : SECOND_FIELD_MISSING;
  return { ...s1, strength: round((1 - SECOND_FIELD_WEIGHT) * s1.strength + SECOND_FIELD_WEIGHT * second) };
}

const FIT_BUCKET: Record<FitResult["fit"], Bucket> = { super_reach: "reach", reach: "reach", target: "target", safety: "safety" };

function byStrength<C extends MatchCollege>(a: Rec<C>, b: Rec<C>): number {
  return (
    (b.score.strength ?? -1) - (a.score.strength ?? -1) ||
    tierRank(a.college.general_tier) - tierRank(b.college.general_tier) ||
    a.college.name.localeCompare(b.college.name)
  );
}

export type RecommendInput<C extends MatchCollege> = {
  colleges: C[];
  evidence: Record<string, FieldEvidence>;
  student: StudentProfile;
  fields: [FieldKey, FieldKey?];
  regions?: string[]; // country codes; empty or missing = all
};

export type Recommendation<C extends MatchCollege> = {
  buckets: Record<Bucket, Rec<C>[]>; // strength >= threshold, split by admission chance
  weaker: Rec<C>[]; // offered but below the threshold
  famousNotForField: Rec<C>[]; // general tier A or better that did not make the list
};

export function recommend<C extends MatchCollege>({ colleges, evidence, student, fields, regions }: RecommendInput<C>): Recommendation<C> {
  const [f1, f2] = fields;
  const buckets: Record<Bucket, Rec<C>[]> = { reach: [], target: [], safety: [], unknown: [] };
  const weaker: Rec<C>[] = [];
  const famous: Rec<C>[] = [];
  const famousRank = tierRank("A");
  for (const college of colleges) {
    if (regions?.length && !regions.includes(college.country_code)) continue;
    const ev = evidence[college.slug];
    let score = scoreField(college, ev, f1);
    if (f2 && f2 !== f1) score = combine(score, scoreField(college, ev, f2));
    const fit = computeFit(student, college);
    const rec: Rec<C> = { college, score, fit };
    const passes = score.status === "ok" && score.strength != null && score.strength >= RECOMMEND_THRESHOLD;
    if (passes) buckets[fit ? FIT_BUCKET[fit.fit] : "unknown"].push(rec);
    else if (score.status === "ok") weaker.push(rec);
    if (!passes && tierRank(college.general_tier) <= famousRank) famous.push(rec);
  }
  for (const list of Object.values(buckets)) list.sort(byStrength);
  weaker.sort(byStrength);
  famous.sort((a, b) => tierRank(a.college.general_tier) - tierRank(b.college.general_tier) || a.college.name.localeCompare(b.college.name));
  return { buckets, weaker, famousNotForField: famous.slice(0, FAMOUS_MAX) };
}
