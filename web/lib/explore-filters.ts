// Filters, sorting and URL state for the Explore page (/colleges): the map list and the table share them. Pure.
// The URL holds the whole state, so a filtered table can be bookmarked or shared.
import type { ApplyTag } from "./apply-tags.ts";
import { englishOk, type EnglishFit } from "./english-fit.ts";
import { scoreField, type FieldEvidence } from "./field-match.ts";
import { fieldByKey, type FieldKey } from "./fields.ts";
import type { Fit, FitResult } from "./fit.ts";
import { isRegion, type RegionCode } from "./regions.ts";
import { tierRank, TIER_ORDER } from "./tiers.ts";
import { withinBudget, type Currency, type TuitionEstimate } from "./tuition.ts";
import type { CollegeSummary, SatEstimate, TierCode } from "./types.ts";

export const FITS: Fit[] = ["super_reach", "reach", "target", "safety"];

/** Aid policies that give internationals any institutional aid (the "Aid for internationals" filter). */
export const INTL_AID_POLICIES = ["need_blind_full_need", "need_aware_full_need", "need_aware_limited", "merit_only"];

export type SortKey = "tier" | "admit" | "name" | "deadline" | "sat" | "act" | "tuition";
/** Each sort's natural direction; `reverse` flips it. Missing values always go last. */
export const SORT_DESC: Record<SortKey, boolean> = { tier: false, admit: false, name: false, deadline: false, sat: true, act: true, tuition: false };
export type SortState = { key: SortKey; reverse: boolean };

export type ExploreFilters = {
  view: "map" | "table";
  region: RegionCode | null; // null = follow the student's first target region
  q: string;
  fit: Fit[];
  field: FieldKey | null;
  admitMin: number | null; // percent, inclusive
  admitMax: number | null;
  maxTuition: number | null; // per year, in the region's currency
  intlAid: boolean;
  english: boolean; // meets my English score
  noSupplements: boolean; // lib/apply-tags.ts
  noAppFee: boolean;
  category: string; // tier category; "general" = overall
  minTier: TierCode | null;
  state: string;
  testPolicy: string;
  plan: string;
  sort: SortState;
};

export const DEFAULT_FILTERS: ExploreFilters = {
  view: "map",
  region: null,
  q: "",
  fit: [],
  field: null,
  admitMin: null,
  admitMax: null,
  maxTuition: null,
  intlAid: false,
  english: false,
  noSupplements: false,
  noAppFee: false,
  category: "general",
  minTier: null,
  state: "",
  testPolicy: "",
  plan: "",
  sort: { key: "tier", reverse: false },
};

/** Steps offered by the admit-rate range selects. */
export const ADMIT_STEPS = [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90];

type Params = { get(name: string): string | null };

const SORT_KEYS = Object.keys(SORT_DESC) as SortKey[];
const pct = (v: string | null): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

export function parseFilters(sp: Params): ExploreFilters {
  const f: ExploreFilters = { ...DEFAULT_FILTERS, sort: { ...DEFAULT_FILTERS.sort } };
  if (sp.get("view") === "table") f.view = "table";
  const region = sp.get("region");
  if (isRegion(region)) f.region = region;
  f.q = sp.get("q") ?? "";
  f.fit = FITS.filter((k) => (sp.get("fit") ?? "").split(",").includes(k));
  const field = sp.get("field");
  if (field && field !== "undecided" && fieldByKey(field)) f.field = field as FieldKey;
  const [lo, hi] = (sp.get("admit") ?? "").split("-");
  f.admitMin = pct(lo ?? null);
  f.admitMax = pct(hi ?? null);
  if (f.admitMin != null && f.admitMax != null && f.admitMin > f.admitMax) [f.admitMin, f.admitMax] = [f.admitMax, f.admitMin];
  const max = Number(sp.get("max"));
  f.maxTuition = sp.get("max") && Number.isFinite(max) && max > 0 ? max : null;
  f.intlAid = sp.get("aid") === "1";
  f.english = sp.get("eng") === "1";
  f.noSupplements = sp.get("nosupp") === "1";
  f.noAppFee = sp.get("nofee") === "1";
  f.category = sp.get("cat") || "general";
  const tier = sp.get("tier");
  f.minTier = tier && (TIER_ORDER as string[]).includes(tier) ? (tier as TierCode) : null;
  f.state = sp.get("state") ?? "";
  f.testPolicy = sp.get("test") ?? "";
  f.plan = sp.get("plan") ?? "";
  const sort = sp.get("sort") ?? "";
  const key = sort.replace(/^-/, "") as SortKey;
  if (SORT_KEYS.includes(key)) f.sort = { key, reverse: sort.startsWith("-") };
  return f;
}

