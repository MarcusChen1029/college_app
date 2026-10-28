# Apply Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** My list grouped by application route (Common App, UC, ... Direct) with the shared login in each group header; Portals limited to after-submission college portals and other accounts; STARS as both a Portals account and a per-college checklist item.

**Architecture:** The data build script assigns every college exactly one route. Pure helpers in `web/lib/portals.ts` group list entries by route and handle STARS write-through; `web/lib/checklist.ts` gains a `stars` after-apply item that, like `INTL_STEPS`, never counts toward progress. `MyList.tsx` renders one group per route using a `LoginRow` component extracted from `PortalsPage.tsx`; `PortalsPage.tsx` drops the application-system section and the status box.

**Tech Stack:** Next.js 16 / React 19 / Tailwind 4 (web/), node:test unit tests (`npm test` = `node --test lib/*.test.ts`), Python 3 data scripts run as `python -I`.

**Spec:** `docs/superpowers/specs/2026-10-28-apply-groups-design.md` (read it, including "Calls made"). Previous version: `docs/superpowers/specs/2026-10-28-portal-progress-design.md`.

## Global Constraints
- Route order (exact): `commonapp, coalition, uc, calstate, applytexas, ucas, ouac, educationplannerbc, applyalberta, sram, uac, vtac, qtac, satac, tisc`, then `direct`.
- Saved data keys never change: `profile.portals.systems[<system key>]`, `campuses["<system>:<campus>"]`, `custom`, `progress`. No migration.
- No raw red/amber/green/rose/emerald classes; never `bg-white`/`border-zinc-*` next to `toneClass`/`buttonClass` (CLAUDE.md).
- All new UI text in `web/lib/i18n` for English and zh-TW; `i18n.test.ts` fails on missing/unused keys, so delete keys the old UI used and no longer does.
- STARS (`checklist.stars`) never counts toward `progress()` or Ready.
- Run checks through the PowerShell tool (the Bash tool's output proxy has hidden failures); report exit codes.

## Review Focus
- A student with a saved Common App login but no Common App college on the list: login stays stored and the Portals "logins hidden" note counts it (Task 2 test `hiddenLoginCount counts route logins with no group`).
- A custom college (typed in by the student) lands in Direct, never crashes the grouping (Task 2 test `routeGroups puts custom colleges in direct`).
- Marking STARS Done when some STARS colleges are already ticked writes only the unticked ones (Task 2 test `starsPatches skips ticked and non-STARS colleges`).
- A college whose status is a decision (admitted, rejected...) counts as submitted in its group (Task 2 test `groupProgress counts decisions as submitted`).
- A group with zero colleges never renders (Task 2 test `routeGroups omits empty routes`).

---

### Task 1: Route per college in the data build

**Files:**
- Modify: `scripts/build_application_systems.py` (`build`, `render`, `main`, docstring)
- Modify: `scripts/test_build_application_systems.py`
- Modify: `web/lib/application-systems-data.ts`
- Regenerate: `web/lib/data/application-systems.json`

**Interfaces:**
- Produces: JSON gains `"routes": { "<every slug in data/colleges>": "<route key or 'direct'>" }`. TS: `export const collegeRoute = (slug: string): string` (returns `"direct"` for unknown/custom slugs) and `export const requiresStars = (slug: string): boolean` in `web/lib/application-systems-data.ts`.

- [ ] **Step 1: Tests** in `test_build_application_systems.py`: `test_route_prefers_common_app` (systems `["applytexas","commonapp"]` -> `commonapp`), `test_route_coalition_before_uc` (`["coalition","uc"]` -> `coalition`), `test_route_direct_when_no_route` (`["stars"]` or none -> `direct`), `test_every_college_has_route` (build over a slug set where one slug has no systems -> it appears in routes as `direct`).
- [ ] **Step 2:** `python -I scripts/test_build_application_systems.py` -> the new tests FAIL.
- [ ] **Step 3:** Add `ROUTE_ORDER` (Global Constraints list) and `route_of(keys) -> str` to the script; `build` returns routes for every slug in `college_slugs()` values; `render` writes `"routes"` one per line after `"colleges"`; `--check` covers it. Summary line adds route counts.
- [ ] **Step 4:** Tests PASS; `python -I scripts/build_application_systems.py` then `--check` exit 0. Expect route counts roughly commonapp ~244, uc 8, calstate 14, applytexas ~8, ucas 18, ouac 5, educationplannerbc 1, direct the rest; report the real numbers.
- [ ] **Step 5:** Add `collegeRoute` / `requiresStars` to `application-systems-data.ts`. Commit `feat(data): one application route per college`.

### Task 2: Pure helpers (portals.ts, checklist.ts)

**Files:**
- Modify: `web/lib/portals.ts`, `web/lib/portals.test.ts`, `web/lib/checklist.ts`, `web/lib/checklist.test.ts`

**Interfaces:**
- Consumes: route keys from Task 1 (passed in as a function so tests need no JSON).
- Produces (all in `portals.ts`):
  - `export const ROUTE_ORDER: readonly string[]` (Global Constraints, ending in `"direct"`).
  - `export type RouteGroup<T> = { route: string; items: T[] }`
  - `export function routeGroups<T extends { slug: string; custom?: boolean }>(items: readonly T[], routeOf: (slug: string) => string): RouteGroup<T>[]` — groups in ROUTE_ORDER, list order inside, custom -> `"direct"`, unknown route keys -> `"direct"`, empty groups omitted.
  - `export function groupProgress(statuses: readonly Status[]): { submitted: number; total: number; done: boolean }` — uses `isSubmitted` from `application.ts`; `done` = total > 0 && submitted === total.
  - `export function starsPatches(entries: readonly { slug: string; checklist: Checklist }[], requires: (slug: string) => boolean): { slug: string; checklist: Checklist }[]` — entries that require STARS and are not ticked, each with `stars: true` added.
  - `export function hiddenLoginCount(data: PortalData, visible: readonly RegionCode[], routesOnList: readonly string[]): number` — existing region rule, plus saved logins (username set) of `kind: "route"` systems not in `routesOnList`, counted once.
  - Removed: `mainRoute`, `neededSystems`, `systemShown`, `hasSavedFor` (if nothing else uses it), `progressCounts`, `ListedCollege` and their tests.
- Produces (`checklist.ts`): `export const AFTER_APPLY = [["stars", "STARS self-reported transcript"]] as const;` and `stars?: boolean` on `Checklist`. `progress()` unchanged (test: `progress ignores stars`).

- [ ] **Step 1: Tests** (portals.test.ts): `routeGroups orders by ROUTE_ORDER`, `routeGroups puts custom colleges in direct`, `routeGroups omits empty routes`, `groupProgress counts decisions as submitted` (statuses `["submitted","admitted","in_progress"]` -> `{submitted:2,total:3,done:false}`), `groupProgress done when all submitted`, `starsPatches skips ticked and non-STARS colleges`, `hiddenLoginCount counts route logins with no group` (saved `commonapp` login, `routesOnList` `["uc"]` -> 1; with `["commonapp"]` -> 0). checklist.test.ts: `progress ignores stars` (`progress({stars:true})` equals `progress({})`).
- [ ] **Step 2:** `cd web; npm test` -> new tests FAIL.
- [ ] **Step 3:** Implement the signatures above; delete the removed helpers and their tests.
- [ ] **Step 4:** `npm test` exit 0 (PortalsPage still compiles? Not required until Task 4 — but `npx tsc --noEmit` must pass at the end of Task 4; leave PortalsPage compiling by keeping temporary imports out, or do Tasks 2–4 before running tsc).
- [ ] **Step 5:** Commit `feat(portals): route groups and STARS helpers`.

### Task 3: My list grouped by route + STARS in the checklist

**Files:**
- Create: `web/components/LoginRow.tsx` (move `LoginRow`, `ProgressButtons`, `CopyButton`, `RowProgress` out of `PortalsPage.tsx`; add an optional `status?: React.ReactNode` rendered left of the Done / Not done buttons)
- Modify: `web/components/MyList.tsx`, `web/components/ChecklistPanel.tsx`, `web/lib/i18n/messages/*.ts` (+ zh-TW)

**Interfaces:**
- Consumes: `routeGroups`, `groupProgress`, `ROUTE_ORDER`, `SYSTEMS` (portals.ts); `collegeRoute`, `requiresStars` (application-systems-data.ts); `AFTER_APPLY` (checklist.ts); `LoginRow` props as today plus `status`.

- [ ] **Step 1:** My list renders one block per `routeGroups(entries, collegeRoute)` group (custom entries -> direct). Header: system name (`sysText` name), `LoginRow` for that system's saved login (`profile.portals.systems[route]`, saved through `student.updateProfile({ portals: { ...data, systems } })`, no Done buttons), and "n of m submitted" / Done from `groupProgress`. Direct header: name + one-line hint ("Apply on each college's own website"), no login. Rows keep the columns College, Fit, Plan, Status, Checklist. Crunch card, "Mark all sent", balance and multi-ED notes work across all groups as before.
- [ ] **Step 2:** ChecklistPanel shows a STARS checkbox (label from `AFTER_APPLY`, i18n) only when `requiresStars(college.slug)`, placed with the international/after-apply steps, saving `checklist.stars`.
- [ ] **Step 3:** i18n keys en + zh-TW (group header text, "n of m submitted", Direct hint, STARS label).
- [ ] **Step 4:** `npx tsc --noEmit`, `npm run lint`, `npm test` exit 0 (with Task 4 if tsc needs it). Commit `feat(my-list): group colleges by application system`.

### Task 4: Portals = after you submit

**Files:**
- Modify: `web/components/PortalsPage.tsx`, `web/app/(app)/application/portals/page.tsx` (intro text only), i18n messages

**Interfaces:**
- Consumes: `LoginRow` (Task 3), `starsPatches`, `hiddenLoginCount` (Task 2), `requiresStars`, `collegeRoute`.

- [ ] **Step 1:** Remove the status strip and the "Application systems" group. Per country: "Submitted colleges" (as today, Done / Not done + note, key `college:<slug>`) and "Other accounts" (optional systems, custom portals, and STARS for US). STARS shows automatically when any listed college `requiresStars`; otherwise it is in the "+ Add portal" menu. Saved campus logins (`data.campuses`) still render under Other accounts (no "add campus" menu any more).
- [ ] **Step 2:** STARS row's Done: `mark("stars")` as today, and when set to done also apply `starsPatches(listed entries, requiresStars)` via `student.update(slug, { checklist })` for each patch (same loop style as `markAllSent` in MyList). Un-marking writes nothing to checklists.
- [ ] **Step 3:** A submitted college row that `requiresStars` passes `status={<StatusPill>STARS ✓ / STARS ✗</StatusPill>}` (tone `done` when `checklist.stars`, else `soon`) to `LoginRow`, left of Done / Not done.
- [ ] **Step 4:** Hidden-logins note uses `hiddenLoginCount(data, regions, routes of listed colleges)`.
- [ ] **Step 5:** Checks exit 0; commit `feat(portals): after-submission portals and STARS account`.

### Task 5: Review, browser check, ship (controller)
- [ ] Fresh-context review of the branch diff against the spec.
- [ ] Browser check on localhost with a seeded list (UIUC submitted, UT Austin, Texas Southern, Pitt, UCLA submitted, Cal State Fullerton, Toronto, Oxford, one custom college): groups, header logins, STARS write-through, phone width.
- [ ] Update CLAUDE.md's "Application systems per college" bullet; commit, PR to `main`, merge.
