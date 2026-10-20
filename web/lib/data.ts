import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { CollegeDetail, CollegeSummary, Deadline, Lookups } from "./types";

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
      `id, slug, name, short_name, state_region, city, setting, control, website, admissions_url,
       undergrad_enrollment, pct_international_ug, student_faculty_ratio, academic_calendar,
       sources(*), admission_stats(*), test_score_percentiles(*), admission_factors(*),
       test_policies(*), application_requirements(*), deadlines(*), english_policies(*),
       english_requirements(*), cost_aid(*), institution_tiers(*), major_admissions(*)`,
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
