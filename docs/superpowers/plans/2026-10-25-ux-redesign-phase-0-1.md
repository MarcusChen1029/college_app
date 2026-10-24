# UX redesign — Phase 0 (quick fixes) and Phase 1 (color + component foundations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the known small bugs, mark the current page in the nav, and replace every ad-hoc status/fit/tier color and
button style with one token-based system, without moving any page or layout.

**Architecture:** Color values live once as Tailwind 4 `@theme` tokens in `web/app/globals.css`. Pure TypeScript in
`web/lib/status.ts` (which tone a thing is) and `web/lib/ui.ts` (which classes a tone, fit, tier or button gets) is unit
tested with `node --test`. Small React components (`StatusPill`, `DeadlineChip`, the reworked `FitBadge`/`TierBadge`) read
those helpers, and the existing call sites are swapped over file by file.
Naming note: the spec's `lib/colors.ts` and `--color-status-urgent-fg` became `lib/status.ts` + `lib/ui.ts` and `--color-urgent`
(shorter class names: `text-urgent`). Same intent, one source of truth.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind 4, TypeScript, `node --test` for `lib/*.test.ts`.

**Spec:** `docs/superpowers/specs/2026-10-24-ux-redesign-design.md` (sections 4, 5, 7, 8 and the locked decisions in 10).
Visual reference: https://claude.ai/artifact/MGKjpjhqCLh7uJc19buvXm

## Global Constraints

- All commands run from `web/`. Before every commit: `npx tsc --noEmit && npm run lint && npm test` (and `npm run build` at
  the end of each phase). Read `web/node_modules/next/dist/docs/` before writing any Next-specific code (Next 16 breaking changes).
- No new dependencies. Icons are inline stroke SVG, never emoji or an icon library.
- `lib/*.ts` files imported by tests use relative imports WITH the `.ts` extension (`./tiers.ts`), never `@/`, because
  `node --test` strips types but doesn't resolve aliases or extensionless paths. `import type` is fine either way.
- Do not move routes, change page layouts, or rename URLs. That is Phase 2+.
- Status hues (red/amber/green) appear ONLY through the status tokens. Fit uses only fit tokens. Tier uses only ink/zinc.
- Every colored mark also carries text or an icon. Text/background pairs below are ≥4.5:1 (green-700 on green-50 is the
  tightest, ≈4.8:1).
- Commit messages: conventional (`fix:`, `feat:`, `refactor:`), ending with the attribution line from the session.
- Run `git branch --show-current` before the first commit. Never `git reset` work you didn't create (another session may
  share the folder).

### Token values (copy verbatim)

| Token prefix | fg (`--color-X`) | bg (`--color-X-bg`) | line (`--color-X-line`) |
|---|---|---|---|
| `urgent` | `#b91c1c` | `#fef2f2` | `#fecaca` |
| `soon` | `#92400e` | `#fffbeb` | `#fde68a` |
| `done` | `#15803d` | `#f0fdf4` | `#bbf7d0` |
| `progress` | `#12304a` | `#cdeafc` | `#9fd5f5` |
| `neutral` | `#3f5a73` | `#e9f2fa` | `#d6e5f1` |
| `fit-super-reach` | `#86198f` | `#fdf4ff` | `#f0abfc` |
| `fit-reach` | `#7e22ce` | `#faf5ff` | `#d8b4fe` |
| `fit-target` | `#4338ca` | `#eef2ff` | `#a5b4fc` |
| `fit-safety` | `#0f766e` | `#f0fdfa` | `#5eead4` |

So the classes are e.g. `text-urgent bg-urgent-bg border-urgent-line`, `text-fit-reach bg-fit-reach-bg border-fit-reach-line`.

### Tone mappings (copy verbatim)

| Thing | Value → tone |
|---|---|
| Application stage (`lib/application.ts` `Stage`) | `in_progress` → progress, `ready` → done, `submitted` → done |
| Result (`RESULT_OPTIONS`) | `submitted` → progress, `admitted` → done, `enrolled` → done, `deferred` → soon, `waitlisted` → soon, `rejected` → neutral, `withdrawn` → neutral |
| Essay status | `not_started` → neutral, `brainstorming`/`drafting`/`revising` → progress, `final` → done |
| Teacher flag (`FlagKey`) | `deadline_soon` → urgent, `essay_not_started` → soon, `no_scores` → soon, `no_colleges` → soon, `inactive` → neutral |
| Checklist progress | all done → done, otherwise neutral |
| `Pill` tones (kept for its 14 call sites; colors only, no icon) | `zinc` → neutral, `blue` → progress, `green` → done, `red` → urgent |
| Deadline | done (submitted, or 0 items left) → done; else days < 0 → urgent; days ≤ 7 → urgent; days ≤ 21 → soon; else neutral |

