# Activities filler (Common App + UC) and the 2026-27 activities format: design

Status: draft for owner review (2026-10-28). Live DOM facts this design relies on: `docs/superpowers/research/2026-10-27-portal-dom.md` §6
(Common App Activities), §7 (UC Activities & awards), §8 (Common App Honors). Those sections are the reference for every selector, id and
option list named below; this document does not repeat them.

## 1. Intent

Students keep their activities, honors and UC activities & awards in the tracker (`/writing/activities`). Typing them again into Common App
and UC is slow, and the portals silently drop or cut values that break their limits. The extension already fills coursework from the
Transcript; this project lets it fill **Common App Activities**, **Common App Honors** and **UC Activities & awards** from the tracker the same way.

Two discoveries shape the project:
- Common App changed its Activities form for 2026-27 (new type list, sport, a leadership yes/no, "After graduating high school" with start/end
  months, "All year", "Not sure"). The tracker still stores last year's format, so a fill could not answer the new questions.
- The tracker's UC model is a simplification of UC's form (one award level where UC allows several; no work dates or school-year/summer hours;
  no years/months after 12th grade; no educational-prep program list).

So the project has two parts, decided by the owner: **(A)** bring the tracker's Activities page and stored data up to the exact 2026-27
Common App and UC forms, and **(B)** the extension filler.

## 2. Goals, non-goals, anti-goals

Goals
- The tracker's Common App tab and UC tab ask exactly what the portals ask, with the portals' own wording, option lists and limits, so
  anything saved in the tracker is accepted by the portal unchanged.
- Existing students' activities are converted to the new format automatically; nothing is lost; answers the old format never asked are left
  blank and flagged "needs an answer" (never guessed).
- The extension fills Common App Activities (up to 10), Common App Honors (up to 5) and UC Activities & awards (up to 20) from the tracker.
- Owner's rule for pages that already have entries (see §5.2): ask once to replace all; yes = replace all with a reminder; no = keep them and
  let the student toggle which tracker items to add, within the page's limit.

Non-goals
- Common App "Responsibilities and circumstances" (`/common/7/250`): personal, not filled.
- UC's "I've finished adding activities" / "I have no activities" buttons and any submit: never pressed.
- Additional Information essays, résumé uploads, other portals (Coalition, ApplyTexas...).

Anti-goals (failure even if it "works")
- A value the portal silently dropped or truncated while the panel reports success. Common App leaves invalid fields out of its save and still
  moves on (research §6); UC truncates long text on submit (§7). Every fill must pre-validate and read back.
- Deleting or overwriting portal entries without the student's explicit "replace all" for that page.
- Ever touching the owner's real Common App or UC applications during development (memory: real accounts are read-only; throwaway only).
- Guessing answers the student never gave (e.g. defaulting "plan to continue in college" to Yes).

## 3. Part A: the 2026-27 data format

### 3.1 Common App activity (replaces `CaActivity`)

| Field | Type | Portal question / rule |
|---|---|---|
| `type` | one of the 30 Common App labels, stored as the exact label text (e.g. "Athletics (JV or varsity)") | "Activity or experience type" (required) |
| `sport` | one of the 48 sport labels, or "" | "Sport/team"; required only when type is "Athletics (other)" or "Athletics (JV or varsity)" |
| `leadership` | boolean or null | "Did you have a specific position or leadership role?" |
| `position` | string ≤ 50 | "What was your role?"; only when leadership = true |
| `organization` | string ≤ 100 | "Organization or group (if applicable)", optional |
| `description` | string ≤ 150 | "Describe this activity or experience..." (required) |
| `grades` | subset of 9, 10, 11, 12, PG | "When did you participate?"; PG = "After graduating high school" |
| `timing` | "school" / "break" / "all" / null | "Time of year"; required when any of 9-12 is ticked |
| `afterStart` | "YYYY-MM" or null | "After graduating high school: Start date"; required when PG ticked |
| `stillParticipating` | boolean or null | "Are you still participating?"; required when PG ticked |
| `afterEnd` | "YYYY-MM" or null | "End date"; required when still = false; must be ≥ afterStart |
| `hoursPerWeek` | number 1-168 (decimals ok) | required |
| `weeksPerYear` | number 1-52 (decimals ok) | required |
| `continueInCollege` | "yes" / "no" / "not_sure" / null | "Do you plan on participating in this activity in college?" (required) |

