# CLAUDE.md — College Application Tracker

Context for Claude Code sessions in this repo. Read this first, then `PLAN.md` for the full plan.

## What this is
A college application tracker for students (many of them international). It stores US colleges with
general and subject **tiers (S/A/B/C/D)**, official **Common Data Set (CDS)** stats (SAT/ACT 25/50/75,
GPA average + band distribution, admit rates incl. ED/international), **ED/EA/REA/RD deadlines**,
**English test requirements** (TOEFL old 0–120 and new 1–6 scale, IELTS, Duolingo, PTE, Cambridge),
test policy, application requirements, cost & international aid, how majors are admitted, and a
**source URL for every fact**. 100 popular US colleges are loaded (the original 10 demo colleges plus 90 added
2026-10-22: Ivies and other top privates, UCs and major flagships, popular privates, top liberal-arts colleges), plus
316 high-admit "safety" colleges for a ~1100 SAT international applicant added 2026-10-26 in six waves (candidate list and
per-college status in `docs/superpowers/research/2026-10-26-safety-college-candidates.md`).
Plan: all US colleges next, then UK/CA/AU.

## Stack & services
- **Supabase** project `college-tracker`, ref `eyvmtaggayqizllaseiu` (ap-northeast-1). Org is on the free plan.
  - URL `https://eyvmtaggayqizllaseiu.supabase.co`, publishable key in `web/.env.example` (safe to expose).
  - Reference tables: public read-only via RLS. `student_profiles` / `student_colleges` / `reminder_log`: per-user RLS (tested).
  - View `college_summary` (security_invoker) feeds the list/compare pages.
  - Edge Function `deadline-reminders` + pg_cron job `deadline-reminders` (14:07 UTC daily). Auth via
    `x-cron-secret` header checked by `public.check_cron_secret()` against `private.app_config`.
    Sends via Resend; **dry-run until secrets `RESEND_API_KEY`, `REMINDER_FROM`, `APP_URL` are set.**
    The same function also sends scholarship reminders (0027) and the opt-in weekly teacher digest (0029, `supabase/functions/_shared/teacher-digest.ts`);
    version 3 deployed 2026-10-27. Deploy both files (`deadline-reminders/index.ts` + `_shared/teacher-digest.ts`, verify_jwt off).
