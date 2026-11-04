<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# ucl
Rows added: "LNAT must be taken by (UCL Law LLB)", 2026-12-31, other, src laws, summary (ucl.ac.uk blocks fetchers with 403; search summary of the UCL Laws page).
Rows corrected: none. Steps added: none; researched left FALSE (official pages unreadable, only search summaries). Summaries said: no interview for CS or standard LLB; tests (TARA for CS, TMUA for Economics, LNAT for Law) come from programs.admissions_test. admissions_url set to UCL's international applicant guidance page.
Not found: UCL Global Undergraduate Scholarship 2027-entry deadline (official page shows 27 Apr 2026 only; 27 Apr 2027 is aggregator-only, not used); TARA/TMUA 2027 sitting dates; deposit/acceptance dates.
Time offsets: same gov.uk source as southampton.md; no new clock-time row.

## Browser pane pass (2026-11-05)
CONFIRMED (scraped): LNAT row. https://www.ucl.ac.uk/laws/study/bachelor-laws-llb/applying-and-entry-requirements - "You must take the test no later than 31 December 2026." Same page: UCAS "by 13 January 2027 at 18:00 UK time". Row tag summary -> scraped.
Course pages (scraped, https://www.ucl.ac.uk/study/prospective-students/undergraduate/courses/computer-science-bsc and .../economics-bsc-econ): CS requires TARA alongside UCAS for 2027/28; Economics BSc (Econ) requires TMUA. Both are already program admissions_test values. No interview, portfolio or supplementary form mentioned for CS, Economics. Law page: interview only for LLB with a European Legal System (not a tracked course).
Steps: none to add (tests live on programs). researched set true, checked_on 2026-11-05, steps [].
Still not found: UCL Global Undergraduate Scholarship 2027 date; TARA/TMUA sitting/registration dates (on UAT-UK site, not checked); deposit/acceptance.
Note: textContent (not innerText) was needed to read collapsed accordions.

## Integration (2026-11-05)
LNAT row appended (browser-confirmed). researched true. admissions_url = the UCL undergraduate page already in our sources (the international guidance URL was never read).
