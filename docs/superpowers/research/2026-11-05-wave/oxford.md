<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# oxford (GB5)
Access: ox.ac.uk pages, the UAT-UK timeline PDF and medsci.ox.ac.uk all returned 403 to WebFetch and curl (browser UA too). Facts below come from search summaries of those pages except where marked scraped.
Rows added: none. Rows corrected: none (UCAS 15 Oct 2026 18:00 row matches the maths.ox.ac.uk TMUA page, scraped, and search summaries). Cycle file is an unchanged copy.
Steps added: online_interview (interview, all courses, no deadline): shortlisting November 2026, interviews December 2026, decisions January 2027. Source https://www.maths.ox.ac.uk/study-here/undergraduate-study/tmua, scraped (Computer Science); applying it to Economics and Management and Medicine rests on search summaries of ox.ac.uk/medsci pages (summary). researched true, checked_on 2026-11-05.
Not added: admissions tests (TMUA / TARA / UCAT) come from programs.admissions_test, not steps; Economics and Management written work listed "None" and the 10 Nov 2026 written-work deadline applies to other courses (summary); Medicine has no written work found (summary). Test booking deadline 28 Sep 2026 and test dates 12-16 Oct 2026 are past (TMUA page scraped); UCAT last sitting 24 Sep 2026 (summary).
Not found: test results date (summary only, 16 Nov), offer reply/deposit dates, any international undergraduate scholarship date (none located).
Time offset: gov.uk/when-do-the-clocks-change (scraped): UK clocks go back 25 Oct 2026; 15 Oct 2026 was still BST, so 18:00 UK = 01:00 on 16 Oct Taiwan, as the existing label says.
Note: step ids must match ^[a-z0-9_]{1,40}$ in build_application_steps.py (underscores).
# oxford
## Browser pane pass (2026-11-05)
CONFIRMED (scraped) https://www.ox.ac.uk/admissions/undergraduate/applying/guide-for-applicants/interviews : "Shortlisted applicants will be invited to online interviews in December 2026."
CORRECTED step online_interview: name said "shortlisting emailed in November"; page says invitations come "usually between the middle of November and early December" -> name now "...(invitations usually mid-November to early December)"; source_url changed from the Maths TMUA page to the interviews page.
Admissions tests (scraped) .../guide-for-applicants/admissions-tests : Computer Science - TMUA; Economics and Management - TARA; Medicine - UCAT. Matches programs.admissions_test.
Written work (scraped) .../guide-for-applicants/written-work : Computer Science, Economics and Management, Medicine "None required"; general deadline 10 November (not applicable to our courses). No written_work step.
Page failures: two guessed URLs 404 before the right path was found (no impact).

## Integration (2026-11-05)
Taken as proposed (rows appended, steps file as proposed).
