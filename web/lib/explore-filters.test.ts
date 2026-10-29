// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  admitRateFor,
  anyFilter,
  clearFilters,
  dayHeading,
  monthDay,
  daysBetween,
  DEFAULT_FILTERS,
  dueGroups,
  dueWithin,
  effectiveFilters,
  filtersToQuery,
  hasIntlAid,
  isNarrowDeadline,
  matchesAdmit,
  medianFor,
  moreFilterCount,
  nextDue,
  nextSort,
  offersField,
  onlyNarrowAhead,
  parseFilters,
  rowMatches,
  sortRows,
  type ExploreFilters,
  type ExploreRow,
  type FilterContext,
} from "./explore-filters.ts";
import { estimatedTuition } from "./tuition.ts";
import type { CollegeSummary } from "./types.ts";

const base: CollegeSummary = {
  id: "1", slug: "alpha", name: "Alpha University", short_name: "Alpha", country_code: "US", state_region: "CA", city: "Palo Alto",
  latitude: null, longitude: null, setting: null, control: "private_nonprofit", undergrad_enrollment: null, pct_international_ug: null,
  general_tier: "A", cds_year: "2024-2025", applicants: null, admits: null, admit_rate: 20, ed_admit_rate: null, intl_admit_rate: 8,
  gpa_avg: null, sat_p25: 1400, sat_p50: 1480, sat_p75: 1540, act_p25: 31, act_p50: 33, act_p75: 35, test_policy: "required",
  english_policy: null, total_coa_usd: null, tuition_usd: 60000, tuition_out_of_state_usd: null, tuition_intl_usd: null,
  intl_aid_policy: "need_aware_full_need", tiers: { computer_science: "S" }, plans: ["EA", "RD"], next_deadline: "2026-11-01",
};

const row = (c: Partial<CollegeSummary> = {}, extra: Partial<ExploreRow> = {}): ExploreRow => {
  const college = { ...base, ...c };
  return {
    c: college,
    fit: null,
    english: { status: "unknown", reason: "no_score" },
    tuition: estimatedTuition(college, true),
    sat: medianFor(college, "sat"),
    act: medianFor(college, "act"),
    admit: admitRateFor(college, false),
    ...extra,
  };
};

const ctx: FilterContext = { evidence: {}, currency: "USD", isUS: true, hasScores: true, hasEnglish: true, applyTags: {} };
const f = (over: Partial<ExploreFilters>): ExploreFilters => ({ ...DEFAULT_FILTERS, ...over });
const params = (q: string) => new URLSearchParams(q);

test("URL round trip keeps every filter and leaves defaults out", () => {
  assert.equal(filtersToQuery(DEFAULT_FILTERS), "");
  const full = f({
    view: "table", region: "GB", q: "tech", fit: ["safety", "target"], field: "computer_science", admitMin: 10, admitMax: 40,
    maxTuition: 30000, intlAid: true, english: true, noSupplements: true, noAppFee: true, category: "engineering", minTier: "B", state: "CA", testPolicy: "optional",
    plan: "ED", sort: { key: "sat", reverse: true }, college: "cu-boulder", due: 30,
  });
  const q = filtersToQuery(full);
  assert.match(q, /fit=target%2Csafety/); // canonical order
  assert.match(q, /sort=-sat/);
  assert.match(q, /(^|&)c=cu-boulder(&|$)/);
  assert.deepEqual(parseFilters(params(q)), { ...full, fit: ["target", "safety"] });
});

test("the open college (?c=) round-trips alone and ignores anything that is not a slug", () => {
  assert.equal(filtersToQuery(f({ college: "stanford" })), "c=stanford");
  assert.equal(parseFilters(params("c=stanford")).college, "stanford");
  assert.equal(parseFilters(params("c=university-of-chicago&view=table")).college, "university-of-chicago");
  for (const junk of ["", "Stanford", "a b", "../x", "-mit", "mit-", "mit--x", "x".repeat(81), "<script>"]) {
    assert.equal(parseFilters(params(`c=${encodeURIComponent(junk)}`)).college, null, junk);
  }
  // Clearing filters keeps the card open; it is not a filter.
  assert.equal(clearFilters(f({ college: "mit", fit: ["safety"] })).college, "mit");
});

