import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContextPack, type PackCollege, type PackInput } from "./ai-context.ts";
import type { CollegeDetail, CollegeSummary, Deadline } from "./types.ts";

const TODAY = new Date(2026, 9, 22);

const summary = (over: Partial<CollegeSummary> = {}): CollegeSummary =>
  ({
    id: "id-brown",
    slug: "brown",
    name: "Brown University",
    short_name: "Brown",
    country_code: "US",
    state_region: "RI",
    city: "Providence",
    admit_rate: 5.4,
    intl_admit_rate: 3.1,
    ed_admit_rate: 14.4,
    sat_p25: 1500,
    sat_p50: 1530,
    sat_p75: 1560,
    act_p25: 34,
    act_p50: 35,
    act_p75: 35,
    test_policy: "required",
    plans: ["ED", "RD"],
    ...over,
  }) as CollegeSummary;

const deadline = (over: Partial<Deadline>): Deadline => ({
  id: Math.random().toString(36),
  institution_id: "id-brown",
  cycle: "2026-27",
  kind: "application",
  plan_key: null,
  label: null,
  due_date: null,
  notification_date: null,
  notification_note: null,
  notes: null,
  source_id: null,
  ...over,
});

const detail = (): CollegeDetail =>
  ({
    id: "id-brown",
    slug: "brown",
    country_code: "US",
    programs: [],
    name: "Brown University",
    short_name: "Brown",
    state_region: "RI",
    city: "Providence",
    control: "private_nonprofit",
    setting: "urban",
    undergrad_enrollment: 7639,
    pct_international_ug: 12.3,
    sources: [
      { id: "s-cds", kind: "cds", title: "Brown CDS 2024-25", url: "https://example.edu/cds.pdf", cds_year: "2024-2025", accessed_on: "2026-10-01" },
      { id: "s-adm", kind: "admissions_site", title: "Brown deadlines", url: "https://example.edu/apply", cds_year: null, accessed_on: "2026-10-02" },
    ],
    admission_stats: [
      { cds_year: "2023-2024", admit_rate: 5.2, source_id: "s-cds", source_note: null } as never,
      { cds_year: "2024-2025", applicants: 48904, admit_rate: 5.4, ed_admit_rate: 14.4, intl_admit_rate: 3.1, gpa_avg: 3.94, source_id: "s-cds", source_note: null } as never,
    ],
    test_score_percentiles: [{ cds_year: "2024-2025", test: "SAT_TOTAL", p25: 1500, p50: 1530, p75: 1560, source_id: "s-cds" }],
    admission_factors: [],
    test_policies: [{ cycle: "2026-27", policy: "required", notes: null, source_id: "s-adm" }],
    application_requirements: [],
    deadlines: [deadline({ plan_key: "ED", due_date: "2026-11-01", source_id: "s-adm" })],
    english_policies: { policy: "required_nonnative", waiver_notes: null, source_id: "s-adm" },
    english_requirements: [{ test_key: "TOEFL_IBT", status: "required_option", min_total: 100, recommended_total: null, min_subscores: null, notes: null, source_id: "s-adm" }],
    cost_aid: [],
    institution_tiers: [],
    major_admissions: [],
  }) as unknown as CollegeDetail;

const input = (over: Partial<PackInput> = {}, college: Partial<PackCollege> = {}): PackInput => ({
  profile: {
    gpa: 3.9,
    sat: 1520,
    international: true,
    targetRegions: ["US"],
    tests: { sat: { ebrw: 750, math: 770 }, english: { toefl: { total: 110, sections: { reading: 29 } } } },
    portals: { shared: { commonapp: { url: "", username: "me@x.com", password: "hunter2" } } } as never,
  },
  colleges: [{ college: summary(), plan: "ED", status: "in_progress", checklist: { recommendations: true }, ...college }],
  deadlines: [deadline({ plan_key: "ED", due_date: "2026-11-01" }), deadline({ plan_key: "RD", due_date: "2027-01-03" })],
  planLabels: { ED: "Early Decision", RD: "Regular Decision" },
  englishTestNames: { TOEFL_IBT: "TOEFL iBT" },
  full: false,
  today: TODAY,
  ...over,
});

