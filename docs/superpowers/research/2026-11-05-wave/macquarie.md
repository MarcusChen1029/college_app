<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# macquarie report
Rows added: application, s2, 2027-07-12 "International applications close - Session 2, 2027 (North Ryde)", src deadlines. Value comes from the existing S1 row's notes (earlier scrape of the same page); NOT re-confirmed today.
Rows corrected: none, but a conflict is open. Course page (curl, scraped 2026-11-05, default "domestic student" view) shows: Session 1 closes 28 January 2027, Session 2 closes 11 July 2027, opens 8 Apr 2026 / 7 Apr 2027. The international view loads by script and could not be read, so the existing 8 Feb 2027 (S1) was neither confirmed nor refuted. Please re-check in a real browser with "international student" selected.
Steps: none added; researched stays false. International apply page (scraped) says apply directly or via an authorised agent, supplementary forms exist under documentation, but names no course-specific extra step. Course page: portfolio only for non-Year-12 applicants with no formal qualifications (domestic route).
Scholarships [scraped/summary]: $5,000 Regional Scholarship for international students is assessed automatically, no closing date. Advantage scholarship dates (13 Nov 2026, 10 Dec 2026, 8 Jan 2027) are domestic only, not used. VC's International Scholarship: no official date found.
Not found: acceptance/deposit deadlines, international S1 date confirmation.
Time offset source: no clock times used.

## Browser pane pass (2026-11-05)
CONFIRMED (scraped, international view chosen in the page's student-type modal) https://www.mq.edu.au/study/find-a-course/courses/bachelor-of-information-technology/ : Important dates table, North Ryde: Session 1 opens 1 January 2026, closes 8 February 2027, commences 22 February 2027; Session 2 opens 1 January 2026, closes 12 July 2027, commences 26 July 2027. Text: "The application closing date may vary depending on your location."
No corrections. The earlier conflict (domestic view: S1 28 Jan, S2 11 Jul 2027) is explained: those are the domestic dates. S2 row notes updated from "confirm before relying" to confirmed; source accessed date -> 2026-11-05.
Not checked: Economics and Engineering (Honours) course pages (same dates per earlier note); acceptance/deposit; extra steps (researched stays false).
Tip: the view switch is a modal behind the "domestic student" button; programmatic click on the International card's container worked, a coordinate click did not.

## Integration (2026-11-05)
S2 row appended (browser-confirmed), citing a new source key with accessed 2026-11-05. researched false.
