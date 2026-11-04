# Canada: after the offer, study permit, and money (Fall 2027 entry)

Research date: 2026-11-04. Target: entry September 2027, students applying from Taiwan.
Scope: everything after an offer, plus money. (Application systems, deadlines, supplementals and qualification recognition are covered by another agent.)

How this was done: Firecrawl credits ran out after 5 calls, so the rest used WebFetch/WebSearch and `curl` on official pages. WebFetch and WebSearch return a model's summary of a page, not the raw page, so every figure below is marked with how it was checked:
- **[page]** = a fetched page stated it (page date given where it showed one).
- **[snippet]** = only seen in a search-result summary of the official site; not opened.
- **[3rd]** = third-party article, not official.
- **[inference]** = my reading, not stated by the source.

Status labels: **IN FORCE** (official page says so now), **ANNOUNCED** (official, future), **UNCONFIRMED** (not found on an official page). "Not found" is a real answer here.

---

## 1. After-offer timeline (Fall 2027, applicant from Taiwan)

The order of dependencies is what matters. The deposit gates the PAL; the PAL gates the permit application; for Quebec the CAQ replaces the PAL.

| When (typical) | Step | Amount / rule | Source |
|---|---|---|---|
| Oct-Nov 2026 (before any offer) | Scholarship deadlines that fall BEFORE offers | UBC International Scholars due **Nov 15, 2026 23:59 PT**; Pearson (U of T) scholarship application due **Nov 6, 2026**, school nomination was due Oct 9; U of Alberta President's International Distinction Scholarship due **Jan 10, 2027** | section 4 |
| Jan 15, 2027 | OUAC application deadline (Group A, Ontario) | Offers are conditional on final grades | 2.1 |
| Feb-May 2027 | Offers arrive | Read the response date printed in each offer | 2 |
| Mar 31, 2027 (Toronto) / May 1, 2027 (UBC) | Residence application deadlines for first-year guarantee | U of T "deadline to apply for residence is March 31" [page]; UBC "May 1, 2027" first-year housing guarantee [page] | 2 |
| By the response date in the offer; earliest an Ontario school may require it: **June 1, 2027** | Accept + pay deposit | U of T about CAD 5,000 [snippet]; UBC CAD 3,000 [page]; McGill CAD 2,500 [page]; Alberta, Waterloo not found | 2 |
| Right after payment | University releases the letter of acceptance (LOA) and the PAL (or, for Quebec, you file for the CAQ) | IRCC: "you need to accept your offer and pay your tuition fees, either in part or in full, to get your PAL/TAL" | 3.1 |
| Quebec only: within weeks of the LOA | CAQ | CAD 135, decision in 25 business days in 80% of cases | 3.4 |
| Feb-May for early acceptors, otherwise right after PAL/CAQ | Study permit application online + biometrics | Biometrics CAD 85; IRCC data file shows 4 weeks for Taiwan (outside Canada) | 3.3, 3.6 |
| 30 days from the biometrics letter | Give biometrics at the Taipei VAC | Appointment required [snippet] | 3.6 |
| June-Aug 2027 | Pay residence deposits / first instalment; buy health insurance | e.g. UTSC two CAD 1,000 deposits (2026 dates June 12 and Aug 6) [snippet]; UBC first instalment within 7 days of residence offer [snippet] | 2 |
| By Aug 1 (UTSC rule) | Decide whether to cancel if no permit yet | UTSC encourages students without a permit by Aug 1 to cancel for a full deposit refund [snippet] | 5 |
| Late Aug-Sep 2027 | Travel and arrive; carry permit introduction letter, LOA, proof of funds | not researched in detail | - |

Gap: nothing was found that says how early a student may apply for the permit before the program start. IRCC's apply page says only "Generally, you must apply for a study permit before you come to Canada" and gives no lead time (page dated 2026-09-02).

---

## 2. Acceptance rules and deposits per major university

