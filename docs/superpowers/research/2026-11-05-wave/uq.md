<!-- Copied from the Task 11 wave workspace on 2026-11-05. The research agents' own words; the integration notes at
     the end say what went into data/. -->

<!-- uq was researched in the shared AU3 batch (unsw, uq, uts); this is that batch's report. -->

# AU3 report: unsw, uq, uts (checked 2026-11-05)

Tags: scraped = fetched page text read (WebFetch summary of the page); summary = search summary only.

## Intake confirmations
- UNSW: admissions-info page calls Term 1 the "February intake" (scraped). It does not literally say "Semester 1"; treated as s1 (Feb start, same as UQ 22 Feb and UTS 15 Feb). Term 2/3 undergraduate dates: page says "T2 and T3 dates will be updated soon" (not found).
- UTS: 2027 principal dates page: Autumn Session classes start 15 Feb 2027; international (outside Australia) application closing 30 Nov 2026 (scraped). So Autumn = s1 confirmed.

## Rows added (appended at end)
unsw
- deposit, s1, 2026-12-24, "Acceptance deadline for Round 5 offers (Term 1 2027), 11:59 pm AEDT (20:59 on 24 Dec, Taiwan)", src deadlines_r (unsw admissions-info), scraped. Note: applies to Round 5 offers; other rounds and an 8-week window noted.
uq
- application, s2, 2027-05-31, "Direct applications to UQ close - Semester 2 2027 intake", src deadlines_s2 (UQ CS page), scraped. Not confirmed for Economics/Engineering.
uts
- application, s2, 2027-04-30, Spring session closing (outside Australia), src deadlines (existing UTS page), scraped; year not printed on page, inferred as 2027; principal dates page not confirmed for Spring.
- scholarship, s1, 2026-12-01, UTS GCE A Level and IB Scholarship, 11:55pm AEDT (20:55 Taiwan), src scholarship_gce, scraped. Only for A Level/IB applicants.

## Rows corrected
None. (UNSW 15 Nov, UQ 30 Nov, UTS 30 Nov existing rows confirmed.)

## Steps added
None for any slug. researched: true with steps [] for all three, because the general international admissions pages (and the UQ Computer Science page) mention no portfolio, interview, test or supplementary form for these courses. Degree-specific pages for Economics, Mechanical Engineering and UNSW/UTS CS were not read (guessed URLs 404), so this is "none found", not "none exist". UTS lists a personal statement among documents (not added: not shown as a distinct step/deadline); UTS portfolio is design-only.

## Not found
- UNSW: Term 2/3 undergraduate deadlines; deposit amount/date; international scholarship PUCA1029 and related closed 30 Oct 2026 (past; not added). Scientia 18 Dec 2026 appeared only in a search summary and was not verified (not added).
- UQ: offer acceptance deadline and deposit (set in offer letter; offers 1 Oct 2026 to 16 Feb 2027); UQ International Excellence Scholarship has no separate application or date (automatic).
- UTS: offer acceptance/deposit deadline. Tuition fees due 4 Mar 2027 (principal dates) was not added as a deposit row.

## Time offsets
AEDT UTC+11 until 4 Apr 2027 and Taiwan UTC+8 taken from the brief; not independently verified on an official time site. The UNSW and UTS pages themselves state AEDT.

## Integration (2026-11-05)
S2 row appended.
