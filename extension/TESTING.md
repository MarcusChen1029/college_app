# Live test checklist: Common App filler

**SAFETY FIRST. Use a SEPARATE Chrome profile that is signed in to Common App ONLY with the throwaway test account (the one with Purdue and West Lafayette Junior-Senior High School, nothing submitted). Signing in to the tracker with your test Google account in this profile is fine. NEVER click Fill in a profile where your real Common App account (the one with submitted applications) is signed in. The extension fills the active Common App tab of whatever account is signed in, and it cannot tell test from real.**

This is the end-to-end check that could not be run automatically. You follow it yourself, once, on a throwaway Common App account. Nothing here submits an application.

Before every Fill, look at the Common App tab and confirm the account name and the colleges are the test ones.

## A. Set up (about 10 minutes)

1. In Chrome, create a new profile (profile picture, top right, then "Add profile"). Sign in to https://apply.commonapp.org/ there with the Common App test account only. Use this profile for everything below.
2. Start the tracker: in a terminal run `cd web` then `npm run dev`. The file `web/.env.local` must contain the line `NEXT_PUBLIC_EXTENSION_ID=omnpdpbgbbdbnnaimhppoclimbeeognl`. If you just added it, restart `npm run dev`. The tracker is at http://localhost:3000.
3. Build the extension: in a second terminal run `cd extension`, `npm install`, `node build.mjs`. It prints `built dist/ (TRACKER_URL=http://localhost:3000)`.
4. In the test profile open `chrome://extensions`, turn on Developer mode, click "Load unpacked", choose the `extension/dist` folder. The card must show the id `omnpdpbgbbdbnnaimhppoclimbeeognl`. If it differs, stop: the sign-in will not work.
5. Open the side panel by clicking the extension's toolbar icon (use the puzzle-piece menu if it is not pinned).

## B. The test transcript

Use a throwaway tracker student account, not your own. Your own account holds your real transcript, and this test would mix fake courses into it. Sign in to http://localhost:3000 in the test profile with a second Google account, choose "student" at /welcome, then open /application/transcript.

