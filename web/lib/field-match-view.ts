// What the /tools/match page needs on top of field-match.ts: the compact college row sent to the browser, and
// the message keys that explain a score. Pure; the component turns the keys into text.
import type { FieldScore, MatchCollege } from "./field-match.ts";
import type { FieldKey } from "./fields.ts";
import type { MessageKey } from "./i18n/en.ts";
import type { CollegeSummary } from "./types.ts";

/** The columns the page uses, so the whole summary is not sent to the browser. */
export type MatchRow = MatchCollege & { short_name: string | null };

export const toMatchRow = (c: CollegeSummary): MatchRow => ({
  slug: c.slug,
  name: c.name,
  short_name: c.short_name,
  country_code: c.country_code,
  general_tier: c.general_tier,
  tiers: c.tiers,
  admit_rate: c.admit_rate,
  intl_admit_rate: c.intl_admit_rate,
  sat_p25: c.sat_p25,
  sat_p75: c.sat_p75,
  act_p25: c.act_p25,
  act_p75: c.act_p75,
  test_policy: c.test_policy,
});

export type Reason = { key: MessageKey; vars?: Record<string, number> };

/** Why a college is not in the ranked list for the field (not offered, no data, small program, or just weak). */
export function reasonFor(score: FieldScore): Reason {
  if (score.status === "not_offered") return { key: "match.reason.notOffered" };
  if (score.status === "no_data") return { key: "match.reason.noData" };
  if (score.depth === "small" && score.grads != null && score.grads > 0) return { key: "match.reason.small", vars: { n: score.grads } };
  return { key: "match.reason.weak", vars: { n: score.strength ?? 0 } };
}

/** One course of a university that admits by course (UK, Canada, Australia), as the match page shows it: the fields its
 *  name matches (lib/fields.ts programFields) and its entry offer cut down to a few characters. The full offer text from
 *  the programs table rides along for the tooltip. */
export type MatchCourse = {
  name: string;
  fields: FieldKey[];
  aLevel: string | null; // "A*AA" or "A*AA–ABB"
  ib: number | null; // IB points
  atar: number | null; // Australia
  full: string; // the published offer text, for a tooltip
};

// Three or four A-level grades (A* counts as one), optionally "to" a second set: "A*AA", "A*A*A to AAA".
const GRADES = /(?<![A-Za-z])((?:A\*|[A-E]){3,4})(?:\s*(?:to|-|–)\s*((?:A\*|[A-E]){3,4}))?(?![A-Za-z])/;

/** The A-level grades in a published offer ("A*AA, with A* in Maths" -> "A*AA"; "A-Levels A*AA to ABB (...)" ->
 *  "A*AA–ABB"); null when the offer states no grades (a points score, say). */
export function aLevelGrades(offer: string | null | undefined): string | null {
  const m = offer ? GRADES.exec(offer) : null;
  if (!m) return null;
  return m[2] ? `${m[1]}–${m[2]}` : m[1];
}

const GRADE_POINTS: Record<string, number> = { "A*": 6, A: 5, B: 4, C: 3, D: 2, E: 1 };
/** A grade string's weight, to order offers from hardest to easiest ("A*A*A" > "AAA" > "ABB"). */
export function gradeScore(grades: string): number {
  return (grades.match(/A\*|[A-E]/g) ?? []).reduce((n, g) => n + GRADE_POINTS[g], 0);
}

/** One course's offer in a short phrase, "A-level A*AA · IB 39"; null when it publishes none of the three. */
export function courseOffer(c: Pick<MatchCourse, "aLevel" | "ib" | "atar">): string | null {
  const parts = [c.aLevel && `A-level ${c.aLevel}`, c.ib != null && `IB ${c.ib}`, c.atar != null && `ATAR ${c.atar}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** The spread of offers across a college's courses, "A-level A*A*A–AAA · IB 33–39"; null when none is published. */
export function offerRange(courses: readonly MatchCourse[]): string | null {
  const span = (lo: number, hi: number) => (lo === hi ? String(lo) : `${lo}–${hi}`);
  const grades = courses.flatMap((c) => (c.aLevel ? c.aLevel.split("–") : [])).sort((a, b) => gradeScore(b) - gradeScore(a));
  const ib = courses.flatMap((c) => (c.ib != null ? [c.ib] : []));
  const atar = courses.flatMap((c) => (c.atar != null ? [c.atar] : []));
  const parts = [
    grades.length && `A-level ${grades[0] === grades[grades.length - 1] ? grades[0] : `${grades[0]}–${grades[grades.length - 1]}`}`,
    ib.length && `IB ${span(Math.min(...ib), Math.max(...ib))}`,
    atar.length && `ATAR ${span(Math.min(...atar), Math.max(...atar))}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
