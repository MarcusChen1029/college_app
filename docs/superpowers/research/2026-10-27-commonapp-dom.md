# Common App DOM facts for the fill extension (test account)

Recorded 2026-10-26 on the owner's throwaway Common App account (dashboard: 0/7 sections complete, one college: Purdue University, nothing
submitted). Tool: the built-in browser pane, tab-1, mostly `javascript_tool` DOM reads plus real clicks and typing.

Legend: **VERIFIED** = observed on the test account, 2026-10-26. **NOT RECORDED** = could not be observed; why is given.

## 0. What could and could not be recorded

- First pass: the test account had no school in Education (the school had not been saved), so every `/common/13*` URL redirected to
  `/common/13/not-required` ("We need to know your current or most recent secondary/high school before you can enter your courses and
  grades"). Section 2 (Current Year) was recorded then.
- Second pass: the controller saved "West Lafayette Junior-Senior High School" in Education; `/common/13` now opens `/common/13/54`.
  Section 1 (Courses & Grades) was recorded then. **Lesson for the filler: Courses & Grades is only reachable once the Education school is
  saved; otherwise it redirects to `/common/13/not-required`.**

## 1. Courses & Grades (`/common/13`)

### 1.1 Pages (VERIFIED)
| URL | h1 | Notes |
|---|---|---|
| `/common/13` | | redirects to `/common/13/54` (or `/common/13/not-required` if no school is saved) |
| `/common/13/54` | "Courses & Grades" | "Required: Purdue University"; question "I can access a copy of my transcript(s) or official grades": radios `option_ques_1913_2371-input` = Yes, `..._2372-input` = No; button `#sectionContinue54`. Yes + Continue goes to `/55`. |
| `/common/13/55` | "9th Grade" | button `#addCG` "Add 9th grade" (becomes "Edit 9th grade" once data exists); checkbox "I have reported all of my courses for this grade"; `#sectionContinue55` |
| `/common/13/56` | "10th Grade" | `#addCG` "Add 10th grade"; `#sectionContinue56` |
| `/common/13/57` | "11th Grade" | `#addCG` "Add 11th grade"; `#sectionContinue57` |
| `/common/13/58` | "12th Grade" | first asks "Do you have 12th grade courses on your transcript with official grades? ..." Yes/No (`#clear_ques_1927`); `#addCG` "Add 12th grade"; `#sectionContinue58` |
| `/common/13/59` | "Other Courses" | first asks "Do you have any other courses on your transcript with grades? (...)" Yes/No (`option_ques_1933_2371-input` = Yes, `#clear_ques_1933`); `#addCG` "Add Other Courses" is hidden (height 0) until Yes is picked; checkbox "I have reported all of my courses that I did not report in grade 9-12"; last button is "Go to My Colleges" (no Continue) |

On a grade page with data the summary reads: "School: ...", "School Year: 2023-24", "Grading Scale: A-F", "Schedule: Semesters", "Completed
courses & grades entered: 3", "Incomplete courses & grades entered: 0". The Preview button says "Courses & Grades Section, Opens dialog".

### 1.2 The dialog (VERIFIED; mat-select, unlike Current Year's ng-select)
- Opened by `#addCG`. `mat-dialog-container`, title `h2#changePreferencesTitle` "Courses & Grades", `h3` "Courses & Grades – 9th grade", header
  `h4.transcript__title` "Transcript #1 - West Lafayette Junior-Senior High School" (after the school is chosen). **A new dialog starts with
  2 empty rows.**
- Header selects (`mat-select`, `role=combobox`): `schoolNameControl1`, `schoolYearControl1`, `gradingScaleControl1`, `scheduleControl1`.
  Every `mat-select` option list begins with "Clear selection". A select's chosen text is in `.mat-mdc-select-value-text` (visible in
  `innerText`), unlike Current Year.
