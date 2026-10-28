# Portals: done / not done, and only the systems you need (2026-10-28)

Owner's request: on the Portals page (`/application/portals`), every portal gets two choices on the right,
**Done** and **Not done**, and "Not done" can carry a note saying what is left. Application systems (UC, Cal State
Apply, ApplyTexas, STARS, ...) appear only when a college on the student's list uses them. The page shows the status
of each system (e.g. "STARS: done"). The owner said "simply check": done means the student ticked it, nothing is
derived.

## Goals
- Done / Not done on every portal row: submitted colleges, application systems, campus portals, optional systems
  (tests, aid, visas), custom portals.
- Not done reveals a one-line note ("What's left?"), visible without opening the login box.
- Application systems are listed only when needed by the student's list (all statuses, not only submitted).
- A status strip at the top of the page: one chip per listed portal with its state, plus "n of m done".
- Research which colleges use ApplyTexas, Cal State Apply, STARS, SRAR (and UCAS/OUAC/AU admissions centres for
  the non-US colleges), with an official source for each list.

## Non-goals
- No automatic "done" from other data (submission status, transcript, checklist).
- No change to how logins are stored, and no new migration (progress lives in `student_profiles.portals` jsonb).
- Teachers never see portals (unchanged).

## Data: which systems a college uses
- Source file `data/application_systems_2026_27.json` (hand-researched, every list has an official source URL):
  `{ "_about": "...", "systems": { "<system key>": { "source": "<url>", "checked": "2026-10-28", "members": ["<slug>", ...], "notes": "..." } } }`.
- Existing `requirements.platforms` in the cycle data is merged in: `common_app` -> `commonapp`, `coalition` -> `coalition`,
  `uc_app` -> `uc`. `own` and `questbridge` add nothing.
- `python -I scripts/build_application_systems.py [--check]` validates (every slug exists in `data/colleges/`, every
  system key exists in `SYSTEMS` in `web/lib/portals.ts`, no duplicates, source present) and writes
  `web/lib/data/application-systems.json`: `{ "colleges": { "<slug>": ["commonapp", "stars"] }, "sources": { "<key>": "<url>" } }`.
  Output keyed by the inner database slug, like `build_supplements.py`.
- New `SYSTEMS` entries as needed: `srar` (SRAR self-reported record). Existing keys are never renamed.
- Each system gets a `kind`: `route` (a way to apply: Common App, Coalition, UC, Cal State Apply, ApplyTexas, UCAS, OUAC,
  UAC, ...) or `addon` (needed on top of the application: STARS, SRAR).

## Which systems are "needed"
For each college on the student's list (custom colleges have no data and add nothing):
1. Every `addon` it uses is needed.
2. Its application route: the first `route` it accepts in the order Common App, UC, Cal State Apply, ApplyTexas, UCAS,
   OUAC, the other country systems, Coalition. A college that only takes its own application adds no system.
3. A route the student already has saved data for (a login or a progress mark) also counts for the colleges that accept it,
   so a student applying to UT Austin through ApplyTexas keeps seeing ApplyTexas once they touch it.

A system row is shown when it is needed or the student has saved anything for it (nothing saved is ever hidden). Each
shown application system says which of the student's colleges it is for ("For: UT Austin, Texas A&M"). The "Add portal"
menu offers the not-shown application systems too, so a student can add one by hand.

## Progress storage
`PortalData.progress?: Record<string, { done: boolean; note?: string }>` keyed by: system key, campus key
(`uc:UCLA`), `custom:<id>`, `college:<slug>`. Missing = not marked, counted as not done. Removing a custom portal or a
campus also removes its progress entry.

## UI
- Each row's header: the existing click-to-open area, then on the right a two-button group **Done** / **Not done**
  (`aria-pressed`), outside the clickable area. Done uses the `done` tone, Not done the `soon` tone (`toneClass`).
- Not done shows a single note input under the header, saved on blur.
- Top of the page: status strip, chips "Common App: Done", "STARS: Not done", and "3 of 7 done". A chip with a note shows
  it as a title / tooltip.
- English and zh-TW dictionary keys for all new text (`i18n.test.ts` must pass).

## Left to the builder
Exact spacing, chip layout on phones, and test names. Pure logic (needed systems, progress counts) goes in
`web/lib/portals.ts` with unit tests in `web/lib/portals.test.ts`.