Date range: the portal accepts 1926-2027 (`min`/`max` in the catalog). Lengths count characters as the portal does (plain `length`).
`CaHonor` is unchanged (title ≤ 100, grades 9-12 + PG, levels school / state_regional / national / international): it already matches §8.

Old → new type mapping (for conversion):
Academic → Academic; Art → Art; Athletics: Club → Athletics (other); Athletics: JV/Varsity → Athletics (JV or varsity); Career Oriented →
Career readiness or practicums; Community Service (Volunteer) → Community service or volunteer work; Computer/Technology → Computer or
technology; Cultural → Cultural; Dance → Dance; Debate/Speech → Debate or speech; Environmental → Environmental; Family Responsibilities →
Family responsibilities; Foreign Exchange → Study abroad or foreign exchange; Foreign Language → Foreign language; Internship → Internship;
Journalism/Publication → Journalism or publishing; Junior R.O.T.C. → R.O.T.C. or military; LGBT → LGBT+; Music: Instrumental → Music;
Music: Vocal → Music; Religious → Religious; Research → Research; Robotics → Robotics; School Spirit → School spirit; Science/Math →
Science or math; Social Justice → Social justice or organizing; Student Govt./Politics → Student government or politics; Theater/Drama →
Theater or drama; Work (Paid) → Employment or work (paid); Other Club/Activity → Other. New types with no old source: Hobby.
Other field conversion: old `timing` [school, break] → "all", [school] → "school", [break] → "break", [] → null; non-empty `position` →
leadership = true, empty → null (not false: the student never answered); `continueInCollege` true/false → "yes"/"no"; `sport`,
`afterStart`, `stillParticipating`, `afterEnd` → empty. Grades unchanged ("PG" already means after graduating).

### 3.2 UC entry (replaces `UcEntry`)

Common to all categories: `id`, `category` (award / edprep / extracurricular / coursework / volunteer / work), `grades` (9, 10, 11, 12, PG =
"After 12th grade"), `fromId?` (as today).

| Category | Fields (UC question, limit) |
|---|---|
| award | `name` "What's the name of the award or honor?" (60); `awardLevels` subset of school, city, state, regional, national, international (≥1); `awardType` academic / non_academic; `extra` eligibility requirements (250); `description` "What did you do to achieve this award or honor?" (350). No hours, no years/months. |
| edprep | `program` one of UC's program values (the 27 listed in research §7, or "18" = Other); `name` = program name when Other (30); `description` (350); hours/weeks |
| extracurricular | `name` activity name (60); `description` "What did you do?" (350); hours/weeks |
| coursework | `name` course name (60); `description` (350); hours/weeks ("time in class") |
| volunteer | `name` organization volunteered for (60); `extra` describe the organization (250); `description` "What did you do?" (350); hours/weeks |
| work | `name` workplace "Where did you work?" (60); `extra` describe the company (250); `jobTitle` (60); `description` responsibilities (350); `workHours` per ticked grade `{ schoolYear: number or null, summer: number or null }` (1-168); `stillWorking` boolean; `start` "YYYY-MM" (≤ current year); `end` "YYYY-MM" when not still working |

- `hoursPerWeek` 1-168, `weeksPerYear` 1-52 (non-award, non-work categories).
- `afterYears` 0-10 or "10+", `afterMonths` 0-11: required when PG is ticked (every category except award).
- Text limits: UC counts a newline as 2 characters (`length + count("\n") ≤ limit`); the tracker counts the same way.
- Conversion from the old shape: `awardLevel` → `awardLevels: [level]`; work: old `name` (job title) → `jobTitle`, old `organization`
  (employer) → `name`; everything new stays empty and is flagged.
