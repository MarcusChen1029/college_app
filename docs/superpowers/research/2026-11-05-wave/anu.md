<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# anu report
Rows added (appended at end, no clock times):
- deposit, s1, 2027-01-15 "Accept your offer by (Semester 1, 2027, if overseas)", src deadlines (study.anu.edu.au/apply/international-applications) [summary]
- deposit, s1, 2027-01-11 "Accept your offer by - applicants under 18 (Semester 1, 2027)", src under18 (study.anu.edu.au/apply/international-students-under-18-years-age) [summary]
- application, s2, 2027-05-15 "International applications close - Semester 2, 2027", src deadlines [summary]
- deposit, s2, 2027-06-30 "Accept your offer by (Semester 2, 2027, if overseas)", src deadlines [summary]
Rows corrected: none. Existing S1 15 Dec 2026 row re-confirmed by search summary.
Steps: none added; researched stays false. study.anu.edu.au returns HTTP 500 to every automated fetch (WebFetch and curl), so the extra-steps pages were not read. Search summaries mention portfolio/audition for Music and Design (not among tracked courses advanced-computing-honours, economics, engineering-honours) and a supplementary form for Health Science.
Not found: scholarship closing date (Chancellor's International Scholarship: no separate application, automatic consideration; page old); S2 rows are summary-only and should be re-verified by a page read.
Time offset source: no clock times used.

## Browser pane pass (2026-11-05)
PAGE FAILED: study.anu.edu.au/apply/international-applications, /apply/key-dates, /apply/international-students-under-18-years-age and www.anu.edu.au/study/apply/international-applications all returned HTTP 500 ("The website encountered an unexpected error") in the browser too. Nothing confirmed. The 4 summary rows (S1 acceptance 15 Jan 2027, under-18 11 Jan 2027, S2 close 15 May 2027, S2 acceptance 30 Jun 2027) are UNCONFIRMED and left untouched in cycle/anu.json (controller rule: drop unless confirmed).

## Integration (2026-11-05)
Nothing taken: the 4 summary-only rows stay out (page failed in the browser pass too). researched false.
