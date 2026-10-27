# Field-aware college recommender — design (2026-10-27)

## Why
A student picks a broad direction (business, engineering, CS, pre-med, pre-law, ...) and gets a balanced list of
colleges that are actually good **for that direction**. Today the only signals are the general tier and 10 subject
tiers. A college's overall reputation leaks into every field: Waterloo is a national S in Canada but has no business
school in our data, yet a business student browsing by general tier sees it near the top. Princeton and Harvard
have no undergraduate business major at all (IPEDS 2023-24: 0 business graduates).

The owner asked for this design and said "design it the best you can". Every product call below is the designer's
call, not something the owner reviewed.

## Goals
- ~27 directions, grouped by area, far more than the 10 tier categories (adds pre-law, communications, psychology,
  architecture, education, environment, data science, finance, performing arts, ...).
- **Overall reputation never stands in for a field.** A college with no program in the field is never recommended
  for it; a college with no field evidence is put in "not enough data", not ranked.
- Combine the field signal with the existing admission-chance label (`computeFit`) into a balanced list:
  Reach / Target / Safety (+ "chance unknown" for non-US colleges).
- Every recommendation explains itself (which tier, how many graduates per year, how sure we are).
- Show the "famous but not for this field" colleges with the reason, so the Waterloo case is visible, not silent.