/** The query string for the filters, defaults left out (so the bare page URL stays clean). */
export function filtersToQuery(f: ExploreFilters): string {
  const p = new URLSearchParams();
  if (f.view !== "map") p.set("view", f.view);
  if (f.region) p.set("region", f.region);
  if (f.q.trim()) p.set("q", f.q);
  if (f.fit.length) p.set("fit", FITS.filter((k) => f.fit.includes(k)).join(","));
  if (f.field) p.set("field", f.field);
  if (f.admitMin != null || f.admitMax != null) p.set("admit", `${f.admitMin ?? ""}-${f.admitMax ?? ""}`);
  if (f.maxTuition != null) p.set("max", String(f.maxTuition));
  if (f.intlAid) p.set("aid", "1");
  if (f.english) p.set("eng", "1");
  if (f.noSupplements) p.set("nosupp", "1");
  if (f.noAppFee) p.set("nofee", "1");
  if (f.category !== "general") p.set("cat", f.category);
  if (f.minTier) p.set("tier", f.minTier);
  if (f.state) p.set("state", f.state);
  if (f.testPolicy) p.set("test", f.testPolicy);
  if (f.plan) p.set("plan", f.plan);
  if (f.sort.key !== "tier" || f.sort.reverse) p.set("sort", `${f.sort.reverse ? "-" : ""}${f.sort.key}`);
  return p.toString();
}

// ───────────── Per-college values the filters and columns share ─────────────

export type Median = { value: number | null; estimated: boolean; p25: number | null; p75: number | null };

/** SAT/ACT median. SAT falls back to the sum of the section medians (an estimate, shown with ≈). */
export function medianFor(c: Pick<CollegeSummary, "sat_p25" | "sat_p50" | "sat_p75" | "act_p25" | "act_p50" | "act_p75">, test: "sat" | "act", sat?: SatEstimate): Median {
  const n = (v: number | null) => (v == null ? null : Number(v));
  if (test === "act") return { value: n(c.act_p50), estimated: false, p25: n(c.act_p25), p75: n(c.act_p75) };
  if (c.sat_p50 != null) return { value: n(c.sat_p50), estimated: false, p25: n(c.sat_p25), p75: n(c.sat_p75) };
  if (sat) return { value: sat.p50, estimated: true, p25: n(c.sat_p25) ?? sat.p25, p75: n(c.sat_p75) ?? sat.p75 };
  return { value: null, estimated: false, p25: n(c.sat_p25), p75: n(c.sat_p75) };
}

/** The admit rate the student is compared on: the international one when they are international and it is known (as lib/fit.ts). */
export const admitRateFor = (c: Pick<CollegeSummary, "admit_rate" | "intl_admit_rate">, international: boolean): number | null =>
  international && c.intl_admit_rate != null ? Number(c.intl_admit_rate) : c.admit_rate == null ? null : Number(c.admit_rate);

/** Everything a row needs, computed once per college. */
export type ExploreRow = {
  c: CollegeSummary;
  fit: FitResult | null;
  english: EnglishFit;
  tuition: TuitionEstimate;
  sat: Median;
  act: Median;
  admit: number | null;
};

export type FilterContext = {
  evidence: Record<string, FieldEvidence>;
  currency: Currency; // the region's currency (max tuition is in it)
  isUS: boolean; // fit labels exist only for US colleges
  hasScores: boolean; // fit filter needs SAT/ACT
  hasEnglish: boolean; // English filter needs an English score
  applyTags: Record<string, readonly ApplyTag[]>; // by slug, only colleges that have one
};

/** Drops filters that cannot apply to this viewer or region (e.g. a shared link with a fit filter, opened by someone with no scores). */
export function effectiveFilters(f: ExploreFilters, ctx: Pick<FilterContext, "isUS" | "hasScores" | "hasEnglish">): ExploreFilters {
  return {
    ...f,
    fit: ctx.isUS && ctx.hasScores ? f.fit : [],
    english: ctx.hasEnglish ? f.english : false,
    intlAid: ctx.isUS ? f.intlAid : false,
    testPolicy: ctx.isUS ? f.testPolicy : "",
    // Supplements and fees are researched for US colleges only.
    noSupplements: ctx.isUS ? f.noSupplements : false,
    noAppFee: ctx.isUS ? f.noAppFee : false,
  };
}

export const tierFor = (c: Pick<CollegeSummary, "general_tier" | "tiers">, category: string): TierCode | null =>
  (category === "general" ? c.general_tier : c.tiers?.[category]) ?? null;

