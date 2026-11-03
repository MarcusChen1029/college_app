# Brief: research one batch of popular US colleges (wave of 2026-11-03)

The tracker (www.track-ur-college.com) helps students, many applying from abroad, plan US applications. 123 popular
colleges were missing (big flagships such as Alabama, LSU and NC State; top liberal-arts colleges; Illinois Tech, BYU, Baylor...).
Each college page shows CDS admission stats, test scores, deadlines, English test minimums, international aid, tiers and
a source for every fact. Your batch fills these for 3 colleges. The repo's first rule: **never invent data.**

REPO = `C:/Users/user/Desktop/college/.claude/worktrees/popular-colleges` (a git worktree; run every command from it).

## What exists already, what you write
- `data/colleges/<slug>.json` is pre-filled from the College Scorecard file: name, short_name, city, state, lat/long,
  setting, control, website, ipeds_unit_id, undergrad_enrollment (Scorecard), and a Scorecard `cost` block (2023-24).
  **Keep** slug, name, short_name, lat/long, setting, control, ipeds_unit_id and the `scorecard` source.
  **Fill in**: `admissions_url`, `undergrad_enrollment` + `intl_undergrads` (CDS B1/B2 "total undergraduates" and nonresident
  rows; keep the Scorecard enrollment only if no CDS), `student_faculty_ratio` (CDS I2), `academic_calendar` (CDS),
  a `cds` source, `scores_source`, `stats`, `scores`, `factors`. If the CDS has G1 costs for 2025-26 or later, replace the
  cost block with them (`source: "cds"`, see angelo-state.json); otherwise leave the Scorecard block.
- **Create** `data/cycle_2026_27/<slug>.json`: sources, test_policy, requirements, deadlines, english_policy, english,
  aid, majors, score_codes, tiers, tier_notes.
- Touch **nothing else**: no other data files, no scripts, no git commands.

## Copy the shape of these files exactly (read them first)
- Public with CDS: `data/colleges/virginia-tech.json` + `data/cycle_2026_27/virginia-tech.json`
- Private, ED/EA, need-aware aid: `data/colleges/lehigh.json` + `data/cycle_2026_27/lehigh.json`
- CDS stats with IPEDS scores fallback, CDS cost block: `data/colleges/angelo-state.json` + its cycle file
- Major-level admission (`majors` with admit_model): `data/cycle_2026_27/asu.json`
- Allowed enum values: `ENUMS` in `scripts/build_seed.py` lines 75-98. `requirements.platforms` uses only
  `common_app`, `coalition`, `questbridge`, `own` (the college's own application). `factors` use VI / I / C / NC.

## Sources, in this order
1. The college's latest **Common Data Set** (2025-2026, else 2024-2025): C1 applicants/admits/enrolled incl. residency and
   international rows, C2 waitlist, C9 SAT/ACT percentiles and submit %, C11/C12 GPA, C7 factors, C21/C22 ED/EA counts,
   B1/B2 enrollment, I2 ratio, G1 cost. Read it as **text**: WebFetch, or curl the file into a NEW empty folder under your
   scratch dir and run `pdftotext -layout file.pdf out.txt` / python openpyxl for .xlsx (run python with `-I`). Do not
   render PDF pages as images. Record the CDS year in `stats.cds_year` and `sources.cds`.
2. Official admissions, international admissions and financial-aid pages for the **2026-27 cycle (fall 2027 entry)**:
   deadlines, test policy, English tests, application fee, recommendations, essays, aid policy, score codes (CEEB/ACT).
3. No readable CDS: IPEDS via College Navigator `https://nces.ed.gov/collegenavigator/?id=<ipeds_unit_id>`
   (fall 2024 admissions + test scores) with `scores_source: "ipeds"`, `stats.source: "ipeds"`, and say "no CDS found" in notes.
If firecrawl or WebSearch is unavailable or out of credits, fetch pages directly with WebFetch or curl. Never use
third-party aggregators (Niche, PrepScholar, US News pages, Wikipedia) as a source for a number.

## Rules that have burned earlier waves
- Every fact carries `src` naming a key in `sources`; every source has kind, title, url, accessed `2026-11-03`.
- Unconfirmed = `null` plus a note saying why. Never compute a value and present it as published: no derived admit counts
  from percentages, no shifted last-year deadlines. If the site still shows fall 2026 dates, leave the deadline out and
  say so in `requirements.notes`.
- **Domestic vs international deadlines**: several colleges post earlier international deadlines (or financial-aid / CSS
  deadlines) on a separate page. Use the international ones when they differ and say so in the deadline `notes`.
- CDS PDFs: read table columns **by position** (the columns are often shifted in text output); check that C1 residency
  rows sum to the totals and that 25th <= 50th <= 75th.
- English: one row per test with the published minimum; TOEFL old scale (`TOEFL_IBT`, 0-120) and new scale
  (`TOEFL_IBT_2026`, 1-6) are separate rows; only add the new-scale row if the college publishes a new-scale minimum.
  Subscores under `subs`. Duolingo / PTE / Cambridge only if listed.
- Aid: `intl_aid_policy` from the college's own words (need-blind for internationals is rare: MIT, Harvard, Yale, Princeton,
  Amherst, Bowdoin and a few others). Merit-only publics are `merit_only`. Note CSS Profile / ISFAA requirements.
- Tiers (`tiers` + `tier_notes`): general tier may use `++`/`+` (S++ ... D); subject tiers are plain S/A/B/C/D.
  Scale: S = top ~5 nationally in the field, A ~6-15, B ~16-40, C ~41-100, D beyond; omit a category when the college has
  no undergraduate program in it and say so in `tier_notes` (e.g. "nursing": "No nursing program."). Calibrate the
  general tier against the existing peers in `TIER_PEERS` (path given in your task). Write a reason in `tier_notes` for
  every subject tier that differs from the general tier's letter.
- Display names are fixed already; do not change `short_name`.

## Done means
1. `python -I scripts/build_seed.py --check` run from REPO prints **no error line containing your slugs**. (Other agents'
   colleges show "no cycle data" until they finish; ignore those lines.)
2. Every number you entered is in a source you opened today.

## Report (≤200 words total, plain text)
Per college: `slug: CDS <year> | IPEDS baseline` / deadlines found (plans) / nulls left and why / any fact you are unsure of
(quote the source wording). Then the validator lines for your slugs (should be none). No file dumps.
