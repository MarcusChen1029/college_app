# Common App first-year: Subject, Grading Scale, grades, credits (2026-27)

Researched 2026-10-26. Tools: WebSearch/WebFetch for finding pages, built-in browser pane for the JS-rendered Common App help site and the Salesforce file viewer, local zip/XML parsing of the downloaded workbooks.

## Result in one line
The Subject list is FOUND and OFFICIAL: 20 flat options, no sub-categories. It is the same list for both (a) Courses & Grades and (b) Education > "Current or Most Recent Year Courses" (both use the choice group named `Subject`). The Grading Scale dropdown labels are only PARTLY found ("A-F" and "Other" confirmed; the full list is not published in any document I could reach).

## 1. Subject dropdown (OFFICIAL, VERIFIED)

Source A (Courses & Grades): Common App "2026-2027 Courses & Grades Data Catalog" (workbook file name `2026-2027_Courses_&_Grades_Data_Catalog_04-29-2026`, posted 5/7/2026), tab "Courses & Grades Choices", choice group `Subject`. Linked from https://appsupport.commonapp.org/applicantsupport/s/article/Data-catalogs (page lists 2021-22 through 2026-27 editions).
Direct file link as published on that page: https://commonapp.my.salesforce.com/sfc/p/d0000000eEna/a/Vz000004OVun/iwn79FZMEcQmkQ6c1WubVlBILk5hBrDr2rOMNZ29eQE

Source B (Education > Current or Most Recent Year Courses): Common App "2026-2027 First-year Data Catalog" (`2026-2027_FY_DataCatalog_8-18-2026`, dated 8/21/2026), tab "Common Choices", choice group `Subject`; tab "Common Questions" rows "Course 1 subject" ... "Course 15 subject" (section "Curr or Most Recent Yr Courses") all point to choice group `Subject` (type SingleSelectDropdown).
Link on the same Data-catalogs page: https://commonapp.my.salesforce.com/sfc/p/d0000000eEna/a/Vz000005enoj/cBNZN1if4YTD8FDtxpfOseyeIjxVF2CSAtCSFjKbcW4

Both files list the identical 20 values, in this order (Order | Label shown to the student | Export code):

| Order | Label (exact) | Export code |
|---|---|---|
| 10 | Pre-Algebra | PRE-ALG |
| 20 | Algebra | ALG |
| 30 | Geometry | GEOM |
| 40 | Trigonometry | TRIG |
| 50 | Pre-Calculus | PRE-CALC |
| 60 | Calculus | CALC |
| 70 | Math (Other) | MATH |
| 80 | Biology | BIOL |
| 90 | Chemistry | CHEM |
| 100 | Physics | PHYS |
| 110 | Earth/Environmental Science | ENVSCI |
| 120 | Science (Other) | SCI |
| 130 | English | ENG |
| 140 | History/Social Science | HIST |
| 150 | Foreign/World Language | LANG |
| 160 | Physical Education/Health | PE/HLTH |
| 170 | Art (Visual or Performing) | ART |
| 180 | Computer Science | COMPSCI |
| 190 | Religion | RELG |
| 200 | Other/Elective | OTH/ELE |

Facts that matter for tagging:
- Flat list. There is NO sub-category under any subject. Art is ONE option, "Art (Visual or Performing)"; there is no separate Music/Visual/Performing choice. Math and Science are split into specific courses plus a "(Other)" catch-all; English, History/Social Science, Foreign/World Language have a single option each.
- There is no "Social Science" by itself, no "Foreign Language" (it is "Foreign/World Language"), no "Career/Technical" and no "Music" option. Anything that does not fit goes in "Other/Elective".
- The list is unchanged across editions: the 2021-22 Courses & Grades catalog (`2021-2022 Preview Courses & Grades Data Catalog_04-12-2021`) has the same 20 values, same order and codes.
- Required or not: in Courses & Grades: Required (catalog tab "Courses & Grades Details": `<Subject> SingleSelectDropdown Required`). In Current/Most Recent Year Courses the question is not marked required in the catalog.
- Corroboration from the live UI (SECONDARY): University of Minnesota's 2023 screenshots of filled Common App rows show the dropdown values "Physical Education/Health", "Science (Other)", "English", "Algebra", "History/Social Science", "Foreign/World Language", "Art (Visual or Pe..." (truncated in the narrow box; read as "Art (Visual or Performing)", which matches the catalog), "Other/Elective", "Physics". URL e.g. https://admissions.tc.umn.edu/sites/admissions.tc.umn.edu/files/2023-10/Semesters%201%20in%20Common%20App.png and https://admissions.tc.umn.edu/sites/admissions.tc.umn.edu/files/2023-10/quarters_1_sample_common_app_.png (a UMN FAQ answer says: choose the subject that best matches the course name; "If you are unsure, select Other.", https://admissions.tc.umn.edu/faqs-courses-and-grades-self-reporting-your-transcript). University of Washington's guide (SECONDARY) says that when a subject is not in the list, pick the "(Other)" variant such as "Math (Other)".

