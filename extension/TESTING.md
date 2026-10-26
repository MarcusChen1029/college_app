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

| Grade level | Academic year | Course | Semester 1 | Semester 2 | Final grade | Credit | Note |
|---|---|---|---|---|---|---|---|
| 9 | 2022 | Test Algebra I | `A` | `A-` | `A` | 1 | |
| 9 | 2022 | Test English 9 | `B+` | `B` | `B+` | 1 | |
| 10 | 2023 | Test Geometry | `A-` | `A` | `A-` | 1 | |
| 10 | 2023 | Test Biology | `B` | `B+` | `B` | 1 | |
| 11 | 2024 | Test Chemistry | `A++` | `A` | `A` | 1 | `A++` is not in Common App's A-F list on purpose |
| 11 | 2024 | Test US History | `A` | `A` | `A` | (leave blank) | No credit on purpose |
| 12 | 2025 | Test Calculus | status "In progress", no grade | status "In progress", no grade | (none) | 1 | In progress |
| 12 | 2025 | Test Literature | status "In progress", no grade | status "In progress", no grade | (none) | 1 | In progress |

Before the first Fill, on the Common App test account answer Yes to the Courses & Grades intro question by hand (see step 7).

## C. Fill all

6. In the panel click "Sign in". A window opens on the tracker's connect page; click Allow. The panel lists 9th, 10th, 11th grade (2 courses each) and "Current year courses", all ticked.
7. First, by hand on the Common App test account, answer Yes to the Courses & Grades intro question. Then put the Common App tab (test account) in the active tab of the same window and click "Fill selected".
8. Expected, for each grade:
   - 9th (School Year 2022-23) and 10th (2023-24): "Filled 2 courses", no blanks listed. Each dialog shows School West Lafayette Junior-Senior High School, Grading Scale A-F, Schedule Semesters, and per course the Semester 1, Semester 2 and Final grades from the table and Final credit 1.
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
