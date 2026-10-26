# Subject / category lists of US self-reported coursework systems

Researched 2026-10-26. Tools: WebSearch/WebFetch, curl for PDFs and images, the built-in browser pane for JS pages (STARS Zendesk help center, Common App help center, YouTube), youtube-transcript-api in a scratch venv for tutorial-video transcripts. Firecrawl not used.

Legend: **OFFICIAL** = read on the system's own or the college's own page/data file (URL given). **SECONDARY** = counselor, consultant, forum or school-district page. **NOT FOUND** = searched, nothing; sources tried are listed. Nothing below is guessed.

Items already known and NOT redone: STARS 10 Subject Areas, UC A-G area names and F/C/D disciplines, CSU areas C, D1/D2, E, G.

---------------------------------------------------------------------------
## 0. Headline findings

1. **Common App Courses & Grades: the full Subject list is now OFFICIAL.** It is in the 2026-27 "Courses & Grades Data Catalog" (Excel, dated 04-29-2026, posted 5/7/2026), Choices tab. 20 flat values; there is NO sub-category level. Same file also gives the exact Course Level (17), Schedule (5), Credits (0-10 in 0.25 steps + N/A) and Grade values. See section 1.
2. **CSU area names are OFFICIAL**: A History/Social Science, B English, F Visual & Performing Arts, G College-Prep Elective (plus C, D1, D2, E). See section 3.
3. **UIUC SRAR Subject list is OFFICIAL via screenshots on UIUC's own help pages**: English, Mathematics, Science, Social Science, Language Other Than English, Other. Fine arts and computer science have no category of their own (they are "Other"). See section 4.
4. **UT Austin Academic Coursework Form**: five principal areas (English, Mathematics, Science, Social Studies, Language Other Than English) plus optional "Other". OFFICIAL (UT FAQ). See section 6.
5. **STARS Generic Course Title lists are NOT published** anywhere I could reach (help center, 118 articles searched by API; college guides). Only the Subject Area list, Course Length and a partial Course Level list are published. See section 5.
6. **UC dropdown strings**: still not published. One official deck says the first course dropdown is "Subject Area/Course Category". See section 2.

---------------------------------------------------------------------------
## 1. Common App Courses & Grades (C&G), 2026-27  [OFFICIAL]

Source: "2026-2027 Courses & Grades Data Catalog" (Excel, file name `2026-2027_Courses_&_Grades_Data_Catalog_04-29-2026`, dated 5/7/2026), linked from https://appsupport.commonapp.org/applicantsupport/s/article/Data-catalogs . Public link: https://commonapp.my.salesforce.com/sfc/p/d0000000eEna/a/Vz000004OVun/iwn79FZMEcQmkQ6c1WubVlBILk5hBrDr2rOMNZ29eQE . I read the "Courses & Grades Choices" tab as page images (36-page preview). The Excel itself is a member-facing data catalog ("choice values available in the drop down").

### 1.1 Subject (exact option text, in dropdown/export order; codes 10..200 are the export codes)
| Code | Subject option |
|---|---|
| 10 | Pre-Algebra |
| 20 | Algebra |
| 30 | Geometry |
| 40 | Trigonometry |
| 50 | Pre-Calculus |
| 60 | Calculus |
| 70 | Math (Other) |
| 80 | Biology |
| 90 | Chemistry |
| 100 | Physics |
| 110 | Earth/Environmental Science |
| 120 | Science (Other) |
| 130 | English |
| 140 | History/Social Science |
| 150 | Foreign/World Language |
| 160 | Physical Education/Health |
| 170 | Art (Visual or Performing) |
| 180 | Computer Science |
| 190 | Religion |
| 200 | Other/Elective |

Notes: single flat list of 20; math and science are split by discipline, but arts are ONE value ("Art (Visual or Performing)": no Dance/Music/Theater/Visual split). There is no Business, Economics or Psychology value (those go to History/Social Science or Other/Elective by judgment). I did not find a second dropdown ("sub-category") in the catalog.

### 1.2 Course Level (17 values, exact; confirms and settles the earlier doubt)
10 Regular/Standard; 20 Accelerated; 30 Advanced; 40 Advanced Placement (AP); 50 AS/A-level/International A-level, Cambridge AICE (ONE option); 60 College Prep; 70 Dual Enrollment; 80 Enriched; 85 GCSE, IGCSE (ONE option); 90 Gifted; 100 High Honors; 110 Honors; 120 Intensive; 130 International Baccalaureate (IB); 140 Pre-IB; 150 Regents; 160 N/A.
(Codes 10-40 seen on preview page 15 and 50-160 on page 16, counting from 1.)

