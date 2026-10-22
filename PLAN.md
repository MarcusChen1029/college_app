# College Application Tracker — Plan

A tracker that helps students compare and follow colleges they're applying to.
Phase 1 is a demo with **10 US colleges** stored in Supabase. The data model is
designed up front so it can grow to all US colleges and then to the UK, Canada,
Australia, etc. without a rewrite.

---

## 1. Scope by phase

| Phase | Scope | Outcome |
|---|---|---|
| **1. Demo ✅ built** | 10 US colleges in Supabase; browse / detail / compare / my-list UI; reach-target-safety labels | Proves the data model and data-collection workflow |
| **2. Student accounts ✅ built** | Email-link sign-in (Supabase Auth); profile + list + application checklist stored in `student_profiles` / `student_colleges` with per-user RLS; local data merged on first sign-in; daily deadline reminder emails (Edge Function + pg_cron, opt-out on /account) | Sync across devices |
| **2b. 100 popular colleges ✅ built (2026-10-22)** | 90 more colleges: CDS 2025-26 where readable, else IPEDS/Scorecard baseline; 2026-27 deadlines, English, aid, score codes, tiers | Covers the schools most students ask about |
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
| Admit rate, applicants, enrolled | CDS **C1** | Plus in-state / out-of-state / **international** splits where reported |
| **ED admit rate**, waitlist offered/accepted/admitted | CDS **C21**, **C2** | |
| **Test policy per cycle** (required / recommended / optional / flexible / blind) | CDS **C8** + admissions site | Many schools reinstated testing |
| **Admission factors** (rigor, essays, demonstrated interest, …) | CDS **C7** | Drives the "demonstrated interest counts" tip |
| **Application requirements** (platform, essays, recs, interview, portfolio, fee, CSS/FAFSA, midyear) | Admissions site | |
| **Extra deadlines** (priority, scholarship, financial-aid, deposit) | Admissions / aid site | Shown in a timeline |
| **Cost & aid** (tuition by residency, fees, housing, COA, intl aid policy, # intl aided + avg award) | CDS **G1**, **H6** + aid site | Need-blind / need-aware / merit-only / none |
| **How majors are admitted** (direct / school / undeclared / pre-major; capped; internal-transfer difficulty) | Admissions site (editorial v0) | e.g. UIUC CS, CMU SCS, Ross |
| **Fit label** (reach / target / safety) | Computed from student scores vs SAT/ACT 25–75 + (international) admit rate | `web/lib/fit.ts`, reasoning shown on hover |

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

**Review v1 (2026-10-20):** subject tiers follow S = top ~5 nationally in the field, A ≈ 6–15, B ≈ 16–40, C ≈ 41–100, D beyond. A college gets no tier for a field it has no undergraduate program in (e.g. business at Stanford/Harvard, nursing at MIT). Changes from v0: Haas, Stern and Sloan business → S; Gies → A; Berkeley biology and economics → S; Stanford and Harvard business removed. Every tier now stores a rationale. For the general tier that's the admit rate and SAT range. Rules are in `data/cycle_2026_27.json` → `_tier_rules`.

---

## 4. Supabase schema

Implemented in `supabase/migrations/0001–0004` (project `college-tracker`, ref `eyvmtaggayqizllaseiu`). Draft below for orientation; beyond it there are `admission_factors`, `test_policies`, `application_requirements`, `english_policies`, `cost_aid`, `major_admissions`, `student_profiles`, and the `college_summary` view.

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
4. Record values in `data/colleges/<slug>.json` (CDS) and `data/cycle_2026_27.json` (current cycle), each with source URLs.
5. `python3 scripts/build_seed.py` validates (percentile order, GPA bands sum to ~100%, deadlines before notifications, etc.) and writes the idempotent seed.

Lessons from the first 10: CDS formats vary (HTML, PDF, xlsx, Google Sheets); PDF checkboxes sometimes don't survive extraction — those fields stay NULL and are confirmed on the school's site. Some schools omit fields entirely (MIT and UIUC: no GPA; Harvard: no SAT composite; NYU: no section G). Berkeley's CDS Google Sheet couldn't be machine-read, so its stats come from the admissions site for now.

---

## 7. App (Phase 1 UI)

- **Stack (proposal):** Next.js (App Router) + TypeScript + Tailwind + `@supabase/supabase-js`, deployable to Vercel.
- **Pages:** college list with filters (tier, subject tier, state, test-optional) ·
  college detail (stats, deadlines timeline, English reqs, sources) · side-by-side compare (up to 4).

---

## 8. Repo layout

```
data/colleges/<slug>.json      CDS extracts + sources
data/cycle_2026_27.json        current-cycle data, tiers, major admission
scripts/build_seed.py          validate + generate seed
supabase/migrations/           0001 schema+RLS · 0002 extra fields · 0003 summary view · 0004 indexes
supabase/seed/                 00_lookups.sql · 10_colleges.sql (generated)
web/                           Next.js 16 app
```

---

## 9. Decisions

1. **Supabase:** a new dedicated project (`college-tracker`).
2. **Colleges:** the 10 listed in §5.
3. **Tiers:** letter scale S / A / B / C / D.
4. **Frontend:** Next.js + TypeScript + Tailwind on Vercel.

## 10. Status & next steps

Done:
- Supabase project, schema and RLS (security advisor clean). RLS on the student tables tested: users see and edit only their own rows; anonymous visitors see none.
- 10 colleges seeded with sources.
- Next.js app: list / detail / compare / my list / account, with unit tests and browser tests run against a local API stub.
- Data gaps filled in the repo: NYU average GPA and 2026-27 costs, Berkeley enrollment / nonresident tuition / international aid, UIUC RD date. Applied to the live database via `supabase/patches/2026-10-20_fill_data_gaps.sql` (run in the SQL editor; the Supabase connector can't confirm UPDATEs from cloud sessions).

Remaining data gaps: Berkeley CDS sections C7/C9/C11 (Google Sheet not machine-readable). NYU doesn't publish waitlist or ED counts.

Also done: tier review v1 and deadline reminder emails (dry run until Resend secrets are set).

Next (owner steps, see DEPLOY.md): run the tier patch and migration 0006, import to Vercel, set the Supabase Auth URLs and SMTP, add the Resend secrets.
Later: Phase 3 bulk import (IPEDS / College Scorecard).