test("the when lens (?due=) round-trips 7 and 30 and ignores anything else", () => {
  assert.equal(filtersToQuery(f({ due: 7 })), "due=7");
  assert.equal(parseFilters(params("due=7")).due, 7);
  assert.equal(parseFilters(params("due=30&view=table")).due, 30);
  for (const junk of ["", "0", "14", "-7", "7.5", "seven", "30days"]) assert.equal(parseFilters(params(`due=${junk}`)).due, null, junk);
  // It has its own switch, so "Clear all" leaves it on.
  assert.equal(clearFilters(f({ due: 7, fit: ["safety"] })).due, 7);
});

test("nextDue: the first real deadline on or after today, with its plan and days left", () => {
  const ds = [["2026-11-15", "EA"], ["2026-11-01", "ED"], ["2027-01-05", "RD"], ["2026-10-15", "REA"]] as const;
  assert.deepEqual(nextDue(ds, "2026-10-29"), { date: "2026-11-01", plan: "ED", days: 3 });
  assert.deepEqual(nextDue(ds, "2026-11-01"), { date: "2026-11-01", plan: "ED", days: 0 }); // due today still counts
  assert.deepEqual(nextDue(ds, "2026-11-02"), { date: "2026-11-15", plan: "EA", days: 13 });
  assert.equal(nextDue(ds, "2027-01-06"), null); // all passed
  assert.equal(nextDue(undefined, "2026-10-29"), null);
  assert.equal(nextDue([], "2026-10-29"), null);
  // Two plans on one date: a stable pick (alphabetical), so the chip never flickers between them.
  assert.equal(nextDue([["2026-11-01", "ED"], ["2026-11-01", "EA"]], "2026-10-29")?.plan, "EA");
});

test("nextDue skips narrow deadlines: Longwood's nursing-only ED never beats its general EA", () => {
  const longwood = [["2026-11-01", "ED", 1], ["2026-12-01", "EA", 0]] as const;
  assert.deepEqual(nextDue(longwood, "2026-10-29"), { date: "2026-12-01", plan: "EA", days: 33 });
  assert.equal(onlyNarrowAhead(longwood, "2026-10-29"), false);
  // Only narrow dates ahead: no single next deadline (and the page shows none rather than the narrow one).
  const bfaOnly = [["2026-12-01", "RD", 1]] as const;
  assert.equal(nextDue(bfaOnly, "2026-10-29"), null);
  assert.equal(onlyNarrowAhead(bfaOnly, "2026-10-29"), true);
  assert.equal(onlyNarrowAhead(bfaOnly, "2026-12-02"), false); // passed: nothing ahead at all
  assert.equal(onlyNarrowAhead(undefined, "2026-10-29"), false);
});

test("isNarrowDeadline reads the label (real labels from the deadlines table)", () => {
  const narrow = [
    "Early Decision, nursing applicants only (fall 2027 entry)",
    "Early Action (first-generation college students only)",
    "International spring 2027 application deadline",
    "International spring 2027 (January) application deadline (regular)",
    "Regular Decision, spring 2027 entry",
    "Regular Decision — Drama & Music",
    "Regular Decision (performing arts majors)",
    "Final deadline: Acting (BFA), Comedy Writing and Performance (BFA), Fashion Design (BFA), Musical Theatre (BFA), Performance and Songwriting (BMus)",
    "RD with optional arts portfolio",
  ];
  const general = [
    null,
    "Early Decision (binding)",
    "Early Decision (most majors)",
    "Early Action (non-binding, autumn only)",
    "Early Action (fall 2027 entry); also the final deadline for nursing and the Honors portfolio",
    "Early Action (priority for admission, merit aid and Honors College), fall 2027",
    "Application deadline (summer and autumn quarter)",
    "UBC Vancouver final application deadline (Winter Session 2027/28)",
    "International first-year early action",
    "International applications close - Semester 1, 2027",
  ];
  for (const l of narrow) assert.equal(isNarrowDeadline(l), true, l);
  for (const l of general) assert.equal(isNarrowDeadline(l), false, String(l));
});