Teacher flag thresholds (`SOON_DAYS = 14` in `lib/roster.ts:179`) are NOT changed; only the colors are.

## Review Focus

1. **A deadline with everything done** (0 checklist items left, or submitted) must render as done, never red, even if it is
   today or past. Test in Task 4.
2. **Today and overdue**: days = 0 reads "today", days < 0 reads "overdue" and is urgent unless done. Test in Task 4.
3. **Nav active state on nested and sibling routes**: `/teacher/classes` must highlight Classes, not Dashboard; `/colleges/harvard`
   highlights Colleges; `/` highlights nothing. Test in Task 2.
4. **Tiers with `++`/`+`** (`S++`, `A+`) get the same style as their letter and print the suffix. Test in Task 5.
5. **Teacher at `/account`** is redirected to `/teacher`. Test in Task 1.

---

## Phase 0

### Task 1: Quick fixes (redirect bug, Help link, stale copy)

**Files:**
- Modify: `web/lib/roles.ts:19`, `web/lib/roles.test.ts`
- Modify: `web/app/(app)/help/page.tsx:33`, `web/components/AccountPanel.tsx` (add export)
- Modify: `web/components/TeacherAttention.tsx:46`, `web/components/TeacherRoster.tsx:68-70`, `web/components/CollegeActions.tsx:42`

**Interfaces:**
- Produces: `SettingsLink({ children, className }: { children: React.ReactNode; className?: string })`, a client component exported
  from `components/AccountPanel.tsx`. It links to `/teacher#account` for teachers and `/profile#account` otherwise, and dispatches
  `OPEN_SETTINGS_EVENT` on click (same behavior as the existing Settings menu item).

- [ ] **Step 1: Failing test** in `lib/roles.test.ts`:

```ts
test("/account is student-only", () => {
  assert.equal(isStudentOnlyPath("/account"), true);
  assert.equal(redirectFor("teacher", "/account", true), "/teacher");
});
```

- [ ] **Step 2:** `npm test` → FAIL on that test.
- [ ] **Step 3:** Add `"/account"` to `STUDENT_ONLY_PATHS`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Add `SettingsLink`, and use it in `help/page.tsx` in place of the `/profile#account` `Link`. Keep the page a server
  component; only `SettingsLink` is client.
- [ ] **Step 6:** Replace the stale copy exactly:
  - `TeacherAttention.tsx:46`: `No students are linked yet. Share a class code or your one-on-one code from` + `<Link href="/teacher/classes">Classes</Link>` + `.`
  - `TeacherRoster.tsx:68-70`: the link goes to `/teacher/classes` and reads `Classes page`, not `dashboard`.
  - `CollegeActions.tsx:42`: `Add your scores on your` + `<Link href="/profile">Profile</Link>` + ` to see your fit.`
  Links use the existing `font-semibold text-blue-700 underline underline-offset-4` style.
- [ ] **Step 7:** `npx tsc --noEmit && npm run lint && npm test` → all pass.
- [ ] **Step 8: Commit** `fix: teachers at /account, role-aware Help settings link, stale copy`

### Task 2: Active nav state

**Files:**
- Modify: `web/lib/roles.ts`, `web/lib/roles.test.ts`, `web/components/SiteNav.tsx`

**Interfaces:**
- Produces: `activeNavHref(pathname: string, hrefs: readonly string[]): string | null`, the href whose path is the longest
  segment-boundary prefix of `pathname` (exact match or `pathname.startsWith(href + "/")`), else `null`.

- [ ] **Step 1: Failing test**:

```ts
test("activeNavHref picks the longest matching nav item", () => {
  const t = navFor("teacher").map(([h]) => h);
  const s = navFor("student").map(([h]) => h);
  assert.equal(activeNavHref("/teacher/classes", t), "/teacher/classes");
  assert.equal(activeNavHref("/teacher", t), "/teacher");
  assert.equal(activeNavHref("/teacher/students", t), "/teacher/students");
  assert.equal(activeNavHref("/application/essays", s), "/application");
  assert.equal(activeNavHref("/colleges/harvard", s), "/colleges");
  assert.equal(activeNavHref("/compare", s), "/compare");
  assert.equal(activeNavHref("/", s), null);
  assert.equal(activeNavHref("/colleges-old", s), null);
});
```

