// Official outcomes from the US Department of Education College Scorecard (web/lib/data/outcomes.json, built by
// scripts/build_outcomes.py). Pure: no React, no Next. Every figure comes with the measure's exact name in the UI text.
import { cipContains, countedCips, FIELDS, type FieldDef, type FieldKey } from "./fields.ts";

/** Per college, as the build script writes it. A missing key means Scorecard has no (or a suppressed) value. */
export type CollegeOutcomesRaw = {
  id: number; // UNITID, for the link to the college's Scorecard page
  grad?: number; // whole percent finishing within 150% of normal time
  e10?: number; // median earnings 10 years after starting (US dollars)
  e6?: number; // median earnings 6 years after starting
  f?: Record<string, number[]>; // CIP prefix -> [graduates, sum of program median x graduates]
};

export type OutcomesData = {
  source: string;
  source_url: string;
  released: string; // YYYY-MM-DD
  files: Record<string, string>;
  measures: Record<string, string>;
  colleges: Record<string, CollegeOutcomesRaw>;
};

/** What the college page shows. Null = not published (too few students or not reported). */
export type CollegeOutcomes = {
  scorecardId: number;
  gradRate: number | null;
  earnings10: number | null;
  earnings6: number | null;
};

/** Median earnings for one study field at one college: graduates-weighted average of the programs' medians. */
export type FieldEarnings = { median: number; n: number };

/** Fewer graduates than this behind a field figure: the page says so instead of hiding the number. */
export const FEW_GRADUATES = 30;

/** Cohorts behind the figures, from the Scorecard cohort map (data dictionary, released 2026-10-15). Shown in footnotes. */
export const COHORT = {
  grad: "2018-19", // entering classes of fall 2018 and 2019 (two years pooled, POOLYRS = 2 for every college here)
  e10: "2011-13",
  e6: "2015-17",
  field: "2016-18",
} as const;

/** The 10-year, 6-year and graduation-rate figures of one college; undefined when the file has nothing for it. */
export function collegeOutcomes(data: OutcomesData, slug: string): CollegeOutcomes | undefined {
  const r = data.colleges[slug];
  if (!r) return undefined;
  return { scorecardId: r.id, gradRate: r.grad ?? null, earnings10: r.e10 ?? null, earnings6: r.e6 ?? null };
}

/**
 * Median earnings in a study field from per-prefix [graduates, sum] pairs. Prefixes are combined the way fieldGrads()
 * combines IPEDS counts (a prefix inside another listed prefix is skipped; each exclude is subtracted once). A true
 * median cannot be merged, so with several programs this is the average of their medians weighted by graduates.
 * Null when the college has no published figure for the field.
 */
export function fieldEarnings(f: CollegeOutcomesRaw["f"], field: FieldDef): FieldEarnings | null {
  if (!f || !field.cips.length) return null;
  const counted = countedCips(field);
  let n = 0;
  let sum = 0;
  for (const p of new Set(counted)) {
    const e = f[p];
    if (e) {
      n += e[0];
      sum += e[1];
    }
  }
  for (const ex of new Set(field.exclude ?? [])) {
    const e = f[ex];
    if (e && counted.some((p) => p !== ex && cipContains(p, ex))) {
      n -= e[0];
      sum -= e[1];
    }
  }
  return n > 0 && sum > 0 ? { median: Math.round(sum / n), n } : null;
}

/** Field earnings for every field the college has a figure for (undecided has none). */
export function fieldEarningsFor(data: OutcomesData, slug: string): Partial<Record<FieldKey, FieldEarnings>> {
  const f = data.colleges[slug]?.f;
  const out: Partial<Record<FieldKey, FieldEarnings>> = {};
  if (!f) return out;
  for (const def of FIELDS) {
    const e = fieldEarnings(f, def);
    if (e) out[def.key] = e;
  }
  return out;
}

/** Earnings are shown to the nearest $1,000: Treasury adds noise to the medians (typically $1,000-2,000) and cohorts are small. */
export const roundEarnings = (n: number): number => Math.round(n / 1000) * 1000;

/** "$122,000" (the app shows US dollars in both languages). */
export const formatEarnings = (n: number): string => `$${roundEarnings(n).toLocaleString("en-US")}`;

/** Link to the college's own Scorecard page. */
export const scorecardUrl = (id: number): string => `https://collegescorecard.ed.gov/school/?${id}`;