test("daysBetween counts calendar days across months, years and DST changes", () => {
  assert.equal(daysBetween("2026-10-29", "2026-10-29"), 0);
  assert.equal(daysBetween("2026-10-29", "2026-11-05"), 7);
  assert.equal(daysBetween("2026-10-31", "2026-11-02"), 2); // US DST ends Nov 1
  assert.equal(daysBetween("2026-12-30", "2027-01-02"), 3);
  assert.equal(daysBetween("2026-11-05", "2026-10-29"), -7);
});

test("dayHeading names the weekday of a calendar date (Nov 1, 2026 is a Sunday)", () => {
  assert.equal(dayHeading("2026-11-01"), "Sun, Nov 1");
  assert.equal(dayHeading("2026-10-31"), "Sat, Oct 31");
  assert.equal(dayHeading("2026-11-15"), "Sun, Nov 15");
  assert.equal(dayHeading("2027-01-01"), "Fri, Jan 1");
  assert.equal(dayHeading("2026-11-01", "zh-TW"), "11月1日（週日）");
  assert.equal(dayHeading("2026-10-31", "zh-TW"), "10月31日（週六）");
  assert.equal(dayHeading("2027-01-01", "zh-TW"), "1月1日（週五）");
});

test("monthDay prints a lens date without the year, in either language", () => {
  assert.equal(monthDay("2026-11-01"), "Nov 1");
  assert.equal(monthDay("2026-12-15", "zh-TW"), "12月15日");
});

test("dueGroups: one heading per deadline day on its first row, with the day's count", () => {
  const due = (date: string, days: number) => ({ date, plan: "EA", days });
  const rows = [
    { k: "a", d: due("2026-10-31", 2) },
    { k: "b", d: due("2026-11-01", 3) },
    { k: "c", d: null },
    { k: "d", d: due("2026-11-01", 3) },
    { k: "e", d: due("2026-11-15", 17) },
  ];
  const g = dueGroups(rows, (r) => r.k, (r) => r.d);
  assert.deepEqual([...g.entries()], [
    ["a", { date: "2026-10-31", days: 2, n: 1 }],
    ["b", { date: "2026-11-01", days: 3, n: 2 }],
    ["e", { date: "2026-11-15", days: 17, n: 1 }],
  ]);
  assert.equal(dueGroups([], (r: { k: string }) => r.k, () => null).size, 0);
});

test("dueWithin: day 0 through the window's last day, inclusive", () => {
  const at = (days: number) => ({ date: "x", plan: "EA", days });
  assert.equal(dueWithin(at(0), 7), true);
  assert.equal(dueWithin(at(7), 7), true);
  assert.equal(dueWithin(at(8), 7), false);
  assert.equal(dueWithin(at(8), 30), true);
  assert.equal(dueWithin(at(30), 30), true);
  assert.equal(dueWithin(at(31), 30), false);
  assert.equal(dueWithin(null, 30), false);
});

test("parseFilters ignores junk", () => {
  const p = parseFilters(params("view=grid&region=FR&fit=maybe,reach&field=undecided&admit=x-200&max=-5&tier=Z&sort=price"));
  assert.equal(p.view, "map");
  assert.equal(p.region, null);
  assert.deepEqual(p.fit, ["reach"]);
  assert.equal(p.field, null);
  assert.deepEqual([p.admitMin, p.admitMax, p.maxTuition, p.minTier], [null, null, null, null]);
  assert.deepEqual(p.sort, { key: "tier", reverse: false });
  // A reversed range is put back in order; an open end is kept.
  assert.deepEqual([parseFilters(params("admit=60-20")).admitMin, parseFilters(params("admit=60-20")).admitMax], [20, 60]);
  assert.deepEqual([parseFilters(params("admit=50-")).admitMin, parseFilters(params("admit=50-")).admitMax], [50, null]);
});

test("medianFor: published median, SAT section estimate, or missing (never 0)", () => {
  assert.deepEqual(medianFor(base, "sat"), { value: 1480, estimated: false, p25: 1400, p75: 1540 });
  assert.deepEqual(medianFor(base, "act"), { value: 33, estimated: false, p25: 31, p75: 35 });
  const noTotal = { ...base, sat_p25: null, sat_p50: null, sat_p75: null };
  assert.deepEqual(medianFor(noTotal, "sat", { p25: 1100, p50: 1200, p75: 1300 }), { value: 1200, estimated: true, p25: 1100, p75: 1300 });
  assert.deepEqual(medianFor(noTotal, "sat"), { value: null, estimated: false, p25: null, p75: null });
  // Range without a median: the range is kept for the cell's hint, the value stays missing.
  assert.equal(medianFor({ ...base, sat_p50: null }, "sat").value, null);
  assert.equal(medianFor({ ...base, sat_p50: null }, "sat").p25, 1400);
});

