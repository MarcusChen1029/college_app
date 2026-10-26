# Common App fill extension: design

Date: 2026-10-26. Status: draft for owner approval.

## 1. Intent

Students already enter their transcript once in the tracker (`/application/transcript`). Typing the same 30-40 courses again into
Common App, one subject, level, term grade and credit at a time, is the most tedious part of the application. A browser extension
reads the student's transcript from their tracker account and fills Common App's coursework pages with **one click**.

Common App comes first. Other application systems (UC, STARS, Cal State Apply, ...) come later, so the design keeps the
Common App specifics in one place, the same way `web/lib/transcript-maps/*.ts` does for the copy-field view.

Success: a student with a complete tracker transcript opens Common App, ticks the grades to fill, clicks Fill, and ends up with every
course filled. The only things left to do by hand are the ones the report lists.

## 2. Goals, non-goals, anti-goals

Goals (owner's decisions)
- One **Fill** action fills everything selected. Then the student checks the result afterwards. There is no per-course confirmation.
- The panel lists the grades **9th, 10th, 11th, 12th, Other courses** with a checkbox each, all ticked by default. "Fill selected"
  fills them in a row. Ticking one grade gives the one-grade-at-a-time flow.
- Between grades the extension presses Common App's **Continue** (which saves that grade) by itself and moves on. It does not stop for review.
- If a grade already has courses in it, the extension **asks: Replace or Keep**.
  - Replace: remove the existing rows, then fill from the tracker.
  - Keep: leave existing rows untouched and add only tracker courses that are not there yet. *(My call: "not there" = no existing row
    with the same course name, compared case-insensitively and ignoring extra spaces.)*
- Also fill Education > **Current or Most Recent Year Courses**.

Non-goals (v1)
- Other application systems. The code is structured for them, but only Common App ships.
- Firefox / Safari. Chrome, which also covers Edge. *(My call.)*
- Teachers/counselors filling for a student. The transcript is private to the student by design (no teacher access anywhere), and this
  extension keeps it that way.
- Reading Common App data back into the tracker.
- Any other Common App section: profile, testing, activities, GPA/rank in Education > Grades.
- Public Chrome Web Store listing. v1 is shared privately (unlisted or a load-unpacked build) with the owner's students. *(My call.)*

Anti-goals (a failure even if it "works")
- **A grade on Common App that differs from the transcript.** Grades are entered exactly as stored (the tracker never converts
  grades). If the stored grade is not an option in Common App's list, the box stays **blank** and goes in the report. Never pick a
  "closest" value.
- Clicking anything that submits an application, pays, or touches a college-specific section. The extension acts only inside the
  Courses & Grades grade dialogs and the Current Year Courses page.
- Sending Common App page content or the student's grades anywhere other than the student's own browser and their own tracker account.
- The extension holding anything that can read more than the transcript (portal passwords, notes, essays, aid offers).
- Silently overwriting existing Common App courses (that is what the Replace/Keep question prevents).

## 3. Constraints

- **Never test on the owner's real Common App account.** It holds submitted applications. Development and testing need a throwaway
  Common App account with a Courses & Grades college on its list (e.g., Purdue, Arizona State, UW-Madison, Stanford) and an Education
  section with a school entered. The owner creates it. The agent must not create accounts or type passwords.
- Common App's Terms of Use could not be read (the page loads its text by script). Other extensions already fill Courses & Grades
  (CollegeFill, Admitigo, GradMap, Crimson Autofill). **Read the terms before any public release.** A private v1 is fine to build.
- The transcript stays private to the student: the extension reads only through a transcript-only token (§5.2); teachers get no new access.
- Repo rules apply: Next 16 docs before touching `web/`, `npx tsc --noEmit && npm run lint && npm test && npm run build` before commits.

## 4. What Common App's pages look like (observed 2026-10-26, read-only, owner's real account)

App: Angular 18.2 + Angular Material. Dropdowns are `mat-select` (role `combobox`). Their options only exist in the DOM while open,
inside `.cdk-overlay-pane` as `mat-option`. So a value is chosen by opening the select and clicking the option whose text matches.
Text boxes are plain inputs; Angular needs real `input`/`change`/`blur` events.

### 4.1 Courses & Grades (`/common/13`)
- Sub-pages: `/common/13/54` intro (lists colleges requiring C&G), `/common/13/55` = 9th grade. Links continue to `/56`-`/59`
  (presumably 10th, 11th, 12th, Other courses; **not opened**, confirm on the test account).
- Each grade page shows a summary (School, School Year, Grading Scale, Schedule, completed/incomplete counts), an **"Edit <grade>"**
  button that opens a dialog, and a checkbox "I have reported all of my courses for this grade".
- Dialog (`mat-dialog-container`), element ids, where `T` = transcript number and `C` = course number (1-based):

| Field | Element | id |
|---|---|---|
| School Name | mat-select (only schools from the Education section) | `schoolNameControl{T}` |
| School Year | mat-select (e.g. "2023-24") | `schoolYearControl{T}` |
| Grading Scale | mat-select | `gradingScaleControl{T}` |
| Schedule | mat-select (shown value "Semesters") | `scheduleControl{T}` |
| Subject | mat-select | `subjectControl_T{T}C{C}` |
| Course Name | text input | `courseNameControl_T{T}C{C}` |
| Course Level | mat-select | `levelControl_T{T}C{C}` |
| Term grades | mat-select per term | `grade1Control_…`, `grade2Control_…`, `gradeFinalControl_…` |
| Term credits | text input per term | `credit1Control_…`, `credit2Control_…`, `creditFinalControl_…` |
| Credits N/A | checkbox | `creditNA_T{T}C{C}-input` |

  Each element also has a readable `aria-label` ("Transcript 1, Course 3, Semester 1 Grade"). Use it as a fallback locator.
- Buttons: "Add another course", "Add courses from another transcript", per-row "Remove transcript 1, course N of M" (opens a confirm
  dialog), "Continue" (closes and saves), "Close dialog" (X).
- **Grading Scale options (VERIFIED):** A-F, 1-100, 0.0-4.0, 0.0-5.0, 1-7, 1-10, 1-11, 1-20, Other.
- Grade options on the 1-100 scale: 105 down to 0, then Incomplete, No Grade, Fail - (Pass/Fail), Pass - (Pass/Fail), S - Satisfactory,
  U - Unsatisfactory, Withdrawn, Withdrawn - Failed, Medical Excuse. Other scales' grade lists were not observed. Read them live.
- Term columns follow the Schedule (Semester: S1, S2, Final; per the research notes Trimester: T1-T3 + Final, Quarterly: Q1-Q4 + Final).

### 4.2 Current or Most Recent Year Courses (`/common/4/24`, Education section)
- A normal page, not a dialog. "How many courses would you like to report?" (text input), then the scheduling system as **radio buttons**
  (Semester, Trimester, Quarter, Yearly). Then per course: subject, name (textarea), level, schedule ("Full Year", "First Semester",
  "Second Semester", ...).
- Subject, level and schedule are type-ahead inputs with a "Clear selection" button, not `mat-select`. Observed values (Chemistry,
  Math (Other), Advanced Placement (AP)) match the C&G lists, but that the full lists are identical is **not confirmed**. Match against
  the options read live, as for C&G.
- Ids are generic question ids (`text_ques_1073`, `text_ques_308`, ...). They are probably stable but not patterned, so locate fields by
  their visible label ("Course 3 subject").
- How this page saves (autosave vs Continue) was not checked. Confirm on the test account.

## 5. How it works

### 5.1 Pieces
1. **Extension** (new top-level `extension/` dir; Manifest V3, TypeScript): a side panel UI, a background service worker
   (auth + data fetch), and a content script on `https://apply.commonapp.org/*` that does the filling.
2. **Shared mapping code**: reuse the tracker's pure modules (`web/lib/transcript.ts`, `transcript-maps/*`), bundled into the
   extension at build time, not copied. Add a Common App **fill plan** module (pure, unit-tested) that turns a transcript into
   "per grade: school, year, scale, schedule, rows of field → exact option text".
3. **Tracker side**: the verified Grading Scale list, the scale mapping and the Current Year schedule mapping (Full Year / First
   Semester / Second Semester, ...) live in the new fill-plan module, **not** in `SystemMap` (adding a field there would touch all six
   maps and the completeness test for something only Common App filling needs). Also update the Common App research note:
   the Grading Scale list is now verified.

### 5.2 Sign-in and data
**Owner's decision:** the student signs in **once inside the extension**. After that, Fill works from Common App alone, with no tracker tab.

Because a stored login would otherwise reach the whole account (including saved portal passwords), the extension does **not** keep a
Supabase session. It keeps a narrow **transcript-only token** instead *(my design; builder may refine the mechanics, not the scope)*:
1. "Sign in" in the panel opens the tracker page `/extension/connect` with `chrome.identity.launchWebAuthFlow`. The student signs in
   as usual (Google via Supabase) if not already signed in, and sees an extension-specific consent screen: "This extension can read
   your transcript (schools, courses, grades). It cannot see anything else in your account." Not the AI connector's consent page,
   whose copy is about AI.
2. On Allow, the page calls a new SECURITY DEFINER RPC that creates a random opaque token, stores only its hash in a new table
   `extension_tokens` (user id, hash, label, created, last used, expires after 90 days, revoked), and redirects to
   `https://<extension-id>.chromiumapp.org/#token=…`. The extension id is pinned with a `key` in the manifest so it is stable for
   unpacked/unlisted builds. `/extension/connect` only redirects to that one pinned id.
3. The extension stores the token in `chrome.storage.local` and calls a second SECURITY DEFINER RPC, `extension_transcript(p_token)`, which
   returns the token owner's `transcript_schools` and `transcript_courses` only (explicit column list), and updates "last used".
   A wrong, expired or revoked token returns `{ok:false}`.
4. Settings on the tracker lists connected extensions with "Disconnect" (revokes the token). The panel has "Sign out" (forgets the token).
   Teacher accounts are refused at step 2 ("students only").
- Schema change = new migration (next number per CLAUDE.md, currently 0031), applied to the project.
- The extension keeps no grades after the run, beyond what the token can fetch again.

### 5.3 Fill flow (Courses & Grades)
1. The panel shows the grades with checkboxes (only grades that have tracker courses are enabled) and the course count for each.
2. On Fill, for each ticked grade in order: go to that grade's page, open "Edit", and check for existing rows → Replace/Keep prompt
   (asked once per grade that has rows).
3. Set School Name, School Year, Grading Scale, Schedule. Add rows ("Add another course") and fill each course. Press **Continue**.
4. Move to the next grade. At the end, show the **report**.

Which courses go into Courses & Grades *(my calls)*:
- Only courses at `kind = high_school` schools. Courses at a `college` school are not entered (Common App asks for those in
  Education > Colleges & Universities, with no course list).
- Only courses with at least one `graded` term or a `finalGrade`. C&G "captures courses with credit awarded on high school transcript"
  (research note §1.1), so in-progress and planned courses go to Current Year Courses (§5.4) instead and are listed in the report.
- Dual-enrollment courses (`isCollege` or level `dual_enrollment`) that sit under the high school are entered there with level
  "Dual Enrollment", per Common App's rule. Summer, repeated and withdrawn courses are entered as the transcript shows them (each
  attempt is its own row; the grade is the printed one, e.g. "Withdrawn" when that is an option).
