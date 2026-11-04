<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# queens-university (CA2)

Rows added
- "Deadline to respond to an offer of admission (students not attending an Ontario high school)" | 2027-05-01 | deposit | src key_dates (https://www.queensu.ca/queensubound/key-dates) | scraped. Notes carry the 1 Jun 2027 4 PM ET residence deposit (04:00 on 2 Jun Taiwan, EDT UTC-4 in June).
Rows corrected: none. Existing rows confirmed by scraping queensu.ca/admission/applying/dates-deadlines: 1 Mar 2027 application, 31 Mar 2027 documents, 8 Dec 2026 MAA on SOLUS (page gives no clock times; recommended OUAC date 20 Nov 2026 vs the page's 15 Nov mention).
Steps added: none. researched true, steps []: queensu.ca/admission/applying/supplementary-application (scraped) lists only Commerce, Health Sciences, Nursing (Kira Talent, due 15 Feb 2027); Computing, Economics (Arts) and Engineering are not listed. Caveat: that page does not itself list Engineering/Computing admission requirements; no separate Engineering page was reachable (404).
Not found
- Tuition deposit due date (CAD 2,500 in the 2026 cycle, search summary only): set by the offer letter; no row.
- Clock times for the 1 Mar and 8 Dec dates: not published.
Time offsets: Eastern UTC-5 until 14 Mar 2027 (search summary of timeanddate.com/time/change/canada?year=2027; summary tag).
Admissions_url set to https://www.queensu.ca/admission/international (scraped, title "International Students").

## Integration (2026-11-05)
Deposit row appended; notes drop the 4 PM ET residence time (June Eastern offset unverified) and the CAD 2,500 tuition deposit (search summary).