test("admitRateFor uses the international rate for international students when known", () => {
  assert.equal(admitRateFor(base, true), 8);
  assert.equal(admitRateFor(base, false), 20);
  assert.equal(admitRateFor({ ...base, intl_admit_rate: null }, true), 20);
  assert.equal(admitRateFor({ ...base, admit_rate: null, intl_admit_rate: null }, true), null);
});

test("matchesAdmit: open-ended ranges, and an unknown rate never passes an active range", () => {
  assert.equal(matchesAdmit(20, null, null), true);
  assert.equal(matchesAdmit(null, null, null), true);
  assert.equal(matchesAdmit(20, 10, 40), true);
  assert.equal(matchesAdmit(40, 10, 40), true);
  assert.equal(matchesAdmit(41, 10, 40), false);
  assert.equal(matchesAdmit(5, 10, null), false);
  assert.equal(matchesAdmit(null, 10, null), false);
});

test("fit filter keeps only the chosen labels; colleges without a fit drop out", () => {
  const target = row({}, { fit: { fit: "target", reason: "", parts: { rate: "20", intl: false, score: null, note: null } } });
  assert.equal(rowMatches(target, f({ fit: ["target", "safety"] }), ctx), true);
  assert.equal(rowMatches(target, f({ fit: ["reach"] }), ctx), false);
  assert.equal(rowMatches(row(), f({ fit: ["target"] }), ctx), false);
});

test("field filter uses the /tools/match rule: no graduates = not offered, no evidence = hidden", () => {
  const evidence = { alpha: { total: 2000, grads: { computer_science: 300 }, programFields: [] } };
  const withEv = { ...ctx, evidence };
  assert.equal(offersField(base, evidence.alpha, "computer_science"), true);
  assert.equal(offersField(base, evidence.alpha, "nursing"), false);
  // No IPEDS evidence: a rated subject tier still proves the program; without one the college is hidden (no data).
  assert.equal(offersField(base, undefined, "computer_science"), true);
  assert.equal(offersField(base, undefined, "psychology"), false);
  assert.equal(rowMatches(row(), f({ field: "computer_science" }), withEv), true);
  assert.equal(rowMatches(row(), f({ field: "nursing" }), withEv), false);
});

test("max tuition: same figure as the column, missing tuition never passes", () => {
  assert.equal(rowMatches(row(), f({ maxTuition: 60000 }), ctx), true);
  assert.equal(rowMatches(row(), f({ maxTuition: 50000 }), ctx), false);
  assert.equal(rowMatches(row({ tuition_usd: null }), f({ maxTuition: 70000 }), ctx), false);
});

test("intl aid and English filters", () => {
  assert.equal(hasIntlAid(base), true);
  assert.equal(hasIntlAid({ intl_aid_policy: "none" }), false);
  assert.equal(hasIntlAid({ intl_aid_policy: null }), false);
  assert.equal(rowMatches(row({ intl_aid_policy: "none" }), f({ intlAid: true }), ctx), false);
  assert.equal(rowMatches(row({}, { english: { status: "meets" } }), f({ english: true }), ctx), true);
  assert.equal(rowMatches(row({}, { english: { status: "not_required" } }), f({ english: true }), ctx), true);
  assert.equal(rowMatches(row({}, { english: { status: "below" } }), f({ english: true }), ctx), false);
});

test("no-supplements and no-app-fee filters keep only tagged colleges", () => {
  const tagged = { ...ctx, applyTags: { alpha: ["no_app_fee"] as const } };
  assert.equal(rowMatches(row(), f({ noAppFee: true }), tagged), true);
  assert.equal(rowMatches(row(), f({ noSupplements: true }), tagged), false);
  assert.equal(rowMatches(row(), f({ noAppFee: true }), ctx), false);
  assert.equal(rowMatches(row({ slug: "beta" }), f({ noAppFee: true }), tagged), false);
  assert.equal(moreFilterCount(f({ noSupplements: true, noAppFee: true })), 2);
});