- **web/**: Next.js **16** (App Router, `cacheComponents: true`), React 19, Tailwind 4, supabase-js 2.118.
  **Next 16 has breaking changes. Read `web/node_modules/next/dist/docs/` before writing Next code** (see `web/AGENTS.md`).
  - Server data reads are in `web/lib/data.ts`: `await connection()` then a `"use cache"` + `cacheLife("hours")` function.
    Builds never touch Supabase; pages wrap data in `<Suspense>`.
  - Student state: `web/lib/student-store.ts` (`useSyncExternalStore`). localStorage when signed out, Supabase when
    signed in (Google OAuth via Supabase, PKCE, client-side only, no proxy/middleware). Local data is merged into the account on first sign-in.
  - Google Docs (Writing > Essays page, `/writing/essays`, one-click "+ New Google Doc"): `web/app/api/google/*` + `web/lib/google-docs.ts` / `google-server.ts`.
    Needs server env vars `GOOGLE_DOCS_CLIENT_ID`, `GOOGLE_DOCS_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
    `GOOGLE_TOKEN_ENCRYPTION_KEY` (base64, 32 bytes) and migration 0016 (`google_tokens`, applied).
    Without them the page keeps the docs.new + paste-link flow.
  - Roles (migration 0020, plan in `docs/superpowers/specs/2026-10-24-teacher-counselor-design.md`): each account is a `student` or a `teacher`,
    chosen once at `/welcome` via RPC `set_my_role` (tables `user_roles`, `teacher_profiles`; existing users were backfilled as students).
    `student-store.ts` loads the role first and only students load/merge list data. `RoleGate` redirects, `SiteNav` swaps the nav, `/teacher` is the
    teacher home. Teachers must never get SELECT on student tables (portal passwords live in them); later phases read through SECURITY DEFINER RPCs.
  - Linking (migration 0021): teachers make `classes` and `join_codes` (class code, or one personal "individual" code); a student redeems a code via
    `preview_code`/`redeem_code` (failures are returned as `{ok:false}`, not raised, so the 10/hour rate limit sticks) which creates a `teacher_links`
    row (the access grant later phases check) and a `class_members` row. All writes go through SECURITY DEFINER RPCs; client wrappers are in `web/lib/links-api.ts`.
  - Navigation (UX redesign phase 2): nav model in `web/lib/roles.ts` (`navFor`/`accountMenuFor`/`startedFrom`); sign-in is a dialog opened with `openSignIn()`;
    account, reminders and the role switch live at `/settings` (old `/account` and `#account` redirect); Essays and Activities are under `/writing/*`; the Résumé generator moved to the **Tools** page (`/tools`, `/tools/resume`; `/resume` and `/writing/resume` redirect), which also offers the Common App filler download (Beta).
  - Switching role (migration 0025): `RoleSwitcher` (Settings page for students, dashboard for teachers) calls RPC `change_my_role`. It is refused while the
    account has links (a student must leave their teachers, a teacher must remove their students); leaving teacher mode revokes all join codes and archives
    classes. The other side's data is kept so switching back restores it.
  - Teacher read access (migrations 0022/0023): teachers read students only through `teacher_roster(p_today)`, `teacher_student(id, p_today)`,
    `teacher_deadlines(days, p_today)`; they return an explicit column list (never `portals`, `portal_*`, `notes`, `resume`, aid offers; essay titles/links
    are stripped when the student's `share_essays` is off). The client sends its local date as `p_today`. Flags/progress are computed in `web/lib/roster.ts`;
    teacher pages are `/teacher`, `/teacher/students` (`?s=<id>` for detail), `/teacher/deadlines`.
  - Teacher notes (migration 0024): `teacher_notes` are private to the author (RLS) and tied to the teacher<->student link by a composite FK, so they are
    deleted when the link ends. The roster CSV (`web/lib/roster-export.ts`, `csv.ts`) neutralises spreadsheet formulas in student-controlled text and
    exports only the rows shown. Teacher accounts (Phases 1-4) are done; ideas not built: counselor->student comments, assigning tasks to a class,
    teacher email digests, verified-school badges.
  - Share links (migration 0032, applied 2026-10-27, smoke test passed; spec `docs/superpowers/specs/2026-10-27-share-links-design.md`): a student makes a read-only
    parent link (Settings) or a portfolio link (Tools > Résumé); pages `/share/parent/<token>` and `/share/portfolio/<token>` call anon RPCs
    `parent_view` / `portfolio_view` that return an explicit field list (never email, portals, notes, aid, essays, transcript, contact lines).
  - Class charts (migration 0033, applied 2026-10-27, smoke test passed; spec `docs/superpowers/specs/2026-10-27-class-charts-design.md`): `/teacher/charts`,
    anonymous GPA vs SAT/ACT outcome scatter per college via RPC `teacher_outcomes`; shown only when >= 5 linked students have outcomes (overall and per college).
  - College match by field (`/tools/match`, spec `docs/superpowers/specs/2026-10-27-field-recommender-design.md`): 27 directions in `web/lib/fields.ts`
    (CIP codes + tier mapping + course keywords), scoring in `web/lib/field-match.ts`. Overall reputation never stands in for a field: no graduates in the
    field (IPEDS) = not offered, non-US with no tier/course = not enough data. Data `web/lib/data/field-completions.json` is generated by
    `python -I scripts/build_field_completions.py <C2024_a.csv>` (NCES IPEDS C2024_A, 2023-24 first-major bachelor's; `--check` verifies). Saved choice:
    `student_profiles.study_fields` (migration 0036).
  - Interest quiz: `/tools/interests`, 30 own RIASEC items (official O*NET Interest Profiler items are CC BY-ND, so not used), careers from O*NET (CC BY 4.0)
    in `web/lib/interest-careers.ts` generated by `scripts/build_interest_careers.py`; answers in localStorage only. Licensing: `docs/superpowers/research/2026-10-27-interest-quiz-licensing.md`.
  - Languages: English + Traditional Chinese (zh-TW), `lang` cookie, no URL prefix (spec `docs/superpowers/specs/2026-10-27-i18n-design.md`). Dictionaries in
    `web/lib/i18n/` (zh-TW must match the English key type; `i18n.test.ts` fails on missing/unused keys). New UI text goes through the dictionaries; data,
    stored values and portal dropdown values stay English.
    Hashed tokens, one active link per kind; pure code in `web/lib/share-links.ts`, wrappers in `share-api.ts`.
  - Colors and buttons (UX redesign, spec `docs/superpowers/specs/2026-10-24-ux-redesign-design.md`; phases 0-1 done, 2-6 next):
    status tones in `web/lib/status.ts` (urgent ≤7 days, soon ≤21, done = application deadline submitted), classes in `web/lib/ui.ts`
    (`toneClass`, `fitClass`, `tierClass`, `buttonClass`), tokens in `globals.css`, components `StatusPill`/`DeadlineChip`/`FitBadge`/`TierBadge`.
    Never write raw red/amber/green/rose/emerald classes, and never leave `bg-white`/`border-zinc-*` next to a tone or button class
    (Tailwind stylesheet order wins). No dark mode.
  - Fit labels: `web/lib/fit.ts` (uses the international admit rate when the student is international). GPA percentile estimate: `web/lib/gpa.ts`.
- **Transcript** (migration 0030, applied; spec `docs/superpowers/specs/2026-10-26-transcript-design.md`, plan `docs/superpowers/plans/2026-10-26-transcript.md`):
  one standardized coursework record per student at `/application/transcript` (tabs Edit / Import / View as). Tables `transcript_schools` and `transcript_courses`
  (per-user RLS, composite FK so a course can only join the same student's school). Teachers get **no** access; no RPC, roster or context pack reads them.
  Grades are stored exactly as printed, never converted. Pure code: `web/lib/transcript.ts` (model, validators, merge), `transcript-maps.ts` + `transcript-maps/*.ts`
  (Common App, STARS, Cal State Apply, UC, UIUC SRAR, UT Austin mapping tables; every value is `verified | unverified | none`; unverified values get no Copy button;
  each system also carries `subjectList`, its own exact subject dropdown, which the AI prompt lists so the AI tags every course per application via `systemSubjects` -> per-system overrides),
  `transcript-import.ts` (format spec, copy-prompt for any AI, JSON reader, import plan, MCP add/update planning). Import is paste-JSON with a review table; MCP tools
  (`get_transcript_format`, `get_transcript`, `add_transcript_courses`, `update_transcript_course`, `delete_transcript_course`) save directly and are badged "AI".
  Adding another system = one new `SystemMap` file plus an entry in `SYSTEMS` (the completeness test fails until every canonical value is mapped).
- **Extension** (`extension/`, Chrome MV3 side panel, pinned id `omnpdpbgbbdbnnaimhppoclimbeeognl` = `NEXT_PUBLIC_EXTENSION_ID` in `web/.env.example`; spec `docs/superpowers/specs/2026-10-26-common-app-fill-extension-design.md`,
  plan `docs/superpowers/plans/2026-10-26-common-app-fill-extension.md`): fills the Common App courses & grades section from the Transcript. Build with `cd extension && node build.mjs`
  (`TRACKER_URL=... node build.mjs` for a deployed tracker; default `http://localhost:3000`), load `extension/dist` unpacked; steps in `extension/README.md`. The Tools page serves a zip of it from `web/public/downloads/common-app-filler.zip`, built for `https://www.track-ur-college.com`: run `cd extension && npm run package` after any extension change and commit the new zip (builds into a temp dir, leaves `dist/` alone). It never holds a Supabase session:
  the student approves it at `/extension/connect`, which mints a **transcript-only token** (migration 0031, table `extension_tokens`, applied; students revoke it under Settings > Connected extensions, then Fill says "Sign in again").
  **Never test fills on the owner's real Common App account.** Use the throwaway test account (Purdue, nothing submitted) in a separate Chrome profile signed in only to it.
  The live end-to-end run has not been done yet: follow `extension/TESTING.md`.
  Schools are matched to the portal's school by `web/lib/school-match.ts`: the optional school code (CEEB, migration 0034 `transcript_schools.school_code`,
  also returned by `extension_transcript`) first, then the name word by word with abbreviations expanded (Intl, Sch, Cmp, HS, St...), never a guess between two close names.
  Other portals (2026-10-27): the panel's "Fill for" picker follows the active tab (`extension/src/sites.ts`). STARS
  (both coursework pages), Cal State Apply (High School Coursework, US schools) and UC (Enter courses & grades) get "Add courses", each verified
  on a live test account (plans `web/lib/stars-fill.ts`, `csu-fill.ts`, `uc-fill.ts`); UIUC and UT get the fill assistant (click a box, press a
  value; plans `web/lib/system-fill.ts`). Live DOM facts:
  `docs/superpowers/research/2026-10-27-portal-dom.md`. Portals sign out after ~15-20 min idle (UC also on a second tab); the agent cannot sign in.
- **Data pipeline:** `data/colleges/<slug>.json` (CDS, or an IPEDS/College Scorecard baseline where no CDS was readable)
  + current cycle (tiers, tier_notes, deadlines, English, aid, codes) in `data/cycle_2026_27.json` (original 10 + `_tier_rules`)
  or one file per college in `data/cycle_2026_27/<slug>.json` → `python3 scripts/build_seed.py` (validates, incl. every
  DB enum) → `supabase/seed/10_colleges.sql` (idempotent: deletes + reinserts those colleges).
  - The full seed's leading DELETE cascades to students' `student_colleges` rows. To add NEW colleges, build insert-only:
    `build_seed.py --insert-only --only slug1,slug2 --out file.sql`. To change an existing college, prefer a targeted
    UPDATE patch in `supabase/patches/` over re-seeding it.

## Commands
```bash
cd web && npm install && npm run dev        # http://localhost:3000 (needs web/.env.local = copy of .env.example)
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build   # run all before committing
python3 scripts/build_seed.py               # after editing data/*.json
cd extension && npm test && npx tsc --noEmit && node build.mjs   # Common App filler extension; live check is extension/TESTING.md
cd extension && npm run package   # rebuilds web/public/downloads/common-app-filler.zip (live-site build) after extension changes
cd extension && node build.mjs   # ALSO rebuild dist/ (what the owner loads unpacked in Chrome; package does not touch it)
```

## Rules for this repo
- **Never invent data.** Every number needs an official source (CDS, admissions or financial-aid site), recorded in `sources`.
  If it can't be confirmed, leave it null and note why. Mark estimates as estimates (e.g. GPA percentiles).
- Edit `data/*.json`, not the generated SQL. Keep `scripts/build_seed.py --check` passing.
- Schema changes = a new file in `supabase/migrations/` (next number: **0037**; 0001-0036 are all applied to the project as of 2026-10-27) **and** apply it to the project.
- **Known-red check:** GitHub's "Supabase Preview" fails with "Remote migration versions not found in local migrations directory". Migrations applied
  through the MCP are recorded remotely under timestamp versions (`20261024050323_user_roles`) while the repo uses `00NN_name.sql`, and the two lists also
  differ (remote has `profile_app_essays`, no local file; local has `0006_pg_net_schema`, no remote record). It failed the same way on PR #4 and is not a
  code problem; don't rename migrations or repair history to silence it without the owner deciding to.
- **Supabase MCP quirk:** INSERT/SELECT/DDL via `execute_sql`/`apply_migration` work. UPDATE/DELETE/DROP wait for the
  owner's approval and time out after 60 s if nobody approves. Approve the prompt when it appears, or put the SQL in
  `supabase/patches/` and have the owner run it in the dashboard SQL Editor.
- Tiers: S = top ~5 nationally in the field, A ≈ 6–15, B ≈ 16–40, C ≈ 41–100, D beyond. No tier if there's no undergrad
  program in that field. Always write a reason in `tier_notes`. The **general** tier alone may also use `++`/`+`
  (S++, S+, S, A++, … D+, D; migration 0019, `web/lib/tiers.ts`); subject tiers stay plain S–D.
- Commit messages: conventional style (`feat:`, `fix:`, `data:`, `docs:`).

## Multi-country (started 2026-10-22)
Colleges have `country_code` (US, GB, CA, AU; the UK is "GB"). Students pick **target regions** in the profile (`student_profiles.target_regions`,
first = default region on `/colleges`); the Map/Table page has a US/UK switch (`web/lib/regions.ts`, `web/lib/region-geo.ts`).
UK, Canadian and Australian colleges admit **by course** and are grade-based: set `country_code` in `data/colleges/<slug>.json`, omit SAT/ACT/CDS
fields, and put courses in a `"programs"` array (table `programs`, migrations 0015 + 0035). Per course: `apply_via` (UCAS / OUAC / Direct...),
`a_level_offer`, `ib_offer`/`ib_points`, `ap_offer` (US diploma + AP/SAT/ACT route), `atar` (AU only), `ucas_code` (GB only) and one fee column
in the country's currency (`intl_fee_gbp` / `intl_fee_cad` / `intl_fee_aud`; `build_seed.py` enforces these). Helpers: `web/lib/programs.ts`.
Fit labels only exist for US colleges. General tiers use a **national** scale: UK = Complete University Guide 2027 rank, CA/AU = position among
that country's universities in QS World University Rankings 2027 (S 1-5, A 6-15, B 16-40; ++/+/plain = top/middle/bottom of the band).
Loaded: Oxford, UCL, Edinburgh (2026-10-22); 15 English, 10 Canadian, 10 Australian universities with CS, Economics and Engineering courses
(2026-10-27, brief `docs/superpowers/research/2026-10-27-uk-ca-au-brief.md`). Many fees are 2026-27 values (2027 not published) and say so in
`notes`. Not sourced: Edinburgh fees/stats, Oxford CS fee (page shows £66,580, re-verify).

## Current status (2026-10-26)
Safety waves 1-6 (316 colleges) loaded insert-only; 419 institutions live (416 US + 3 UK); 454 after the 2026-10-27 UK/CA/AU wave (+15 England, +10 Canada, +10 Australia). Both candidate pools are used up
(pool 1 from College Scorecard, pool 2 from local IPEDS HD2024 + ADM2023 + EF2023A). Held: central-arkansas (uca.edu was
unreachable, no sourced data). Skipped: NJCU (merged into Kean, July 2026) and mostly-online schools. Many later-wave schools
are IPEDS baselines (no current CDS). Process, for the next wave: one shared brief, 3 colleges per sonnet agent (the harness
caps concurrent subagents at 20; queue the rest), CDS read as text only (firecrawl credits and the Scorecard demo key ran out;
curl/WebFetch/College Navigator worked). Then: map pins, `setting` and blank international undergrad counts from IPEDS
(LOCALE 1x urban, 2x suburban, 3x/4x rural); missing or percentage-derived admit counts replaced with exact IPEDS ADM2023
figures; computed deadlines removed; a fresh agent spot-checks 6 risky colleges (24 facts) against sources; then
`build_seed.py --insert-only --only ...` split per college, loaded through `execute_sql` by haiku loaders, and a DB-side
per-column fingerprint diff against the local data (loaders retype SQL and do make typos). Known recurring source traps:
domestic deadlines filed as international (Morgan State, Fayetteville State, Coastal Carolina) and CDS PDFs whose columns
must be read by position. Many of these publics admit internationals far
less often than domestic applicants (CDS C1): Arkansas 12%, Oklahoma State 18%, W. Michigan 28%, UNM 29%, K-State 33%, Idaho 34%,
CU Denver 34%, WVU 36%, UNT 41%, Iowa 42%. They stay in the list; `fit.ts` uses the international rate for international students.
Baseline-only (IPEDS) in wave 1: george-mason, louisville, mississippi-state, portland-state, unlv, ut-arlington.

### Status 2026-10-22
100 colleges live in Supabase (row counts verified against the local data). Baseline-only colleges (IPEDS fall 2023,
no CDS SAT total/GPA/ED yet): arizona, brown, cu-boulder, fordham, johns-hopkins, miami, ohio-state, pomona.
UConn has no 2026-27 deadlines (its admissions site was down). New colleges without a short_name show IPEDS names
(e.g. "University of California-Riverside").

### Earlier status (2026-10-20)
Done: schema + RLS, 10 colleges seeded, tier review v1, data gaps patched, web app (list/detail/compare/my colleges/settings),
sign-in + synced list + checklist, reminder function + cron. All SQL patches have been run on the live DB.

**Open issue (Vercel):** the deployed site shows "A server error occurred". Cause confirmed: env vars are missing in Vercel.
Fix: add `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production + Preview), set Root Directory `web`,
then **redeploy** (NEXT_PUBLIC_* are baked in at build time).

Owner still needs to set (Supabase dashboard): Auth Site URL + redirect URLs (`https://<vercel-domain>/**`,
`http://localhost:3000/**`), custom SMTP (Resend), and the reminder function secrets. Details in `LOCAL_SETUP.md` / `DEPLOY.md`.

## Next tasks (suggested order)
1. Help the owner verify the Vercel fix and Google sign-in end to end (Google provider must be enabled in Supabase first; see `DEPLOY.md` §3).
2. Add a friendly error/config page: when env vars are missing, show a clear message instead of the generic error
   (e.g. check in `app/layout.tsx` and add `app/error.tsx`).
3. Transcript mapping gaps (flagged `unverified` in the app). Common App is done: its Subject, Level and Credit lists are official (data catalogs) and its
   Grading Scale list is verified from a live account (A-F, 1-100, 0.0-4.0, 0.0-5.0, 1-7, 1-10, 1-11, 1-20, Other; `web/lib/commonapp-fill.ts`). Still open: UC's exact
   dropdown wording and discipline dropdown, STARS Generic Course Title lists and full Course Level list, UIUC's full Type/Grade lists, UT's levels and terms (behind a login).
   Research with source URLs: `docs/superpowers/research/`.
3b. Fill data gaps: CDS for the 8 baseline-only colleges above, UConn deadlines, short names. Berkeley CDS C7/C9/C11. Its CDS is a multi-tab Google Sheet: download it as .xlsx manually and parse it.
4. Phase 3: bulk-import base rows for all US colleges from College Scorecard / IPEDS (name, location, size, admit rate,
   SAT ranges, cost), marked as such. CDS details can then be added school by school.

## Competitor research & feature roadmap
`docs/competitor-analysis-and-roadmap.md` (2026-10-25) compares us with Xello, SchooLinks, OverGrad, Unifrog, BridgeU, Cialfo, FolderWave,
MaiaLearning, Naviance and Parchment, and holds a prioritized feature roadmap with effort estimates and a status column. Read it before
planning new features, and update the status column when an item lands.