### 1.3 Schedule (5 values, exact)
10 Semesters; 20 Trimesters; 30 Quarters; 40 Yearly; 50 Other. (Differs from the earlier deck wording "Semester/Trimester/Quarterly/Yearly" and adds "Other".)

### 1.4 Credits (numeric choices)
N/A, 0, then every 0.25 step from 0.25 up to 10 (0.25, 0.5, 0.75, 1, 1.25 ... 9.75, 10). So credits are a dropdown, not free text; unit not defined in the catalog.

### 1.5 Grade values (dropdown choices)
- Letters: A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, E, F.
- Whole numbers: 105 down through 100 ... 0 (read 105-73 on the preview; the run continues downward; the tail was not read).
- Decimals (GPA-style): descending by 0.1, ending 2.1, 2, 2.0, 1.9 ... 0.1, 0.0 (read 2.1 to 0.0; the upper decimals were not read).
- Status values: Incomplete; No Grade; Fail - (Pass/Fail); Pass - (Pass/Fail); S - Satisfactory; U - Unsatisfactory; Withdrawn; Withdrawn - Failed; Medical Excuse.
- No "Grading Scale" choice list exists in the Choices tab (nothing between Grade values and Schedule), consistent with the earlier finding that a scale list with an "Other" escape is a different control. Treat Grading Scale options as NOT FOUND.

### 1.6 Other facts from the same file
- School Year choices: 2026-27 back to 2000-01 (27 values).
- Question wording confirms grade grids for 9th, 10th, 11th, 12th ("Do you have 12th grade courses on your transcript with official grades?") and "other courses" (middle school, post-12th, summer, only if on the official transcript).

---------------------------------------------------------------------------
## 2. UC application, Academic History