- Old values with no exact new home (my call) go into a per-entry `legacy` note (plain text, shown on the page as "From your earlier
  version: ..." until the student clears it; never sent to a portal), so nothing is lost and nothing is guessed:
  - edprep: old `name` matched case-insensitively to a UC program label or its acronym in brackets (e.g. "EAOP", "MESA") → that program;
    otherwise program = Other with `name` = old name when ≤ 30 characters; longer names → Other, blank name (flagged), old name in `legacy`.
  - work: old `hoursPerWeek` / `weeksPerYear` → `legacy` ("10 hours/week, 40 weeks/year"); `workHours` left empty and flagged.
- Copy from Common App (my call): honor level State/Regional → UC "state" with the item flagged "check the level" (UC splits State and
  Regional; ticking both would overclaim). The same rule in TypeScript and the 0038 backfill.

### 3.3 Storage and conversion
- Still one jsonb column `student_profiles.activities`; the object gains `"version": 2`.
- One pure function `upgradeActivities(raw) → ActivityData` (v1 or v2 in, v2 out) in `web/lib/activities.ts`, used by every TypeScript
  reader. Saving always writes v2.
- Stored data is converted once by the next migration (0038): a SQL backfill applies the same §3.1/§3.2 rules to every row and sets
  `version: 2`. It is an UPDATE on live student data, so the owner approves it when it is applied (Supabase MCP quirk in CLAUDE.md), after a
  backup query of the column. `upgradeActivities` stays for signed-out (localStorage) data and as a safety net.
- `portfolio_view` (the only SQL that reads activity keys by name, `0032_share_links.sql:174-196`) is redefined in 0038 for the v2 keys.
  `teacher_student` passes the jsonb through and needs no SQL change.

### 3.4 The Activities page
- The Common App tab renders the §3.1 questions in the portal's order, with show/hide rules identical to the portal (sport only for the
  athletics types, role only on leadership yes, time of year only with 9-12, dates and "still participating" only with PG, end date only on
  "no"). Character counters and range checks use the portal's limits; out-of-range values cannot be saved silently (inline error).
- The UC tab renders each category's §3.2 questions, the program list for educational prep, and the work-experience grid.
- Items with unanswered required questions show "needs an answer" on the item header and a count at the top of the tab. The fill still
  runs for them (see §5.4).
- Existing behaviour kept: reorder, 10/5/20 limits, "Copy from Common App" drafts for UC (mapping updated to the new types: Employment or work
  (paid) and Internship → work, Community service or volunteer work → volunteer, the rest → extracurricular; honors → award with all their levels).
- New UI text goes through the i18n dictionaries (en + zh-TW). Portal option labels stay English (they are data, as with portal dropdowns).

## 4. Part B: the extension filler

### 4.1 Getting the data
- Today the extension token is transcript-only (`extension_transcript`, migrations 0031/0034; consent text in
  `web/components/ExtensionConnect.tsx:106` and `extension/src/panel.ts:101`).
- New anon RPC `extension_activities(p_token)` (migration 0038) returning only `activities.commonApp` and `activities.uc` (v2) for the token's
  student; same token checks as `extension_transcript`. Tokens get a scope: `extension_tokens.scopes text[]` default `{transcript}`; tokens
  minted after this change ask for and record `{transcript,activities}`. An old token gets "Reconnect to allow activities" in the panel
  (consent is never widened silently). Consent text on `/extension/connect` and in the panel names activities and honors.
- Extension: `auth.ts` gains `loadActivities` (like `loadTranscript`, `auth.ts:67`); `messages.ts` gains a `loadActivities` PanelRequest and
  activity variants of `ContentMessage` / `AssistMessage`.

### 4.2 Pages and entry points
- The panel's "Fill for" picker already follows the active tab. On `apply.commonapp.org/common/7/232` it offers "Fill activities"; on
  `/common/4/25` "Fill honors"; on UC `/my-application/introactivitiesawards` "Fill activities & awards". On other pages of those portals it
  says which page to open.
