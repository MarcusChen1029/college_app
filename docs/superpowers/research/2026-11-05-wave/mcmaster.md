<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# mcmaster (CA2)

Rows added
- "McMaster University Award of Excellence (international entrance award) application due, 11:59 p.m. ET (12:59 on 20 Feb, Taiwan)" | 2027-02-19 | scholarship | src intl_awards (https://future.mcmaster.ca/internationalawards/) | scraped
Rows corrected: none. Existing rows confirmed: Eng/CS supplementary 28 Jan 2027 11:59 p.m. ET and early date 26 Nov 2026, OUAC early 12 Nov 2026 (scraped, eng.mcmaster.ca/supplementary-application).
Steps added
- eng_supplementary_kira | supplementary_form | courses computer-science, engineering-i | https://eng.mcmaster.ca/supplementary-application | scraped. Opens 1 Oct 2026, invitation 7-10 business days after OUAC, $50 CAD via OUAC.
Not found
- International admission deposit: $2,000 CAD (search summary only); no fixed date, each offer letter sets it. No row.
- Official Level I outside-Canada OUAC deadline page (future.mcmaster.ca dates pages show only a search tool); existing 15 Jan 2027 row not re-confirmed. Honours Economics has no supplementary application (supplementary page does not list it; scraped).
- Offer acceptance date: not published.
- Award of Excellence is the only international award with a stated application deadline; the engineering award page shows "19 Feb 2026" (likely stale), not used.
Notes
- Step id regex in build_application_steps.py is ^[a-z0-9_]{1,40}$ (underscores, not hyphens, unlike the brief).
- Time offsets: Eastern UTC-5 until DST starts Sun 14 Mar 2027 (search summary of timeanddate.com/time/change/canada?year=2027, tag summary; timeanddate direct fetch returned 403).

## Integration (2026-11-05)
Scholarship row and the Kira step taken (step name shortened to 120 characters). admissions_url kept as the admission-requirements page (more specific than the future-students home page).
