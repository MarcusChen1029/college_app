<!-- Task 11 wave queue, browser pass and integration summary. Copied from the wave workspace on 2026-11-05. -->

# Data wave queue (Task 11) — base commit b130aa6, dispatched 2026-11-04

| Batch | Slugs | Agent id | Status | Notes |
|---|---|---|---|---|
| GB1 | bath, birmingham, bristol | a2dfbbea12a5dd5ca | done | bath +2 scholarship rows; birmingham 0; bristol +1 Think Big 2027-03-19 13:00 UK (21:00 Taiwan); all researched true (one course page each) |
| GB2 | cambridge, durham, edinburgh | a726f3d2b1521a852 | done | cambridge +2 rows (MCA, transcript 22 Oct) +2 steps; durham 403, 1 step from SUMMARY ONLY with researched true (BROWSER PASS or researched false); edinburgh +1 step (medicine assessment) |
| GB3 | exeter, imperial, kings-college-london | ab537842a5fda687f | done | exeter +1 scholarship 4 Mar 11:59 GMT +1 step (pre-CAS interview, some cases); imperial +2 rows (Inspires scholarship 5 Feb 23:59; ESAT/TMUA booking 21 Dec) +1 step (computing interview); kcl pages truncated, researched false (BROWSER PASS) |
| GB4 | leeds, loughborough, lse | a659f6273e6a7de6d | done | leeds 0 rows researched; loughborough +1 scholarship 2027-04-11; lse +1 TMUA registration 2026-12-21 (other); all researched true |
| GB5 | manchester, nottingham, oxford | ade5eed6efc66b6d8 | done | manchester, nottingham researched true no steps; oxford 403, 1 step online_interview from SUMMARIES (BROWSER PASS) |
| GB6 | southampton, ucl, warwick | a472e9fbb29549e86 | done | southampton +1 scholarship 2027-04-30 17:00 UK; ucl 403, +1 LNAT row SUMMARY ONLY (exclude unless browser pass), researched false; warwick +2 other rows (proof of qualifications) |
| CA1 | alberta, calgary, mcgill | afc2f332f24935704 | done | alberta +4 rows, researched false, Mountain offsets UNVERIFIED; calgary site in maintenance, existing 1 Apr row may be 1 Mar (BROWSER PASS); mcgill +2 steps |
| CA2 | mcmaster, queens-university, simon-fraser | ab2d2f3ab560ee913 | done | mcmaster +1 scholarship +1 step (Kira); queens +1 offer response 1 May; sfu +3 rows; Pacific/Eastern DST date from summary |
| CA3 | toronto, ubc, waterloo | a9b5ee318a431c540 | done | toronto +2 steps (ESA, CS supplementary; A&S page blocked); ubc +4 rows (deposit "1 May or 1 Jun per letter" -> used 1 May: LABEL MUST SAY SO) +2 steps; waterloo +3 rows +3 steps (interview required vs optional conflict); ET/PT offsets from search summary |
| AU1 | adelaide, anu, macquarie | ac10f3993f9bf3b2d | done | adelaide +1 step (scholarship form, no close date); anu +4 rows SUMMARY ONLY (site HTTP 500, BROWSER PASS); macquarie +1 S2 row from existing notes, intl view script-loaded, existing 8 Feb S1 row unconfirmed (BROWSER PASS) |
| AU2 | melbourne, monash, sydney | a31fc7b8dd4f300a7 | done (thin) | melbourne 403 (study.unimelb.edu.au), mid-year date conflict: file 31 Mar 2027 vs research 31 May 2027; monash rolling, course pages 403; sydney +1 S2 row 2027-05-29 |
| AU3 | unsw, uq, uts | a4a35d3ac8855b50f | done | unsw +1 acceptance 2026-12-24; uq +1 S2 close 2027-05-31; uts +2 (Spring close 2027-04-30 page prints no year - SPOT-CHECK; scholarship 2026-12-01); researched true from general pages only (course pages not read); UTS Autumn = S1 confirmed, UNSW Term 1 = February intake |
| MX | western-university, uwa | a9c01bcef9323a7e5 | done | western +2 rows (scholarship 14 Feb 23:59 EST; residence prepayment 3 Jun) +1 step (Casper, Engineering); uwa +1 S2 row 7 Jun, 1 notes correction |

Other agents running at the same time: Task 10 reviewer acb3446f4e8de30bd (opus); Task 9 fix round 1 (implementer aaa1b1bdf939a0787).

On a stall notice: SendMessage the same agent: "re-read your files in wave\ on disk; continue from where they stop; hard timeouts".

## Browser pass (2026-11-05) - status per item

