<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# alberta (CA1)
Rows added (cycle\alberta.json, source key deadlines_checked = https://www.ualberta.ca/en/admissions/how-to-apply/dates-deadlines/index.html, accessed 2026-11-05, tag: summary via WebFetch of the page text):
- scholarship 2027-01-10 Entrance Award application deadline, 23:59 MT
- other 2027-04-30 self-report final marks
- deposit 2027-05-01 accept offers made before 1 Apr (Launchpad gives exact date)
- other 2027-08-01 outstanding high school documents
Rows corrected: none. Existing 1 Mar 2027 application row confirmed (page: most programs 1 Mar 2027, 23:59 MT = 14:59 on 2 Mar Taiwan; not edited in place).
Steps: none; researched false (international requirements / transcripts pages not readable; how-to-apply page only links to them).
Not found: international-specific extra steps, per-program (Computing Science, Economics, Engineering) extras, a General International Undergraduate Scholarships deadline (scholarships page 404).
Time offsets: MST UTC-7 until 14 Mar 2027, MDT UTC-6 after, Taiwan UTC+8. No official time source reachable (timeanddate 403, no tzdata); derived from the brief's Eastern DST date (14 Mar 2027), North American rule. Unverified.
Note: firecrawl out of credits; used WebFetch.

## Browser pane pass (2026-11-05)
CONFIRMED (scraped) https://www.ualberta.ca/en/admissions/how-to-apply/dates-deadlines/index.html : "All deadlines are effective as of 11:59 p.m. MT"; "January 10, 2027 Entrance Award Application Deadline"; "March 1, 2027 ... Deadline to submit application for admission for most programs"; "April 30, 2027 Deadline to self-report final high school marks"; "May 1, 2027 Deadline to accept admission offers made before April 1" (Launchpad shows your exact date); "August 1, 2027 Deadline to submit outstanding documents for high school students". Rows' dates all match; the rows' tag summary -> scraped.
Scholarships (scraped) https://www.ualberta.ca/en/admissions/tuition-and-scholarships/international-entrance-scholarships/index.html : "The deadline for application-based scholarships is January 10." Admission-based scholarships need no application. Matches the Entrance Award row (2027-01-10).
TIME OFFSETS - NEEDS CONTROLLER DECISION. Official sources did not load (nrc.canada.ca 403; alberta.ca page 404). Secondary source timeanddate.com (read in browser): Toronto 2027: DST starts 14 Mar 2027, ends 7 Nov 2027 (so the brief's Eastern UTC-5 until 14 Mar 2027 is supported). But for Edmonton: "Last change: 2026, 1 Nov DST end ... No further time changes in 2027 ... DST not observed in 2027-2029" (https://www.timeanddate.com/time/change/canada/edmonton?year=2027). If true, Alberta stays on MST (UTC-7) all 2027 and three labels that assume MDT UTC-6 are one hour off for Taiwan: 30 Apr row would be "14:59 on 1 May, Taiwan" (now says 13:59), 1 May row "14:59 on 2 May" (now 13:59), 1 Aug row "14:59 on 2 Aug" (now 13:59); notes "Mountain Daylight Time, UTC-6" would become "Mountain Standard Time, UTC-7". The 10 Jan row (MST) is unaffected. NOT edited because the only source is secondary; confirm Alberta's 2027 time rule on an official page, then apply.
Extra steps for Computing Science/Economics/Engineering: not checked this pass; researched stays false.

## Integration (2026-11-05)
Rows 1-4 appended. Rows 2-4 (30 Apr, 1 May, 1 Aug): clock time dropped from label and notes (Alberta's 2027 daylight-saving rule unconfirmed, controller ruling); row 1 (10 Jan, MST) kept with its Taiwan time. researched false.