- Grade popup: `gradeLevel` 9-12 → that grade. Null or other (pre-9th, ungraded-level) → "Other courses".
- One school and one year per dialog: the school with the most courses in that grade, and that school's most common `academicYear`
  for it. Courses from any other school or year in the same grade are listed in the report, not filled (see "second school" below).

Mapping rules (from tracker data to Common App):
- School Name: match the tracker school name to the dropdown option text (case/space-insensitive). No match → skip that grade and say
  why in the report ("add this school in Common App's Education section first").
- School Year: `academicYear` → "YYYY-YY" (2023 → "2023-24").
- Grading Scale *(my call; verified list above)*: `percent_100` → 1-100; `letter`/`letter_plus_minus` → A-F; `gpa_decimal` with
  `scaleMax` 4 → 0.0-4.0, 5 → 0.0-5.0; `ib_7` → 1-7; `other` with `scaleMax` 10/11/20 → 1-10/1-11/1-20; anything else → Other
  (then grades are typed, per Common App help). If one grade's courses use more than one scale, use the most common one and report the rest.
- Schedule: the dialog's wording differs from `COMMON_APP_MAP.period` ("Semesters" shown vs "Semester"; the Current Year radios say
  "Quarter" where the map says "Quarterly"). Match on the stem (`semester`, `trimester`, `quarter`, `year`) against the options read
  live, not on exact text. Record the observed option texts from the test account in the fill-plan module.
