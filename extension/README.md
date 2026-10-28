# College application filler (Chrome extension)

Chrome MV3 side panel that fills courses and grades from the transcript in Trakur: Common App's Courses & Grades and Current Year Courses in one click, and a fill assistant for the UC application, STARS, Cal State Apply, UIUC's SRAR (myIllini) and UT Austin's coursework form (MyStatus). It signs in with a transcript-only token (never a Supabase session) obtained from the tracker's `/extension/connect` page.

Pinned extension id: `omnpdpbgbbdbnnaimhppoclimbeeognl` (derived from the public `key` in `manifest.json`; also `NEXT_PUBLIC_EXTENSION_ID` in `web/.env.example`). The private key was discarded and must never be committed (`*.pem` is gitignored).

## Develop

```bash
cd extension
npm install
npm test            # node --test on src/**/*.test.ts and scripts/*.test.mjs
npx tsc --noEmit
node build.mjs      # writes dist/ ; TRACKER_URL=https://your-tracker.example node build.mjs for a deployed tracker (default http://localhost:3000)
node scripts/extension-id.mjs "<base64 key>"   # prints the id derived from a key
```

## Package for the live site

```bash
cd extension
npm run package    # builds with TRACKER_URL=https://www.track-ur-college.com into a temp dir, zips it to ../web/public/downloads/common-app-filler.zip
```

The Tools page (`/tools`) offers that zip to students. Rerun the command and commit the new zip after any extension change. `extension/dist` is not touched, so local development keeps pointing at `http://localhost:3000`. The zip has `manifest.json` at its root (with the pinned `key`, so the id stays `omnpdpbgbbdbnnaimhppoclimbeeognl`); `scripts/package.test.mjs` checks the committed zip. Zip writing is a small built-in helper (`scripts/zip.mjs`, node:zlib), so there is no extra dependency and it works on Windows.

## Load and sign in (manual check)

Everything below is done from the side panel; no console is needed except for the optional token check in step 7.

1. Run the tracker locally: `cd web && npm run dev`. `web/.env.local` must contain `NEXT_PUBLIC_EXTENSION_ID=omnpdpbgbbdbnnaimhppoclimbeeognl`; restart the dev server if you just added it.
2. Build the extension: `cd extension && node build.mjs`.
3. In Chrome open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and choose the `extension/dist` folder.
4. Check that the extension card shows the id `omnpdpbgbbdbnnaimhppoclimbeeognl`. If it shows a different id, the manifest `key` was not picked up.
5. Open the side panel: click the extension's toolbar icon (the puzzle-piece menu lists it if it is not pinned). Signed out, it shows a "Sign in" button.
6. Click "Sign in". A window opens showing the tracker's connect page (sign in to the tracker first if asked). Click Allow. The panel then lists "9th grade (N courses)" and so on, plus "Current year courses", all ticked. If you click Cancel, the panel says "Sign in did not finish. Try again." A teacher account is told the extension is for student accounts.
7. Optional: confirm the token is stored. On `chrome://extensions`, click "service worker" on the extension card to open its console and run `await chrome.storage.local.get("token")`. Expected: `{token: "<long string>"}`.
8. Click "Sign out" in the panel. The panel returns to the "Sign in" button. Run the command from step 7 again; it now returns `{}`.
9. To fill: sign in again, open your Common App (https://apply.commonapp.org/) in the active tab of the same window (otherwise the panel says "Open your Common App in this window first." and "Fill selected" is disabled), untick what you do not want, and click "Fill selected". The panel asks "Replace them" or "Keep them, add the rest" for any page that already has courses, and ends with a report. Tick "I have reported all of my courses for this grade" on each grade yourself.

10. Fill assistant (UC, STARS, Cal State Apply, UIUC, UT): open the portal's coursework page in the active tab. The panel switches to that system (or pick one under "Fill for"), lists every course grouped by school, grade and year with each value already in that system's words (`web/lib/system-fill.ts`), and lists what is left out and why. Click the first box of a course on the page, then press "Fill from here" to type its values in page order, or press values one at a time: each goes into the box last clicked and focus moves to the next box. A value that can't go in (no exactly matching option, read-only box) is copied to the clipboard instead. Dropdowns are matched on the exact option text only. Nothing is saved or submitted. A "?" on a value means its wording is not confirmed on an official page.

STARS, UC and UIUC work like Common App: tick the school years / grades, press "Fill selected", and the extension opens each page itself (`src/stars/nav.ts`, `src/uc/nav.ts`, runners `src/stars/run.ts`, `src/uc/run.ts`, `src/uiuc/run.ts`, panel `src/auto-view.ts`). UIUC (myIllini SRAR): it opens Courses Years 9-11 and Courses Year 12 in the same tab, adds one row per term grade with Add Course (rows already there are left alone), presses Save Progress and checks the saved list (`src/uiuc/*`, plan `web/lib/uiuc-fill.ts`). It never presses Submit Page or "I'm done! Submit my record." and does nothing on Education, Other Academic Information or Review and Submit; while it adds rows, a MAIN-world script (`src/uiuc-main.ts`, `uiuc-main.js`) records the page's alert()/confirm() messages for the report instead of letting them block. Cal State Apply (High School Coursework, US schools) gets an "Add courses" button per school. Every course is saved with the portal's own Save button, and the panel checks it was saved (`src/stars/*`, `src/csu/*`, `src/uc/*`, plans in `web/lib/stars-fill.ts`, `web/lib/csu-fill.ts` and `web/lib/uc-fill.ts`). Live checks: `TESTING.md` section G (UIUC: section H).

The assistant knows no portal's layout; it handles standard controls (text boxes, native selects, radios, tick boxes), ARIA comboboxes, Angular Material / ng-select lists and Telerik RadComboBox (STARS). Portal hosts are in `src/sites.ts` and `manifest.json` (keep them in step).

The token lives only in `chrome.storage.local` and is never logged.