- Row `n` (element `ca-cng-course`, ids with `T1C{n}`): `subjectControl_T1C{n}` (select), `courseNameControl_T1C{n}` (input, maxlength 100,
  aria-label "Transcript 1, Course n, Course Nameundefined"), `levelControl_T1C{n}` (select), grades `grade1Control_`, `grade2Control_`,
  (`grade3Control_`, `grade4Control_`), `gradeFinalControl_` (selects; aria "Transcript 1, Course n, Semester 1 Grade" / "Final Grade"),
  credits `credit1Control_`, `credit2Control_`, ..., `creditFinalControl_` (inputs, maxlength 5, aria "... Semester 1 Credit" / "Final Credits"),
  `creditNA_T1C{n}` (mat-checkbox) with `creditNA_T1C{n}-input` ("Credits not applicable"). Term labels read "S1", "S2", "Final";
  group labels "Semester Grades *" and "Semester Credits *".
- Selects open with a click on `.mat-mdc-select-trigger`; options are `mat-option` inside the last `.cdk-overlay-pane` (a sibling of the
  dialog, with `role=listbox` panel id `{selectId}-panel`). Option text carries spaces around it (" A+ "), "Clear selection" has none.
  **Synthetic `.click()` on the trigger and on the `mat-option` works** (no real mouse needed); Escape closes a panel, and X/backdrop
  clicks do not reliably close it.
- "Add another course" (`button--primary`) appends row `n+1` with ids `..._T1C{n+1}` (VERIFIED: 2 rows then a click gave
  `subjectControl_T1C3`, `courseNameControl_T1C3`, `grade1Control_T1C3` ... `creditNA_T1C3`). Rows 2 and up get a "Remove course" button
  (aria "Remove transcript 1, course n of M, Opens dialog"; there are two buttons with that aria-label, one with the text, one icon-only);
  row 1 has none.
- Other buttons: "Add courses from another transcript", footer "Continue" (aria "Continue , Closes dialog"), `#changePreferencesClose`
  ("Close dialog", the X), "View walkthrough", "View FAQs".

### 1.3 Option lists (VERIFIED)
- **School Name**: only the Education school: "West Lafayette Junior-Senior High School".
- **School Year** (27, newest first): 2026-27, 2025-26, ... , 2001-02 (the same "YYYY-YY" form as `schoolYearLabel`).
- **Grading Scale** (9): A-F, 1-100, 0.0-4.0, 0.0-5.0, 1-7, 1-10, 1-11, 1-20, Other. Identical to `COMMON_APP_GRADING_SCALES`.
- **Schedule** (5): `Semesters`, `Trimesters`, `Quarters`, `Yearly`, `Other`. The wording is plural ("Semesters"), unlike the Current Year radios
  ("Semester"). `matchStem` stems `semester`/`trimester`/`quarter`/`year` each pick exactly one of the first four; **"Other" exists** (it adds a
  text box "Please describe" and Final-only columns) and no stem picks it.
- **Subject** and **Level**: same lists as Current Year (20 and 17); row 1 used "Algebra", "English", "Biology", "Honors", "Regular/Standard",
  "Advanced Placement (AP)" and they were accepted.
- **Grades per scale** (after the grade values, every list ends with the same 9 words: Incomplete, No Grade, Fail - (Pass/Fail), Pass -
  (Pass/Fail), S - Satisfactory, U - Unsatisfactory, Withdrawn, Withdrawn - Failed, Medical Excuse):
  - A-F: A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, **E**, F (14; note there is an E and no "P"/"W").
  - 0.0-4.0: 4.0, 3.9, ... , 0.0 in steps of 0.1 (41 values, one decimal, "4.0" not "4").
  - 0.0-5.0: 5.0, 4.9, ... , 0.0 (51 values).
  - 1-7: 7, 6, 5, 4, 3, 2, 1 (no 0).
  - 1-10: 10 ... 0 (11 values); 1-11: 11 ... 0 (12); 1-20: 20 ... 0 (21).
  - 1-100: 105 down to 0 (106 values, integers).
  - Other: the grade boxes become **text inputs**: `INPUT#gradeControl_T1C1` (the same id on all three term boxes!), maxlength 12, located by
    aria-label "Transcript 1, Course 1, Semester 1undefined" / "Semester 2undefined" / "Finalundefined"; credits are the same inputs as before.