- Each page is one independent run (the owner's replace question is asked per page).

## 5. The fill flow (all three pages)

### 5.1 Before writing
1. Read the portal page: how many entries exist (Common App: the 1020 / 1971 counter and the visible slots; UC: the list items) and each
   entry's name (Common App activity: organization, else description start; honor: title; UC: category + name).
2. Validate every tracker item against the portal's rules (§3). Items that break a rule are listed with the reason and are not sent;
   items with blank required answers are sent with those boxes left blank (the student finishes them in the portal) and listed.
   Exception, UC (ruling R17, 2026-10-29): UC refuses Save & continue while a required box is blank, so such an entry is not sent and is
   listed as "UC requires an answer for: <questions>". The Replace question counts only the items that will be sent.

### 5.2 The owner's rule for pages with entries
- Page empty: fill every tracker item in tracker order. No question.
- Page has N entries: ask "Common App already has N activities. Replace all of them with the M in your tracker?" (wording per page).
  - Yes: remove all existing entries, then fill all tracker items. The confirm names what will be removed, and the final report repeats it
    ("Replaced the 4 activities that were already on Common App: ...names").
  - No: keep them. Show the tracker items as a toggle list (Common App activities by organization, else type; honors by title; UC by
    category + name). The student switches on the ones to add; once (existing + switched on) reaches the page limit (10 / 5 / 20) the
    remaining toggles are disabled. Chosen items are added after the existing entries.

### 5.3 Writing, per portal
Common App Activities / Honors (Angular; research §6, §8):
- Answer the gate Yes if needed. **Remove does not erase** (verified 2026-10-28 on the throwaway account): it only lowers the counter
  (1020 / 1971); the slot's answers stay on the server and reappear when the slot is re-added. Slot 1 has no Remove button at all. So
  "replace all" = overwrite slots 1..M in place, setting EVERY question of the slot (a blank tracker answer is written as a cleared box:
  empty text, ng-select Clear, the radio group's "Clear answer", checkboxes unticked; verified that a cleared text box is saved as ""),
  then remove surplus slots from the END only (never a middle slot; what a middle removal does to later slots is unknown). The same applies
  to "keep" runs: a newly added slot may show stale answers from an earlier removal, so every question of every slot the filler touches
  is set, never assumed empty. Add slots with "Add another...". Fields are found by slot (`subGroup...` legend "Activity N" / "Honors N") + label, never by id
  arithmetic. ng-select via the existing type-ahead + Enter helper; radios/checkboxes by clicking the native input; text by the native value
  setter + input + blur; dates typed as "Month YYYY". Show/hide rules mean dependent questions are answered after the question that reveals them.
- Common App saves on Continue, on "Add another" AND on any in-app navigation (§8): the panel must never navigate the page mid-fill, and a
  failure mid-way leaves a partially saved page. Press Continue only when every field went in; otherwise stop, list what is filled and what
  is not, and leave the page as is (the student can press Continue).
UC (server forms; research §7):
- One entry at a time: `#add_activity` → choose category → fill → `#save` → back on the list page. "Replace all" = each item's Delete +
  `#warningYesButton`, before adding. Every step is a full page load in the ORIGINAL tab (single-tab guard), so the run is a resumable
  state machine like the existing UIUC/UC coursework runs (state kept in the extension, re-attached after each load).
- Text is fitted before typing (UC truncates otherwise); hours/weeks errors (`#<id>-error`) stop the run.

### 5.4 After writing
- Read back, Common App (my call): before pressing Continue, check every touched control is valid on the page (Angular `ng-invalid`
  class on its form control; out-of-range and over-long values are invalid and would be silently left out of the save) and stop if any is.
  After Continue has saved and moved on, nothing is dirty, so the panel navigates back to the section (in-app link, e.g.
  `#tertiaryNavItem7_232`) and compares every field on the page with what was sent. The extension never calls Common App's private API.
- Read back, UC: the list page's read-only `section-content` per entry. Report any field that did not stick.
- Report: filled N, skipped/blocked items with reasons, "needs an answer" boxes left blank, entries replaced (names), and for "keep"
  runs which tracker items were not added.

## 6. Testing
- Unit tests with fake DOMs in the existing style (`extension/src/commonapp/fake-commonapp.ts`, UC fakes): replace-all path, keep +
  toggle path with the limit, validation blocks, a mid-fill failure that must not press Continue, read-back mismatch reporting.
- `web/lib/activities.test.ts`: conversion of every old type and field rule in §3.1/§3.2; limit counting incl. UC newlines.
- Live runs on the owner's throwaway Common App and UC accounts only (they hold test data, memory `portal-test-accounts`), added to
  `extension/TESTING.md`. Never the real accounts.

## 7. Code that changes
Data model and its readers (all move to v2 in the same change; nothing may keep reading v1 keys):
- `web/lib/activities.ts`: types, `CA_ACTIVITY_TYPES` (30 new labels), sports list, UC program list, limits, factories,
  `upgradeActivities`, validators shared by the page, MCP and extension, `ucDraftsFromCommonApp` (new type mapping, all honor levels).
- `web/components/ActivitiesEditor.tsx`: the new questions and show/hide rules (§3.4); `CA_TYPE_KEYS` (:37) and label maps (:73-101).
- `web/lib/resume.ts` (:56 type strings, :71 `fromCa`, :81 `fromUc`), `web/components/TeacherDetailActivities.tsx` (:26, :40, :52),
  `web/lib/ai-context.ts` (:93-106), `web/lib/fit.ts` (:29), `web/lib/share-links.ts` `normalizePortfolioView` (:199-256),
  `web/components/ShareViews.tsx` (:217), `web/lib/roster.ts` (:139 passes through).
- MCP: `web/lib/mcp/rules.ts` (:203-296 validation, `normalizeActivities`, add/update/delete) and `web/lib/mcp/tools.ts` `activityFields`
  (:611-631) and the three activity tools: the AI must be able to fill every new field and gets the same limits.
- Store: `web/lib/student-rows.ts` / `student-store.ts` load and merge through `upgradeActivities` (local data merged into an account on
  first sign-in may still be v1).
- i18n: `messages/writing.ts` (:76-164 en, :260-326 zh-TW), `messages/teacher.ts` (:159-170, :470-481): new field labels; the 30 type
  labels are translated for display only (stored values stay the portal's English labels; sports and UC program names stay English).
- Tests: `activities.test.ts`, `resume.test.ts`, `share-links.test.ts`, `mcp-rules.test.ts`, `roster.test.ts`, `fields.test.ts`,
  `profile-tests.test.ts`, and `supabase/patches/2026-10-27_share_links_smoke_test.sql` (rerun after 0038).
- SQL: migration 0038 (backfill, `portfolio_view` for v2, token scopes, `extension_activities`).

Extension (reuse before writing new code):
- Common App: `commonapp/dom.ts` helpers (`waitFor`, `need`, `click` + `isChecked` for radios/checkboxes, `setText`, `selectNgOption`
  type-ahead, `clearNg`, `StopRequested` / `PageChanged`, `TIMING`); `commonapp/pages.ts` gains the Activities and Honors URLs; new
  `commonapp/activities.ts` + tests on a fake page like `fake-commonapp.ts`.
- UC: the `UcTab` abstraction (`uc/run.ts`), `tab-wait.ts` (`sendTo`, `navigate`, `afterReload`), `uc/fill.ts` `pick` / `fire` (make the
  needed ones exported); new `uc/activities-*.ts` + tests; `assist-content.ts` gains the UC activities page handlers.
- Panel: `sites.ts` page detection, `panel.ts` offers, `auto-view.ts` style list view for the toggle list and report.
- Packaging (CLAUDE.md): rebuild `extension/dist` AND the download zip (`npm run package`), and commit the zip.

## 8. Left to the builder
- Panel layout and wording of the replace question, toggle list and report (keep the existing panel's style; text in en + zh-TW).
- Timing constants and waits (reuse `TIMING`).
- How the UC run's state survives page loads (follow the UIUC / UC coursework runs).
- Splitting the work into PRs (suggested order: data format + page + readers + 0038; then the RPC/token; then the Common App filler; then UC).
