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
- Coursework for a school outside the US: `/srt/EnterInternationalCoursework-yr-<endYear>.aspx?selCeeb=<ceeb>&yr=<endYear>&sel_sender_ceeb=<ceeb>`
  (`yr` = the year the school year ends: 2024 = 2023-24). The page for a US school was not seen (no US school on the test record).

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
- MUI Autocomplete opens on mousedown on its input; options are `[role=option]` in a popper. From the page's own JS world, setting
  `input.value` needs the native setter (a content script's isolated world sets it natively anyway).
- A-G Matching (`/23505`): "Update A-G Courses" opens a drawer with one row per course and an MUI Select (`div[role=combobox]`, aria-label
  "select-grade") whose options are a code and a name: A History / Social Science, B English, C Mathematics, D1 Biological Science,
  D2 Physical Science, E Language Other than English, F Visual & Performing Arts, G College-Preparatory Elective, "- No match".
  It unlocks after "I'm Done Adding High School Courses".

## 3. UC (apply.universityofcalifornia.edu)

The application signs you out when it is opened in a second tab (it went to `/my-application/login/logout`). Use a single tab.
Academic history links: `/my-application/acadhistFrHighSchool`, `/acadHistFrCollege`, `/acadHistFrCollegeCoursesMain`.
The course form itself was not reached in this session (signed out).

## 4. UT Austin

The Academic Coursework Entry Form is in MyStatus and appears only after an application to UT; a new ApplyTexas account cannot reach it.

## 5. UIUC

myIllini shows "First-year applicants apply through the Common App"; the SRAR appears only after a Common App submission to UIUC.
