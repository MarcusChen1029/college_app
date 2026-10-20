# College Application Tracker — Plan

A tracker that helps students compare and follow colleges they're applying to.
Phase 1 is a demo with **10 US colleges** stored in Supabase. The data model is
designed up front so it can grow to all US colleges and then to the UK, Canada,
Australia, etc. without a rewrite.

---

## 1. Scope by phase

| Phase | Scope | Outcome |
|---|---|---|
| **1. Demo (now)** | 10 US colleges, schema + seed data in Supabase, simple read-only browse/compare UI | Proves the data model and data-collection workflow |
| 2. Student tracking | Supabase Auth, "my list", per-college status (researching → applied → decision), personal deadline view | The actual "tracker" part |
| 3. All US colleges | Bulk import base data (name, location, size) from IPEDS / College Scorecard; CDS stats added school by school | Coverage |
| 4. International | UK (UCAS), Canada, Australia: new deadline types, grade systems (A-levels, IB, ATAR), English-test rules | Multi-country |

---

## 2. Data per college (Phase 1 fields)

| Field | Source | Notes |
|---|---|---|
| Name, aliases, website | Official site | |
| Location: country, state, city, lat/lng, setting (urban/suburban/rural) | IPEDS / College Scorecard | lat/lng enables map + "near me" later |
| **General tier** | Our own definition (§3) | Avoids chasing specific rank numbers |
| **Tier per subject** (CS, engineering, business, bio, …) | Our own definition (§3) | One row per college × category |
| **SAT 25/50/75** (total, ERW, Math) | Common Data Set **C9** | 50th percentile has been in CDS since 2020-21. Also capture ACT and % submitting, since many schools are test-optional |
| **GPA** | Common Data Set **C11 / C12** | ⚠️ CDS does **not** publish GPA 25/50/75. It gives the **average** GPA (C12) and the **distribution by band** (C11: % with 4.0, 3.75–3.99, 3.5–3.74, …). We store both and can *derive* an approximate percentile from the bands, clearly labelled as derived |
| ED / ED II / EA / REA / RD deadlines & notification dates | CDS **C21 / C22** + admissions site (CDS lags a year, so the current cycle is confirmed on the site) | |
| English test requirements (TOEFL, IELTS, Duolingo, PTE, Cambridge…) | Admissions site (not in CDS) | Minimum totals, sub-score minimums, waiver rules, "recommended vs required" |
| Admit rate, applicants, enrolled (bonus, cheap to add) | CDS **C1** | Useful context next to the tiers |

**Provenance is first-class:** every stat row links to a `sources` record (URL, CDS year,
date accessed). If a value can't be confirmed from an official document it is left
`NULL` rather than estimated.

---

## 3. Tier definitions (letter tiers — editable)

One scale used for both the general tier and each subject tier:

| Tier | Rough meaning (general) |
|---|---|
| **S** | Admit rate ≲ 8%, global top-name (e.g. MIT, Stanford, Harvard) |
| **A** | Top ~25 national universities / top LACs |
| **B** | Top ~26–60, strong flagships |
| **C** | Top ~61–120 |
| **D** | Broad admissions |

Subject tiers use the same S–D scale but judged per field — e.g. Georgia Tech can be
General A but Engineering S. Initial categories:
`computer_science, engineering, business, biology_life_sci, pre_med, economics,
math_physics, humanities, arts_design, nursing`.

Tiers live in a lookup table so labels/thresholds can change without touching data.

---

## 4. Supabase schema (draft)

Generic where it matters for later expansion (countries, test types, deadline
plan types are lookup values, not hard-coded columns).