## 2. Grading Scale dropdown (PARTIAL)

Courses & Grades only (school-level field, required, once per "transcript group"). Catalog tab "Courses & Grades Details": `<Grading_scale> SingleSelectDropdown, Required, choice group "Grading Scale"`. The choice group named "Grading Scale" is NOT included in the Choices tab of any catalog edition I opened (2021-22 and 2026-27), so its labels are not published there.

Confirmed:
- "Other" exists (OFFICIAL): https://appsupport.commonapp.org/applicantsupport/s/article/What-if-my-Grading-Scale-doesn-t-appear-in-the-dropdown says "Select the 'Other' option. You can then type in to the individual grade boxes."
- "A-F" exists (SECONDARY, read from UMN 2023 screenshots of the live form, all four sample images show "Grading Scale: A-F"; also the Westborough HS counselor guide says `For Grading Scale, select "A-F"`).
- Numeric grades with decimals: UMN FAQ says choose "Other" (https://admissions.tc.umn.edu/international-students-entering-courses-and-grades). A letter system with AB/BC grades: UMN says choose "Other".
- Any other option labels (for example a 0-100 or a 4.0 scale): NOT FOUND. The grade-value list below hints that numeric (0-105) and decimal (0.0-5.0) value sets exist, but I could not see which scale label offers them.

## 3. Grade values (OFFICIAL, from the C&G catalog choice group `Grade values`)

Grade_1..Grade_4 and Grade_Final are "SingleSelectDropdown/Short" with max length 12 (a dropdown when the scale is a listed one, a free-text box when the scale is "Other"). The catalog lists ONE combined set of 181 values, not split per scale:
- Letters (order 10-140): A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, E, F
- Special marks (order 150-230), label -> code: Incomplete -> I; No Grade -> NG; Fail - (Pass/Fail) -> F; Pass - (Pass/Fail) -> P; S - Satisfactory -> S; U - Unsatisfactory -> U; Withdrawn -> W; Withdrawn - Failed -> WF; Medical Excuse -> ME
- Whole numbers 105 down to 0 (order 240-1290, 106 values: 105, 104, ... 1, 0)
- Decimals: 5.0, 4.9 ... 4.1, 4.0, 3.9 ... 0.1, 0.0 (order 1390-1980 and 1400-1790, plus a duplicate "2" with code 2.0 at order 1590 and "2.0" at 2190)
Term columns per row: Grade_1..Grade_4 plus Grade_Final (UI: S1/S2/Final, T1-T3/Final, Q1-Q4/Final, or Full Year). At least one grade is required per course.

## 4. Credits (OFFICIAL)
- Credit_1..Credit_4 and Credit_Final are SingleSelectDropdown (choice group `Credits`), at least one required per course.
- Values: "N/A" then 0, 0.25, 0.5, 0.75, 1 ... up to 10, in steps of 0.25 (42 values total including N/A). Max two-decimal granularity is quarters (0.25, 0.5, 0.75). Unit is not named in the catalog (the values are used as "credits"; the form shows no unit label).
- Help article: if the transcript lists no credit, tick the N/A box and nothing is required (https://appsupport.commonapp.org/applicantsupport/s/article/What-can-I-do-if-my-transcript-doesn-t-list-a-credit-for-a-particular-course-I-took).

## 5. Other structure facts from the same catalog (OFFICIAL)
- Per grade (9, 10, 11, 12) plus "Other Courses": up to 4 transcript groups (unique school + academic year + schedule + grading scale), up to 32 courses per grade across the groups.
- Course Name: free text, max 100 characters. Required.
- Schedule choices in C&G (data-catalog labels): Semesters, Trimesters, Quarters, Yearly, Other (Other adds a free-text `Schedule_Other`, max 50 chars). Note: the Nov 2025 counselor deck prints them as Semester, Trimester, Quarterly, Yearly; the catalog labels above are the form export labels.
- School Year choices: 2026-27 back to 2000-01 (27 values).
- Course Level (17 values, same list in both places; confirms the earlier open question): Regular/Standard; Accelerated; Advanced; Advanced Placement (AP); AS/A-level/International A-level, Cambridge AICE (ONE option, code "Cambridge AICE AS A-Level"); College Prep; Dual Enrollment; Enriched; GCSE, IGCSE (ONE option, code "Cambridge IGCSE"); Gifted; High Honors; Honors; Intensive; International Baccalaureate (IB); Pre-IB; Regents; N/A.
- Education > Current or Most Recent Year Courses: "How many courses would you like to report?" 1 to 15; System Schedule radio: Semester, Trimester, Quarter, Yearly; per-course Course Schedule multi-select: Full Year, First Semester, First Trimester, Second Semester, Second Trimester, Third Trimester, First Quarter, Second Quarter, Third Quarter, Fourth Quarter; per-course fields: Subject, Name (max 100), Level, Schedule. No grade or credit fields there.

## 6. Sources tried (URL -> what it showed)
Official / decisive:
1. https://appsupport.commonapp.org/applicantsupport/s/article/Data-catalogs -> lists data catalog downloads 2021-22..2026-27 (led to everything above).
2. 2026-27 Courses & Grades Data Catalog (Salesforce link above) -> Subject, Course Level, Credits, Grade values, Schedule; no Grading Scale labels.
3. 2026-27 First-year Data Catalog (Salesforce link above) -> Current/Most Recent Year Courses fields and `Subject` choices; GPA Scale = 4..20, 100, None.
4. 2021-22 Preview Courses & Grades Data Catalog (Salesforce link on the same page) -> same Subject list.
5. https://appsupport.commonapp.org/applicantsupport/s/article/What-if-my-Grading-Scale-doesn-t-appear-in-the-dropdown -> "Other" option.
6. https://appsupport.commonapp.org/applicantsupport/s/topic/0TO0V000001QRLFWA4/courses-grades and ~6 articles (failed/retaken course, no-credit, how colleges use transcripts, FAQ index) -> no dropdown values.
7. https://www.commonapp.org/files/webinar_decks/Academic-Record-Reporting.pdf (Nov 2025) -> course level and schedule lists, required fields; the "Courses & Grades walkthrough" slide is only a title slide (video not in the PDF); no subject list.
Secondary:
8. UMN Twin Cities FAQ + 4 UMN screenshots (links above) -> live-UI evidence of subject labels, "A-F" scale, N/A box, term/Final columns; "Other" for decimals/AB grading.
9. Westborough HS and Lake Washington SD counselor guides -> select "A-F"; no subject list.
10. Stanford OHS reference sheet, Palm Beach, CBSD, Marks Education, New Bremen, schoolinsites PDFs -> no subject list (checked by text extraction).
11. University of Washington Common App page -> only describes STARS; a search snippet from another UW page mentions the "(Other)" subject fallback.
12. collegeapplicationguy.com Courses & Grades article -> no dropdown values.
13. ~8 web searches with exact-phrase variants (Subject, Grading Scale, Math (Other)) -> only the above; no page quoting the Grading Scale options list.

## 7. Gaps
- Full Grading Scale label list: not found. Needs a live account (open a grade-level pop-up and expand the dropdown) or Common App's applicant "Courses & Grades walkthrough" video. Safe values to use meanwhile: "A-F" and "Other".
- Which grade values appear for which scale: not published.