test("search, tier, state, test policy and plan filters", () => {
  assert.equal(rowMatches(row(), f({ q: "palo" }), ctx), true);
  assert.equal(rowMatches(row(), f({ q: "boston" }), ctx), false);
  assert.equal(rowMatches(row(), f({ minTier: "A" }), ctx), true);
  assert.equal(rowMatches(row(), f({ minTier: "A+" }), ctx), false);
  assert.equal(rowMatches(row(), f({ category: "computer_science", minTier: "S" }), ctx), true);
  assert.equal(rowMatches(row(), f({ category: "nursing" }), ctx), false);
  assert.equal(rowMatches(row(), f({ state: "NY" }), ctx), false);
  assert.equal(rowMatches(row(), f({ testPolicy: "optional" }), ctx), false);
  assert.equal(rowMatches(row(), f({ plan: "ED" }), ctx), false);
  assert.equal(rowMatches(row(), f({ plan: "EA" }), ctx), true);
});

test("effectiveFilters drops filters that cannot apply to this viewer or region", () => {
  const all = f({ fit: ["target"], english: true, intlAid: true, testPolicy: "optional", noSupplements: true, noAppFee: true });
  assert.deepEqual(effectiveFilters(all, { isUS: true, hasScores: true, hasEnglish: true }), all);
  const noScores = effectiveFilters(all, { isUS: true, hasScores: false, hasEnglish: false });
  assert.deepEqual([noScores.fit, noScores.english], [[], false]);
  const uk = effectiveFilters(all, { isUS: false, hasScores: true, hasEnglish: true });
  assert.deepEqual([uk.fit, uk.intlAid, uk.testPolicy, uk.english, uk.noSupplements, uk.noAppFee], [[], false, "", true, false, false]);
});

test("filter counts and clear-all", () => {
  assert.equal(anyFilter(DEFAULT_FILTERS), false);
  assert.equal(anyFilter(f({ q: "x" })), false);
  assert.equal(anyFilter(f({ field: "economics" })), true);
  assert.equal(moreFilterCount(f({ admitMin: 10, intlAid: true, state: "CA", fit: ["safety"] })), 3);
  const cleared = clearFilters(f({ view: "table", region: "US", q: "x", fit: ["safety"], maxTuition: 1, sort: { key: "sat", reverse: false } }));
  assert.deepEqual(cleared, f({ view: "table", region: "US", q: "x", sort: { key: "sat", reverse: false } }));
});

test("sortRows: medians high to low by default, missing values last in both directions", () => {
  const rows = [row({ slug: "a", name: "A", sat_p50: 1300 }), row({ slug: "b", name: "B", sat_p50: null, sat_p25: null, sat_p75: null }), row({ slug: "c", name: "C", sat_p50: 1500 })].map((r) => ({
    ...r,
    sat: medianFor(r.c, "sat"),
  }));
  assert.deepEqual(sortRows(rows, { key: "sat", reverse: false }).map((r) => r.c.slug), ["c", "a", "b"]);
  assert.deepEqual(sortRows(rows, { key: "sat", reverse: true }).map((r) => r.c.slug), ["a", "c", "b"]);
});

test("sortRows: tuition cheapest first, tier best first, ties by admit then name", () => {
  const rows = [
    row({ slug: "a", name: "A", tuition_usd: 50000, general_tier: "B" }),
    row({ slug: "b", name: "B", tuition_usd: 30000, general_tier: "S" }),
    row({ slug: "c", name: "C", tuition_usd: null, general_tier: null }),
  ];
  assert.deepEqual(sortRows(rows, { key: "tuition", reverse: false }).map((r) => r.c.slug), ["b", "a", "c"]);
  assert.deepEqual(sortRows(rows, { key: "tier", reverse: false }).map((r) => r.c.slug), ["b", "a", "c"]);
  assert.deepEqual(sortRows(rows, { key: "name", reverse: true }).map((r) => r.c.slug), ["c", "b", "a"]);
});

test("nextSort: a new column starts in its natural direction, the same column flips", () => {
  assert.deepEqual(nextSort({ key: "tier", reverse: false }, "sat"), { key: "sat", reverse: false });
  assert.deepEqual(nextSort({ key: "sat", reverse: false }, "sat"), { key: "sat", reverse: true });
});