/** Offers the field by the /tools/match rule (lib/field-match.ts): no graduates in it = not offered, no data = not shown. */
export const offersField = (c: CollegeSummary, evidence: FieldEvidence | undefined, field: FieldKey): boolean =>
  scoreField(c, evidence, field).status === "ok";

export function matchesSearch(c: Pick<CollegeSummary, "name" | "short_name" | "city" | "state_region">, q: string): boolean {
  const term = q.trim().toLowerCase();
  return !term || `${c.name} ${c.short_name ?? ""} ${c.city ?? ""} ${c.state_region ?? ""}`.toLowerCase().includes(term);
}

export function matchesAdmit(rate: number | null, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true;
  if (rate == null) return false;
  return (min == null || rate >= min) && (max == null || rate <= max);
}

export const hasIntlAid = (c: Pick<CollegeSummary, "intl_aid_policy">): boolean => INTL_AID_POLICIES.includes(c.intl_aid_policy ?? "");

/** Pass `effectiveFilters(...)`. */
export function rowMatches(r: ExploreRow, f: ExploreFilters, ctx: FilterContext): boolean {
  const c = r.c;
  if (!matchesSearch(c, f.q)) return false;
  if (f.fit.length && !(r.fit && f.fit.includes(r.fit.fit))) return false;
  if (f.field && !offersField(c, ctx.evidence[c.slug], f.field)) return false;
  if (!matchesAdmit(r.admit, f.admitMin, f.admitMax)) return false;
  if (!withinBudget(r.tuition, f.maxTuition, ctx.currency)) return false;
  if (f.intlAid && !hasIntlAid(c)) return false;
  if (f.english && !englishOk(r.english)) return false;
  if (f.noSupplements && !ctx.applyTags[c.slug]?.includes("no_supplements")) return false;
  if (f.noAppFee && !ctx.applyTags[c.slug]?.includes("no_app_fee")) return false;
  const tier = tierFor(c, f.category);
  if (f.category !== "general" && !tier) return false;
  if (f.minTier && (!tier || tierRank(tier) > tierRank(f.minTier))) return false;
  if (f.state && c.state_region !== f.state) return false;
  if (f.testPolicy && c.test_policy !== f.testPolicy) return false;
  if (f.plan && !(c.plans ?? []).includes(f.plan)) return false;
  return true;
}

/** How many filters behind "More filters" are on (shown on its button). */
export function moreFilterCount(f: ExploreFilters): number {
  return [
    f.admitMin != null || f.admitMax != null,
    f.intlAid,
    f.english,
    f.noSupplements,
    f.noAppFee,
    f.category !== "general",
    !!f.minTier,
    !!f.state,
    !!f.testPolicy,
    !!f.plan,
  ].filter(Boolean).length;
}

/** Any filter on at all (search excluded: it has its own clear button). */
export const anyFilter = (f: ExploreFilters): boolean => f.fit.length > 0 || !!f.field || f.maxTuition != null || moreFilterCount(f) > 0;

/** Clears every filter, keeping the view, region, search and sort. */
export const clearFilters = (f: ExploreFilters): ExploreFilters => ({ ...DEFAULT_FILTERS, view: f.view, region: f.region, q: f.q, sort: f.sort });

function sortValue(r: ExploreRow, key: SortKey, category: string): number | string | null {
  switch (key) {
    case "tier": {
      const t = tierFor(r.c, category);
      return t ? tierRank(t) : null;
    }
    case "admit":
      return r.admit;
    case "name":
      return r.c.name;
    case "deadline":
      return r.c.next_deadline;
    case "sat":
      return r.sat.value;
    case "act":
      return r.act.value;
    case "tuition":
      return r.tuition.amount;
  }
}

/** Sorted copy. Missing values always last; ties fall back to tier, then admit rate, then name. */
export function sortRows(rows: ExploreRow[], sort: SortState, category = "general"): ExploreRow[] {
  const desc = SORT_DESC[sort.key] !== sort.reverse;
  const cmp = (a: number | string | null, b: number | string | null, flip: boolean) => {
    if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
    const d = typeof a === "string" ? a.localeCompare(String(b)) : a - (b as number);
    return flip ? -d : d;
  };
  return [...rows].sort(
    (a, b) =>
      cmp(sortValue(a, sort.key, category), sortValue(b, sort.key, category), desc) ||
      cmp(sortValue(a, "tier", category), sortValue(b, "tier", category), false) ||
      cmp(a.admit, b.admit, false) ||
      a.c.name.localeCompare(b.c.name),
  );
}

/** Next sort when a column header is clicked: a new column starts in its natural direction, the same one flips. */
export const nextSort = (current: SortState, key: SortKey): SortState => (current.key === key ? { key, reverse: !current.reverse } : { key, reverse: false });
