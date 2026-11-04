<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

# western-university (batch MX)

## Rows added (end of deadlines)
- scholarship, 2027-02-14, "International President's Entrance Scholarship (National Scholarship application), 23:59 Eastern time (12:59 on 15 Feb, Taiwan)"; src scholarship (studentservices.uwo.ca National Scholarship 2027-2028 page); scraped.
- deposit, 2027-06-03, "Residence Placement Questionnaire and residence prepayment (first-year residence)"; src deadlines (welcome.uwo.ca key dates), plus residence.uwo.ca key steps (source key residence, defined but only cited in notes); scraped. International prepayment date is "in your Residence Offer letter" per Western search summary of residence guide (summary), noted in the row.

## Rows corrected
None. Existing rows (OUAC 15 Jan, Ivey AEO 15 Jan, Casper 2 Mar) match the key-dates page (scraped).

## Source changes
New keys: requirements, scholarship, residence. `deadlines` accessed date set to 2026-11-05 (url unchanged).

## Steps added
- casper, test, "Casper test (online situational-judgement test, Engineering)", courses [engineering-common-first-year-ee], deadline "Last Casper test date (Engineering)", welcome.uwo.ca US requirements page; scraped. researched true, checked 2026-11-05. admissions_url = https://welcome.uwo.ca/international/index.html.
- Note: step id regex in scripts/build_application_steps.py is ^[a-z0-9_]{1,40}$ (no hyphens), not the brief's hyphen form; "casper" fits both.

## Not added (no tracked course applies)
Music audition registration 1 Feb, Studio Arts portfolio 15 Feb, SASAH statement 28 Feb, Commercial Aviation Mgmt form 1 Mar, WISc (Science, "April 2027 TBC"), all scraped from the key-dates and requirements pages; none concern computer-science-ecs, economics-social-science-eo or the engineering course. CS and Economics have no supplemental requirement on the requirements page.

## Not found
- Fixed acceptance deadline for international offers (only Ontario high-school rule of 1 Jun, which does not apply).
- Exact English-test deadline (page says "mid April").
- Welcome to Canada / Continue in Canada admission scholarships are automatic (no separate application, no date).
- Page lists no clock time for OUAC 15 Jan deadline.

## Time offsets
Eastern Canada EST UTC-5 until 14 Mar 2027, Taiwan UTC+8 (13 h ahead). Checked with the IANA tz database (python zoneinfo): 14 Feb 2027 23:59 America/Toronto = 15 Feb 2027 12:59 Asia/Taipei. timeanddate.com returned 403.

## Integration (2026-11-05)
Scholarship and residence rows appended; the residence row's notes drop the summary-only offer-letter sentence. Casper step taken.