- **Remove confirm** (a second `mat-dialog-container`): title "Remove course 3 of 3", text "Are you sure you want to permanently remove this course?",
  buttons `#alert_rc_c` "Cancel" (aria "Cancel, Closes dialog") and `#alert_rc_r` "Remove" (aria "Remove, Closes dialog").

### 1.4 Columns per Schedule (VERIFIED, row 1 element ids)
| Schedule | grade selects | credit inputs | other |
|---|---|---|---|
| Semesters | grade1, grade2, gradeFinal | credit1, credit2, creditFinal | |
| Trimesters | grade1, grade2, grade3, gradeFinal | credit1, credit2, credit3, creditFinal | |
| Quarters | grade1 ... **grade4**, gradeFinal | credit1 ... credit4, creditFinal | |
| Yearly | gradeFinal only | creditFinal only | |
| Other | gradeFinal only | creditFinal only | extra text box "Please describe" (appears before Subject) |

So **a Final column exists for every Schedule**, and Quarters does give `grade4Control`. The Semesters column header is "Semester Grades".

### 1.5 Behaviour (VERIFIED)
- **Saving: Continue and X both save.** Pressing Continue sends `POST https://api26.commonapp.org/answer/v2` and closes the dialog. Pressing the X
  (`#changePreferencesClose`) **also** sent the POST and kept every row, including an incomplete one: **X does not discard.** Reopening
  ("Edit 9th grade") shows all rows with their values. Incomplete rows are allowed to be saved: the summary then counts them under "Incomplete
  courses & grades entered". The inline validation text is "Subject, Course Name, Course Level, at least one grade, and at least one credit are required
  for each row."
- **Remove** is client-side until the dialog closes: confirming "Remove" sent no `answer/v2` POST; the remaining rows were **renumbered**
  (removing course 2 of 3 turned the old course 3 into `..._T1C2`).
- **Changing the Grading Scale clears all grade boxes** of every row (credits, names, subjects, levels are kept). Set the scale before
  the grades. Changing Schedule rebuilds the columns (and, as on Current Year, assume it clears the term grades: not separately checked).
- **N/A**: ticking `creditNA_T1C{n}-input` makes that row's credit inputs read-only (`readOnly = true`); typed credit values stay in them.
  A row with N/A ticked and a grade counted as complete.
- The grade selects read "Clear selection" first; a stale grade can be cleared by picking it.

### 1.6 What this changes in `web/lib/commonapp-fill.ts`
Nothing: the stems already match the dialog's wording ("Semesters" ...), the term columns (S1/T1/Q1 -> 1, S2/T2/Q2 -> 2, T3/Q3 -> 3, Q4 -> 4,
FY -> Final) match `grade{n}Control` and `gradeFinalControl`, and Final-only for `Yearly`. A test now pins the five observed Schedule texts.
Open for Task 7: a plan with scale "Other" needs the text-input path (`gradeControl_T1Cn` with duplicate ids); a Schedule of "Other" is never planned.

## 2. Current or Most Recent Year Courses (`/common/4/24`)

### 2.1 Page (VERIFIED)
- URL `https://apply.commonapp.org/common/4/24`, heading `h1#pageTitle` = "Current or Most Recent Year Courses", breadcrumb "Complete your
  Common Application". Education sub-pages seen in the side nav: `/common/4/18` Current or Most Recent Secondary/High School, `/19`
  Other Secondary/High Schools, `/21` Colleges & Universities, `/23` Grades, `/24` Current or Most Recent Year Courses, `/25` Honors,
  `/22` Community-Based Organizations, `/197` Future Plans.
- Loads slowly: the body says "Please wait, the page is loading." for several seconds; wait for `main` (or `h1#pageTitle`).