- Subject, level: from `COMMON_APP_MAP` (`subjectFor`, `level`), respecting the student's per-course `overrides.common_app`.
- Grades: S1/S2/T1-3/Q1-4 → matching term column; `finalGrade` (or FY term) → Final. Only `graded` terms are filled. Use `grade`
  (as printed), never `gradeWeighted`. Exact option-text match or blank + report. *(My call.)*
- Credits: the tracker has one credit per course → **Final credit** box *(my call)*. `creditUnit = not_listed` → tick N/A.
- Courses from a second school in the same grade: *(my call)* v1 fills the main school's courses and lists the others in the report.
  "Add courses from another transcript" is a later step.
- Warnings from `COMMON_APP_MAP.rules` are added to the report.
- The extension does **not** tick "I have reported all of my courses for this grade". That is the student's own statement, so the report
  tells them to tick it. *(My call.)*

### 5.4 Current Year Courses
- Courses = the high-school courses in the latest `academicYear` (any term `in_progress`/`planned`, or the most recent year if none are).
- Set the course count, the scheduling-system radio, and per course subject, name, level, and schedule (Full Year / First Semester / Second
  Semester / ... from which terms the course has). Same Replace/Keep question if courses already exist.
- Shown as its own checkbox in the panel ("Current year courses"), ticked by default.

