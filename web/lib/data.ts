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

// The API returns at most 1000 rows per request, and deadlines, English requirements and score codes are past that.
// Bulk reads page through with range(); each `page` must order by a unique key so pages neither overlap nor skip rows.
const PAGE = 1000;
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(await page(from, from + PAGE - 1), what);
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// College data changes a few times a year, so cache for hours. Pages call these at request
// time (after connection()) so builds never need network access to Supabase.

async function cachedSummaries(): Promise<CollegeSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const db = supabase();
  return allRows((from, to) => db.from("college_summary").select("*").order("name").order("slug").range(from, to), "colleges");
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
  const db = supabase();
  return allRows((from, to) => db.from("deadlines").select("*").order("due_date", { nullsFirst: false }).order("id").range(from, to), "deadlines");
}

async function cachedEnglish(): Promise<Record<string, EnglishSummary>> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const db = supabase();
  const [reqs, policies] = await Promise.all([
    allRows(
      (from, to) => db.from("english_requirements").select("institution_id, test_key, status, min_total, min_subscores").order("institution_id").order("test_key").range(from, to),
      "english requirements",
    ),
    allRows((from, to) => db.from("english_policies").select("institution_id, policy").order("institution_id").range(from, to), "english policies"),
  ]);
  const out: Record<string, EnglishSummary> = {};
  const slot = (id: string) => (out[id] ??= { policy: null, toefl: null, toefl2026: null, ielts: null, duolingo: null, tests: {} });
  for (const p of policies) slot(p.institution_id).policy = p.policy;
  for (const r of reqs) {
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
  const db = supabase();
  const rows = await allRows(
    (from, to) =>
      db.from("test_score_percentiles").select("institution_id, cds_year, test, p25, p50, p75").in("test", ["SAT_ERW", "SAT_MATH"]).order("institution_id").order("cds_year").order("test").range(from, to),
    "SAT section scores",
  );
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
  const db = supabase();
  const fees = await allRows((from, to) => db.from("programs").select("institution_id, intl_fee_gbp, intl_fee_cad, intl_fee_aud").order("id").range(from, to), "course fees");
  const byCollege = new Map<string, { intl_fee_gbp: number | null; intl_fee_cad: number | null; intl_fee_aud: number | null }[]>();
  for (const r of fees) byCollege.set(r.institution_id, [...(byCollege.get(r.institution_id) ?? []), r]);
  const out: Record<string, ProgramFees> = {};
  for (const [id, rows] of byCollege) {
    const range = programFeeRange(rows);
    if (range) out[id] = range;
  }
  return out;
}

/** institution_id → the latest cycle's application fee in USD (null = not published). */
async function cachedAppFees(): Promise<Record<string, number | null>> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const db = supabase();
  const rows = await allRows(
    (from, to) => db.from("application_requirements").select("institution_id, cycle, app_fee_usd").order("institution_id").order("cycle").range(from, to),
    "application fees",
  );
  // Ordered by cycle, so the last row per college wins.
  const out: Record<string, number | null> = {};
  for (const r of rows) out[r.institution_id] = r.app_fee_usd == null ? null : Number(r.app_fee_usd);
  return out;
}

async function cachedScoreCodes(): Promise<ScoreCode[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges", "score-codes");
  const db = supabase();
  const rows = await allRows(
    (from, to) => db.from("score_codes").select("institution_id, test_key, code, notes, sources(url)").order("institution_id").order("test_key").range(from, to),
    "score codes",
  );
  type Row = Omit<ScoreCode, "source_url"> & { sources: { url: string } | null };
  return (rows as unknown as Row[]).map(({ sources, ...r }) => ({ ...r, source_url: sources?.url ?? null }));
}

/** institution_id → application platforms (common_app, uc_app, …), merged over every cycle on file. */
async function cachedPlatforms(): Promise<Record<string, string[]>> {
  "use cache";
  cacheLife("hours");
  cacheTag("colleges");
  const db = supabase();
  const reqs = await allRows((from, to) => db.from("application_requirements").select("institution_id, platforms").order("institution_id").order("cycle").range(from, to), "application platforms");
  const out: Record<string, string[]> = {};
  for (const r of reqs) out[r.institution_id] = [...new Set([...(out[r.institution_id] ?? []), ...(r.platforms ?? [])])];
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

export async function getAppFees() {
  await connection();
  return cachedAppFees();
}

export async function getPlatforms() {
  await connection();
  return cachedPlatforms();
}

export async function getScoreCodes() {
  await connection();
  return cachedScoreCodes();
}
