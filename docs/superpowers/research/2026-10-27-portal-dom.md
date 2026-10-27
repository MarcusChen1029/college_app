# Coursework pages of STARS, Cal State Apply, UC and UT: live DOM facts

Recorded 2026-10-27 on throwaway test accounts created by the owner (never the owner's real applications). Everything below was read from
the live pages with the built-in browser; nothing was submitted. Where a fact is a guess it says so.

## 1. STARS (srar.selfreportedtranscript.com), ASP.NET WebForms + Telerik

### 1.1 Pages
- Schools: `/srt/EnterSchools.aspx`. Per school (`hsList_ctl00_...`): Grade Scale radios `grade_scale` (L Letter Grades, N Number Grades,
  B Letter & Number Grades, D Decimal Grades, O Narrative / Descriptive), dates `from_date_dateInput` / `to_date_dateInput` (Telerik RadDateInput,
  text `mm/yyyy`), Final Education System / Curriculum (Telerik RadDropDownTree `document_type`, a tree of regions; leaves are systems, e.g.
  "USA/American High School Style Diploma", "Taiwanese Senior High School Diploma", "International Baccalaureate (IB)"), school year radios
  `academic_calendar_year` (A traditional fall start, C calendar year), "I plan to graduate/have graduated from this school" `graduated_yn`.
  All of these are required before "Enter Courses" (`goStep('ceeb','<ceeb>')`), else a "Required Fields Missing" dialog.
- Summary: `/srt/SchoolSummary.aspx?sel_sender_ceeb=<ceeb>`, one link per year: `openCourseEntry('<ceeb>','<endYear>','9th Grade (2023-2024)')`.
  Its openCourseEntry() opens `<course_url>?selCeeb=<ceeb>&yr=<endYear>&sel_sender_ceeb=<ceeb>` (+ `&gl=09`..`12` from a "9th"... label, `&ms=Y`
  for "Middle School"); course_url is the function's last `course_url = "..."`. Enter Schools links each school as `goStep('ceeb','<ceeb>')`
  titled "Enter Coursework taken at <name>". The extension reads both pages with fetch (`extension/src/stars/nav.ts`). An idle session
  redirects requests to `LogoutBridge.aspx?message=timeout`.
- Coursework for a school outside the US: `/srt/EnterInternationalCoursework-yr-<endYear>.aspx?selCeeb=<ceeb>&yr=<endYear>&sel_sender_ceeb=<ceeb>`
  (`yr` = the year the school year ends: 2024 = 2023-24).
- Coursework for a US school: `/srt/EnterCoursework-yr-<n>.aspx?selCeeb=<ceeb>&yr=<endYear>&...` (the file name's number is NOT the year; use `yr`).
  Differences from the international page (seen live on a New Jersey school): no `academic_level`, no `course_language`, no `grade_scale_id`
  (the school's Grade Scale from Enter Schools applies); per term also `summer_course_yn_<n>` and `retake_course_yn_<n>`; subjects
  "English … World Language, Computer Science / Info Tech, Business, Fine Arts / Music, Phys. Ed / Health / Gym, Other Subject Area"; 29 levels
  and its own titles ("ENGLISH 1" … , `STARS_US_*` in stars-lists.ts). The table's name column is "Course Name". **Before any course saves, the
  year's GPA box `year_gpa` must be filled or `no_annual_gpa` ("I have not received an annual GPA for this academic year") ticked** (validator
  `v_year_gpa`); the filler stops and asks the student. The coursework page names the school ("ENTER 10TH GRADE (2024-2025) COURSEWORK FOR …").

### 1.2 International coursework form (ids are `ctl00_mainContent_<name>`)
Fields in order: `academic_level` (RadComboBox, read-only), `subject_area`, `course_cd` ("Course/Exam Content" = generic title; list loads after
the subject), `exact_course_title` (RadTextBox; prefilled with the generic title when one is picked; STARS stores it upper-cased),
`course_level` ("Proficiency Level", read-only), `term` ("Course Length / External Exam", read-only), `course_language` (182 languages),
then after a length is chosen: `grade_scale_id` (Grading Scale), and per term n = 1..k: `grade_<n>` (RadComboBox), `units_<n>` (RadNumericTextBox,
default 0.5 for a semester), `online_course_yn_<n>`, `intl_predicted_score_<n>` (checkboxes). Save: `btn_submit` ("Save Course", posts the
page). After a save the form clears except academic level and language. Exact option lists: `web/lib/transcript-maps/stars-lists.ts`.
- A saved semester course shows as one table row per term: Subject Area, Generic Title, NAME (upper case), Level, Length, Semester/Term
  ("First", "Second"), Grade, converted letter, Edit. Each row has a checkbox `delId` (value = row id) and `btn_remove` "Remove Selected Courses".
- Grade options (100-point scale): "In Progress", 1..200, "Withdrawn", "Medical Excuse", "No Credit", "Pass/Fail - Pass", "Pass/Fail - Fail",
  "Incomplete", "No Grade - Not In Progress". There is no letter-grade scale on the international page.

### 1.3 Driving the controls (verified)
- RadComboBox: click its `.rcbActionButton` (opens `#<id>_DropDown`), then click the `li` with the exact text (mouseover + mousedown + click).
  A click on an `li` while the list is closed worked for some boxes and not for `grade_scale_id`: always open first. Some picks post back
  (subject loads the title list; length adds the grade boxes): wait ~2.5 s after each.
- RadDateInput / RadTextBox: set the value, then fire focus, input, change, blur and focusout. Without the blur the hidden value stays empty.
- A pick shows its value before STARS finishes the update it starts; a Save Course pressed right after lost the grades. Wait ~1.5 s and re-check.
- The course name box is reset to the generic title by later picks: type the name (and credits) last.
- After choosing a subject, the title list may still be the previous subject's for a moment: compare before trusting it.
- Full-year run with the owner's real transcript on the throwaway record (2026-10-27, 2023-24: 12 courses, 2024-25: 6): the page updates a
  pick starts can reset ANY box, before or after it (Proficiency Level and the grades were cleared). The filler waits until the form has had
  no DOM changes for 0.7 s after each pick, then checks every box and re-applies what was reset (up to twice) before Save Course.
- "Language of Instruction" (`course_language`) is empty on a fresh page load and required; STARS only keeps it after a save in the same
  session. A failed save shows validators `ctl00_mainContent_v_<field>` ("Required") instead of reloading.
- The school's Grade Scale, dates and school-year type on Enter Schools decide which year pages exist ("2023-2024" ... "2026-2027").
- RadDropDownTree: the tree lives outside the widget in `#<widgetId>_EmbeddedTree`; a click on a leaf `.rtText` selects it even while closed.
- Radios: click the radio whose `<label for>` text matches.

## 2. Cal State Apply (calstate.cas.myliaison.com), React + MUI

- High Schools Attended (`/applicant/my-application/23498`): first a "Did you go to High School(s) in California?" yes/no. A school is
  Country (MUI Autocomplete), "State, City, Zip Code, or CEEB Code" search, School Name, Term Type (exact options: Quarter, Semester,
  Trimester, Full Year), From/To month (options "January".., shown abbreviated "Aug") and year (plain text). Only foreign high schools ->
  no course entry (Liaison help).
- High School Coursework (`/23502`): per school an "Add course" button (its label becomes "N Courses" once there are courses) opens a
  right-hand MUI Drawer. The page holds two inputs with id `gradeLevelId` at once: always look inside the last `.MuiDrawer-root`.
- Course drawer: Grade Level (options "9th Grade • 2023-2024" and "Add Grade Level"); a grade level is added in a sub-form: Grade Level
  ("12th Grade" ... "8th Grade"), Year ("2023-2024" ... from the school's dates), "Is this a Summer Course?" switch `includeSummer`.
  Then Course Title `#courseName` (free text; the typed text comes back as an option to click), Course Type radios `courseTypeLkupId`
  labelled None, Advanced Placement, International Baccalaureate, Honors, and one grade combobox per term `highSchoolCourseGrades.<i>`
  labelled "Fall", "Spring" for semesters (trimester/quarter labels not seen). Grade options: A+ A A- B+ B B- C+ C C- D+ D D- F, No Course,
  Pass, No Pass; the current school year also has In Progress and Planned. Buttons: Cancel, "Add Another" checkbox, Save.
- MUI Autocomplete opens on mousedown on its input; options are `[role=option]` in its own listbox (`aria-controls` = "<id>-listbox": use it,
  a list that is still closing is another input's). A mousedown right after a drawer opens can be lost: retry until options show. From the
  page's own JS world, setting `input.value` needs the native setter (a content script's isolated world sets it natively anyway).
- Picking the course title re-renders the form and clears a Course Type chosen before it: set Course Type last and check it. "Add Grade Level"
  opens a sub-form and leaves the Grade Level box empty.
- Verified run (2026-10-27): 4 planned courses, 2 already there were skipped, 2 added (one needing a new 10th-grade level, one In Progress /
  Planned); the edit form shows the stored Course Type.
- A-G Matching (`/23505`): "Update A-G Courses" opens a drawer with one row per course and an MUI Select (`div[role=combobox]`, aria-label
  "select-grade") whose options are a code and a name: A History / Social Science, B English, C Mathematics, D1 Biological Science,
  D2 Physical Science, E Language Other than English, F Visual & Performing Arts, G College-Preparatory Elective, "- No match".
  It unlocks after "I'm Done Adding High School Courses".

## 3. UC (apply.universityofcalifornia.edu)

The application signs you out when it is opened in a second tab (it went to `/my-application/login/logout`). Use a single tab; in-app links
are full page loads.
- High school: `/acadhistFrHighSchoolSearch` (In California / Outside California (in the U.S.) / Outside the U.S., country select, school search)
  -> `/acadHistFrInfo?action=add&schId=<code>...`: start/end month+year selects, grading system checkboxes (exact list `UC_GRADING_SYSTEMS`),
  term system checkboxes ("Semester (2 final grades per year)" etc.), grades attended rows (`attendgrade<i>` 9th-12th + `attendsyear<i>`
  "2023 - 2024", summer tick), graduation Yes/No, degree, graduation month/year, language of instruction. All plain `<select>`s / checkboxes.
- Grade pages: `/my-application/acadHistFrGrades/09` ... `/12`; each school card (name, "School code: 694132", "2023 - 2024 academic year") has
  `a#edit_<NN><id>` "Enter courses & grades" (href javascript:void(0), a click handler) -> `/acadHistFrHighSchoolClasses/editClasses/<NN>/<id>`.
  Rows `academics_hs_classes_add_<i>_subject` (course category with A-G optgroups, `UC_DISCIPLINES`; two options are both "Computer Science",
  value 16 under Mathematics and 50 under Science), `_class_title`, `_honors` (HL / IB / NH / AP), `_grade1`..`_grade4` (hidden boxes 3-4 exist
  on a Semester school), `_subject_language_code` (LOTE language, `UC_LANGUAGES`). Grade options on "0-100 (Taiwan)": 100..0 and NO; 12th grade
  adds IP and PL. "Add another course" `#addManualHSClass`, "Save & continue" `#save`, "Cancel" `#cancel-btn`. Existing courses come back as
  filled rows. After saving, the grade page lists "Subject area/Course category | Course name | Hnrs | Term | G1..G4 | Language name".
- Verified run (2026-10-27): 4 planned 9th-grade courses, 1 already there skipped, 3 added (English, IB biology, Chinese 2 with language Chinese
  and NO for the second semester) and listed correctly.

## 4. UT Austin

The Academic Coursework Entry Form is in MyStatus and appears only after an application to UT; a new ApplyTexas account cannot reach it.

## 5. UIUC

myIllini shows "First-year applicants apply through the Common App"; the SRAR appears only after a Common App submission to UIUC.

Seen live 2026-10-28 on the owner's real account (Common App submitted, SRAR filled by hand-run scripts, NOT final-submitted).
ASP.NET MVC + jQuery + Bootstrap 4, origin `https://myillini.illinois.edu`. One form `#MainForm` (POST to the page URL) per page.

Pages (left nav, in order; each has `#btn_save` "Save Progress" and `#btn_submit` "Submit Page", both `input[type=button]`):
- `/Apply/Application/Education`: school details pre-filled from Common App. Grading scale radios `HighSchools[<key>].GradingScaleTypeID`:
  `2` = "A-F grades Or numerical grades with an A-F conversion listed on the transcript", `3` = "Other" (class `otherGradingType`; for six
  hard-coded US school codes UIUC alerts "select A-F and enter the conversion"). "New Scale/Conversion" = `a.AddScale` (href
  `/Apply/Application/AddLegend?HSIndex=...`; jQuery GETs it and appends a `.legendRow` to `.legendRecords`; handler returns false, so
  `.click()` is safe). Row inputs: `.HSscale` "Numerical Range" (maxlength 10) and `.HSletterEquivalent` "Grade/Notation" (maxlength 30).
  The first row's inputs get title hints "90-100" / "A" via a `.hint()` plugin that puts the title into `.value` while empty, so an empty
  first row READS as "90-100" = "A": compare against `title` before trusting a value. The courses pages stay locked ("You must first
  complete and submit the Education section") until this page is SUBMITTED (Submit Page), not just saved.
  Grading type 3 (Other) turns the course Grade/Mark box into free text (maxlength 10); type 2 makes it a select of A+..F, P, W, WF, ME,
  NC, PFP, PFF, S, U. UIUC's China help page: numeric grades without an A-F conversion -> "Other" + enter the conversion rows.
- `/Apply/Application/FreshmanSRAR` (Courses Years 9-11) and `/Apply/Application/FreshmanSRAR?IsLower=False` (Courses Year 12). One
  editor `.GradeEditor` per school (`.SchoolArea`), saved rows in `.gradeArea` (one child per row, text like
  "Drama 88 Year: 9th Year Term: 1st Semester Subject: Other Type: Regular Repeated: No Copy Edit Delete").
  Editor fields (classes): `.TermYear` (9-11 page: 1=9th, 2=10th, 3=11th, 0=Pre-High School; 12 page: 4=12th, 5=Post-12th),
  `.Term` (`.2.1` 1st Semester, `.2.2` 2nd Semester, `.3.1-.3.3` trimesters, `.4.1-.4.4` quarters, `.5.1` Summer, `.1.1` All Year),
  `.CourseTypeID` subject (ENG English, M Mathematics, SCI Science, S Social Science, FL Language Other Than English, OTH Other,
  TECH Technical), `.CourseName` (maxlength 255), `.CourseGrade` (see above; on the Year 12 page it defaults to the value
  "In Progress", which is what UIUC wants for unfinished 12th-grade courses), `.AdvancedTypeID` type (None Regular, Academic,
  Accelerated, Advanced, AP "AP Course", AP Prep, A Level, AS Level, IGCSE, College Prep, Enriched, Gifted, High Honors, Honors, IB HL,
  IB SL, MYP), `.IsRepeat` checkbox, `input.addGrade` "Add Course". Checkbox `HighSchools[i].NoLowerCoursesTaken` /
  `NoUpperCoursesTaken` = "I did not attend this school during ...".
  Add Course POSTs the editor to `/Apply/Application/AddGradePost`; on success it appends the row to `.gradeArea`, shows
  "Your course has been added above." and AutoSave()s; the editor keeps its values. An error reply (text starting "Error") goes to an
  alert. Picking "All Year" on the 9-11 page opens `#termDialog` (semesters / trimesters / quarters / yearly) unless the school uses block
  scheduling. A-Level/AS types pop a confirm() for non-international schools. The page sets `window.onbeforeunload` while there are
  unsaved changes.
  Subject help (verbatim categories): English includes Drama and Speech; Mathematics includes AP Computer Science A/Principles;
  Technical = Drafting, Engineering, Information Processing, PLTW, Graphic Design, CAD, Web Design; Other = Religion, Art, Music, Dance,
  PE, Driver's Ed, Health, Consumer Education.
- `/Apply/Application/OtherAcademic`: `ForeignLanguageCode` select (e.g. LZH Chinese, LJA Japanese; each listed twice), 
  `ForeignLanguageLevel` (0.5 ... 4.0, 4.5 = "4+"), checkbox `HasNotTakenForeignLanguage`. One language only: the highest level.
- `/Apply/Application/Preview` (Review and Submit): "Review" opens `/Apply/Application/ViewApplication` (read-only, full record) and
  **`#btn_submit` here is "I'm done! Submit my record." - the FINAL submission. It has the same id as every page's Submit Page button:
  never click `#btn_submit` on /Preview.**
- Status page `/Apply/Application/Status` lists "Self-Reported Academic Record" under Missing Items until the final submission.