### 2.2 Controls (VERIFIED)
The page is built with **ng-select** (the `@ng-select/ng-select` library), not `mat-select` and not a plain type-ahead. Options exist only
while a select is open, in `ng-dropdown-panel .ng-option` (role `option`, appended inside the page, not in a `.cdk-overlay-pane`).
`aria-expanded="true"` is set on the combobox input while open.

| Question | Element | id |
|---|---|---|
| How many courses would you like to report? | ng-select, single | `text_ques_307` |
| Course scheduling system | `mat-radio-group#radioGroup1803`, radios `option_ques_1803_3522-input` = Semester, `..._3523-input` = Trimester, `..._804-input` = Quarter, `..._5356-input` = Yearly; button `#clear_ques_1803` "Clear answer" | |
| Course n subject | ng-select, single | `text_ques_{1073+n-1}` (1073-1087 for courses 1-15) |
| Course n name | `textarea`, `maxlength="100"` | n=1: 308, 2: 312, 3: 316 ... = 308+4(n-1) up to n=10 (344) |
| Course n level | ng-select, single | 309+4(n-1) |
| Course n schedule | ng-select, **multi** ("Choose one or more options") | 311+4(n-1) |
| Continue | `button#sectionContinue24` | |

- Ids for courses 11-15 are not on the same pattern (11: 1083 / 1847 / 1848 / 1849; 12: 1084 / 1850 / 1851 / 1852; and so on up to 15:
  1087 / 1859 / 1860 / 1861). **Locate by the visible label** ("Course 3 subject": `label[for]` or `ca-control-wrapper-label`), never by
  arithmetic.
- Each field's label is `label[for=<id>]` with text "Course n subject" / "Course n name" / "Course n level" / "Course n schedule".
- All 15 courses' wrappers (`ca-single-select-dropdown`, `ca-short-answer`, `ca-multi-select-dropdown`) always exist; the ones beyond the
  chosen count are empty and the question inputs only exist for the first `count` courses. After choosing a count, the inputs
  for those courses appear.
- **The selected value of a single ng-select is NOT visible in the DOM text.** It is the `value` *property* of the combobox `input`
  (`document.getElementById('text_ques_1073').value` is "Geometry"); `outerHTML` and `innerText` of the select do not show it. For
  multi-selects each selected option is a `.ng-value` > `.ng-value-label` (text "First Semester") with `.ng-value-icon` as its remove x.
  Selecting sets `ng-valid`, shows `button.ng-clear`.
- The course **count** has options **1 to 15** (VERIFIED: "1", "2", ... "15").

