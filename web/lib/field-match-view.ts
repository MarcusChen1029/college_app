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
  ibText: string | null; // the IB offer's first clause when no points total is published ("30-33 is required for consideration")
  atar: number | null; // Australia
};

// Three or four A-level grades (A* counts as one), optionally "to" a second set: "A*AA", "A*A*A to AAA", "A*A*A* down to AAB".
const GRADES = /(?<![A-Za-z])((?:A\*|[A-E]){3,4})(?:\s*(?:down\s+to|to|-|–)\s*((?:A\*|[A-E]){3,4}))?(?![A-Za-z])/;

/** The A-level grades in a published offer ("A*AA, with A* in Maths" -> "A*AA"; "A-Levels A*AA to ABB (...)" ->
 *  "A*AA–ABB"; "A*A*A* down to AAB" -> "A*A*A*–AAB"); null when the offer states no grades (a points score, say). */
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

const SUMMARY_MAX = 72;

/** An IB offer's first sentence, for a course that publishes no points total. Bracketed asides are detail and go whole
 *  ("Range from 43 points (777 at HL) down to 34 points (665 at HL), with HL Maths" -> "Range from 43 points down to 34
 *  points, with HL Maths"), so a cut never lands inside one; a sentence still too long ends at its last comma that fits,
 *  with "…". Null when the text says nothing is published ("No IB points total published. ...") or there is none. */
export function ibSummary(offer: string | null | undefined): string | null {
  let text = offer?.trim() ?? "";
  if (!text || /^no\b/i.test(text)) return null;
  for (let prev = ""; prev !== text; ) [prev, text] = [text, text.replace(/\s*\([^()]*\)/g, "")];
  const first = text.split(/;|\.\s/)[0].trim().replace(/\.$/, "");
  if (first.length <= SUMMARY_MAX) return first;
  const cut = first.slice(0, SUMMARY_MAX);
  const at = cut.lastIndexOf(",") > 20 ? cut.lastIndexOf(",") : cut.lastIndexOf(" ");
  return `${cut.slice(0, at).trimEnd()}…`;
}

/** One course's offer in a short phrase, "A-level A*AA · IB 39"; null when it publishes none of the three. */
export function courseOffer(c: Pick<MatchCourse, "aLevel" | "ib" | "ibText" | "atar">): string | null {
  const ib = c.ib != null ? `IB ${c.ib}` : c.ibText ? (/\bIB\b/.test(c.ibText) ? c.ibText : `IB ${c.ibText}`) : null;
  const parts = [c.aLevel && `A-level ${c.aLevel}`, ib, c.atar != null && `ATAR ${c.atar}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** A college row's offer while no field is chosen: `text` when it holds for every course shown, `varies` when the courses
 *  publish different things, null when none publishes an offer. */
export type OfferSummary = { text: string } | { varies: true };

/** A course's name without its faculty or campus note: "Mechanical Engineering BASc (Faculty of ...)" -> "Mechanical Engineering BASc". */
export const courseLabel = (name: string): string => name.split(" (")[0].trim();

/** What can be said about a college's offers as a whole. A measure (A-level, IB, ATAR) is summarised only when every course
 *  shown publishes it, so the range is true of each of them ("A-level A*A*A–AAA · IB 33–39"); IB words count only when every
 *  course has the same ones. When only one course publishes a number, the offer is named with its course ("Medicine: A-level
 *  AAA"). Anything else is `varies`: the row never lends one course's offer to the others. */
export function offerRange(courses: readonly MatchCourse[]): OfferSummary | null {
  if (!courses.length) return null;
  const span = (lo: number, hi: number) => (lo === hi ? String(lo) : `${lo}–${hi}`);
  const every = <T,>(pick: (c: MatchCourse) => T | null): T[] | null => {
    const values = courses.map(pick);
    return values.every((v) => v != null) ? (values as T[]) : null;
  };
  const grades = every((c) => c.aLevel)
    ?.flatMap((g) => g.split("–"))
    .sort((a, b) => gradeScore(b) - gradeScore(a));
  const ib = every((c) => c.ib);
  const ibWords = every((c) => (c.ib == null ? c.ibText : null));
  const sameWords = ibWords && new Set(ibWords).size === 1 ? ibWords[0] : null;
  const atar = every((c) => c.atar);
  const parts = [
    grades && `A-level ${grades[0] === grades[grades.length - 1] ? grades[0] : `${grades[0]}–${grades[grades.length - 1]}`}`,
    ib ? `IB ${span(Math.min(...ib), Math.max(...ib))}` : sameWords && (/\bIB\b/.test(sameWords) ? sameWords : `IB ${sameWords}`),
    atar && `ATAR ${span(Math.min(...atar), Math.max(...atar))}`,
  ].filter(Boolean);
  if (parts.length) return { text: parts.join(" · ") };

  const published = courses.filter((c) => courseOffer(c) != null);
  if (!published.length) return null;
  const only = published.length === 1 ? published[0] : null;
  // Named with its course only when the offer is a number or grades (short and exact); one course's words say "varies".
  if (only && !(only.ib == null && only.ibText)) return { text: `${courseLabel(only.name)}: ${courseOffer(only)}` };
  return { varies: true };
}
