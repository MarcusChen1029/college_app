// Does the student's English test score meet a college's published minimum? Pure (no React, no Supabase).
// TOEFL has two scales: the old iBT 0-120 and the band 1-6 scale used from 21 Jan 2026. They are never converted:
// an old-scale score is only compared with an old-scale minimum, a band score only with a band minimum.
import type { EnglishScore, EnglishTestKey } from "./scores.ts";

/** Test keys as stored in public.english_tests / english_requirements. */
export type EnglishReqKey = "TOEFL_IBT" | "TOEFL_IBT_2026" | "IELTS" | "DUOLINGO" | "PTE" | "CAMBRIDGE";

/** english_requirements.status. Only the two *_option values satisfy the requirement on their own. */
export type EnglishReqStatus = "required_option" | "recommended_option" | "accepted" | "not_accepted";

export type EnglishReq = { status: string; min: number | null; subscores: boolean };

/** What the college publishes: english_policies.policy and one row per test. */
export type CollegeEnglish = { policy: string | null; tests: Partial<Record<EnglishReqKey, EnglishReq>> };

/** The student's English test scores (profile.tests.english). */
export type StudentEnglish = Partial<Record<EnglishTestKey, EnglishScore>> | undefined;

export type EnglishFitStatus = "meets" | "below" | "not_required" | "waivable" | "unknown";

/** Why the status is `unknown` (or what the `waivable` comparison was missing). */
export type EnglishUnknownReason =
  | "no_score" // the student has no English score
  | "no_data" // the college publishes nothing on English tests
  | "scale_mismatch" // e.g. old-scale TOEFL score, college lists only the 1-6 band minimum
  | "not_accepted" // the college does not accept the student's tests (or only as a supplement)
  | "no_minimum" // the test is accepted but no minimum is published
  | "not_listed"; // the college lists other tests, not the student's

export type EnglishFit = {
  status: EnglishFitStatus;
  /** The comparison the status rests on (meets / below / waivable with a score). */
  test?: EnglishTestKey;
  score?: number;
  min?: number;
  /** The college also sets section minimums, which this check does not cover. */
  subscores?: boolean;
  reason?: EnglishUnknownReason;
};

/** Student test -> the one college key it may be compared with. Never across TOEFL scales. */
export const STUDENT_TO_REQ: Record<EnglishTestKey, EnglishReqKey> = {
  toefl: "TOEFL_IBT",
  toefl_band: "TOEFL_IBT_2026",
  ielts: "IELTS",
  duolingo: "DUOLINGO",
  pte: "PTE",
  cambridge: "CAMBRIDGE",
};

/** Short names for the UI (test names are not translated). */
export const ENGLISH_TEST_SHORT: Record<EnglishTestKey, string> = {
  toefl: "TOEFL",
  toefl_band: "TOEFL (1–6)",
  ielts: "IELTS",
  duolingo: "Duolingo",
  pte: "PTE",
  cambridge: "Cambridge",
};

const SATISFIES = new Set<string>(["required_option", "recommended_option"]);
const ORDER = Object.keys(STUDENT_TO_REQ) as EnglishTestKey[];

/** The student's English totals, in a fixed order, skipping tests without a total. */
export function studentEnglishScores(english: StudentEnglish): { test: EnglishTestKey; score: number }[] {
  return ORDER.flatMap((test) => {
    const total = english?.[test]?.total;
    return total != null && Number.isFinite(total) ? [{ test, score: total }] : [];
  });
}

export const hasEnglishScore = (english: StudentEnglish): boolean => studentEnglishScores(english).length > 0;

export function englishFit(student: StudentEnglish, college: CollegeEnglish | null | undefined): EnglishFit {
  const tests = college?.tests ?? {};
  const listed = Object.keys(tests).length > 0;
  if (!college || (!college.policy && !listed)) return { status: "unknown", reason: "no_data" };
  if (college.policy === "not_required") return { status: "not_required" };

  const scores = studentEnglishScores(student);
  if (scores.length === 0) return college.policy === "recommended" ? { status: "waivable", reason: "no_score" } : { status: "unknown", reason: "no_score" };

  type Cmp = { test: EnglishTestKey; score: number; min: number; subscores: boolean; gap: number };
  const comparable: Cmp[] = [];
  const reasons = new Set<EnglishUnknownReason>();
  for (const { test, score } of scores) {
    const req = tests[STUDENT_TO_REQ[test]];
    if (!req) {
      // Only the other TOEFL scale is listed: say so instead of guessing a conversion.
      const otherToefl = test === "toefl" ? tests.TOEFL_IBT_2026 : test === "toefl_band" ? tests.TOEFL_IBT : undefined;
      reasons.add(otherToefl && SATISFIES.has(otherToefl.status) ? "scale_mismatch" : "not_listed");
      continue;
    }
    if (!SATISFIES.has(req.status)) {
      reasons.add("not_accepted");
      continue;
    }
    if (req.min == null) {
      reasons.add("no_minimum");
      continue;
    }
    // Relative gap so tests on different scales can be ranked against each other.
    comparable.push({ test, score, min: req.min, subscores: req.subscores, gap: (score - req.min) / req.min });
  }

  const pick = (c: Cmp, status: EnglishFitStatus): EnglishFit => ({ status, test: c.test, score: c.score, min: c.min, subscores: c.subscores });
  const best = [...comparable].sort((a, b) => b.gap - a.gap)[0];
  if (best && best.gap >= 0) return pick(best, "meets");
  // The college only recommends a test: a lower (or no comparable) score does not rule the student out.
  if (college.policy === "recommended") return best ? pick(best, "waivable") : { status: "waivable", reason: firstReason(reasons) };
  if (best) return pick(best, "below");
  return { status: "unknown", reason: firstReason(reasons) };
}

// Most useful explanation first: a scale mismatch is actionable, "not listed" is the weakest.
const REASON_ORDER: EnglishUnknownReason[] = ["scale_mismatch", "no_minimum", "not_accepted", "not_listed"];
const firstReason = (r: Set<EnglishUnknownReason>): EnglishUnknownReason => REASON_ORDER.find((x) => r.has(x)) ?? "not_listed";

/** Builds the college side from the full college page data (english_policies + english_requirements). */
export function collegeEnglishFrom(
  policy: { policy: string } | null | undefined,
  reqs: { test_key: string; status: string; min_total: number | null; min_subscores: Record<string, number> | null }[],
): CollegeEnglish {
  const tests: CollegeEnglish["tests"] = {};
  for (const r of reqs) {
    tests[r.test_key as EnglishReqKey] = {
      status: r.status,
      min: r.min_total == null ? null : Number(r.min_total),
      subscores: !!r.min_subscores && Object.keys(r.min_subscores).length > 0,
    };
  }
  return { policy: policy?.policy ?? null, tests };
}

/** "Meets my English score" filter: the score clears the minimum, or no test is needed at all. */
export const englishOk = (f: EnglishFit): boolean => f.status === "meets" || f.status === "not_required";
