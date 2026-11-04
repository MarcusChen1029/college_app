<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# uwa (batch MX)

## Rows added
- application, intake s2, 2027-06-07, "International applications for Semester 2 2027 (all other countries)"; src deadlines (uwa.edu.au international-applicants); scraped. No clock time on the page.

## Rows corrected
- Row 0 (S1 11 Jan 2027) notes: earlier-date group dates "28 December 2026 and 24 May 2027" -> "21 December 2026 and 17 May 2027". Source: https://www.uwa.edu.au/study/how-to-apply/international-applicants (scraped 2026-11-05; the table shows 21 December 2026 / 17 May 2027 for 2027). Taiwan is not on the earlier-date country list, so 11 Jan 2027 and 7 Jun 2027 apply. The `deadlines` source key kept its url; accessed set to 2026-11-05 and title extended with the S2 date.

## Steps
None added; researched true, checked_on 2026-11-05. Read the UWA international page and the Bachelor of Science, Bachelor of Economics and Bachelor of Engineering (Honours) course pages: no interview, portfolio, test or supplementary form is listed for these courses (scraped; "Some courses have earlier closing dates" noted on the page, none shown for these three). admissions_url unchanged.

## Not added
- Global Excellence Scholarship: automatic consideration on applying, no date (scraped). Some other scholarships need separate applications, none with a published date for these courses.
- Acceptance: each offer letter carries its own expiry date; no fixed deadline published.
- Course-level dates: no change to any programs[].application_deadline; no colleges copy written.

## Not found
Application clock time; fixed offer-acceptance or deposit date; whether the Semester 2 date applies to all three courses (page only says some courses have different dates; Semester 2 intake availability per course not checked).

## Time offsets
Perth AWST UTC+8, same as Taiwan (IANA tz database via python zoneinfo, 11 Jan 2027 23:59 Australia/Perth = 23:59 Asia/Taipei). No clock times used in rows.

## Integration (2026-11-05)
Row 0 notes corrected in place (earlier-date group: 21 Dec 2026 / 17 May 2027); S2 row appended; both cite a source copy with accessed 2026-11-05.