### 2.1 Ontario (OUAC rule) - applies to Toronto, Waterloo, Queen's, McMaster, Western, etc.
- **June 1 rule.** For the 2026-27 cycle, **June 1, 2027** is the earliest date an Ontario university may require a Group A applicant to respond to an offer and make a financial commitment (registration or residence deposit). Individual universities may set later dates. Group B applicants respond by the deadline stated in their offer. [snippet of OUAC pages: https://www.ouac.on.ca/guide/105-dates/ and https://guidance.ouac.on.ca/resources/schedule-of-dates/ ; my direct fetches of these pages returned HTTP 403, so the wording was not checked on the page itself]
- Group A applicants who applied by the **January 15, 2027** deadline can expect a response by **May 28, 2027**. [snippet, same pages]
- Only one acceptance on file at a time; cancel the first before accepting another. Residence deposits do not replace the official response. Some schools allow one-year deferral if accepted by June 1 and all conditions met. [snippet, https://guidance.ouac.on.ca/applications/accepting-an-offer/]
- UNCONFIRMED: whether international applicants are treated as Group A for every Ontario program (Group A/B definitions were not read on the page).

### 2.2 Per university

| University | Accept-by date for Fall 2027 | Deposit (international) | Refundability | Residence | Source |
|---|---|---|---|---|---|
| **U of Toronto** | "the deadline stated in your offer letter" [page]. The 2026 cycle residence guarantee used offer acceptance by **June 2, 2026** [snippet]; the 2027 equivalent is UNCONFIRMED. | **CAD 5,000** admission deposit, credit card only, due at the offer response date; credited to tuition [snippet, UTSC/UTM pages]. A faculty-level page (Social Work) shows CAD 500 [snippet], so check the offer letter. | UTSC/UTM: non-refundable [snippet]; UTSC encourages cancelling by Aug 1 if no permit yet to receive a full refund [snippet] | Apply by **March 31**; guarantee also needs offer accepted by the June date [snippet]. UTSC: two CAD 1,000 deposits (2026: June 12, Aug 6). UTM: CAD 1,650 non-refundable acceptance deposit. University College: CAD 1,000 + CAD 1,000 (second non-refundable). | https://future.utoronto.ca/timeline-international-student [page]; UTSC/UTM/UC pages [snippet] |
| **UBC Vancouver** | **May 1, 2027 or June 1, 2027** (date is in the offer / Applicant Service Centre) [page] | **CAD 3,000**, credit card, credited to tuition [page, calendar policy] | Non-refundable, except proof of a denied study permit: refund less CAD 150 processing fee [page, https://vancouver.calendar.ubc.ca/fees/policies-fees]. A 2024 Board paper described 50% refunds; current policy page contradicts it (treat the Board paper as outdated). | First-year guarantee: apply by **May 1, 2027**; offers early June 2027 [page]. Pay the first instalment within 7 days of the offer or lose it; card payments carry a 2.65% fee [snippet, https://vancouver.housing.ubc.ca/applications/fees-payments/] | https://you.ubc.ca/applying-ubc/dates-deadlines/ (no page date; covers 2026-27 cycle) |
| **McGill** | "before the deadline given in your letter of acceptance"; date not stated on the page [page] | **CAD 2,500** international (CAD 500 Canadian/PR), paid in Minerva [page]. McGill's "Important updates" page still shows CAD 1,000 [snippet], likely stale. | Refund policy not stated on the accepting page; deposit forfeited if you do not enrol unless deferred [snippet] | Guaranteed to first-year undergraduates aged 22 or under on Sept 1 who accept before the residence confirmation deadline [snippet]. Residence deposit quoted as CAD 1,500 on one page and CAD 500 on the Macdonald page [snippet]: UNCONFIRMED. | https://www.mcgill.ca/accepted/nextsteps/accepting (no page date; footer 2026) |
| **Waterloo** | UNCONFIRMED (Ontario June 1 rule applies) | not found | not found | not found | - |
| **Alberta** | not found | not found | not found | not found | - |

Key McGill point [page]: "International students must accept the offer and pay the confirmation deposit before they can access the official letter needed for CAQ and study permit applications." McGill also says it expects admitted international students not to be refused a CAQ because its allotment was exceeded [snippet].

Conditional offers and final transcripts: OUAC says offers are conditional on meeting minimum academic requirements; applicants should read the conditions in the offer [snippet]. Per-university final-transcript deadlines were NOT found.

---

## 3. Study permit, PAL/TAL, CAQ, proof of funds - current rules

### 3.1 PAL/TAL (provincial/territorial attestation letter)
- **IN FORCE.** A PAL/TAL is "usually required". The province issues it; the school ("designated learning institution") provides it; the student asks the school how. Submit it WITH the permit application, one per applicant. (IRCC PAL page, dated 2026-09-02: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/provincial-attestation-letter.html) [page]
- **IN FORCE.** "In most cases, you need to accept your offer and pay your tuition fees, either in part or in full, to get your PAL/TAL." (IRCC, dated 2026-10-06: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents.html) [page]
- **IN FORCE.** Validity: valid until Dec 31, 2026 for the 2026 cap year (issued Jan 1 - Dec 31, 2026) unless an earlier date is printed on it. "You can't apply with a PAL/TAL that was issued during a previous study permit cap year." It must be valid when you APPLY, not when you start. [page]
- **[inference]** A Fall 2027 entrant applying in 2027 will need a PAL from the 2027 cap year. IRCC's page lists only the 2025 and 2026 cap years today.
- **IN FORCE.** A PAL is tied to the school. A new one is needed for changing schools (since Jan 22, 2025), after an approved or refused application, or after expiry. The same PAL can be reused only if it is still valid AND the earlier application was withdrawn after being accepted for processing or was not accepted for processing (fee refunded). [page]
- **IN FORCE.** Exempt: preschool, primary, secondary; master's and doctoral programs at public institutions (from Jan 1, 2026); no-tuition exchange students; Global Affairs Canada scholars. **Bachelor's students are not exempt**, so every Taiwanese undergraduate needs a PAL (or a CAQ for Quebec). [page]
- **IN FORCE.** Letter-of-acceptance verification: "Your school will be asked to make sure your letter of acceptance (LOA) is valid. If your school does not respond by the deadline, we'll return your application and refund your processing fee." Students are told to confirm with the school that it will validate the LOA before resubmitting. Attach the LOA only in the LOA-specific space; anything else put there is disclosed to the school. (IRCC, dated 2026-10-06) [page]

### 3.2 The cap (2026 published; 2027 not found)
- **IN FORCE (announced Nov 25, 2025).** 2026: up to **408,000** study permits expected (155,000 new arrivals + 253,000 extensions); 180,000 for PAL-required applicants; **309,670** application spaces under the cap for PAL-required students. Allocation of applications: Ontario 104,780; Quebec 93,069; BC 32,596; Alberta 32,271; Manitoba 11,196; Saskatchewan 11,349; Nova Scotia 8,480; New Brunswick 8,004; Newfoundland and Labrador 5,507; PEI 1,376; NWT 785; Yukon 257; Nunavut 0. "Each province or territory is responsible for distributing their allocated spaces to their respective designated learning institutions." (IRCC notice, dated 2025-11-25: https://www.canada.ca/en/immigration-refugees-citizenship/news/notices/2026-provincial-territorial-allocations-under-international-student-cap.html) [page]
- IRCC's stated aim: reduce temporary residents to below 5% of the population by end of 2027 (same notice) [page].
- **2027 cap: UNCONFIRMED.** A search of canada.ca found no 2027 allocation notice and no published 2027-2029 Levels Plan (a search-summary of IRCC's 2026-27 Departmental Plan repeats 155,000 new student arrivals in 2026 and 150,000 in each of 2027 and 2028 from the 2026-2028 plan [snippet]). The 2026 allocation notice came out Nov 25, 2025; the 2025 one came in January 2025. Third-party posts say the 2027-2029 plan was due by Nov 1, 2026; I could not confirm it was tabled. Treat 2027 numbers as unknown until IRCC publishes.

### 3.3 Proof of funds (IRCC)
- **IN FORCE for applications on or after Sept 1, 2026 (outside Quebec):** CAD **23,448** per year for the applicant for living costs (2 people 29,192; 3 people 35,888; 4: 43,572). Previous band shown on the page: CAD 22,895 for applications Jan 1, 2025 - Aug 31, 2026. The amounts "do not include tuition and transportation costs" and "are updated each year". (IRCC, dated 2026-08-28: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html) [page]
- So the figure to show for a single applicant = first-year tuition + CAD 23,448 + return travel. **[inference]** A student applying in spring 2027 falls under the CAD 23,448 band unless IRCC publishes a newer one.
- Evidence listed (examples, not a complete list): proof of first-year tuition and housing paid to the school (must be accompanied by proof of living funds); bank education loan; scholarship letter; pay stubs; a letter from the person giving money (their job, relationship, dependants, amount) with their ID or business registration; proof of a Canadian bank account if money was transferred; a GIC from a Canadian financial institution; **bank statements for the past 6 months, including the month of application or the month before, with documents showing where the money came from**; pension documents; rental income proof. For programs longer than a year the student must also explain how later years will be paid. [page]
- GIC is one acceptable option, not the only one [page]. (Student Direct Stream: not verified in this research; nothing on the pages above refers to it.)
- Foreign-exchange controls: must prove funds can be exported [page]. Taiwan-specific rule: not checked.

### 3.4 Quebec (McGill): CAQ
- **IN FORCE.** Quebec students need a CAQ (attestation) instead of a PAL. Sequence: get admitted -> apply for the CAQ "as soon as you receive your letter of admission" -> apply for the federal permit "as soon as you receive the letter confirming your CAQ". (quebec.ca, last update Oct 22, 2026: https://www.quebec.ca/en/education/study-quebec/obtaining-authorizations/authorizations) [page]
- **Fee CAD 135** (effective Jan 1, 2026), paid by credit card in Arrima, non-refundable even if refused. **Decision within 25 business days in 80% of cases** from receipt of a complete application. Documents: passport, admission letter meeting ministry requirements, tuition fee information, credit card, proof of financial capacity; 15 days to submit documents in Arrima. (quebec.ca: https://www.quebec.ca/en/education/study-quebec/temporary-selection-studies ; page label "Last update: January 1, 2026" but the text also mentions July 2026 changes) [page]
- **Cap on Quebec applications:** from Dec 17, 2025 to Dec 16, 2027 each institution has a maximum number of CAQ applications per one-year period for university/college/vocational studies; if the school's maximum is reached, a student cannot apply unless exempt; vacant places are reallocated on selected Thursdays; an order in council of July 22, 2026 revised some maximums; the tracking table is French-only. [page, same quebec.ca page]
- **Financial capacity for the CAQ:** living costs CAD **24,617** per year for a single adult for applications as of Jan 1, 2026, plus tuition and round-trip transport shown separately. (quebec.ca, last update Jan 1, 2026: https://www.quebec.ca/en/education/study-quebec/required-conditions/costs-studies) [page]
- A CAQ issued in a prior year is accepted if it is still valid at application; the CAQ must carry the sentence confirming a place in Quebec's share (IRCC PAL page) [page].
- Quebec health insurance for international students: not researched.

### 3.5 Biometrics and medical
- Biometrics: CAD **85** per person (maximum CAD 170 per family); give them within **30 days** of the biometrics letter; processing starts after biometrics are received. (IRCC apply page, dated 2026-09-02: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/apply.html) [page]. Taipei has a Canada Visa Application Centre; an appointment is mandatory (VFS Global Taiwan, https://visa.vfsglobal.com/twn/en/can/) [snippet]. Most applicants 14-79 need biometrics; they are valid 10 years [snippet].
- Medical exam: needed for a stay over 6 months if the applicant lived or travelled 6 months or more in a row in the year before coming in "certain countries or territories", or for protected jobs. **Taiwan (Republic of China): "no"**, row marked "New: As of November 3, 2025" on IRCC's country list (https://www.canada.ca/en/immigration-refugees-citizenship/services/application/medical-police/medical-exams/requirements-temporary-residents/country-requirements.html, fetched 2026-11-04; requirements page dated 2026-08-04) [page]. The same list shows "yes" for, e.g., Singapore and Thailand, so a student who lived 6+ months in a "yes" country in the prior year (international-school families who relocated) may still need an exam. A Taiwan-based student who recently lived abroad is an edge case worth a prompt in the checklist.

### 3.6 Processing time
- IRCC's processing-time data file lists **study permit (applied outside Canada), Taiwan: 4 weeks** (for comparison in the same file: Hong Kong 6 weeks, Japan 3, Korea 2, India 8, China 10). File fetched 2026-11-04 from https://www.canada.ca/content/dam/ircc/documents/json/data-ptime-en.json ; the processing-times page was modified 2026-10-30. This is a moving estimate, not a guarantee. [page]

### 3.7 Work and after-study
- **Off-campus work:** up to **24 hours per week** during regular academic sessions, **unlimited** during scheduled breaks (summer, winter break, reading week). The page does not say when 24 hours took effect, and does not cover on-campus work or co-op. (IRCC, dated 2026-04-15: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/work-off-campus.html) [page]
- **PGWP (post-graduation work permit):** "There are no field of study requirements for graduates with a bachelor's degree, master's degree or doctoral degree." Language: **CLB 7 / NCLC 7** in all four skills for bachelor's graduates. Program must be at least 8 months (900 hours in Quebec). Distance learning rules from Sept 1, 2024; time studied outside Canada is deducted from PGWP length for lock-in dates on or after that. The page lists no 2025 or 2026 changes. (IRCC, dated 2026-06-24: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/eligibility.html) [page]
- PGWP length for a 4-year bachelor's and co-op work-permit rules: not found on the pages fetched.

---

## 4. Money

### 4.1 Cost figures
| Item | Figure | Source |
|---|---|---|
| IRCC living-cost figure for one applicant (outside Quebec), apply on/after Sept 1, 2026 | CAD 23,448 per year, excl. tuition and travel | IRCC 2026-08-28 [page] |
| Quebec financial-capacity living figure | CAD 24,617 per year, applications as of Jan 1, 2026 | quebec.ca [page] |
| U of T first-year international tuition (Arts and Science, CS, Management at UTSC) | **CAD 66,110** current year; year 2+: Arts/Science 68,750, CS 72,480, Management 78,160. Page says these are "for the current year, to help you estimate fees for fall 2027" and "Accurate fees will be approved in spring 2027". | https://www.utsc.utoronto.ca/admissions/tuition-and-fees (undated; footer 2026) [page] |
| U of T incidental fees | CAD 2,286 | same page [page] |
| U of T residence (Sept-April) | CAD 8,367 - 18,022 | same page [page] |
| UHIP (Ontario compulsory health insurance), 12 months | about **CAD 948** (2026-27) | UTSC page above lists "$948 (approximate for 12 months)", mandatory [page]. News reports a 20% rise from CAD 792 [3rd: https://moving2canada.com/2026/08/ontario-international-students-will-pay-more-for-uhip/]. uhip.ca home page did not show the amount. |
| UBC iMED (temporary plan, required for new international students) | Vancouver 3-month fee shown as CAD 204.30 for 2026/27, but the source line was garbled | [snippet, https://vancouver.calendar.ubc.ca/fees/medical-insurance]: UNCONFIRMED; opt-out is not possible with private insurance alone [snippet] |
| Tuition fixed for the whole program? | **UNCONFIRMED.** U of T's report mentions cohort-based fee schedules, but the UTSC page says nothing on guarantees [page/snippet]. UBC: tuition "subject to change", UBC "reserves the right at any time to change fees without notice", so not fixed [page, https://vancouver.calendar.ubc.ca/fees/policies-fees]. | |
| Tuition at McGill, Waterloo, Alberta, UBC (amounts) | **Not researched** (the site already stores CAD fees from the earlier data wave) | gap |

Rough first-year funds a Taiwanese applicant to U of T Arts and Science would need to show (arithmetic only, my sum of the figures above): 66,110 tuition + 23,448 IRCC living figure = CAD 89,558, plus return airfare (IRCC gives no amount). Residence, incidental fees and UHIP are real costs but are not separately added in IRCC's table.

### 4.2 Scholarships open to international first-years (Fall 2027 entry)

| Name | Amount | How to apply | Deadline | Source / status |
|---|---|---|---|---|
| **Lester B. Pearson International Scholarship (U of T)** | Tuition, books, incidental fees and full residence support for 4 years; about 37 scholars per year | School nominates (one student per school per year; participating schools get the form from July 6, 2026). Student also applies to U of T; private link to the scholarship application arrives after the admission application. No agents; AI-generated content disqualifies. | Nomination **Oct 9, 2026** (passed); U of T application **Oct 16, 2026** (passed); scholarship application **Nov 6, 2026** (two days away) | https://future.utoronto.ca/pearson-scholarships [page, no page date; 2026 cycle]. For a student not already nominated, no route found. |
| **UBC International Scholars Program** (4 categories: Karen McKellin International Leader of Tomorrow; Donald A. Wehrung International Student Award; International Impact Award; Vantage One Excellence Award) | "up to the full cost of a student's academic program and living expenses"; no category amounts on the page | One application; apply to UBC first; nomination from a counsellor-type nominator plus a different teacher referee; financial information; four essays of about 150-250 words; possible video interview Jan-Mar. Applicants considered for these awards are not considered for merit awards. Needs financial need, all-A results; grad no earlier than June 2026; first undergraduate degree; some programs excluded (Nursing, Dental Hygiene, Medical Laboratory Science, dual/joint degrees). | Application opens **Oct 5, 2026**; due **Nov 15, 2026, 23:59 PT**; UBC documents due Jan 31, 2027; results April 2027 | https://you.ubc.ca/financial-planning/scholarships-awards-international-students/international-scholars/ [page, no page date]; dates page https://you.ubc.ca/applying-ubc/dates-deadlines/ [page] |
| **University of Alberta President's International Distinction Scholarship** | up to CAD 120,000 over 4 years | separate scholarship application | Opens Oct 1, 2026; closes **Jan 10, 2027** | [snippet of ualberta.ca]: https://www.ualberta.ca/en/admissions/tuition-and-scholarships/international-entrance-scholarships/index.html - not opened |
| U of Alberta International Admission Scholarship | up to CAD 10,000 (older pages CAD 5,000) | automatic from admission average | - | [snippet] Applies to students attending high school IN Canada on a study permit, so **does not fit Taiwan-based applicants**. |
| **McGill entrance scholarships** | merit, one-year and renewable; international applicants eligible in the general competition; the CAD 12,000 major awards are for Canadian citizens/PR only | not confirmed whether automatic or application-based | not found | [snippet]: https://www.mcgill.ca/studentaid/scholarships-aid/future-undergrads/entrance-scholarships . McGill entrance bursary is need-based and international students may apply; McGill recommends applying within 30 days of formal acceptance [page, accepting page]. |
| **Waterloo President's Scholarship of Distinction** | CAD 2,000 for an early-May admission average of 95%+ (plus CAD 1,500 awards claimed in later years) | automatic; no application | decided early May from admission average | [snippet of uwaterloo.ca]; whether international students qualify was NOT confirmed. |
| Waterloo "International Student Entrance Scholarship" (20 x CAD 10,000) | CAD 10,000 | unknown | unknown | **UNCONFIRMED**: seen only in an awards-database listing on pages flagged as roughly five years old. Do not publish without checking. |

---

## 5. Pain points and common mistakes

| Pain point | Evidence | Source type |
|---|---|---|
| The deposit has to be paid before the school can issue the PAL, and the PAL is needed to apply for the permit. A student pays thousands of dollars before knowing whether the permit will be granted. | IRCC wording in 3.1; U of T timeline says PAL is issued after accepting and paying the deposit | official |
| Deposits are mostly non-refundable, with refusal-based exceptions that differ by school. UBC: refund only with proof of a denied permit, less CAD 150. Manitoba: only if the permit is denied and the refusal is for the term of the PAL. Douglas College: the refusal letter must be dated after the latest LOA. Some schools take an admin fee (e.g., OCAD CAD 250; Saskatchewan colleges CAD 500). | UBC calendar [page]; others [snippet] | university policy pages |
| A PAL is single-use after a refusal; reapplying needs a new PAL, and some schools hold the deposit instead of refunding (uOttawa advises not to request a refund if you will reapply within the same calendar year). | IRCC PAL page [page]; Northeastern/uOttawa pages [snippet] | official + university |
| Scholarship deadlines come before offers. UBC International Scholars (Nov 15, 2026) and Pearson (nomination Oct 9) close before any offer exists; a student who waits for offers has already missed them. | 4.2 | official |
| Pearson cannot be applied for by oneself: the school must nominate, one student per school. | U of T Pearson page | official |
| Conflicting figures online: McGill CAD 1,000 vs 2,500; UBC old 50%-refund Board paper vs current non-refundable policy; U of T 2025 vs 2026 dates on the same page; UHIP CAD 792 / 756 / 948 across sources. Students copy the wrong one. | pages above | official vs stale |
| A school that does not respond to IRCC's LOA check in time causes IRCC to return the application and refund the fee, and the student must confirm validation before resubmitting. | IRCC 2026-10-06 | official |
| Proof of funds: bank statements must cover 6 months and show where money came from; the school-tuition receipt alone is not enough without living funds. | IRCC 2026-08-28 | official |
| Medical exam not needed for Taiwan, but a prior stay of 6+ months in a listed country can trigger it. | IRCC country list | official |
| McGill: international students cannot see the official letter needed for CAQ/permit until they accept and pay the deposit. Quebec institutions have their own CAQ application caps through Dec 16, 2027. | McGill accepting page; quebec.ca | official |
| UBC: first residence instalment due within 7 days of the housing offer or the offer is forfeited. | UBC Housing [snippet] | university |

I did not find student-forum or counsellor-blog sources that I could cite; every item above is from an official or university page, so none of them are "lived experience" evidence.

---

## 6. What a tracker could do

"Needs per-university data" = needs a college-by-college field; "generic" = works from rules that apply to everyone.

1. **Offer-to-permit dependency timeline per accepted college** (accept -> deposit -> LOA -> PAL/CAQ -> biometrics -> permit -> housing -> insurance -> travel), with dates auto-filled from the response date in the offer. Generic skeleton; needs per-university data for the response date, deposit amount and refund rule.
2. **Deposit and response-date alerts.** Reminder 14 / 7 / 2 days before each school's accept-by date; Ontario schools show the "no earlier than June 1, 2027" rule. Needs per-university data (dates are in each offer; UBC May 1 or June 1).
3. **Deposit-risk card.** Shows amount, whether it is refundable if the permit is refused, and the paperwork the school wants (refusal letter, dated after the latest LOA). Needs per-university data.
4. **Scholarship calendar that starts before offers.** Per-scholarship deadline, nominator needed, essay count; flags "school must nominate". Needs per-university data (and yearly refresh: UBC Nov 15, Pearson Oct 9/Nov 6, Alberta Jan 10).
5. **Proof-of-funds calculator.** Tuition (from the site's CAD fees) + IRCC living figure (CAD 23,448, or CAD 24,617 for Quebec) + travel, with the evidence checklist (6-month statements with source of funds, sponsor letter with ID, tuition receipt). Generic formula; tuition needs per-university data; the two IRCC figures need a yearly update flag.
6. **Study-permit checklist** (generic): LOA, PAL or CAQ, passport, photos, proof of funds, letter of explanation, biometrics within 30 days, medical (Taiwan "no", ask about prior residence in a listed country), police certificate if requested.
7. **PAL/CAP risk banner** (generic): 2027 cap not yet published; allocations are per province and distributed by the province to schools; recommend not waiting.
8. **Quebec branch** (needs per-university data for McGill, Bishop's, etc.): replaces PAL with CAQ, shows CAD 135 fee and 25-business-day estimate, Quebec living figure, and a note that institutions have CAQ application caps through Dec 16, 2027.
9. **Housing guarantee tracker** (needs per-university data): application deadline (U of T Mar 31, UBC May 1), acceptance condition, deposit schedule, payment window (UBC 7 days).
10. **Total first-year cost sheet** (needs per-university data): tuition, incidental, residence range, health insurance (UHIP about CAD 948 vs UBC iMED), vs funds shown. Mark each number "estimate - confirm in offer".
11. **Work and PGWP explainer** (generic): 24 hours per week off campus in term, unlimited on scheduled breaks; bachelor's graduates have no field-of-study requirement for a PGWP, but need CLB 7.
12. **Refund-by-date reminder** (needs per-university data): e.g., UTSC's Aug 1 "no permit yet" cancel-for-full-refund date.

Bilingual note: Traditional Chinese summaries of deposit and PAL rules would help parents who sign off on the payment; no data is needed for that.

---

## 7. Sources

Official, opened (fetched pages):
- IRCC, Get the right documents (LOA validation, PAL needs accept+pay, medical, police cert), dated 2026-10-06: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents.html
- IRCC, Proof of financial support (CAD 23,448 / 22,895; evidence list), dated 2026-08-28: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html
- IRCC, PAL/TAL (who needs one, validity, CAQ line), dated 2026-09-02: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/provincial-attestation-letter.html
- IRCC, 2026 provincial allocations notice (408,000; 309,670; table), dated 2025-11-25: https://www.canada.ca/en/immigration-refugees-citizenship/news/notices/2026-provincial-territorial-allocations-under-international-student-cap.html
- IRCC, How to apply (biometrics CAD 85, 30 days, PAL upload), dated 2026-09-02: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/apply.html
- IRCC, medical exam requirements, dated 2026-08-04: https://www.canada.ca/en/immigration-refugees-citizenship/services/application/medical-police/medical-exams/requirements-temporary-residents.html
- IRCC, medical exam country list (Taiwan "no", "New: As of November 3, 2025"), fetched 2026-11-04: https://www.canada.ca/en/immigration-refugees-citizenship/services/application/medical-police/medical-exams/requirements-temporary-residents/country-requirements.html
- IRCC, processing-times data (TW 4 weeks), fetched 2026-11-04; processing-times page modified 2026-10-30: https://www.canada.ca/content/dam/ircc/documents/json/data-ptime-en.json
- IRCC, work off campus (24 h/week), dated 2026-04-15: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/work-off-campus.html
- IRCC, PGWP eligibility (no field-of-study rule for bachelor's; CLB 7), dated 2026-06-24: https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/eligibility.html
- quebec.ca, steps and exemptions, last update 2026-10-22: https://www.quebec.ca/en/education/study-quebec/obtaining-authorizations/authorizations
- quebec.ca, CAQ fee/time/caps, label 2026-01-01: https://www.quebec.ca/en/education/study-quebec/temporary-selection-studies
- quebec.ca, living costs CAD 24,617, last update 2026-01-01: https://www.quebec.ca/en/education/study-quebec/required-conditions/costs-studies
- U of Toronto, international timeline (no date; 2026): https://future.utoronto.ca/timeline-international-student
- U of Toronto, Pearson scholarship (2026 cycle; no page date): https://future.utoronto.ca/pearson-scholarships
- UTSC tuition and fees (no date; "fall 2027 estimate"): https://www.utsc.utoronto.ca/admissions/tuition-and-fees
- UBC, dates and deadlines (2026-27 cycle; no date): https://you.ubc.ca/applying-ubc/dates-deadlines/
- UBC, International Scholars (applications open Oct 5, 2026; no date): https://you.ubc.ca/financial-planning/scholarships-awards-international-students/international-scholars/
- UBC Calendar, fee policies ($3,000 deposit; fees can change): https://vancouver.calendar.ubc.ca/fees/policies-fees
- McGill, how to accept (CAD 2,500; letter for CAQ; no date): https://www.mcgill.ca/accepted/nextsteps/accepting

Seen only as search summaries (not opened; verify before publishing): OUAC https://www.ouac.on.ca/guide/105-dates/ , https://guidance.ouac.on.ca/resources/schedule-of-dates/ , https://guidance.ouac.on.ca/applications/accepting-an-offer/ (direct fetch returned 403); U of T UTSC/UTM/UC residence and deposit pages (utsc.utoronto.ca/residences/deposit, utm.utoronto.ca/future-students/admissions/admitted-students); UBC Housing https://vancouver.housing.ubc.ca/applications/fees-payments/ ; McGill https://www.mcgill.ca/accepted/nextsteps/accepting and https://www.mcgill.ca/students/housing/faq ; McGill entrance scholarships https://www.mcgill.ca/studentaid/scholarships-aid/future-undergrads/entrance-scholarships ; Alberta https://www.ualberta.ca/en/admissions/tuition-and-scholarships/international-entrance-scholarships/index.html ; Waterloo https://uwaterloo.ca/future-students/financing/scholarships ; VFS Taiwan https://visa.vfsglobal.com/twn/en/can/ ; UBC iMED https://vancouver.calendar.ubc.ca/fees/medical-insurance ; school refund policies (Manitoba, Douglas College, OCAD, uOttawa, Northeastern).

Third-party (labeled): https://moving2canada.com/2026/08/ontario-international-students-will-pay-more-for-uhip/ (UHIP rise to CAD 948; news article, not official).

## 8. Gaps (not confirmed)
- 2027 study-permit cap, 2027 PAL allocations and whether the 2027-2029 Levels Plan has been tabled.
- Deposit, accept-by date, final-transcript deadline and housing rules for Waterloo and Alberta; McGill refund rule and residence deposit/deadline; U of T 2027 acceptance date and the CAD 5,000 deposit (snippet only).
- International tuition at UBC, McGill, Waterloo, Alberta; whether any are fixed for the program (U of T unclear; UBC not fixed).
- Quebec international health insurance cost; UBC iMED exact amount; official UHIP amount from uhip.ca.
- Study permit processing fee amount (not on the pages fetched), co-op work permit rules, PGWP length for a 4-year degree, Student Direct Stream status, Taiwan-specific financial or document rules, how early one may apply for the permit.
- Whether McGill entrance scholarships and Waterloo's CAD 2,000 President's award need an application and whether Waterloo's international scholarship still exists.