### 2.1 What is verified
- **Single "Subject Area/Course Category" selector comes first** (OFFICIAL, UC "Presenting yourself on the UC application" freshman deck, older 2022-era edition, https://admission.universityofcalifornia.edu/how-to-apply/files/presenting-yourself-uc-application-freshman.pdf): "First select the Subject Area/Course Category of the course to be entered (e.g. English, Math, etc.). Next, if a student is enrolled in a California high school, select from the course list for the school ... To see the courses, expand each subject area." So California-school entry is: subject area (expandable list of the school's A-G courses) then course.
- Non-California manual entry: "Subject area, course name, and honors type is required for institutions without an A-G course list" (OFFICIAL, UC Counselor Conference "Decoding coursework entries in the UC application", Sept 2026, https://admission.universityofcalifornia.edu/counselors/_files/documents/2026-counselor-conference-ada-pdfs/cc_-decoding-coursework-entry_ada.pdf).
- The same deck/older deck names the headings students choose from for non-CA courses: "a. History/social science, b. English ..., c. Mathematics, d. Laboratory science, e. Language other than English ..., f. Visual and performing arts and g. College-preparatory elective" (OFFICIAL, older deck above). The 2026-27 first-year page https://admission.universityofcalifornia.edu/admission-requirements/first-year-requirements/subject-requirement-a-g.html uses: History; English; Mathematics; Science; Language other than English; Visual and performing arts; College-preparatory elective (areas A-G). Wording differs by page, so the exact dropdown string is not settled.
- Disciplines on that official page: A: "world history, cultures or historical geography", "U.S. history", half-year "civics or American government"; C: geometry, integrated math; D: biology, chemistry, physics, interdisciplinary or earth and space sciences; F: dance, music, theater, visual arts, interdisciplinary arts.
- **7th-8th grade (OFFICIAL, Sept 2026 deck):** Math entry = course name (drop-down) + term period. LOTE entry = course name (manual) + term period + "course category (level)" + language. Students do not enter grades. A CCC course entry additionally needs grade, A-G subject area, and language name for LOTE.
- Grade codes etc.: already in the earlier report.

### 2.2 Not found (tried: UC Sept 2026 and older counselor decks, QRG, UC application tip pages, ivymax, egelloc, Let's Unbound, ACM, CCGI student sheet, iorad, College Confidential; the 2024 "UC application 201" and 2025 "Decoding your academic history DNA" PDFs now return 404)
- The literal strings in the Subject Area dropdown for a manual (non-CA) course.
- Whether a second dropdown (discipline) appears after the Subject Area.
- The literal options of "course category (level)" for the 7th-8th LOTE entry. SECONDARY only (College Confidential thread, not UC): LOTE 1 (beginner), LOTE 2 (HS second year), LOTE 3 (third year), LOTE 4+ (fourth year or higher). Treat as unverified.
- The 7th-8th math "course name" dropdown contents.
- To get them: a live UC application account (Academic History), or ask UC counselor line.

---------------------------------------------------------------------------
## 3. Cal State Apply (CSU)  [OFFICIAL]

Source: CSU "Freshman Application Guide 2027-2028" (last revised 8/1/26), https://www.calstate.edu/apply/freshman/Documents/cal-state-apply-freshman-application-guide.pdf (pp. 28-30, 36-38), and "Cal State Apply Nonresident Application Guide" https://www.calstate.edu/apply/freshman/documents/cal-state-apply-ca-nonresident-application-guide.pdf (A-G table, same revision). CSU Admission Handbook 2027-2028 https://www.calstate.edu/attend/student-services/Documents/csu-admission-handbook.pdf names areas "A. History/Social Science ... F. Visual and Performing Arts". Note: calstate.edu blocks plain fetchers (403); curl with browser headers worked.

### 3.1 A-G areas as the application's A-G Matching grid and nonresident table label them
| Area | Label |
|---|---|
| A | History/Social Science (guide text: "Subject A - History/Social Science", 2 years) |
| B | English |
| C | Mathematics |
| D1 | Biological Science |
| D2 | Physical Science |
| E | Language Other than English |
| F | Visual & Performing Arts |
| G | College-Prep Elective ("Area G: Elective") |

The nonresident guide's example column: A World History, Geography, U.S. Gov't, U.S. History; B English Literature & Composition; C Algebra, Geometry; D Biology, Earth Science, Physics, Chemistry; E Spanish, French, Sign Language; F Art, Theater, Dance; G excess A-G courses or electives (e.g. Psych, Journalism, Sociology). The area is chosen in the "Update A-G Courses" screen ("Select the correct A-G subject area in the right column"), after the course is entered by title; there is no sub-discipline dropdown documented.

### 3.2 Per-course fields (OFFICIAL, guide pp. 28-30)
- Grade Level dropdown (via "Add Grade Level"): grade levels incl. 7th and 8th (math/foreign language only, passed with C- or better), 9th-12th; summer courses use the "Is this a summer course?" toggle and the next grade level. A full literal list of options is not printed.
- Course Title: type-ahead for California schools; manual otherwise.
- **Course Type (exact):** None (standard); Advanced Placement; International Baccalaureate; Honors* (approved honors).
- Grade per term: letter grades, In Progress, Planned, No Course; "Pass" appears for some courses (older Liaison help page: Pass, No Grade/No Course, CR, P).
- Term type chosen at the school level: "1 grade given = Full year; 2 = Semester; 3 = Trimester; 4 = Quarter".
- "The application cannot recognize partial credit in a unit amount smaller than 2.5 credits (quarter)."
- No international (outside-US-only) course list: foreign-HS-only applicants skip coursework entry.

---------------------------------------------------------------------------
## 4. UIUC Self-Reported Academic Record (SRAR in myIllini)

Sources (all OFFICIAL, University of Illinois Undergraduate Admissions, 2026-05 screenshots): https://www.admissions.illinois.edu/international-baccalaureate-application-help/ (screenshots `ib-911-scaled.png`, `ib-12.png`, `ib_grading.png`), https://www.admissions.illinois.edu/south-korea-application-help/ (`korea_911-scaled.png`, `korea_12-scaled.png`), https://www.admissions.illinois.edu/self-reported/gcse-gce (`gcse-gce-sample.png`); official video "University of Illinois SRAR Tutorial, Part 5: Courses 9-11" https://www.youtube.com/watch?v=p9JhFxqKG-M and "Part 3: School Info" https://www.youtube.com/watch?v=DUn2D8ZWcTE (transcripts read). Only course lists as printed on the screenshots are quoted; the Subject dropdown itself was never shown open, so the list may contain values that no sample course used.

### 4.1 Per-course fields (screenshot "Add Course" row and course cards)
Year; Term; Subject; Course Name; Grade/Mark; Type; Repeated Course (checkbox). **No credit field appears** in the form or the tutorial; none documented.

### 4.2 Subject (values seen on course cards, exact text)
English; Mathematics; Science; Social Science; Language Other Than English; Other.
- "Other" is used for fine arts, music, computer science, career guidance, home economics, technology, PE (cards "Korean Traditional Music", "AP Computer Science", "Fine Arts (Computer Graphics)", "Career Development Guidance" all show Subject: Other). So **UIUC has no Fine Arts or Computer Science subject**.
- Tutorial: "We'll select Mathematics from the Subject drop down menu. If you're confused about what subject to select, please see number 2 in the key at the top of the page where each subject is listed with corresponding course titles." The key text itself is on the myIllini page and was not published on the public site: NOT FOUND.
- No sub-category level was visible.

### 4.3 Type (values seen)
Regular; Advanced; Enriched; "AP" (shown as "AP Course" on the low-resolution Korea screenshot, partly blurry); IB HL; IB SL; MYP. Tutorial: "choose a type such as honors, ap, or advanced, only if it lists this on your transcript. Otherwise, do not select anything." A school-district video says non-honors core courses may be listed as "College Prep"; a forum thread mentions "Regular" vs "College Prep" (SECONDARY). Whether "Honors", "College Prep", "Dual Credit" are literal options: NOT VERIFIED (not seen on an official screenshot).

### 4.4 Year / Term / Grade / Grading scale
- Year (labels seen): "10th Year", "11th Year", "12th Year"; the 9th-grade label is blurry on the low-res Korea screenshot (reads "9th Year"); "Pre-High School" (tutorial).
- Term: "1st Semester", "2nd Semester", "All Year" (12th grade cards); tutorial: "Second Semester" (pre-high-school example). Trimester/quarter labels: not seen (instructions say list each trimester/quarter grade).
- Grade/Mark: dropdown when grading system = "A-F"; the tutorial shows "Pass/Fail - Pass" among the options; "IP" (In Progress) for senior year. Full grade option list: NOT FOUND.
- Grading Scale (OFFICIAL screenshot): radio "A-F grades or numerical grades with a grading scale listed on the transcript" or "Other"; "Other" opens a conversion table (e.g. 1 = ..., 7 = ...). School Type dropdown (e.g. "International", "US Domestic").
- Instructions: "If your transcript shows grades for 2 semesters, 3 trimesters, or 4 quarters for each class, list each grade separately; do not list a final grade." (Korea page).
- International External Exam Results is a separate section (GCSE/IGCSE, GCE A-Level; fields Month, Year, Grading Scale e.g. "A*-U"/"A*-E", Subject, "Result Not Received Yet"; subject strings are the exam's own, e.g. Maths, Chemistry, English Literature).

---------------------------------------------------------------------------
## 5. STARS (starsrecord.zendesk.com)

Read via the help center's public Zendesk API (118 articles, all bodies searched) and the page itself in the browser pane, 2026-10-26.

### 5.1 Generic Course Title
**NOT FOUND (not published).** Article "How Do I Select A Generic Course Title?" (https://starsrecord.zendesk.com/hc/en-us/articles/37035522611611) contains no list: "Choose the title that best matches your course content. For example, select 'English 1' for a 9th grade English class. If no title closely matches, select 'Other'." Search of all 118 article bodies for Band, Choir, Orchestra, Dance, Theater, Ceramics, Music Theory, Calculus returned zero hits (only Algebra and Geometry appear, in examples). Official screenshots show titles in CAPS inside the dropdown: "ENGLISH 1" (Subject English) and "FINANCIAL LITERACY" (Subject Business). Tried also: Penn State, Pitt, Virginia Tech, FSU, UTSA, TAMU, UConn pages and the Pingry STARS PDF (no lists; VT page gives examples "Pre-Calculus, Spanish 1, World History"). To get the lists: a live STARS account, or STARS support.

Useful official rules: psychology and economics sit under the Social Science / History subject; International records: "English is listed under World Language" and the content field is called "Course / Exam Content" (examples include "Integrated Algebra-Trigonometry", "Trigonometry-Precalculus"). A math course combining topics: select the highest-level content.

### 5.2 Subject Area
Same 10 as already known (screenshot headings: English, Mathematics, Science, History / Social Studies, World Language, Business, Computer Science, Fine Arts / Music, Physical Education / Health / Gym, Other Subject Area). Note the official article's own bullet list omits "Other Subject Area" from the list but describes it in the next paragraph.

### 5.3 Course Level
Published list is partial; the article states "The Course Level drop-down in your STARS Record contains the full list." Named: Honors; Advanced Placement (AP); International Baccalaureate (IB); Dual Enrollment; College Prep; Regents; Gifted and Talented; Standard (default). Pingry (SECONDARY) also names "Advanced" (post-AP). Full dropdown: NOT FOUND.

### 5.4 Other verified field facts (OFFICIAL screenshots + articles)
- Add-course row, left to right: Subject Area, Generic Course Title, Course Name, Course Level, Course Length; per term: Grade, "Credits/Units" (default 0.5 per semester; "01.00" for Full Year in the summary table), checkboxes "taken online", "taken during the summer", "a repeat/retake of a prior course".
- Course Length: Full Year; Semester; Trimester; Quarterly; Penn State's video also names "block schedule term" (SECONDARY).
- Summary table columns: Subject Area, Generic Course Title, Course Name, Course Level, Grade, Length (Credits/Units), Semester/Term.
- Entry modes: by Year or by Subject Area; middle-school HS-credit courses have their own section.

---------------------------------------------------------------------------
## 6. Texas systems

### UT Austin  [OFFICIAL]
Source: https://admissions.utexas.edu/apply/frequently-asked-questions/ and https://admissions.utexas.edu/apply/freshman/ (accessed 2026-10-26).
- Called "Academic Coursework Form" (FAQ) / "Academic Coursework Entry Form" (freshman page). Required only if MyStatus says so (non-Texas high schools).
- **Subjects: "five principal areas: English, Mathematics, Science, Social Studies, and Language Other Than English"**; "Other" coursework is optional.
- Rules: grade 9 onward only; completed courses only (no in-progress); summer courses go under the grade level before or after; "No courses to report" checkbox for a subject done only before 9th grade; cannot be saved, cannot be edited once submitted.
- **Credits:** if the transcript has none, "A course graded each year equals 1 credit; graded each semester equals 0.5 credit."
- Grades: A-F or 100-point; for A/B-style ranges use the higher level; the form's exact dropdown strings and any sub-categories: NOT FOUND (login-gated; no public screenshot).

### Texas A&M  [uses STARS]
STARS required (TAMU is on the official STARS list). The old page admissions.tamu.edu/srar is a 404. No TAMU-specific subject list; follows STARS (section 5).

### ApplyTexas
No course-level entry documented (see earlier report). NOT FOUND.

---------------------------------------------------------------------------
## 7. Other systems worth supporting

| System | Subject list published? | Notes |
|---|---|---|
| **UCF SPARK** (Self-Provided Academic Record for Knights): own form inside the UCF portal, used by UCF only | partial, SECONDARY | UCF's 2023 SPARK Form Guide (https://sos.sdes.ucf.edu/wp-content/uploads/sites/62/2023/12/2023-Spark-Form-Guide.pdf, last updated 12.4.23, official UCF student-services page) lists subject TABS: "English, Math, Natural Science, Social, World Languages, etc."; fields: course name + number, Subject Area/Type, Grade Level, Course Level ("Regular, IB, Dual Enrollment, etc."), semester 1 and semester 2 final grades (IP for in progress). Semester grades only; no credit field described. Current live labels not verified. UCF FAQ (https://www.ucf.edu/admissions/undergraduate/faq/spark-form/): AP, IB, AICE, honors, dual enrollment are weighted by course level. The "etc." means the full tab list is NOT FOUND. |
| **Virginia Tech, Penn State, Pitt, Rutgers, UW Seattle, NYU, UF, FSU, Clemson ...** | via STARS | OFFICIAL list "Which Colleges Use STARS" (2026-08-06); no school-specific subject lists; one STARS model covers them. A 2026-27 consultant list (JRA, as of 2026-10-02) counts 38 colleges: 27 require, 11 optional (SECONDARY). |
| **Georgia Tech** | n/a | Common App only plus the transcript; college classes listed in GT-specific Common App questions; no coursework self-report form found (official admission.gatech.edu pages, several undated). |
| **Purdue** | n/a | Reads "courses and grades self-reported on the Common App or on a transcript" (admissions.purdue.edu first-year criteria); uses Common App C&G, so section 1 covers it. |
| **Scoir / Coalition** | NOT FOUND | Coalition application was folded into Scoir; no per-course subject list published in Scoir help or Coalition FAQ. Technolutions KB mentions a "CoalitionApplicationCourses" data source for colleges, not the student field list. |
| **Common App C&G users** | section 1 | Official count 77 (2025-26 deck); 76 per a consultant (as of 2026-10-02, SECONDARY). Includes Stanford, Purdue, CMU, UW-Madison, etc. |

---------------------------------------------------------------------------
## 8. Cross-system subject map (for the AI-tagging prompt)

Each system uses its OWN labels; values below are exact strings from OFFICIAL sources above.

| Concept | Common App C&G | STARS | UIUC SRAR | CSU | UT Austin | UC |
|---|---|---|---|---|---|---|
| English | English | English | English | B English | English | B English |
| Math | Pre-Algebra / Algebra / Geometry / Trigonometry / Pre-Calculus / Calculus / Math (Other) | Mathematics | Mathematics | C Mathematics | Mathematics | C Mathematics (disciplines: Algebra I or Math I; Geometry or Math II; Algebra II or Math III; Precalculus; Calculus; Other Advanced Math) |
| Science | Biology / Chemistry / Physics / Earth/Environmental Science / Science (Other) | Science | Science | D1 Biological Science, D2 Physical Science | Science | D Science (Biology/Life Sciences, Chemistry, Physics, Earth & Space Sciences, Integrated, Interdisciplinary) |
| History / social | History/Social Science | History / Social Studies | Social Science | A History/Social Science | Social Studies | A History/social science |
| World language | Foreign/World Language | World Language | Language Other Than English | E Language Other than English | Language Other Than English | E Language other than English |
| Arts (all kinds) | Art (Visual or Performing) | Fine Arts / Music | Other | F Visual & Performing Arts | Other (optional) | F Visual and performing arts (Dance / Music / Theater / Visual Arts / Interdisciplinary Arts) |
| Computer science | Computer Science | Computer Science | Other | G College-Prep Elective (or none) | Other | G or D (CS only as 3rd/4th-year science per UC) |
| Business / economics | Other/Elective (or History/Social Science for economics) | Business (economics goes to History / Social Studies) | Other (or Social Science) | G | Other | G |
| PE / health | Physical Education/Health | Physical Education / Health / Gym | Other | not A-G | Other | not reportable |
| Religion | Religion | Other Subject Area | Other | G | Other | G |
| Everything else | Other/Elective | Other Subject Area | Other | G College-Prep Elective | Other | G |

Caveats for the tagger: the UC and CSU cells for dropdown wording are not fully verified (section 2.2). For STARS there is a second level (Generic Course Title) whose values are unavailable; the tagger should output the Subject Area and a free-text "closest generic title" with "Other" fallback.

---------------------------------------------------------------------------
## 9. Still missing
1. UC literal dropdown strings; discipline dropdown; 7th-8th LOTE "course category (level)" and math course-name list.
2. STARS Generic Course Title lists (all subjects, incl. Fine Arts / Music, Mathematics, Science) and the full Course Level list.
3. UIUC SRAR: the "key" of subjects (page-top key), the complete Subject and Type dropdown contents (only values seen on sample cards), the complete Grade/Mark list, full Term and Year option lists.
4. UT Austin form: literal dropdown strings and any sub-categories.
5. Common App: Grading Scale choices (none in the catalog); full tail of numeric and decimal Grade values (read partially).
6. UCF SPARK live subject-tab labels; Scoir/Coalition per-course fields.

## 10. Source index
- Common App Data catalogs page: https://appsupport.commonapp.org/applicantsupport/s/article/Data-catalogs ; C&G catalog link above.
- UC: counselor decks (Sept 2026 Decoding; "Presenting yourself" first-year 2026-27 and older freshman edition); https://admission.universityofcalifornia.edu/admission-requirements/first-year-requirements/subject-requirement-a-g.html
- CSU: Freshman Application Guide 2027-2028 and Nonresident guide (links in section 3); Liaison help https://help.liaisonedu.com/Cal_State_Apply_Applicant_Help_Center/Filling_Out_Your_Cal_State_Apply_Application/Cal_State_Apply_Academic_History/03_High_School_Coursework
- UIUC: help pages and YouTube links in section 4.
- STARS: https://starsrecord.zendesk.com/hc/en-us/articles/37027194180251 (Subject Area), /37036006202523 (Course Level), /37036235354779 (Course Length), /36994622253851 (by Subject Area), /37496822554011 (international Subject Area), /37497336837531 (international content); screenshots /hc/article_attachments/37023752163483 and /36997482067739.
- UT Austin FAQ: https://admissions.utexas.edu/apply/frequently-asked-questions/
- UCF: https://www.ucf.edu/admissions/undergraduate/spark/ and the 2023 SPARK Form Guide PDF.
- Penn State video (STARS walkthrough): https://www.youtube.com/watch?v=56C4pgpKkao
