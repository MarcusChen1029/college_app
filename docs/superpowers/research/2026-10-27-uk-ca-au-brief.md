# Brief: adding UK (England), Canadian and Australian universities (2026-10-27)

One shared brief for every research agent. Each agent gets 2-3 universities and writes, per university:

- `data/colleges/<slug>.json` — the institution + its `programs` array
- `data/cycle_2026_27/<slug>.json` — sources, deadlines, English requirements (no tiers: the controller adds them)

Then runs `python3 scripts/build_seed.py --check` from the repo root (must print `OK`; it reports errors for any college,
so fix only your own files and ignore errors in files you were not given).

## The one rule

**Never invent data.** Every value comes from an official university page (or UCAS / OUAC / UAC for deadlines) that you
actually fetched today. If you cannot confirm a value, leave the key out (or null) and say why in `notes`. Do not fill a
value from memory, from a ranking site, or from another university. Copying a fee or offer from the wrong course is the
worst possible error: check the course page you cite shows that exact value.

Fetching: use WebFetch or `curl -sL` on official pages. If a search tool is out of credits, guess the official URL from
the site's structure or fetch the site's course search page directly. Course pages for **2027 entry** (Australia: 2027
intake; Canada: Fall 2027) are preferred; if only 2026 entry is published, use it and say so in `notes`.

## Templates

The `//` comments below are explanations only: the files you write must be plain JSON (no comments).
Copy the shape of the existing UK files: `data/colleges/ucl.json`, `data/cycle_2026_27/ucl.json` (and `oxford.json`).

### `data/colleges/<slug>.json`

```json
{
  "slug": "toronto",
  "name": "University of Toronto",
  "short_name": "U of T",
  "country_code": "CA",                 // "GB" for England, "CA", "AU"
  "state_region": "Ontario",            // England -> "England"; Canada -> province; Australia -> state/territory
  "city": "Toronto",
  "latitude": 43.6629, "longitude": -79.3957,   // main campus, 4 decimals
  "setting": "urban",                   // urban | suburban | rural
  "control": "public",                  // public | private_nonprofit
  "website": "https://www.utoronto.ca/",
  "admissions_url": "<the international undergraduate admissions page>",
  "sources": {},
  "programs": [ ... exactly 3, see below ... ]
}
```

### Programs: which three

1. **Computer Science** (the main undergraduate CS degree; if it sits inside a broader faculty admission, e.g.
   U of T "Computer Science" in Arts & Science St. George, or Waterloo "Computer Science", use that admission category).
2. **Economics** (or the closest: "Commerce" / "Economics" / "Business" only if the university has no Economics
   degree with its own entry requirements).
