# College Scorecard outcomes (2026-10-27)

Data in `web/lib/data/outcomes.json`, built by `python -I scripts/build_outcomes.py <institution.csv> <field_of_study.csv>` (`--check` verifies the committed file).
Shown on the college page ("Graduation & earnings", `web/components/CollegeOutcomes.tsx`) and as one evidence line on `/tools/match`.

## Source

U.S. Department of Education, College Scorecard, "Most Recent" files, **released 2026-10-15** (page: https://collegescorecard.ed.gov/data/).
- Institution: https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Institution_10152026.zip
- Field of study: https://ed-public-download.scorecard.network/downloads/Most-Recent-Cohorts-Field-of-Study_10152026.zip
- Docs: https://collegescorecard.ed.gov/assets/InstitutionDataDocumentation.pdf, https://collegescorecard.ed.gov/assets/FieldOfStudyDataDocumentation.pdf, data dictionary https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx
- Raw CSVs are not committed. Download into an empty directory outside the repo (they are untrusted data) and run Python with `-I`.
- When the next release comes out: change the two URLs, `RELEASED` and the `COHORT` years in `web/lib/outcomes.ts` (read them from the dictionary's cohort map tabs).

## Measures

| Shown as | Scorecard column | Cohort (data dictionary) |
|---|---|---|
| Graduation rate | `C150_4_POOLED_SUPP`: first-time, full-time students finishing within 150% of normal time (6 years for a bachelor's); two entering classes pooled; blank under 30 students | fall 2018 and 2019 entering classes (POOLYRS = 2) |
| Earnings 10 years after starting | `MD_EARN_WNE_P10` | entered AY2011-12 and 2012-13; earnings measured CY2022-23, 2024 dollars |
| Earnings 6 years after starting | `MD_EARN_WNE_P6` | entered AY2015-16 and 2016-17 |
| Field earnings (match page) | `EARN_MDN_5YR`, weight `EARN_COUNT_WNE_5YR`; bachelor's (`CREDLEV` 3); 4-digit CIP | graduated AY2016-17 and 2017-18 |

Why 5 years for fields: nearly the same coverage as 1 and 4 years (about 12,300 of 23,961 bachelor's programs at our colleges), and later is a better guide than 1 year.

## Caveats (from the Scorecard documentation)

- Earnings cover only students who received federal (Title IV) aid, and only those working and not enrolled that year (wages and self-employment from tax records). International students are generally not eligible for federal aid, so they are mostly not in these figures.
- Treasury perturbs the medians and counts (typical error about $1,000-2,000), so the app rounds to the nearest $1,000.
- A true median cannot be merged across programs. For a study field that spans several 4-digit CIP codes the app shows the graduates-weighted average of the programs' medians (stored as exact sums per CIP prefix, combined like `fieldGrads()`).
- Suppressed values (`PS`, `PrivacySuppressed`, `NULL`, `NA`, blank) are left out, never stored as 0.
- Field figures with fewer than 30 graduates are labelled "few graduates" on the match page.

## Verification

Checked against the official API (`api.data.gov/ed/collegescorecard`, same data): Harvard, Georgia Tech, Purdue institution-level numbers equal; Georgia Tech computer science (CIP 1101) 417 graduates at $154,714 equals the stored sum / count.