1. melbourne - CORRECTED/CONFLICT. S1 2027 close 30 Nov 2026 CONFIRMED (course page + general page). Mid-year close NOT settled: course page says 31 Mar 2027, general international applications page says 31 May 2027. S1 row notes edited to say so; no S2 row added. Scholarship: automatic, no date. Controller decides S2 date.
2. durham - CONFIRMED. send_scanned_qualifications step on durham.ac.uk application-guidance (scraped). CS course page: no extra steps seen (partial). No changes beyond report.
3. calgary - CORRECTED. Dates page (scraped): 1 Mar = Fall application deadline, 15 Mar = documents. Row 1 Apr 2027 -> 1 Mar 2027; row added for 15 Mar documents. Requirements page (source of 1 Apr) failed (maintenance site), so 1 Apr could not be re-read. Page does not print the year or say "international".
4. ucl - CONFIRMED. LNAT 31 Dec 2026 (scraped, UCL Laws page). CS requires TARA, Economics requires TMUA (scraped; already in programs). No interview/other steps for tracked courses. steps/ucl.json: researched true, steps [].
5. oxford - CONFIRMED + CORRECTED. Online interviews December 2026 (scraped). Step name corrected (invitations mid-Nov to early Dec, not "emailed in November"); source_url now ox.ac.uk interviews page. Tests CS TMUA / E&M TARA / Medicine UCAT confirmed; written work "None required" for all three.
6. anu - PAGE FAILED. All study.anu.edu.au / anu.edu.au pages HTTP 500 in the browser. The 4 summary rows stay UNCONFIRMED (left untouched).
7. macquarie - CONFIRMED. International view: S1 closes 8 Feb 2027, S2 closes 12 Jul 2027 (domestic view differs: 28 Jan / 11 Jul). S2 row notes updated.
8. kings-college-london - UNCONFIRMED. how-to-apply re-read (UCAS 13 Jan 2027 18:00 confirmed); course pages' entry requirements not in page text; no extra steps proven. researched stays false.
9. toronto - CONFIRMED + CONTENT ADDED. Arts & Science CS Supplementary Application: four short-answer questions, in JOIN U of T account after OUAC, not timed; due 1 Feb (scraped). Step name + source_url updated.
10. monash - CONFIRMED NO EXTRA STEPS. International entry requirements for Computer Science, Economics, Engineering list only age, academic, English, prerequisites (scraped). researched true, steps [].
11. alberta - CONFIRMED dates; OFFSETS NEED DECISION. All 5 dated rows match the official page and scholarship page (10 Jan). Official time source not reachable; timeanddate (secondary) says Alberta has no DST in 2027, which would make three Taiwan-time labels (30 Apr, 1 May, 1 Aug) one hour off (13:59 -> 14:59). Not edited; see reports/alberta.md.

## Integration into data/ (2026-11-05, Task 11 part 2)

Policy (controller rulings): a fact read only from a search summary, or a time conversion that rests on an unverified
offset, stays out unless the browser pass confirmed it on the official page; a `researched: true` resting on such a fact
became false. Rows were only appended or corrected in place. Totals: 39 rows appended (GB 14, CA 19, AU 6: 13
scholarship, 15 other, 7 deposit, 4 Semester 2 application), 3 rows corrected in place (Calgary, Melbourne, UWA), 14
steps, 29 of 38 universities researched. Per-university notes are at the end of each report in `2026-11-05-wave/`.

Left out (and why):
- ANU: the 4 summary-only rows (S1 acceptance 15 Jan 2027, under-18 acceptance 11 Jan 2027, S2 close 15 May 2027,
  S2 acceptance 30 Jun 2027); the site returned HTTP 500 to the browser pass too.
- UTS: Spring (July) 2027 close 30 Apr; the page prints no year and is not the 2027-intake page (the 2027 principal
  dates page confirmed only Autumn).
- McGill: both Engineering steps (personal statement, video interview). A direct read of the submit-documents page
  showed that section is headed "Engineering - Global Engineering only", not Mechanical Engineering; researched false.
- Loughborough: researched false (the "no extra steps" finding rested on a search summary).
- Waterloo: the Engineering interview step (the report gives no official wording; required vs optional conflict).
- UBC: the "Proof of English" step (a Canadian `test` step becomes the checklist's test-scores item, which would
  duplicate the English-test item); the 15 Feb English-documents row stays.
- Adelaide: the Academic Excellence Scholarship form step (an optional scholarship, ATAR 99 or equivalent, no
  deadline; as a step it would count against every Adelaide student's progress). researched stays true, steps [].
- Times: Alberta's 30 Apr, 1 May and 1 Aug labels/notes and Waterloo's 1 Jun / Queen's 1 Jun Eastern times dropped
  (dates kept): the Taiwan conversion depends on 2027 daylight-saving rules confirmed only by secondary or summary
  sources. Summary-only notes text dropped from Queen's (CAD 2,500 deposit) and Western (residence offer letter).
