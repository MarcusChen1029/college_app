# Live test checklist: Common App filler

This is the end-to-end check that could not be run automatically. You follow it yourself, once, on a throwaway Common App account. Nothing here submits an application.

**SAFETY FIRST. Use a SEPARATE Chrome profile that is signed in ONLY to the throwaway test Common App account (the one with Purdue and West Lafayette Junior-Senior High School, nothing submitted). NEVER click Fill in a profile where your real Common App account (the one with submitted applications) is signed in. The extension fills the active Common App tab of whatever account is signed in, and it cannot tell test from real.**

Before every Fill, look at the Common App tab and confirm the account name and the colleges are the test ones.

## A. Set up (about 10 minutes)

1. In Chrome, create a new profile (profile picture, top right, then "Add profile"). Sign in to https://apply.commonapp.org/ there with the test account only. Use this profile for everything below.
2. Start the tracker: in a terminal run `cd web` then `npm run dev`. The file `web/.env.local` must contain the line `NEXT_PUBLIC_EXTENSION_ID=omnpdpbgbbdbnnaimhppoclimbeeognl`. If you just added it, restart `npm run dev`. The tracker is at http://localhost:3000.
3. Build the extension: in a second terminal run `cd extension`, `npm install`, `node build.mjs`. It prints `built dist/ (TRACKER_URL=http://localhost:3000)`.
4. In the test profile open `chrome://extensions`, turn on Developer mode, click "Load unpacked", choose the `extension/dist` folder. The card must show the id `omnpdpbgbbdbnnaimhppoclimbeeognl`. If it differs, stop: the sign-in will not work.
5. Open the side panel by clicking the extension's toolbar icon (use the puzzle-piece menu if it is not pinned).

## B. The test transcript

Use a throwaway tracker student account, not your own. Your own account holds your real transcript, and this test would mix fake courses into it. Sign in to http://localhost:3000 in the test profile with a second Google account, choose "student" at /welcome, then open /application/transcript.

Add one school, "Test High School", with these courses. Enter grades exactly as shown.

| Grade | Course | Grade given | Credit |
|---|---|---|---|
| 9 | Test Algebra I | A | 1 |
| 9 | Test English 9 | B+ | 1 |
| 10 | Test Geometry | A- | 1 |
| 10 | Test Biology | B | 1 |
| 11 | Test Chemistry | A++ (not in Common App's A-F list) | 1 |
| 11 | Test US History | A | no credit (leave blank) |
| 12 | Test Calculus | in progress, no grade yet | 1 |
| 12 | Test Literature | in progress, no grade yet | 1 |

Use the grading scale A-F for all of them. In Common App the student must also have answered Yes to the "courses and grades" intro question; do that first on the test account, by hand.

## C. Fill all

6. In the panel click "Sign in". A window opens on the tracker's connect page; click Allow. The panel lists 9th, 10th, 11th grade (2 courses each) and "Current year courses", all ticked.
7. Put the Common App tab (test account) in the active tab of the same window. Click "Fill selected".
8. Expected, for each grade:
   - 9th and 10th: every course filled, no blanks listed.
   - 11th: both courses saved. The report lists exactly two blanks: Test Chemistry's grade ("A++") and Test US History's credit.
   - Current Year: shows Test Calculus and Test Literature.
   - The report ends with a reminder to tick "I have reported all of my courses for this grade" yourself. Do that by hand.
9. Check on Common App that the rows match the table above (open each grade's Edit dialog).

## D. Keep and Replace

10. Run "Fill selected" again. When asked, choose "Keep them, add the rest". Expected: no duplicate rows on any grade.
11. Edit one grade by hand on Common App (change a course name). Run Fill on just that grade (untick the others) and choose "Replace them". Expected: its rows now equal the tracker's, the hand edit is gone.

## E. Disconnect and Stop

12. In the tracker open Settings, find the connected extension, click "Disconnect". Back in the panel click "Fill selected". Expected: the panel says "Sign in again" and nothing on Common App changes. Then sign in again from the panel.
13. Stop: start "Fill selected" on one grade, press "Stop" while it is working. Expected: the panel says it is stopping, and that grade is not reported as filled. Check the dialog on Common App; if it is left open, close it with X yourself.

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