- [ ] **Step 2:** `npm test` → FAIL (not exported).
- [ ] **Step 3:** Implement `activeNavHref`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** In `SiteNav`, read `usePathname()` (`next/navigation`) and compute the active href. The active link gets
  `aria-current="page"` and `font-semibold text-ink underline decoration-blue-700 decoration-[3px] underline-offset-8`; the others
  keep `text-zinc-600 hover:text-ink`. `SiteNav` sits in the root layout, which uses `cacheComponents: true`, so put the
  `usePathname` part in a small `NavLinks` component wrapped in `<Suspense>`. Its fallback renders the same links with no active
  state, the way `app/layout.tsx` already wraps `RoleGate`. Check the Next 16 docs on `usePathname` + `cacheComponents` first.
- [ ] **Step 6:** `npx tsc --noEmit && npm run lint && npm test && npm run build` all pass, and the build must pass HERE, not only in Task 10.
  Then a browser check: `preview_start` the dev server and open `/colleges`, `/colleges/<any slug>`, `/application/list` and
  `/compare`. `read_page` shows `aria-current="page"` on exactly one nav link each time.
- [ ] **Step 7: Commit** `feat: mark the current page in the nav`

---

## Phase 1

### Task 3: Color tokens

**Files:**
- Modify: `web/app/globals.css` (`@theme` block, lines 19-52)

- [ ] **Step 1:** Add the 27 tokens from "Token values" to the `@theme` block, under a comment `/* Status and fit: see docs/superpowers/specs/2026-10-24-ux-redesign-design.md §4 */`. Leave `ink`, `sky`, `sun`, `coral`, `mint`, `lilac`, `zinc-*` and `blue-*` as they are.
- [ ] **Step 2:** Prove Tailwind generates them: temporarily put `text-urgent bg-fit-reach-bg` on any element, run `npm run build`,
  and `grep -o "fit-reach-bg" .next/static/chunks/*.css | head -1` prints a match. Remove the temporary classes.
- [ ] **Step 3: Commit** `feat: status and fit color tokens`

### Task 4: Status logic (`lib/status.ts`)

**Files:**
- Create: `web/lib/status.ts`, `web/lib/status.test.ts`

**Interfaces:**
- Produces:
  - `type Tone = "urgent" | "soon" | "done" | "progress" | "neutral"`
  - `const URGENT_DAYS = 7`, `const SOON_DAYS_CHIP = 21`
  - `deadlineTone(days: number, done: boolean): Tone`
  - `deadlineText(days: number): string` returns `"today"` (0), `"tomorrow"` (1), `"${n} days"` (n > 1), `"overdue"` (< 0).
    Callers label the done case themselves.
  - `stageTone(s: Stage): Tone`, `resultTone(r: (typeof RESULT_OPTIONS)[number]): Tone`, `essayTone(s: Essay["status"]): Tone`,
    `flagTone(k: FlagKey): Tone`, `pillTone(t: "zinc" | "blue" | "green" | "red"): Tone`, all following "Tone mappings".
  - Import types from `./application.ts`, `./roster.ts` and `./checklist.ts` (`Essay`/`EssayStatus` live in `lib/checklist.ts`).

- [ ] **Step 1: Failing tests** (`status.test.ts`), including at least:

```ts
test("deadlineTone: done always wins", () => {
  assert.equal(deadlineTone(3, true), "done");
  assert.equal(deadlineTone(0, true), "done");
  assert.equal(deadlineTone(-2, true), "done");
});
test("deadlineTone: thresholds 7 and 21", () => {
  assert.equal(deadlineTone(-1, false), "urgent");
  assert.equal(deadlineTone(0, false), "urgent");
  assert.equal(deadlineTone(7, false), "urgent");
  assert.equal(deadlineTone(8, false), "soon");
  assert.equal(deadlineTone(21, false), "soon");
  assert.equal(deadlineTone(22, false), "neutral");
});
test("deadlineText", () => {
  assert.equal(deadlineText(0), "today");
  assert.equal(deadlineText(1), "tomorrow");
  assert.equal(deadlineText(9), "9 days");
  assert.equal(deadlineText(-3), "overdue");
});
test("mapping tables", () => {
  assert.equal(resultTone("rejected"), "neutral");
  assert.equal(resultTone("waitlisted"), "soon");
  assert.equal(resultTone("enrolled"), "done");
  assert.equal(stageTone("ready"), "done");
  assert.equal(essayTone("drafting"), "progress");
  assert.equal(flagTone("deadline_soon"), "urgent");
  assert.equal(pillTone("red"), "urgent");
});
```

