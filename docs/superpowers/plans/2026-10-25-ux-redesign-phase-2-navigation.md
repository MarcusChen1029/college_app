# UX redesign — Phase 2 (navigation and structure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every role a short, task-based nav with an account menu and a phone menu, replace the hidden Settings panel with a real
`/settings` page and a sign-in dialog, and move Essays/Activities/Résumé under `/writing`. Old URLs keep working.

**Architecture:** What each role sees is defined as data in `web/lib/roles.ts` (pure, unit tested). `SiteNav` renders it as a desktop
bar (≥ `md`) or a menu button with a sheet (< `md`). Sign-in becomes one `SignInDialog` mounted once in the root layout and opened through
`openSignIn()`. Settings moves from `SettingsPanel` (inside `/profile` and `/teacher`) to its own page. Route moves are `git mv` plus
redirects in `next.config.ts`.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents: true`), React 19, Tailwind 4, `node --test` for `lib/*.test.ts`.

**Spec:** `docs/superpowers/specs/2026-10-24-ux-redesign-design.md` §3 (structure, "Things that move with the routes"), §4 (buttons), §8 phase 2.
Phase 0-1 is merged into this branch: use `buttonClass`, `toneClass`, `StatusPill` from `web/lib/ui.ts` / `web/components/StatusPill.tsx`.

## Global Constraints

- All commands run from `web/`. Before every commit: `npx tsc --noEmit && npm run lint && npm test`; `npm run build` too in Tasks 4, 5 and 7.
  Read the matching guide in `web/node_modules/next/dist/docs/` before writing Next code (redirects, `usePathname`, layouts).
- No new dependencies. Icons are inline stroke SVG. Buttons use `buttonClass`; never leave `bg-white`/`border-zinc-*` beside it.
- `lib/*.ts` imported by tests: relative imports with `.ts`, never `@/`.
- Old URLs keep working: every moved route gets a redirect with `permanent: false` (307). Phases 3-5 may move them again, and a 308 is cached by browsers for good.
- Tap targets ≥ 44px in the phone menu and the menu button.
- Don't build Home (phase 3), the compare tray (phase 4), or rename the My colleges tabs (phase 5).
- Commit messages: conventional, ending with the session's Co-Authored-By line. Run `git branch --show-current` before the first commit.

### Nav content (copy verbatim)

| Who | Nav items (href → label), in order |
|---|---|
| Student (signed in, or signed out with started data) | `/colleges` Explore · `/compare` Compare · `/application` My colleges · `/writing` Writing · `/profile` Profile |
| Teacher | `/teacher` Home · `/teacher/students` Students · `/teacher/classes` Classes · `/teacher/deadlines` Deadlines · `/colleges` Explore · `/compare` Compare |
| Signed out, not started | `/colleges` Explore · `/pricing` Pricing · `/help` Help |

| Who | Account menu items (under the username), then a divider and **Sign out** |
|---|---|
| Student | `/settings` Settings · `/connect-ai` Connect AI · `/pricing` Plan & billing · `/help` Help |
| Teacher | `/settings` Settings · `/help` Help |

- **Started** = `student.list.length > 0 || student.profile.interested.length > 0 || profile.sat != null || profile.act != null ||` any English test
  entry in `profile.tests` has a score. Field shapes are in `lib/fit.ts:15-29`; check the exact names there.
- **Right side of the bar:**
  - **Signed in:** the username button with the account menu.
  - **Signed out:** "Sign in" (`buttonClass("quiet","sm")`, opens the dialog).
    - While not started: also "Get started" (`buttonClass("primary","sm")`, links to `/start`).
    - When started: also a "More" button (same menu component) listing the student account menu without Sign out, so Help, Pricing and Connect AI stay reachable.
  - Teachers never see "Get started".
- **Until `student.ready` is true**, the nav links and the right side render as empty placeholders of the same height (no links). Otherwise a
  returning signed-out student would see the public nav flash before the student nav.
- Compare stays in both navs until phase 4 adds the compare tray. Home joins the student nav in phase 3.
- Ruling vs spec §3: the spec lists Explore · Pricing · Help for signed-out visitors. Here that applies only to visitors who haven't started.
  Signed-out students with browser-only data use the app fully today, so they get the student nav.

### Route moves (copy verbatim)

| Old | New | How |
|---|---|---|
| `/application/essays` | `/writing/essays` | `git mv`, redirect (query string kept) |
| `/activities` | `/writing/activities` | `git mv`, redirect |
| `/resume` | `/writing/resume` | `git mv`, redirect |
| `/account` | `/settings` | delete `app/(app)/account`, redirect |
| `/profile#account`, `/teacher#account` | `/settings` | client-side (hashes never reach the server) |

## Review Focus

1. **Old links:** `/account`, `/profile#account`, `/teacher#account`, `/activities`, `/resume` and `/application/essays?google=connected`
   all land on the right new page, with the query string kept. Pinned in Task 4 (curl) and Task 3 (hash).
2. **Google Docs callback** lands on `/writing/essays?google=...` and the Essays page still shows its connected/error banner. Task 4.
3. **Sign-in from the dialog returns to the page you were on**, query string included, not to `/profile`. Task 2.
4. **Phone menu:** closes on Esc, a backdrop tap and route change. Focus goes back to the menu button, and only one `aria-current` is in it. Task 5.
5. **A signed-out student with local data** still sees My colleges and Writing, and reaches Help/Pricing/Connect AI through "More". A brand-new
   visitor sees the short public nav. Nothing flashes while the store loads. Task 1 tests, Task 5 and Task 7 browser.

---

### Task 1: Nav model in `lib/roles.ts`

**Files:** Modify `web/lib/roles.ts`, `web/lib/roles.test.ts`

**Interfaces — Produces:**
- `type NavItem = readonly [href: string, label: string]`
- `navFor(role: Role | null | undefined, opts: { signedIn: boolean; started: boolean }): readonly NavItem[]`: teacher → teacher nav;
  else `signedIn || started` → student nav; else public nav (tables above).
- `accountMenuFor(role: Role | null | undefined): readonly NavItem[]` (tables above; anything not a teacher gets the student menu).
- `hasStarted(s: { collegeCount: number; hasScore: boolean }): boolean`. The caller computes both inputs per the "Started" rule above:
  `collegeCount` = list + interested, `hasScore` = SAT, ACT or any English test score.
- `STUDENT_ONLY_PATHS` gains `"/writing"` (keep the old entries; they now redirect, and the list is harmless).
- `activeNavHref` is unchanged.

- [ ] **Step 1: Tests** (replace the old `navFor` test). Assert:
  - `navFor("teacher", {signedIn: true, started: false})` hrefs equal `["/teacher","/teacher/students","/teacher/classes","/teacher/deadlines","/colleges","/compare"]`.
  - `navFor(undefined, {signedIn: false, started: false})` hrefs equal `["/colleges","/pricing","/help"]`.
  - `navFor(undefined, {signedIn: false, started: true})` deep-equals `navFor("student", {signedIn: true, started: false})`, and its hrefs equal `["/colleges","/compare","/application","/writing","/profile"]`.
  - `accountMenuFor("teacher")` hrefs equal `["/settings","/help"]`, and `accountMenuFor("student")` hrefs equal `["/settings","/connect-ai","/pricing","/help"]`.
  - `hasStarted({collegeCount: 0, hasScore: false}) === false`, `hasStarted({collegeCount: 1, hasScore: false}) === true` and `hasStarted({collegeCount: 0, hasScore: true}) === true`.
  - `isStudentOnlyPath("/writing/essays") === true` and `isStudentOnlyPath("/settings") === false`.
  - `activeNavHref("/writing/essays", studentHrefs) === "/writing"`. This replaces the old `/application/essays` assertion.
  - Update every other existing call of `navFor` in the tests to the new signature.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Keep the app compiling: update `SiteNav`'s call to `navFor(role, { signedIn: !!student.auth, started })`. Compute `started` with
  `hasStarted` from the store (the list/interested entries count and whether any score field in `student.profile` is set; find the field names
  in `lib/fit.ts:15-29`). No visual changes yet beyond the nav items themselves.
- [ ] **Step 6:** Checks pass, then **commit** `feat: role- and progress-aware nav items`.

### Task 2: Sign-in dialog

**Files:** Create `web/components/SignInDialog.tsx`. Modify `web/app/layout.tsx`, `web/components/AccountPanel.tsx`, `web/components/MyList.tsx:101`, `web/components/ActivitiesEditor.tsx:384`

**Interfaces — Produces:**
- `openSignIn(): void`: dispatches `window` event `"open-sign-in"`.
- `SignInDialogHost()`: client component mounted once in the root layout, inside `<Suspense>`. It listens for the event and renders `Modal`
  (`components/Modal.tsx`) titled "Sign in". Inside: `GoogleSignIn` with `returnTo` = the current `pathname + search` (read when opened),
  plus the line "Your list and scores on this device are saved to your account when you sign in." It closes itself when `student.auth` becomes set.
- `SignInButton({ className, children })`: a `<button>` that calls `openSignIn()`.

- [ ] **Step 1:** Implement. `GoogleSignIn` already takes `returnTo` (`AccountPanel.tsx:14`) and passes it to
  `signInWithOAuth({ redirectTo: origin + returnTo })` (`lib/student-store.ts:312`).
- [ ] **Step 2:** Replace the signed-out entry points with `SignInButton`, keeping each one's visible text and link-like styling:
  - `AccountLink`'s "Sign in" (`AccountPanel.tsx:104`).
  - `MyList.tsx:101`.
  - `ActivitiesEditor.tsx:384`.
  - `ReminderToggle`'s signed-out "sign in" link (`AccountPanel.tsx` ~44-55).
- [ ] **Step 3:** Checks pass. Browser check (signed out, dev server on :3000): open `/application/list?x=1`, click "Sign in" in the nav, and the dialog
  opens with a Google button. `read_page` shows the dialog; Esc closes it and focus goes back to the button. Read the button's `returnTo` (or log
  the `redirectTo` it would use) to prove it is `/application/list?x=1`. Don't complete a real Google sign-in.
- [ ] **Step 4: Commit** `feat: sign-in dialog available from any page`

### Task 3: `/settings` page

**Files:**
- Create: `web/app/(app)/settings/page.tsx`, `web/components/SettingsPage.tsx`, `web/components/LegacyAccountHash.tsx`
- Modify: `web/components/SettingsPanel.tsx` (delete it once unused), `web/components/ProfileDashboard.tsx:11,139`,
  `web/components/TeacherHome.tsx`, `web/components/AccountPanel.tsx` (`SettingsLink`, `OPEN_SETTINGS_EVENT`, `ReminderToggle`),
  `web/app/(app)/help/page.tsx`, `web/lib/roles.ts` (only if `RoleGate` needs it)
- Delete: `web/app/(app)/account/`, and in the same commit add the `/account` → `/settings` redirect (`permanent: false`) to `web/next.config.ts`

**Interfaces — Produces:**
- `SettingsPage()`: client component. Signed out → a card "Sign in to save your list and get reminders" with `GoogleSignIn returnTo="/settings"`.
  Signed in → these cards in order, each `rounded-2xl border border-zinc-200 p-6`:
  1. Account: the `Row`s from today's `SignedIn` (username, email, account type, teacher name/school or "Applying from"), the error alert, Sign out
     (`buttonClass("secondary")`).
  2. Reminders (students only, `id="reminders"`): `ReminderToggle`.
  3. My counselors and teachers (students only): `MyCounselors`.
  4. Account type: `RoleSwitcher`.

  The page heading is `Settings` (`font-display text-3xl font-bold`).
- `LegacyAccountHash()`: when the URL hash is `#account`, `router.replace("/settings")`. Mount it on `/profile` and `/teacher`.
- `SettingsLink` becomes a plain `Link href="/settings"`. `OPEN_SETTINGS_EVENT` and `useSettingsOpen` are removed, along with every listener and dispatch.

- [ ] **Step 1:** Build `SettingsPage` from `SettingsPanel`'s `SignedIn`/`SignedOut` code (move it, don't copy it), plus the route file (same page shell
  as `/help`: `max-w-3xl`, with metadata title "Settings").
  - The sentence "Change your scores and other details in the cards on this page" (`SettingsPanel.tsx:109`) becomes: "Change your scores and other
    details on your" + `<Link href="/profile">Profile</Link>` + ".".
  - Once `student.ready` is true, if `location.hash` names an element on the page (e.g. `#reminders`), scroll it into view. It renders after load, so
    the browser's own anchor jump misses it.
- [ ] **Step 2:** Remove `SettingsButton`/`SettingsPanel` from `ProfileDashboard` and `TeacherHome`, and the `ReminderToggle` from under the Profile calendar.
  In its place under the calendar, put one line: "Reminder emails:" + `<Link href="/settings#reminders">Settings</Link>`. Then delete `SettingsPanel.tsx`.
  The teacher dashboard loses its Settings button; Settings is in the account menu.
- [ ] **Step 3:** Mount `LegacyAccountHash` on `/profile` and `/teacher`. Help's Settings sentence links to `/settings`.
- [ ] **Step 4:** Grep (Grep tool) for `#account`, `OPEN_SETTINGS_EVENT`, `SettingsPanel` and `useSettingsOpen` in `web/app` and `web/components`.
  The only remaining hits should be in `LegacyAccountHash.tsx`.
- [ ] **Step 5:** Checks pass. Browser check: signed out, `/settings` shows the sign-in card. Seed one local college, then `/profile#account` lands on
  `/settings`. `/settings#reminders`, signed in via the mock, scrolls to the Reminders card. Teacher `/settings` via the mock Supabase (scratchpad only, as in phase 1) shows Account and Account type cards, with no Reminders or
  Counselors. Paste `read_page` excerpts.
- [ ] **Step 6: Commit** `feat: settings page replaces the hidden settings panel`

### Task 4: Writing routes and redirects

**Files:**
- Move: `web/app/(app)/application/essays/` → `web/app/(app)/writing/essays/`, `web/app/(app)/activities/` → `web/app/(app)/writing/activities/`,
  `web/app/(app)/resume/` → `web/app/(app)/writing/resume/` (all `git mv`)
- Create: `web/app/(app)/writing/layout.tsx`, `web/app/(app)/writing/page.tsx` (redirects to `/writing/essays`)
- Modify: `web/components/ApplicationTabs.tsx` (becomes a generic `SectionTabs`), `web/app/(app)/application/layout.tsx`, `web/next.config.ts`,
  `web/app/api/google/callback/route.ts:14`, `web/components/ChecklistPanel.tsx:44`, `web/components/ResumeBuilder.tsx:83,149`,
  plus any other in-app link the grep in Step 3 finds.

**Interfaces — Produces:**
- `SectionTabs({ label, tabs }: { label: string; tabs: readonly NavItem[] })`: today's `ApplicationTabs` markup, with the active tab colored
  `border-blue-700 text-ink`.
- The application layout uses `SectionTabs label="My colleges"` with the tabs Interested, My list, Portals and Results (Essays removed; labels unchanged
  until phase 5). Its page heading reads "My colleges".
- The writing layout uses `SectionTabs label="Writing"` with `/writing/essays` Essays, `/writing/activities` Activities and `/writing/resume` Résumé,
  under the heading "Writing". Pages keep their own content. If a moved page rendered its own top-level `h1` that now duplicates the layout's, drop it.
  The layout's heading and tabs both get `print:hidden`, so the résumé still prints as only the résumé (`resume/page.tsx:8` already hides its own header).

- [ ] **Step 1:** `git mv` the three routes, then add the layouts and `SectionTabs`.
- [ ] **Step 2:** Add redirects (`permanent: false`): `/application/essays` → `/writing/essays`, `/activities` → `/writing/activities`,
  `/resume` → `/writing/resume`. Keep the existing redirects, including Task 3's `/account` one.
- [ ] **Step 3:** Point the Google callback at `/writing/essays?google=...` directly. Then grep (Grep tool) for `/application/essays`, `"/activities`
  and `"/resume` across `web/app`, `web/components` and `web/lib` (including `lib/ai-context.ts` and `app/mcp`), and update every in-app link
  to the new path. The redirects exist for outside links only.
- [ ] **Step 4:** Checks + `npm run build` pass. Then, against a fresh dev server, `curl -sI` each old URL and paste the status lines and `location` headers:
  `/activities`, `/resume`, `/account` and `/application/essays?google=connected`. The last must keep `?google=connected`. Open
  `/writing/essays?google=connected` in the browser: the existing connected banner shows and the Writing tabs mark Essays.
- [ ] **Step 5: Commit** `feat: Writing section for essays, activities and résumé; redirects for old URLs`

### Task 5: Site header — desktop bar, account menu, phone menu

**Files:** Modify `web/components/SiteNav.tsx`, `web/components/AccountPanel.tsx` (`AccountMenu`), `web/app/layout.tsx` (header markup). Create
`web/components/MenuSheet.tsx`.

**Interfaces:**
- Consumes `navFor`, `accountMenuFor`, `hasStarted` and `activeNavHref` (Task 1), and `SignInButton` (Task 2).
- `AccountMenu` items come from `accountMenuFor(role)` plus Sign out. Each is a real link with 40px rows (`py-2.5`) and `role="menuitem"`; Esc and an
  outside click close it, as today.
- `MenuSheet({ open, onClose, items, active, account })`: a `<dialog>` opened with `showModal()`, anchored to the top (`m-0 w-full max-w-none`,
  white, `border-b`). It lists the nav items (48px rows, `aria-current` on the active one), then a divider, then the account items (or `SignInButton`
  and "Get started" when signed out), then Sign out. It closes on Esc, a backdrop click, and any pathname change. Focus goes back to the menu button on close.
  Its "Sign in" closes the sheet first, then calls `openSignIn()`, so two modals never stack.

- [ ] **Step 1:** Header layout. At `md` and up: logo, then the nav links, then (pushed right) the account area. Below `md`: logo, then (right) one
  menu button. The button is 44×44, `aria-label="Open menu"`, `aria-expanded`, `aria-controls`, with a three-line icon.
  - The desktop links and account area get `hidden md:flex`; the menu button gets `md:hidden`.
  - Keep the `<Suspense>` around everything that calls `usePathname` (the phase 1 pattern: a fallback with no active state).
- [ ] **Step 2:** Desktop account area per the "Right side of the bar" rule.
- [ ] **Step 3:** `MenuSheet` as specified.
- [ ] **Step 4:** Checks + `npm run build` pass. Browser check at 1440px, 768px and 375px (`resize_window`, reset to desktop after). At 768px the
  desktop bar must fit on one row with nothing clipped; if it doesn't, raise the breakpoint to `lg` and say so.
  - **Desktop:** signed out with nothing stored shows Explore/Pricing/Help, Sign in and Get started. After seeding one college it shows the student
    nav and no Get started.
  - **Phone:** the menu button opens the sheet. Esc closes it and focus returns to the button. Tapping a link navigates and closes the sheet.
  - No horizontal scroll at 375px (`document.documentElement.scrollWidth <= 375`), and no console errors.
  - Teacher nav and menu via the mock Supabase.

  Paste the evidence.
- [ ] **Step 5: Commit** `feat: new site header with account menu and phone menu`

### Task 6: Links outside the app and docs

**Files:** Modify `supabase/functions/deadline-reminders/index.ts:40-43`, `DEPLOY.md:48`, `README.md:19`, `LOCAL_SETUP.md:55`, `CLAUDE.md`
(the Roles/Settings lines that mention the Account page or the Settings panel), `web/app/(app)/help/page.tsx`. In Help, fix any wording about:
Settings in the username menu, reminders under the Profile calendar (`help/page.tsx:50-52`), Essays under My application, and Activities/Resume
nav items.

- [ ] **Step 1:** In the email function, change `/my-list` to `/application/list` and the opt-out `/account` to `/settings#reminders`, in both the HTML
  (line ~41) and the plain-text (line ~43) bodies. College links (line 29) stay as they are.
- [ ] **Step 2:** Update the docs to the new paths and names (Settings page, Writing, My colleges). In `CLAUDE.md`, also note: nav model in `lib/roles.ts`,
  sign-in via `openSignIn()`, settings at `/settings`.
- [ ] **Step 3:** Do NOT deploy the edge function. Deploying changes production email and needs the owner's OK; the controller asks at the end. The
  `/account` and `/my-list` redirects keep today's emails working until then.
- [ ] **Step 4:** Checks pass, then **commit** `docs: new paths; reminder email links point at the new pages`

### Task 7: Phase gate

- [ ] **Step 1:** `npx tsc --noEmit && npm run lint && npm test && npm run build`. Paste the last lines.
- [ ] **Step 2:** Use a fresh dev server: restart it via `preview_start`, because a stale one fakes hydration errors.
- [ ] **Step 3:** Walk at 1440px and 375px: `/`, `/colleges`, `/application/list`, `/writing/essays`, `/writing/resume` (and print preview without tabs),
  `/profile`, `/settings`, `/help`, plus each old URL from the route table.
- [ ] **Step 4:** Check the console on every page.
- [ ] **Step 5:** Fix anything found in the task that owns it.

## Not in this plan

- Home (`/home`) and making it the signed-in landing page: phase 3. `homePathFor` is unchanged here.
- The compare tray, and dropping Compare from the nav: phase 4.
- Renaming the tabs to Shortlist/Applying/Decisions, and the college drawer: phase 5.
- Deploying the reminder email function: an owner decision after this plan.