3. **Engineering**: Mechanical Engineering if it has its own entry requirements; in Canada, if engineering admits to a
   common first year (UBC Applied Science, McGill Engineering, Queen's/McMaster/Western first-year engineering), use
   that first-year engineering admission and say so in `name`.

### Program object

```json
{
  "slug": "computer-science",                  // [a-z0-9-]+, unique within the university
  "name": "Computer Science BSc",
  "award": "BSc",                             // BSc, BA, BEng, MEng, BASc, BCom, BAdvCompSc...
  "ucas_code": "G400",                        // UK ONLY, exactly 4 characters; omit elsewhere
  "apply_via": "UCAS",                        // UK: "UCAS". Ontario: "OUAC". Elsewhere in Canada: "Direct".
                                              // Australia: how an INTERNATIONAL student (outside Australia,
                                              // doing IB/A-levels/US curriculum) applies: usually "Direct" (or "Direct or agent")
  "duration_years": 3,
  "a_level_offer": "A*AA, with A* in Maths",  // as printed on the course / international-requirements page
  "ib_offer": "38 points, 766 at HL incl. 7 in HL Maths AA",
  "ib_points": 38,                            // integer, the headline IB total
  "ap_offer": "...",                          // REQUIRED FOCUS, see below
  "atar": 95.0,                               // AUSTRALIA ONLY: the published lowest selection rank / guaranteed ATAR for 2027 (or 2026) entry
  "required_subjects": "Maths",               // prerequisites in plain words (Canada: e.g. "Grade 12 Calculus (MCV4U), English (ENG4U)")
  "admissions_test": "TMUA",                  // only if one is required/considered; omit otherwise
  "intl_fee_gbp": 39500,                      // UK only. Canada: "intl_fee_cad". Australia: "intl_fee_aud".
                                              // integer, per YEAR, international/overseas tuition for the stated entry year
  "application_deadline": "2027-01-13",       // the deadline an international applicant must meet for this course, ISO date
  "ielts_overall": 6.5, "ielts_component": 6.0,
  "toefl_note": "TOEFL iBT 92 overall (old 0-120 scale) ...",   // TOEFL has two scales since 21 Jan 2026; quote what the page says
  "english_note": "...",
  "notes": "...",                             // anything a student must know; mark 2026-entry values as such
  "source_url": "https://<the course page>",
  "retrieved_on": "2026-10-27"
}
```

**`ap_offer` (the US-curriculum / AP route) matters most after the A-level and IB offers.** Every one of these
universities publishes what a student with a US high school diploma needs: e.g. "US High School Diploma plus APs at
5,5,4 including Calculus BC; or SAT 1450 / ACT 32 plus APs". Find the university's international/country requirements
page for "United States" (often "Entry requirements by country" / "Admission requirements: United States" / "US
curriculum"). Quote the course-specific version if one exists, otherwise the general one plus the course's subject
prerequisite in AP terms. If the page gives no AP route, write what it does say (e.g. "SAT/ACT not required; Grade 12
average with Calculus") and never guess.

If one value comes from a different page than `source_url` (e.g. the US-requirements page, the fees page), name that
page's URL in `notes` ("AP route: <url>").

### `data/cycle_2026_27/<slug>.json`

```json
{
  "sources": {
    "english": {"kind": "admissions_site", "title": "<Uni> - English language requirements (undergraduate)", "url": "...", "accessed": "2026-10-27"},
    "deadlines": {"kind": "admissions_site", "title": "...", "url": "...", "accessed": "2026-10-27"}
  },
  "deadlines": [
    {"kind": "application", "plan": "RD", "due": "2027-01-15", "label": "OUAC 105 equal-consideration deadline", "notes": "...", "src": "deadlines"}
  ],
  "english_policy": {"policy": "required_nonnative", "waiver_notes": "<who is exempt, as stated>", "src": "english"},
  "english": [
    {"test": "IELTS", "status": "required_option", "min": 6.5, "subs": {"each_component": 6.0}, "notes": "IELTS Academic", "src": "english"},
    {"test": "TOEFL_IBT", "status": "required_option", "min": 100, "subs": {"writing": 22}, "notes": "old 0-120 scale", "src": "english"},
    {"test": "DUOLINGO", "status": "accepted", "min": 120, "src": "english"}
  ]
}
```

- Allowed `english.test`: `TOEFL_IBT` (old 0-120), `TOEFL_IBT_2026` (new 1-6 scale), `IELTS`, `DUOLINGO`, `PTE`, `CAMBRIDGE`.
  `status`: `required_option` (one of these is required), `accepted`, `recommended_option`, `not_accepted`.
  Duolingo NOT accepted is worth recording as `not_accepted`. Use the university's general undergraduate minimum
  (if courses differ, use the lowest band and say the band name in `notes`).
- `english_policy.policy`: `required_nonnative` | `required_all_international` | `recommended` | `not_required`.
- Deadlines: plan `RD` for the main deadline (UCAS: 13 Jan 2027 18:00 UK; Cambridge: 15 Oct 2026; OUAC equal
  consideration; UBC/McGill/Alberta/Calgary/SFU from their own pages). Australia usually has no single deadline:
  add one only if the university publishes a dated international deadline for the 2027 Semester 1 intake;
  otherwise no deadline and explain in the course `notes` ("rolling, apply early").
  Optional extra `kind: "other"` / `"scholarship"` rows only if sourced (e.g. UBC's Nov deadline for IMES awards).
- `kind` for sources: `admissions_site`, `financial_aid_site`, or `other` (UCAS/OUAC/UAC pages).
- Do NOT add `tiers`, `tier_notes`, `cost`, `aid`, `test_policy`, `stats` or `scores`.

## Report (≤200 words)

Per university: files written; for each program, which fields are null and why; anything surprising (offers that
differ for internationals, 2026-entry values used, a merger, a page that would not load). Last line: the exact output
of `python3 scripts/build_seed.py --check` (restricted to your slugs if others fail).