## Non-goals / anti-goals
- No invented numbers. Every number is a CDS/tier fact already in the repo or an IPEDS count with its source.
- No new subject tiers in this change (assigning tiers for 17 new fields x 450 colleges is a research wave; later).
- No major-specific admit rates (we don't have them). Capped/competitive majors are not modelled in v1.
- Not a ranking of colleges in general. "Undecided" falls back to the general tier and says so.

## Data
### New: IPEDS completions (US)
- Source: NCES IPEDS Completions `C2024_A` (academic year 2023-24), https://nces.ed.gov/ipeds/datacenter/data/C2024_A.zip.
- Rows used: `AWLEVEL = 5` (bachelor's), `MAJORNUM = 1` (first major), `CTOTALT`. `CIPCODE = 99` is the institution's
  bachelor's total.
- `scripts/build_field_completions.py <path-to-C2024_a.csv>` matches `ipeds_unit_id` in `data/colleges/*.json` and writes
  `web/lib/data/field-completions.json`:
  `{ source, source_url, academic_year, colleges: { <slug>: { total, cip: { "52": 1062, "52.08": 210, ... } } } }`.
  It stores 2-digit CIP family totals plus the 4-digit series that the field definitions reference (the script
  reads that list from `web/lib/fields-cips.json` so the CIP list has one owner). Zero entries are omitted.
- Why a file, not a table: the data is generated, read-only reference data used only by this page; there is no
  service-role key locally and MCP bulk loads retype SQL. A table can come later if the MCP tools need it.
- Non-US colleges: no IPEDS. Evidence comes from their `programs` (course names in `data/colleges/<slug>.json`),
  classified into fields by keyword (`computer science|computing|software` -> CS, `engineering` -> engineering, ...).
  The same build script copies program names into the JSON (`programs: [names]`) so the page needs no extra query.

### Existing, reused
- `college_summary` (general tier, `tiers` per category, admit rates, SAT/ACT, test policy, country) via `getSummaries()`.
- `computeFit` for the admission-chance label.

## Directions (fields)
Defined once in `web/lib/fields.ts` (key, area, CIP prefixes, tier mapping, program keywords). CIP prefixes are 2-digit
families (`"52"`) or 4-digit series (`"52.08"`); `exclude` removes series from a family.

| Area | Key | CIP | Tier mapping (weight) |
|---|---|---|---|
| STEM | computer_science | 11, 30.70, 30.08 | computer_science 1 |
| STEM | data_science | 30.70, 27.05, 30.08 | computer_science .5, math_physics .5 |
| STEM | engineering | 14 | engineering 1 |
| STEM | math_physical | 27, 40 (excl. 40.06) | math_physics 1 |
| STEM | environment | 03, 40.06 | none |
| STEM | agriculture | 01 | none |
| Business | business | 52 | business 1 |
| Business | finance_accounting | 52.08, 52.03 | business .7, economics .3 |
| Business | economics | 45.06 | economics 1 |
| Business | hospitality | 52.09 | business (proxy) |
| Health | pre_med | 26, 40.05, 51.11 | pre_med .7, biology_life_sci .3 |
| Health | nursing | 51.38 | nursing 1 |
| Health | health_sciences | 51 (excl. 51.38, 51.11) | none |
| Health | biology | 26 | biology_life_sci 1 |
| Health | psychology | 42 | none |
| Health | kinesiology | 31 | none |
| Law & society | pre_law | 45.10, 22, 38.01 | humanities (proxy) |
| Law & society | international_relations | 45.09, 44.05 | humanities (proxy), economics (proxy) |
| Law & society | social_sciences | 45 (excl. 45.06, 45.09, 45.10) | humanities (proxy) |
| Law & society | criminal_justice | 43 | none |
| Law & society | social_work | 44 (excl. 44.05) | none |
| Law & society | education | 13 | none |
| Arts & humanities | humanities | 23, 54, 38, 16 | humanities 1 |
| Arts & humanities | communications | 09, 10 | none |
| Arts & humanities | visual_arts_design | 50 (excl. 50.03, 50.05, 50.09) | arts_design 1 |
| Arts & humanities | performing_arts | 50.03, 50.05, 50.09 | arts_design (proxy) |
| Arts & humanities | architecture | 04 | none |
| — | undecided | — | general tier only |

"Pre-med" and "pre-law" are tracks, not US majors: the CIP lists are the majors those students usually take. In the
UK/AU, Medicine and Law are direct undergraduate courses; the program keywords (`medicine|mbbs|mbchb`, `law|llb`)
cover that.

## Algorithm (pure, `web/lib/field-match.ts`)
For each college C and field F:

1. **Depth** (how much of a program exists)
   - US: `grads` = sum of first-major bachelor's in F's CIPs; `share = grads / total`.
     `none` (0), `small` (< 10), `established`, `large` (>= 200 or share >= 15%).
   - Non-US: `established` if any program name matches F's keywords, else `unknown`.
2. **Points**: subject tier S 95, A 85, B 72, C 58, D 45. General tier (15 steps) S++ 100 ... D 45 (linear-ish table).
3. **Field strength** (0-100) and **confidence**:
   - `direct` = weighted mean of the direct-mapped tiers C has (missing ones drop out of the mean).
   - `proxy` = weighted mean of proxy-mapped tiers C has.
   - `estimate` = min(general points - 8, cap[depth]); cap small 50, established 70, large 78, non-US established 78.
   - depth `none` and no direct tier -> **not offered** (excluded, reason "no bachelor's graduates in F, IPEDS 2023-24").
   - depth `none` but a direct tier exists (tier says a program exists; IPEDS codes it elsewhere) -> treat as `small`.
   - direct exists -> strength = direct; `small` caps it at 55 ("tiny program"); `large` adds +3. confidence `rated`.
   - else proxy exists -> strength = (proxy + estimate) / 2. confidence `partly_rated`.
   - else depth known -> strength = estimate. confidence `estimated`.
   - else (non-US, no tier, no matching program) -> **not enough data** (excluded from the ranked list).
   - `undecided` -> strength = general points, confidence `general`.
4. **Two directions** (optional second): strength = 0.75 x s1 + 0.25 x (s2 ?? 40). Excluded/unknown in F1 stays excluded.
5. **Recommend threshold**: strength >= 55 goes into the buckets; below goes to "weaker for this field" (collapsed).
6. **Buckets** from `computeFit(student, C)`: super_reach + reach -> Reach, target -> Target, safety -> Safety,
   null (no admit rate, incl. all non-US) -> Chance unknown. Within each bucket sort by strength desc, then general tier,
   then name. Show 8 per bucket with "show all".
7. **Famous but not for this field**: colleges with general tier A or better that ended up not offered / not enough
   data / below threshold, sorted by general tier, top 8, each with its reason.
8. Region filter: student's `targetRegions` (default all regions present), switchable on the page.

## Page
- Route `/tools/match` ("College match by field"), card on `/tools`, and a "Recommend by field" link on `/colleges`.
- Server page loads summaries + the completions JSON, computes per-college field evidence server-side
  (compact: `{slug: {fieldKey: grads}}` + totals + non-US program fields) and passes it to a client component that
  reads the student profile (`useSyncExternalStore` store) and runs the ranking live.
- Controls: direction picker grouped by area (+ optional second direction), region chips. Profile scores are read
  from the existing profile; if none, Fit falls back to admit rate only (as `computeFit` already does) and a note says
  "add your SAT/ACT in your profile for a better split".
- Each result row: name (link to college page), FitBadge, strength bar/number, confidence chip
  (Rated / Partly rated / Estimated), evidence line ("Engineering tier A · 2,413 engineering graduates a year").
- Footer: data note (IPEDS 2023-24 first-major bachelor's; tiers are editorial, `tier_notes`).
- Uses existing UI classes (`buttonClass`, `toneClass`, `FitBadge`, `TierBadge`); no raw colour classes.
- All UI text in a new i18n section `lib/i18n/messages/match.ts` (en + zh-TW), incl. field labels.

## Saved choice
- Migration `0036_study_fields.sql` (applied 2026-10-27): `student_profiles.study_fields jsonb not null default '[]'`,
  an array of at most 2 field keys (same shape as `target_regions`). `StudentProfile.studyFields?: string[]`, mapped in `student-rows.ts`,
  stored in localStorage when signed out like every other profile field. Teacher RPCs are untouched (explicit lists).

## Tests (node --test)
- `fields.test.ts`: every field has a unique key, a label key in both dictionaries, and every CIP it uses appears in
  `fields-cips.json`; mapped tier categories exist in the known category list.
- `field-match.test.ts`: Princeton-like (S++ general, no business tier, 0 business grads) -> not offered for business;
  Waterloo-like (non-US, S, programs CS/Econ/Eng) -> not enough data for business, estimated for engineering;
  Caltech-like (business tier C, 2 grads) -> small, capped at 55; direct tier beats general; proxy blend; two-field
  blend; bucket assignment and sort order; famous-but-not list.

## Left to the builder
Exact visual layout, copy wording, strength display (bar vs number), how many per bucket on mobile.

## Later (not built)
Subject tiers for the new fields; major-specific competitiveness (`major_admissions` capped majors); IPEDS table in
Supabase for the MCP tools; seeding the direction from the interest quiz result.
