import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { EnglishReqKey } from "./english-fit";
import { programFeeRange, type ProgramFees } from "./tuition";
import type { CollegeDetail, CollegeSummary, Deadline, EnglishSummary, Lookups, SatEstimate, ScoreCode } from "./types";

// Reference data is public (RLS: read-only for anon), so the publishable key is enough.
function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)");
  return createClient(url, key, { auth: { persistSession: false } });
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`Failed to load ${what}: ${res.error.message}`);
  return res.data as T;
}

// College data changes a few times a year, so cache for hours. Pages call these at request
// time (after connection()) so builds never need network access to Supabase.

async function cachedSummaries(): Promise<CollegeSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const res = await supabase().from("college_summary").select("*").order("name");
  return unwrap(res, "colleges");
}

async function cachedCollege(slug: string): Promise<CollegeDetail | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges", `college:${slug}`);
  const res = await supabase()
    .from("institutions")
    .select(
      `id, slug, name, short_name, country_code, state_region, city, setting, control, website, admissions_url,
       undergrad_enrollment, pct_international_ug, student_faculty_ratio, academic_calendar,
       sources(*), admission_stats(*), test_score_percentiles(*), admission_factors(*),
       test_policies(*), application_requirements(*), deadlines(*), english_policies(*),
       english_requirements(*), cost_aid(*), institution_tiers(*), major_admissions(*), programs(*)`,
    )
    .eq("slug", slug)
    .maybeSingle();
  // english_policies is 1:1 (PK = institution_id) so PostgREST returns an object, not an array.
  return unwrap(res, `college ${slug}`) as unknown as CollegeDetail | null;
}

async function cachedDeadlines(): Promise<Deadline[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const res = await supabase().from("deadlines").select("*").order("due_date", { nullsFirst: false });
  return unwrap(res, "deadlines");
}

async function cachedEnglish(): Promise<Record<string, EnglishSummary>> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const db = supabase();
  const [reqs, policies] = await Promise.all([
    db.from("english_requirements").select("institution_id, test_key, status, min_total, min_subscores"),
    db.from("english_policies").select("institution_id, policy"),
  ]);
  const out: Record<string, EnglishSummary> = {};
  const slot = (id: string) => (out[id] ??= { policy: null, toefl: null, toefl2026: null, ielts: null, duolingo: null, tests: {} });
  for (const p of unwrap(policies, "english policies")) slot(p.institution_id).policy = p.policy;
  for (const r of unwrap(reqs, "english requirements")) {
    const s = slot(r.institution_id);
    const min = r.min_total == null ? null : Number(r.min_total);
    s.tests[r.test_key as EnglishReqKey] = { status: r.status, min, subscores: !!r.min_subscores && Object.keys(r.min_subscores).length > 0 };
    const key = ({ TOEFL_IBT: "toefl", TOEFL_IBT_2026: "toefl2026", IELTS: "ielts", DUOLINGO: "duolingo" } as const)[r.test_key as string];
    if (key) s[key] = min;
  }
  return out;
}

// Some colleges publish only SAT section percentiles (no total). Adding the two section values is an
// estimate of the total, so the UI labels it as such.
async function cachedSatEstimates(): Promise<Record<string, SatEstimate>> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const res = await supabase().from("test_score_percentiles").select("institution_id, cds_year, test, p25, p50, p75").in("test", ["SAT_ERW", "SAT_MATH"]);
  const rows = unwrap(res, "SAT section scores");
  const latest = new Map<string, string>();
  for (const r of rows) if (!latest.has(r.institution_id) || r.cds_year > latest.get(r.institution_id)!) latest.set(r.institution_id, r.cds_year);
  const out: Record<string, SatEstimate> = {};
  for (const [id, year] of latest) {
    const erw = rows.find((r) => r.institution_id === id && r.cds_year === year && r.test === "SAT_ERW");
    const math = rows.find((r) => r.institution_id === id && r.cds_year === year && r.test === "SAT_MATH");
    if (!erw || !math || erw.p25 == null || erw.p50 == null || erw.p75 == null || math.p25 == null || math.p50 == null || math.p75 == null) continue;
    out[id] = { p25: erw.p25 + math.p25, p50: erw.p50 + math.p50, p75: erw.p75 + math.p75 };
  }
  return out;
}

/** institution_id → cheapest and dearest international course fee (colleges outside the US charge by course). */
async function cachedProgramFees(): Promise<Record<string, ProgramFees>> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const res = await supabase().from("programs").select("institution_id, intl_fee_gbp, intl_fee_cad, intl_fee_aud");
  const byCollege = new Map<string, { intl_fee_gbp: number | null; intl_fee_cad: number | null; intl_fee_aud: number | null }[]>();
  for (const r of unwrap(res, "course fees")) byCollege.set(r.institution_id, [...(byCollege.get(r.institution_id) ?? []), r]);
  const out: Record<string, ProgramFees> = {};
  for (const [id, rows] of byCollege) {
    const range = programFeeRange(rows);
    if (range) out[id] = range;
  }
  return out;
}

async function cachedScoreCodes(): Promise<ScoreCode[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges", "score-codes");
  const res = await supabase().from("score_codes").select("institution_id, test_key, code, notes, sources(url)");
  type Row = Omit<ScoreCode, "source_url"> & { sources: { url: string } | null };
  return (unwrap(res, "score codes") as unknown as Row[]).map(({ sources, ...r }) => ({ ...r, source_url: sources?.url ?? null }));
}

/** institution_id → application platforms (common_app, uc_app, …), merged over every cycle on file. */
async function cachedPlatforms(): Promise<Record<string, string[]>> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const res = await supabase().from("application_requirements").select("institution_id, platforms");
  const out: Record<string, string[]> = {};
  for (const r of unwrap(res, "application platforms")) out[r.institution_id] = [...new Set([...(out[r.institution_id] ?? []), ...(r.platforms ?? [])])];
  return out;
}

async function cachedLookups(): Promise<Lookups> {
  "use cache";
  cacheLife("days");
  const db = supabase();
  const [categories, tiers, plans, englishTests] = await Promise.all([
    db.from("tier_categories").select("*").order("sort_order"),
    db.from("tiers").select("*").order("sort_order"),
    db.from("application_plans").select("*"),
    db.from("english_tests").select("*"),
  ]);
  return {
    categories: unwrap(categories, "categories"),
    tiers: unwrap(tiers, "tiers"),
    plans: unwrap(plans, "plans"),
    englishTests: unwrap(englishTests, "english tests"),
  };
}

export async function getSummaries() {
  await connection();
  return cachedSummaries();
}

export async function getCollege(slug: string) {
  await connection();
  return cachedCollege(slug);
}

export async function getDeadlines() {
  await connection();
  return cachedDeadlines();
}

export async function getLookups() {
  await connection();
  return cachedLookups();
}

export async function getEnglishSummaries() {
  await connection();
  return cachedEnglish();
}

export async function getSatEstimates() {
  await connection();
  return cachedSatEstimates();
}

export async function getProgramFees() {
  await connection();
  return cachedProgramFees();
}

export async function getPlatforms() {
  await connection();
  return cachedPlatforms();
}

export async function getScoreCodes() {
  await connection();
  return cachedScoreCodes();
}