Add one school, kind "High school", named exactly **West Lafayette Junior-Senior High School** (copy it: it must match Common App's School Name list letter for letter, and it is the only school in the test account's Education section). Then add these courses. For every course:
- Grade scale "Letters with +/-" (Common App's A-F), Period "Semester", Subject "Other" and Level "Regular / standard" (the defaults; Common App shows them as Other/Elective and Regular/Standard).
- Academic year as in the table (the year the school year starts: 2022 means 2022-23). Each grade has its own year, so the 12th-grade courses are the latest year and become the Current Year courses.
- Grades: type the **term grades** in Semester 1 and Semester 2 (status "Graded") **and** the **Final grade**, exactly as shown. The "Note" column is only an explanation, not part of a grade.
- Credits: where the table shows credits in the term columns (e.g. "credit 3"), type them in that term's **Credit** box; the course Credit box then shows their sum and cannot be edited. Otherwise type the course Credit.
- Test Biology's Semester 2 has no grade: leave its grade empty, Status "Auto", and type `0` in its Credit box (the transcript shows no grade that term).

| Grade level | Academic year | Course | Semester 1 | Semester 2 | Final grade | Credit | Note |
|---|---|---|---|---|---|---|---|
| 9 | 2022 | Test Algebra I | `A`, credit 3 | `A-`, credit 2 | `A` | (sum: 5) | Uneven term credits |
| 9 | 2022 | Test English 9 | `B+` | `B` | `B+` | 1 | |
| 10 | 2023 | Test Geometry | `A-` | `A` | `A-` | 1 | |
| 10 | 2023 | Test Biology | `B`, credit 1 | no grade, credit 0 | `B` | (sum: 1) | Semester 2 becomes "No Grade" |
| 11 | 2024 | Test Chemistry | `A++` | `A` | `A` | 1 | `A++` is not in Common App's A-F list on purpose |
| 11 | 2024 | Test US History | `A` | `A` | `A` | (leave blank) | No credit on purpose |
| 12 | 2025 | Test Calculus | status "In progress", no grade | status "In progress", no grade | (none) | 1 | In progress |
| 12 | 2025 | Test Literature | status "In progress", no grade | status "In progress", no grade | (none) | 1 | In progress |

Before the first Fill, on the Common App test account answer Yes to the Courses & Grades intro question by hand (see step 7).

## C. Fill all

6. In the panel click "Sign in". A window opens on the tracker's connect page; click Allow. The panel lists 9th, 10th, 11th grade (2 courses each) and "Current year courses", all ticked.
7. First, by hand on the Common App test account, answer Yes to the Courses & Grades intro question. Then put the Common App tab (test account) in the active tab of the same window and click "Fill selected".
8. Expected, for each grade:
   - 9th (School Year 2022-23) and 10th (2023-24): "Filled 2 courses", no blanks listed. Each dialog shows School West Lafayette Junior-Senior High School, Grading Scale A-F, Schedule Semesters, and per course the Semester 1, Semester 2 and Final grades from the table. Credits:
     - Test Algebra I: Semester 1 credit 3, Semester 2 credit 2, Final credit 5.
     - Test Biology: Semester 1 `B` credit 1, Semester 2 grade **No Grade** with credit 0, Final `B`, Final credit 1.
     - Test English 9 and Test Geometry: term credit boxes empty, Final credit 1.
   - 11th (2024-25): "Filled 2 courses". The report lists exactly two blanks:
     - `Test US History: credit left blank: no credit in tracker`
     - `Test Chemistry: term 1 grade left blank: 'A++' is not in Common App's list` (its Semester 2 `A` and Final `A` are filled)
     The warnings list at the end also has `11th grade: Test US History: Common App needs at least one credit for each course; tick N/A if the transcript lists no credit.` Common App saves Test US History as an incomplete course; that is expected.
   - 12th grade is not offered (both courses are in progress).
   - Current Year: "Filled 2 courses": Test Calculus and Test Literature, each with Schedule "Full Year" (both semesters in progress), no blanks listed.
   - The report ends with a reminder to tick "I have reported all of my courses for this grade" yourself. Do that by hand.
9. Check on Common App that the rows match the table above (open each grade's Edit dialog; closing it with X saves what it shows).

## D. Keep and Replace

10. Run "Fill selected" again. When asked, choose "Keep them, add the rest". Expected: no duplicate rows on any grade.
11. Edit one grade by hand on Common App (change a course name). Run Fill on just that grade (untick the others) and choose "Replace them". Expected: its rows now equal the tracker's, the hand edit is gone.

## E. Disconnect and Stop

12. In the tracker open Settings, find the connected extension, click "Disconnect". Back in the panel click "Fill selected". Expected: the panel says "Sign in again" and nothing on Common App changes. Then sign in again from the panel.
13. Stop: start "Fill selected" on one grade, press "Stop" while it is working. Expected: the panel says it is stopping, and that grade is not reported as filled. If a Courses & Grades popup is left open on Common App after Stop (or after any failure), nothing in it is saved yet. Press X only if you want to KEEP what was filled so far (X saves), or reload the page to discard it. Current Year saves only when Continue is pressed. The report after a stop says under each "Open ... on Common App" link that opening reloads the page: following a link discards anything not yet saved in an open popup.

## F. If something fails

Send back: the full text of the panel report, which grade it was, and a screenshot of both the panel and the Common App page. Do not retry more than once.

Things only a live run can confirm (from the Task 7 report, "Concerns"). If the failure matches one, say so:
- Opening a drop-down by a synthetic `mousedown` on the ng-select (the report says "the list for ... did not open").
- Closing a list with an Escape key press (`keyCode` 27).
- The 12th-grade "courses to report?" question: its Yes radio id starts `option_ques_1927_` (guessed from `clear_ques_1927`), and whether answering Yes sticks without Common App's own Continue.
- The `ng-clear` button (clearing one drop-down in Replace) and lowering the course count (Remove course).
- Continue on Current Year with a required box left blank may not move on ("did not move on after Continue").
- Scale "Other" with Trimesters or Quarters: the box labels were assumed, only Semesters was recorded.

Proof for the owner's records: keep the screenshots of the three reports (Fill all, Keep, Replace).

## G. STARS, Cal State Apply and the fill assistant (2026-10-27)

Use only throwaway accounts (the owner made one each for UC, STARS and Cal State Apply). Each portal signs out after about 15-20 minutes
idle, and UC also signs out when it is opened in a second tab: do one portal at a time, in one tab, right after signing in.
Page facts are in `docs/superpowers/research/2026-10-27-portal-dom.md`.

STARS (school outside the US):
1. On the throwaway record, the school needs Grade Scale, dates, Education System, school year and "I plan to graduate" before
   "Enter Courses" opens. Any STARS page can be open.
2. In the side panel, "Fill for" switches to STARS. Under "Add your courses to STARS" every school year with courses is ticked; answer the
   Grading Scale question if asked (100-point schools: pass mark 60 or 70) and press "Fill selected". Expected: the tab opens each year's
   coursework page by itself (school found by code, else by name; the address comes from STARS's own summary page), the page reloads once per
   course, each course appears in STARS's table with the tracker's name (upper-cased by STARS), grades per term and credit, and names already
   there are skipped. The panel then shows one short report per year; only problems and courses left for you are listed.
3. Open one added course with Edit: name, level, length, scale, grade and credit match the tracker. Press Cancel Edit.
Verified on 2026-10-27 by injecting the page filler into a live record (semester course with In Progress, full-year Honors course with
credit 1); the panel's run loop is covered by unit tests only. US school: the same button works on "EnterCoursework"; STARS first needs the
year's GPA at the top of the page (or its "I have not received an annual GPA" tick) - the filler stops and says so. Verified live the same day
(semester Honors course 93 / IP, full-year AP course with credit 1).

Cal State Apply (US high school only; schools outside the US skip course entry):
1. High Schools Attended must list the school with its Term Type. Open Academic History > High School Coursework.
2. In the panel, press "Add courses to <school>". Expected: for each course the course form opens, a missing grade level is added first
   ("Add Grade Level"), title, Course Type and each term's grade are picked, Save is pressed, and the course shows in the school's list.
3. Set A-G areas yourself on A-G Matching (the panel lists the code for each course).
Verified end to end on 2026-10-27 (the run skipped 2 existing courses, added 2, one with a new grade level). Report the panel's message if it stops.

UC: open any UC page (one tab only). Under "Add your courses to UC" the grades with courses are ticked; press "Fill selected". For each grade
the tab opens /my-application/acadHistFrGrades/<NN>, clicks the school's "Enter courses & grades" (school found by code, else by name), new
courses go into empty rows (rows are added as needed), "Save & continue" is pressed once, and the panel checks the grade page lists every
added course. A grade UC has no page for is reported and the run goes on.
Nothing is guessed (UC or STARS): a course whose portal subject isn't certain (no exact tag, e.g. a language's UC level or a catch-all
"interdisciplinary" arts course) or that misses a required box is not added. The panel lists them in a red box before the run and again,
with what happened, after it.
Navigation verified live 2026-10-27 on both throwaway accounts: STARS's school/year addresses opened 2025-26 with the course form; UC's
`edit_<NN><id>` click opened 10th grade's courses page. The filling and saving steps are the ones verified earlier the same day. Courses whose UC subject
can't be told from the tracker (e.g. history without "U.S."/"World" in the name, computer science, languages without a year number) are left
for you and listed; tag them for UC in the tracker or with the AI import. Verified end to end on 2026-10-27 (3 added, 1 existing skipped).

Fill assistant (UT, and any page the automatic fillers don't cover): click a box on the portal, press a value in the panel.
Verified on real STARS controls: radio by label, Telerik dropdown, Telerik date box, Telerik dropdown tree.

## H. UIUC SRAR on myIllini (not yet run end to end)

Built 2026-10-28 from the live DOM facts in `docs/superpowers/research/2026-10-27-portal-dom.md` §5. The owner's myIllini account is a REAL
application (SRAR not final-submitted): run it only when the owner is watching, and never press "I'm done! Submit my record." for them.
1. On myIllini, fill and Submit the Education page yourself (grading scale: "Other" plus the conversion rows when the transcript prints numbers
   without an A-F conversion). Until then the courses pages are locked and the panel says so.
2. Open any myIllini page in the active tab. "Fill for" switches to UIUC; under "Add your courses to UIUC" tick the grades and press Fill selected.
   Expected: the tab opens Courses Years 9-11, adds one row per term grade for the ticked 9th-11th grades (rows already listed are counted, not
   re-added), presses Save Progress, then does the same on Courses Year 12 with In Progress for unfinished terms. The report lists per grade:
   added, already there, not added (with why: no UIUC subject chosen, an A-F school with numeric grades, a missing grade) and any message the
   page showed.
3. Check the rows on myIllini, then press Submit Page on each courses page and Other Academic Information yourself.


## I. Activities & honors on Common App (not yet run end to end)

Built 2026-10-28 (spec `docs/superpowers/specs/2026-10-28-activities-filler-design.md`, page facts in `docs/superpowers/research/2026-10-27-portal-dom.md`
§6 Activities, §8 Honors). Throwaway Common App account ONLY, in the separate Chrome profile from section A (the fill overwrites Activity 1 test data).
The extension never presses Common App's Responsibilities page or any submit. It needs a token that has activities access: an older
transcript-only connection shows "Reconnect to allow activities" (press Sign in; the panel returns to the activities fill).

Setup: in the tracker (test student account) open Activities and add 7 Common App activities and 3 honors; give one activity a description longer
than 150 characters (it must be reported as not accepted) and leave one activity's hours empty (it must be reported as "needs an answer").

1. Empty page. On Common App open Activities (panel: "Go to the Activities page" if needed) with no activity entered. Press "Fill activities".
   Expected: no question; every tracker activity is added in tracker order (the over-long one is listed under "Not added: Common App would not
   accept these", the empty-hours one under "Added, but these questions are blank"); the report ends "Done: N activities filled and checked." or lists
   read-back differences. Common App shows the same text on the page.
2. Replace. Run it again. Expected: "Common App already has N activities. Replace all of them with the M in your tracker?" with the existing names
   listed. Press "Yes, replace all". Expected: slots rewritten, surplus slots removed from the end, and the report repeats "Replaced the N activities that
   were already on Common App: ..." with the names.
3. Keep with toggles. Edit one entry by hand, run again, press "No, let me choose what to add". Expected: the tracker items as toggles, a counter
   "Room left on the page: X of Y"; once X is 0 the unticked toggles are disabled; "Add the chosen" adds only the ticked ones after the existing
   entries (numbered after them in any read-back message).
4. Full page. With 10 activities on the page press Fill, then "No, let me choose...". Expected: "This page is full (10 of 10). Nothing can be added."
   and nothing changes.
5. Honors. Repeat 1-4 on the Honors page (limit 5; question text says honors, singular "honor"). Honors Level(s) and Grade level boxes match the tracker.
6. Read-back. After each fill the panel reloads the page and compares what Common App shows with what was sent. Expected: the page reloads once at
   the end of each fill and the report has no lines under "Common App shows something different from what was entered" when the page matches the
   tracker. Any line there is a bug worth sending back (it names the portal slot, e.g. "Activity 4").
7. Signed out. Sign out of Common App in another tab, then press Fill. Expected: "Common App signed you out. Sign in again; nothing after this point
   was saved." and no success line.
8. Stop. Start a fill and press Stop while the Replace question is open: "Stopped. Nothing was changed on Common App." Start another and press Stop
   mid-fill: the report says Stopped and that Continue was not pressed.

If something fails, send the panel report and a screenshot of the Common App page; do not retry more than once.

## J. Activities & awards on UC (not yet run end to end)

Built 2026-10-28/29 (spec `docs/superpowers/specs/2026-10-28-activities-filler-design.md`, page facts in `docs/superpowers/research/2026-10-27-portal-dom.md`
§7). Throwaway UC account ONLY (memory `portal-test-accounts`; it holds "Test Club (filler research)"), in the separate Chrome profile. UC signs
out when the application is opened in a second tab: keep exactly one UC tab and let the extension drive it (every button is a full page load).
The extension presses only an item's Delete (then Yes), "Add an activity or award" and "Save & continue"; never "I have no activities or awards
to report" / "I've finished adding activities" (`#no_activities`) or any submit.

Setup: in the tracker (test student account) open Activities > UC and add 3 entries: an Extracurricular activity with a 2-line description,
hours 5.5 and weeks 30; a Volunteer entry; an Award with two levels. Add a 4th entry with 200 hours per week (it must be reported as not accepted).
The question counts every tracker entry (blocked ones too); only the entries ticked or added are checked against UC's limits.

1. Panel offer. On UC open the Activities & awards list (`/my-application/introactivitiesawards`; panel: "Go to Activities & awards" if needed).
   Expected: the UC panel shows "Activities & awards" with "Fill activities & awards".
2. Keep (adds 2). Press Fill. Expected: "UC already has 1 activity or award. Replace it with the 4 in your tracker?" naming "Extracurricular
   activity: Test Club (filler research)". Press "No, let me choose what to add", tick 3 entries including the 200-hour one, "Add the chosen".
   Expected: the tab goes list -> add page -> list once per valid entry (no second tab, no double save: each entry appears once), the 200-hour
   entry is under "Not added: UC would not accept these", the report says "Done: 2 activities and awards filled, but some things need a look"
   (the blocked one) and lists no read-back differences.
3. Read-back wording. For the Volunteer and Award entries just added, note the list's `p.subsectionheader` texts (expand the item). Only
   Extracurricular headers were verified live; record the others in portal-dom.md §7 so `expectOf` (web/lib/uc-activities-fill.ts) can check
   more than the name. A line under "UC shows something different from what was entered" is a bug worth sending back.
4. Replace. Press Fill again, "Yes, replace all". Expected: the tab first reloads the list (UC keeps a stale Yes handler from every earlier
   Delete click, portal-dom.md §7), then each listed entry is deleted one at a time (Delete, Yes, page load), then the 3 valid tracker entries
   are added in tracker order; the report repeats "Replaced the N activities and awards that were already on UC: ..." and has
   no read-back lines. "Test Club (filler research)" is gone: re-add it by hand afterwards if later research needs it.
5. Full list. Only if cheap to set up (20 entries): Fill, "No, let me choose...". Expected: "This page is full (20 of 20). Nothing can be added."
   and nothing changes.
6. Stop. Start a replace run and press Stop while the question is open: "Stopped. Nothing was changed on UC." Start another and press Stop while
   it is adding: the current entry finishes saving (its page load is waited for), then the report says Stopped and lists the rest under "Not added".
7. Signed out. Sign out of UC (in the same tab), sign in again, open the list, then sign out in the middle of a run if practical. Expected:
   "UC signed you out. Sign in again; entries listed as added were saved." and no success line.

A run that stops with "Not sure: check UC's list before running again" means a save or delete went through but its page load did not come
back: look at UC's list before running again (untick an entry that is already there).

If something fails, send the panel report and a screenshot of the UC page; do not retry more than once.