### 5.5 The report
Per grade: filled N courses, and a list of every box left blank with the reason ("grade 'A-' not in Common App's list", "no credit in
tracker", "school not found"). Each item has a link that opens that grade. Also: "Tick 'I have reported all courses' on each grade".

### 5.6 Robustness
- Wait for each element before acting (dialogs and overlays load async). Fill one field at a time and confirm the shown value after each select.
- If a locator is missing (Common App changed its page), stop that grade without pressing Continue and report "Common App's page changed".
- A Stop button aborts after the current field.

## 6. Testing
- Unit tests (`node --test`, like the existing `web/lib/*.test.ts`) for the fill-plan module: scale/term/credit mapping, Keep-mode dedupe,
  blank-and-report cases.
- Content-script tests against saved DOM snapshots of the Common App dialog (captured from the **test** account).
- Manual end-to-end on the throwaway Common App account: fill all grades, re-run with Keep (no duplicates), re-run with Replace.

## 7. Left to the builder
Extension build tooling (e.g. Vite/esbuild), panel design (follow the tracker's tokens in `globals.css`), exact wait/retry timings,
how the shared `web/lib` modules are imported into the extension bundle, and the confirmation of the unobserved sub-pages (`/56`-`/59`),
other scales' grade lists and the Current Year page's save behavior on the test account.