```
countries              (code PK 'US','GB','CA','AU', name)
institutions           (id, slug, name, short_name, country_code FK, state_region,
                        city, latitude, longitude, setting, control public/private,
                        website, ipeds_unit_id, undergrad_enrollment, created_at, updated_at)
tiers                  (code PK 'S','A','B','C','D', sort_order, description)
tier_categories        (key PK 'general','computer_science',..., label)
institution_tiers      (institution_id, category_key, tier_code FK, rationale)  PK(inst, category)

sources                (id, institution_id, kind 'cds'|'admissions_site'|'ipeds'|...,
                        url, cds_year e.g. '2024-2025', accessed_on)

admission_stats        (institution_id, cds_year, applicants, admits, enrolled,
                        admit_rate, pct_submit_sat, pct_submit_act,
                        gpa_avg, gpa_dist jsonb, source_id)      PK(inst, cds_year)
test_score_percentiles (institution_id, cds_year, test 'SAT_TOTAL'|'SAT_ERW'|
                        'SAT_MATH'|'ACT_COMPOSITE'|..., p25, p50, p75, source_id)

application_plans      (key PK 'ED','ED2','EA','REA','RD','ROLLING', later 'UCAS_EQUAL'...)
deadlines              (institution_id, cycle e.g. '2026-27', plan_key, deadline_date,
                        notification_date, deposit_date, binding bool, notes, source_id)

english_tests          (key PK 'TOEFL_IBT','IELTS','DUOLINGO','PTE','CAMBRIDGE', name, max_score)
english_requirements   (institution_id, test_key, min_total, min_subscores jsonb,
                        status 'required'|'recommended'|'accepted'|'not_accepted',
                        waiver_notes, source_id)

-- Phase 2
student_colleges       (user_id → auth.users, institution_id, plan_key, status,
                        notes, created_at)   -- RLS: user sees only own rows
```

Security: reference tables are public read-only via RLS (`select` for `anon`),
writes only via service role / migrations. `student_colleges` gets per-user RLS.

---

## 5. Demo college list (confirmed)

MIT · Stanford · Harvard · Carnegie Mellon · UC Berkeley · Univ. of Michigan ·
Georgia Tech · UIUC · NYU · Purdue

Covers private/public, East/West/Midwest/South, and several subject-tier contrasts
(e.g. CMU CS, GT/UIUC/Purdue engineering, NYU business). Swap freely.

---

## 6. Data-collection workflow (per college)

1. Download the latest published CDS PDF from the school's institutional-research page.
2. Extract C1 (counts), C9 (SAT/ACT percentiles), C11/C12 (GPA), C21/C22 (ED/EA).
3. Confirm current-cycle deadlines and English requirements on the admissions site.
4. Write the values into `supabase/seed/<slug>.sql` with source URLs, then load.
5. A check script flags missing or out-of-range values (e.g. SAT p25 > p75).

Seed data lives in git as SQL, so every number is reviewable and re-loadable.

---

## 7. App (Phase 1 UI)

- **Stack (proposal):** Next.js (App Router) + TypeScript + Tailwind + `@supabase/supabase-js`, deployable to Vercel.
- **Pages:** college list with filters (tier, subject tier, state, test-optional) ·
  college detail (stats, deadlines timeline, English reqs, sources) · side-by-side compare (up to 4).

---

## 8. Repo layout

```
supabase/
  migrations/0001_init.sql     schema + RLS
  seed/lookups.sql             countries, tiers, categories, plans, tests
  seed/<college-slug>.sql      one file per college
scripts/validate_seed.ts
web/                           Next.js app
PLAN.md
```

---

## 9. Decisions

1. **Supabase:** a new dedicated project (`college-tracker`).
2. **Colleges:** the 10 listed in §5.
3. **Tiers:** letter scale S / A / B / C / D.
4. **Frontend:** Next.js + TypeScript + Tailwind on Vercel.

## 10. Next steps

1. Create the Supabase project, write `0001_init.sql`, apply it and run the security advisors.
2. Seed the lookup tables.
3. Collect CDS and admissions-site data for the 10 colleges and seed it with sources.
4. Scaffold the Next.js browse, detail and compare pages.
