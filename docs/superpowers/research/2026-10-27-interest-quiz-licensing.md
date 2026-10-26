# Interest quiz: licensing and data sources (checked 2026-10-27)

Roadmap item #13. All pages below were fetched on 2026-10-27.

## O*NET database content: CC BY 4.0 (confirmed)
- https://www.onetcenter.org/license_db.html : the O*NET 31.0 Database is licensed under Creative Commons Attribution 4.0 International.
  Required: credit "the O*NET 31.0 Database and the U.S. Department of Labor, Employment and Training Administration" as source, link to the
  license, and indicate where changes were made. Use O*NET as an adjective with the trademark symbol. The license covers the downloadable
  database files only; Career Exploration Tools and other website content fall under separate licenses.
- Files used (from https://www.onetcenter.org/dl_files/database/db_31_0_text.zip): `Occupation Data.txt`, `Job Zones.txt`, `Career Interest Types.txt`
  (Scale OI = the six RIASEC interest scores per occupation, range 1-7; 923 occupations).

## O*NET Interest Profiler / Mini-IP item text: NOT clearly reusable, so we do not use it
- https://www.onetcenter.org/license_tools.html : Career Exploration Tools come under two options. CC BY-ND 4.0 lets you copy or publish the
  tools verbatim only (no modified or extended versions). Anything modified or extended needs the O*NET Tools Developer License
  (https://www.onetcenter.org/license_toolsdev.html), which requires a Validation Study, a conspicuous "USDOL/ETA has not approved, endorsed, or
  tested these modifications" notice, and no implied endorsement.
- The page does not address reuse of individual items in a web app, and does not mention the Mini-IP by name.
- Our quiz would reorder items, use a 5-point scale in a custom UI and score them ourselves, which is arguably a modification. Decision: write our
  own 30 items (5 per type), label the quiz "not the official O*NET Interest Profiler", and use only the CC BY O*NET occupation data for matching.
  The page still carries the "has not approved, endorsed, or tested" notice as a precaution.

## Majors mapping
- O*NET publishes no occupation-to-major mapping. We use the NCES CIP 2020 to SOC 2018 crosswalk (US Department of Education publication, sheet SOC-CIP):
  https://nces.ed.gov/ipeds/cipcode/Files/CIP2020_SOC2018_Crosswalk.xlsx (landing page https://nces.ed.gov/ipeds/cipcode/resources.aspx?y=56).
  O*NET-SOC codes are joined on their first 7 characters (SOC 2018). We show the linked CIP program titles per occupation and never invent a
  RIASEC-type-to-major list.

## Generation and decisions
- `scripts/build_interest_careers.py` builds `web/lib/interest-careers.ts` (no hand-typed numbers). Selection: O*NET-SOC codes ending `.00`, Job Zone 4 or
  5, at least one crosswalk program; up to 10 per SOC major group by most linked programs; max 110 (107 selected). Programs shown: one per 4-digit
  CIP series, "General" programs first, max 4.
- Matching: Pearson correlation between the student's six scores and the occupation's six O*NET scores (shape, not level). A flat profile returns none.
- Storage: browser localStorage only (key `interest-quiz-v1`); no DB, no migration.
- Open: this base branch has no `/tools` page (it lives on feat/transcript), so the card is a component, `web/components/InterestQuizCard.tsx`, to be
  placed into the Tools page after merging.
- Not validated: the item set has had no psychometric validation; the result page says it is a starting point only.