test("profile lists scores, sections and English tests", () => {
  const md = buildContextPack(input());
  assert.match(md, /GPA \(unweighted, 4\.0 scale\): 3\.9/);
  assert.match(md, /SAT: 1520 \(Reading & Writing 750 \/ Math 770\)/);
  assert.match(md, /TOEFL iBT \(0–120\): 110 \(Reading 29\)/);
  assert.match(md, /International student/);
  assert.match(md, /Target regions: United States/);
});

test("list row uses the international admit rate and the chosen plan's next deadline", () => {
  const md = buildContextPack(input());
  const row = md.split("\n").find((l) => l.startsWith("| Brown"))!;
  assert.match(row, /Early Decision/);
  assert.match(row, /3\.1% \(international\)/);
  assert.match(row, /1500–1560/);
  assert.match(row, /Nov 1, 2026 — Early Decision \|/);
  assert.doesNotMatch(row, /Jan 3, 2027/);
});

test("never includes portal logins", () => {
  const md = buildContextPack(input({ full: true }, { detail: detail() }));
  assert.doesNotMatch(md, /hunter2|me@x\.com/);
});

test("basic pack has no per-college details or source links", () => {
  const md = buildContextPack(input({}, { detail: detail() }));
  assert.doesNotMatch(md, /## College details/);
  assert.doesNotMatch(md, /example\.edu/);
});

test("full pack cites a numbered source for each fact", () => {
  const md = buildContextPack(input({ full: true }, { detail: detail() }));
  assert.match(md, /## College details/);
  // Latest CDS year wins over the older row.
  assert.match(md, /Admissions \(CDS 2024-2025\): 48,904 applicants; admit rate 5\.4%; Early Decision 14\.4%; international 3\.1%; average GPA 3\.94 \[1\]/);
  assert.match(md, /SAT total 25th–75th: 1500–1560 \(median 1530\) \[1\]/);
  assert.match(md, /Early Decision: Nov 1, 2026 \[2\]/);
  assert.match(md, /TOEFL iBT: minimum 100 \[2\]/);
  assert.match(md, /1\. Brown CDS 2024-25 — https:\/\/example\.edu\/cds\.pdf \(accessed 2026-10-01\)/);
  assert.match(md, /Recommendations: done/);
});

test("full pack labels CDS factors and skips a bare true/false essay field", () => {
  const d = detail();
  d.admission_factors = [{ cds_year: "2024-2025", factor: "test_scores", importance: "very_important" }];
  d.application_requirements = [{ cycle: "2026-27", platforms: ["common_app"], supplemental_essays: "true", notes: "Four essays." } as never];
  const md = buildContextPack(input({ full: true }, { detail: d }));
  assert.match(md, /Very important in admission \(CDS C7\): Test scores/);
  assert.match(md, /via Common App/);
  assert.doesNotMatch(md, /Supplemental essays: true/);
  assert.match(md, /Notes: Four essays\./);
});

test("full pack says when details failed to load instead of inventing them", () => {
  const md = buildContextPack(input({ full: true }, { detail: null }));
  assert.match(md, /Details not available/);
});

test("pipes in names are escaped so the table stays intact", () => {
  const md = buildContextPack(input({}, { college: summary({ short_name: "A|B" }) }));
  assert.match(md, /\| A\\\|B \|/);
});

test("empty list still produces a usable pack", () => {
  const md = buildContextPack(input({ colleges: [] }));
  assert.match(md, /No colleges on my list yet/);
});

test("never includes per-college portal logins, notes or aid offers even if the entry carries them", () => {
  const leaky = { portal: { url: "https://apply.example.edu", username: "kid@x.com", password: "s3cret-pw" }, notes: "private essay idea", aidOfferUsd: 61234 } as never;
  const md = buildContextPack(input({ full: true }, { detail: detail(), ...(leaky as object) }));
  assert.doesNotMatch(md, /s3cret-pw|kid@x\.com|apply\.example\.edu|private essay idea|61,?234/);
});
