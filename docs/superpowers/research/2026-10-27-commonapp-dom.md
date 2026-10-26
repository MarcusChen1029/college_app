# Common App DOM facts for the fill extension (test account)

Recorded 2026-10-26 on the owner's throwaway Common App account (dashboard: 0/7 sections complete, one college: Purdue University, nothing
submitted). Tool: the built-in browser pane, tab-1, mostly `javascript_tool` DOM reads plus real clicks and typing.

Legend: **VERIFIED** = observed on the test account, 2026-10-26. **NOT RECORDED** = could not be observed; why is given.

## 0. What could and could not be recorded

- The test account has **no school in Education** (`/common/4/18` "Current or most recent secondary/high school" shows only a "Find
  school" button, no school, no date of entry). Every Courses & Grades URL (`/common/13`, `/common/13/54`) redirects to
  `/common/13/not-required`: "We need to know your current or most recent secondary/high school before you can enter your courses and
  grades."
- So **all Courses & Grades facts (section 1) are NOT RECORDED**. Adding the school is the one prerequisite still open (the brief says
  to stop and ask when the account is not ready). The Current Year Courses page does not need a school and is fully recorded (section 2).
- The fixtures `cg-dialog.html` and `cg-overlay-grades.html` were therefore not created.

## 1. Courses & Grades (`/common/13`): NOT RECORDED

Still open, to do once the school exists: page URLs `/common/13/55`-`59` and their headings; Schedule options in the dialog; grade lists
for A-F, 0.0-4.0, 1-7; the Remove-course confirm buttons; whether a new row gets `..._T1C{n+1}`; whether Final grade exists for every
schedule; whether Quarterly gives `grade4Control`; Continue's save behaviour; the intro question ("I can access a copy of my transcript(s)").

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
- `cg-dialog.html` and `cg-overlay-grades.html`: **not created** (Courses & Grades is blocked, section 0).