- [ ] **Step 2:** `npm test` → FAIL (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat: status tones for deadlines, stages, results, essays and flags`

### Task 5: Class helpers (`lib/ui.ts`)

**Files:**
- Create: `web/lib/ui.ts`, `web/lib/ui.test.ts`

**Interfaces:**
- Consumes: `Tone` (Task 4), `Fit` (`lib/fit.ts`), `TierCode`/`tierLetter` (`lib/tiers.ts`).
- Produces:
  - `toneClass(t: Tone): string` = `text-${t} bg-${t}-bg border-${t}-line`. Write the five full strings out literally in a
    `Record` (Tailwind only sees literal class names; never build them with template strings).
  - `FIT_LEVEL: Record<Fit, 1 | 2 | 3 | 4>` = `{ super_reach: 4, reach: 3, target: 2, safety: 1 }`
  - `fitClass(f: Fit): string`: literal `text-fit-… bg-fit-…-bg border-fit-…-line` per fit.
  - `fitDotClass(f: Fit): string`: literal `bg-fit-…` (filled dot) per fit; empty dots use `border-current` + transparent.
  - `tierClass(t: TierCode): string`, by letter:
    S `bg-ink text-white border-2 border-ink` · A `bg-white text-ink border-2 border-ink` · B `bg-white text-ink border-[1.5px] border-zinc-500` ·
    C `bg-white text-zinc-700 border border-zinc-400` · D `bg-white text-zinc-600 border border-dashed border-zinc-400`
  - `buttonClass(variant: "primary" | "secondary" | "quiet" | "danger", size: "md" | "sm" = "md"): string`. Shared:
    `inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50`.
    md `h-11 px-5 text-[15px]` · sm `h-9 px-4 text-sm` (compact spots; see Task 9).
    primary `bg-ink text-white hover:bg-zinc-800` · secondary `border-2 border-ink bg-white text-ink hover:bg-zinc-50` ·
    quiet `text-blue-700 hover:underline underline-offset-4` · danger `border-2 border-urgent bg-white text-urgent hover:bg-urgent-bg`.

- [ ] **Step 1: Failing tests**: `toneClass("urgent")` contains `text-urgent`, `bg-urgent-bg` and `border-urgent-line`.
  `tierClass("S++") === tierClass("S")`, and `tierClass("A+") === tierClass("A")`. `tierClass("D")` contains `border-dashed`.
  `FIT_LEVEL.super_reach === 4` and `FIT_LEVEL.safety === 1`. `buttonClass("primary")` contains `h-11` and `bg-ink`. `buttonClass("danger", "sm")` contains `h-9` and `text-urgent`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: class helpers for tones, fit, tier and buttons`

### Task 6: Badge components

**Files:**
- Modify: `web/components/badges.tsx`
- Create: `web/components/StatusPill.tsx` (holds `StatusIcon`, `StatusPill` and `DeadlineChip`)

**Interfaces:**
- Consumes: Tasks 4-5.
- Produces:
  - `StatusIcon({ tone }: { tone: Tone })`: a 14px inline SVG, `aria-hidden`, `stroke="currentColor"`, following the visual
    reference: urgent = warning triangle, soon = clock, done = check, progress = half-filled circle, neutral = empty circle.
  - `StatusPill({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string })`:
    `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap` + `toneClass(tone)`, with the icon first.
  - `DeadlineChip({ date, days, done, doneLabel = "Done" }: { date: string; days: number; done: boolean; doneLabel?: string })`:
    a `StatusPill` with `deadlineTone(days, done)`, reading `${fmtDate(date)} · ${done ? doneLabel : deadlineText(days)}`
    (`fmtDate` from `lib/format.ts`).
  - `TierBadge`: same props and sizes as today; colors come from `tierClass`, and it keeps `font-display`/bold and the `title`.
  - `FitBadge({ fit, reason })`: same props. A pill with `fitClass(fit)`, then 4 dots (`h-1.5 w-1.5 rounded-full border border-current`,
    the first `FIT_LEVEL[fit]` filled with `fitDotClass`), then the label. The dots are `aria-hidden`.
  - `Pill({ children, tone })`: same API and its current shape (`rounded px-1.5 py-0.5 text-xs font-medium`). Only the colors
    change, to `toneClass(pillTone(tone))`. There's no icon: `Pill` is a plain label at most call sites, so an "in progress" icon on
    every blue label would mislead. Where a call site really shows status, Tasks 7-9 replace it with `StatusPill`.

- [ ] **Step 1:** Implement. Remove `FIT_STYLE`, `TIER_STYLE` and the `dark:` classes in `badges.tsx`.
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint && npm test` → pass.
- [ ] **Step 3: Browser check:** `/colleges` (table view) and `/compare?c=<two slugs>`. A screenshot shows ink tier badges and fit pills
  with dots matching the visual reference. `read_console_messages` has no errors.
- [ ] **Step 4: Commit** `feat: ink tier badges, fit badges with a difficulty meter, status pills`

### Task 7: Student-side status colors

**Files (modify):** `components/MyList.tsx` (StatusCell 21-46, ProgressBadge 48-58, upcoming dates ~335-345), `components/ResultsList.tsx:13-21`,
`components/EssaysPage.tsx:49-55`, `components/ChecklistPanel.tsx`, `components/ProfileDashboard.tsx:90-142`, `components/DeadlineCalendar.tsx:61-80`

**Interfaces:**
- Consumes: Tasks 4-6.

- [ ] **Step 1:** Swap each to the mappings:
  - `StatusCell`: the select gets `toneClass(stageTone(st))` and the decision `Pill` becomes `StatusPill tone={resultTone(...)}`.
  - `ProgressBadge`: `StatusPill` done / neutral.
  - Upcoming dates: `DeadlineChip`, where `done` is true when the college is submitted (`isSubmitted`) or its checklist has 0 missing.
  - Results `TONE` → `toneClass(resultTone(o))`. Essay `TONE` → `StatusPill tone={essayTone(s)}`.
  - Checklist done items → `text-done`.
  - Profile "How my list looks" counts render `FitBadge` (so super reach matches everywhere).
  - Calendar: upcoming days `bg-blue-50`, past days `bg-zinc-100`. The count badge (today `bg-coral`) takes `toneClass` of the most
    urgent `deadlineTone` among that day's deadlines. The today ring changes from coral to `ring-2 ring-ink`, because coral is decoration only (spec §4).
  - Expected and intended: the "In progress" select becomes sky-filled (progress tone), so every in-progress row is tinted.
- [ ] **Step 2:** `grep -nE "(bg|text|ring|border)-(rose|emerald|amber|violet|teal|red|green)-" <those 6 files>` → no matches.
- [ ] **Step 3:** Checks pass. Browser check, signed out (localStorage data): add 3 colleges from `/colleges`, then open `/application/list`,
  `/application/results`, `/application/essays` and `/profile`. Screenshots show the new pills, and there are no console errors.
- [ ] **Step 4: Commit** `refactor: student pages use status tones`

### Task 8: Teacher-side status colors

**Files (modify):** `components/TeacherFlags.tsx`, `components/TeacherDeadlines.tsx:62`, `components/TeacherDetailColleges.tsx:20,31,59`,
`components/TeacherRosterTable.tsx:93`, `components/TeacherStudentDetail.tsx`, `components/TeacherNotes.tsx`, `components/TeacherClasses.tsx`, `components/TeacherClassCard.tsx`

- [ ] **Step 1:**
  - `FLAG_STYLE` → `StatusPill tone={flagTone(k)}` (keep the `title` and `sr-only` detail).
  - Teacher status pills use `stageTone`/`resultTone` (same colors as the student sees).
  - Deadline text → `DeadlineChip` (`done` = submitted).
  - Remaining error and success text → `text-urgent` / `text-done`.
- [ ] **Step 2:** The same grep over these files → no matches.
- [ ] **Step 3:** Checks pass. Browser check needs signed-in teacher screens: use the mock-Supabase approach from the teacher-accounts work.
  That means a throwaway node mock REST server in the scratchpad, plus a dev server with `NEXT_PUBLIC_SUPABASE_URL` pointed at it, plus a
  fake `sb-localhost-auth-token` in localStorage. Keep the mock and any launch.json edits in the scratchpad and revert them. Screens to check:
  `/teacher`, `/teacher/students`, `/teacher/students?s=<id>` (Colleges tab), `/teacher/deadlines`.
- [ ] **Step 4: Commit** `refactor: teacher pages use status tones`

### Task 9: Buttons, remaining colors, college page

**Files (modify):** `components/SiteNav.tsx`, `CollegeActions.tsx`, `ResumeBuilder.tsx`, `PricingPlans.tsx`, `ConnectAi.tsx`, `SettingsPanel.tsx`,
`RoleSwitcher.tsx`, `MyCounselors.tsx`, `AddCustomCollege.tsx`, `AiContextButton.tsx`, `ActivitiesEditor.tsx`, `InterestedList.tsx`,
`PortalsPage.tsx`, `OAuthConsent.tsx`, `TestScoresForm.tsx`, `WelcomeForm.tsx`, `AccountPanel.tsx`, `CollegeExplorer.tsx`, `app/error.tsx`,
`app/(app)/colleges/[slug]/page.tsx`

- [ ] **Step 1:** Only ACTION buttons change: a `<button>` or `<Link>` that does or opens something. These do NOT change: tabs, view or segment toggles,
  filter chips, select boxes, menu items, the Map/Table and country pills. Each action switches to `buttonClass(...)`:
  - filled → primary
  - bordered → secondary
  - text-only → quiet
  - delete / remove / leave / unlink → danger

  Size keeps today's footprint: an existing button shorter than 40px (e.g. `py-1`/`py-1.5`, `text-sm`/`text-xs`) gets `sm`, anything else gets `md`.
  Leave the landing page (`app/page.tsx`) and the `Doodles`/map illustrations as they are.
- [ ] **Step 2:** College page:
  - The "Test required" pill (line ~115) → `StatusPill tone="soon"`.
  - The UK "Apply by" pill (~222) → `DeadlineChip`.
  - Timeline dots (~261) → `StatusIcon` with `deadlineTone(days, false)`.
  - The non-application-deadline pill (~266) → `StatusPill tone="neutral"`.
- [ ] **Step 3:** Remaining error/success/warning text across `components/` and `app/(app)` → `text-urgent` / `text-done` / `text-soon`.
- [ ] **Step 4:** `grep -rnE "(bg|text|ring|border)-(rose|emerald|amber|violet|teal|red|green)-" components "app/(app)" app/error.tsx` → no matches,
  except `components/USMap.tsx`/`USMap3D.tsx`/`Doodles.tsx` (maps and illustrations change in Phase 4). List any remaining line in the commit body with a reason.
- [ ] **Step 5:** Checks pass. Browser check: `/colleges/<slug>` for one US and one UK college (e.g. `oxford`), `/pricing`, `/connect-ai`, `/start`.
  Screenshots, no console errors.
- [ ] **Step 6: Commit** `refactor: one button style and status tones everywhere`

### Task 10: Remove dead dark-mode classes, then the phase gate

**Files (modify):** `web/app/globals.css:3-5`, and every `.tsx` under `app/` and `components/` containing `dark:`.

- [ ] **Step 1:** Delete the `@custom-variant dark` line and change the comment to `The site is light-only (no dark mode yet; see the redesign spec §4).`
- [ ] **Step 2:** Strip every `dark:<class>` token, with its leading space, from `className` strings. Use a script in the scratchpad, never a script inside the repo.
  It replaces the regex `\s+dark:[^\s"'\`}]+` with `""` in the files from `grep -rl "dark:" app components`. Then fix any `className=" "` left empty.
- [ ] **Step 3:** `grep -rn "dark:" app components` → no matches.
- [ ] **Step 4: Phase gate:** `npx tsc --noEmit && npm run lint && npm test && npm run build` → all pass (paste the last lines).
- [ ] **Step 5:** Browser walk at 1440px and 375px (`resize_window`): `/`, `/colleges` (map and table), one college, `/compare`, `/application/list`, `/profile`.
  Nothing looks broken where `dark:` was removed. Reset the viewport to desktop afterwards.
- [ ] **Step 6: Commit** `chore: remove unused dark-mode classes`

## Not in this plan

- Phases 2-6 (new nav and IA, Home, Explore, My colleges, Writing, teacher home), `Card`/`PageHeader`/`Tabs`/`Drawer`/`Toast`, the mobile menu,
  and map pin colors. Each gets its own plan after this one ships.
- The spec's quick fix "`/colleges` and `/colleges/[slug]` sit in different layout groups" moves to Phase 4. Fixing it means choosing the
  college page's width, and Phase 4 redesigns that page anyway.