### 2.3 Option lists (VERIFIED)
- **Subject** (20): Pre-Algebra, Algebra, Geometry, Trigonometry, Pre-Calculus, Calculus, Math (Other), Biology, Chemistry, Physics,
  Earth/Environmental Science, Science (Other), English, History/Social Science, Foreign/World Language, Physical Education/Health, Art
  (Visual or Performing), Computer Science, Religion, Other/Elective. **Identical, in the same order, to `COMMON_APP_SUBJECTS`** in
  `web/lib/transcript-maps/common-app.ts` (so the Current Year list equals the C&G Subject list from Common App's data catalog).
- **Level** (17, exact texts, in order): `Regular/Standard`, `Accelerated`, `Advanced`, `Advanced Placement (AP)`,
  `AS/A-level/International A-level, Cambridge AICE`, `College Prep`, `Dual Enrollment`, `Enriched`, `GCSE, IGCSE`, `Gifted`,
  `High Honors`, `Honors`, `Intensive`, `International Baccalaureate (IB)`, `Pre-IB`, `Regents`, `N/A`. Two options contain a comma but are one
  option each. Same wording as the `level` table in `common-app.ts`.
- **Course scheduling system** (radios): Semester, Trimester, Quarter, Yearly. (The map says "Quarterly"; this page says "Quarter".)
- **Course n schedule** options depend on the radio chosen (the options are rebuilt when the radio changes):

| Radio | Schedule options (in order) |
|---|---|
| Semester | Full Year, First Semester, Second Semester |
| Trimester | Full Year, First Trimester, Second Trimester, Third Trimester |
| Quarter | Full Year, First Quarter, Second Quarter, Third Quarter, Fourth Quarter |
| Yearly | Full Year |

### 2.4 Behaviour (VERIFIED)
- **Saving: only on Continue.** Choosing values and blurring the fields sent nothing to Common App (a hook on `fetch`/`XMLHttpRequest`
  showed only analytics POSTs to `r.logr-ingest.com`); a reload before Continue lost everything (count, radio, rows). Pressing Continue
  sends `POST https://api26.commonapp.org/answer/v2` and navigates to the next page (`/common/4/25`, Honors). Coming back to
  `/common/4/24` shows every value restored, and the page header status turns "Complete".
- **Changing the scheduling system clears every course's schedule** (no confirmation); subject, name and level stay. So set the radio
  **before** the per-course schedules.
- **Count first**: choosing the count creates the per-course inputs. The radio is needed before the "Course n schedule" inputs appear
  (the first three fields of each course show after the count; "schedule" shows after the radio).
- **Schedule is multi-select** and does not close after a pick. Selecting "Full Year" **together with** another term is allowed to be
  picked but the field shows the validation error "You may not select both Full Year and other terms" (red, `role="alert"`; whether
  Continue refuses to save with it was not tried). Removing a term: click its `.ng-value-icon`. So a course taken in S1 and S2 is either "Full Year" alone or both semesters
  without "Full Year".
- **Typing into an ng-select filters by "contains", and Enter picks the first match.** Typing "Honors" picks **High Honors** (first match),
  typing "Algebra" would match "Pre-Algebra" too (inferred, not tried). The filler must not type-and-Enter: open the select, read `.ng-option` texts and click the one
  that **equals** the wanted text (after trimming/case, per `matchOption`). Typing the count's "3" and Enter worked (single option "3").
- Real keyboard input works on the page: click the select, type, Enter. A text box (`textarea`) takes `type` events normally; the name was
  accepted and persisted as typed.
- The Education page needs no school to open this page, and it saves without one.
- No Add/Remove course buttons appear in the page text: the count select sets the number of rows (not tested: lowering the count after
  filling rows).

### 2.5 What this changes in `web/lib/commonapp-fill.ts`
- `matchStem` stems stay as they are: radio texts "Semester", "Trimester", "Quarter", "Yearly" start with `semester`, `trimester`,
  `quarter`, `year`.
- `buildCurrentYearPlan`'s single-term wording is now confirmed and filled in (T1-T3: "First/Second/Third Trimester"; Q1-Q4:
  "First/Second/Third/Fourth Quarter"); "First Semester" and "Second Semester" were already right. "Full Year" is right for all systems.
- Because the schedule is a multi-select, **two or three terms of a trimester/quarter year** (not all of them) cannot be one value: they
  stay `null` with the reason "pick the schedule options by hand". Making `schedule` a list is a possible later change.

## 3. Fixtures
- `extension/test/fixtures/current-year.html`: the page's `main`, reduced from the live DOM (3 courses, Semester): wrappers, ids, classes,
  aria attributes as observed; header, svg, notch pieces and the 12 empty placeholders removed; `value` attributes added to the
  comboboxes because the live DOM keeps the selection only as a property. No student name, email or account id.
- `extension/test/fixtures/cg-dialog.html`: the 9th-grade dialog (`mat-dialog-container`), 3 fake rows (Test Algebra / Test Biology with N/A
  ticked / Test English), school West Lafayette Junior-Senior High School, 2023-24, A-F, Semesters. Same reduction as above.
- `extension/test/fixtures/cg-overlay-grades.html`: the same dialog plus the open Semester 1 grade list of course 3 (A-F list, 24 options
  with "Clear selection"), as a sibling `.cdk-overlay-container` outside the dialog, like the live page.
