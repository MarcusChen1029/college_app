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
per-college status in `docs/superpowers/research/2026-10-26-safety-college-candidates.md`), plus 123 popular colleges that were
still missing, added 2026-11-03 (big flagships such as Alabama, LSU, NC State; Illinois Tech, BYU, Baylor; 45 top liberal-arts
colleges; brief `docs/superpowers/research/2026-11-03-popular-colleges-brief.md`).
Plan: all US colleges next, then UK/CA/AU.

## Stack & services
- **Supabase** project `college-tracker`, ref `eyvmtaggayqizllaseiu` (ap-northeast-1). Org is on the free plan.
  - URL `https://eyvmtaggayqizllaseiu.supabase.co`, publishable key in `web/.env.example` (safe to expose).
  - Reference tables: public read-only via RLS. `student_profiles` / `student_colleges` / `reminder_log`: per-user RLS (tested).
  - View `college_summary` (security_invoker) feeds the list/compare pages.
  - Edge Function `deadline-reminders` + pg_cron job `deadline-reminders` (14:07 UTC daily). Auth via
    `x-cron-secret` header checked by `public.check_cron_secret()` against `private.app_config`.
    Sends via Resend; **dry-run until secrets `RESEND_API_KEY`, `REMINDER_FROM`, `APP_URL` are set.**
    The same function also sends scholarship reminders (0027), the opt-in weekly teacher digest (0029, `supabase/functions/_shared/teacher-digest.ts`) and, from 0051, the opt-in
    weekly student summary (`_shared/student-digest.ts`, see "AI for students"); version 6 deployed 2026-11-03 (after 0051; dry run returned 200 with no errors). Version 7 (UK/CA/AU checklists and course deadlines; its deadlines select names `program_id, intake`, so deploy it only after the UK/CA/AU migration) needs six files: `deadline-reminders/index.ts` + `_shared/fafsa.ts`, `pass.ts`, `teacher-digest.ts`, `student-digest.ts`, `application-steps.json` (verify_jwt off). Version 7 was deployed 2026-11-05 (after 0054) with the Supabase CLI: `npx supabase@3.0.0 functions deploy deadline-reminders --remote=eyvmtaggayqizllaseiu --no-verify-jwt --use-api` (the MCP deploy can't carry the 131 KB JSON); a dry-run invoke returned 200 with no errors.
    Deploy these files (verify_jwt off): `deadline-reminders/index.ts` + `_shared/fafsa.ts`, `_shared/pass.ts`, `_shared/teacher-digest.ts`, `_shared/student-digest.ts`, `_shared/application-steps.json` (kept equal to `web/lib/data/application-steps.json` by `build_application_steps.py`). No `deno` on the dev machine: type-check with a
    stub tsconfig (`Deno` global declared, `npm:@supabase/supabase-js@2.118.0` mapped to `web/node_modules`) and run the logic through `web/lib/student-digest.test.ts`.
- **web/**: Next.js **16** (App Router, `cacheComponents: true`), React 19, Tailwind 4, supabase-js 2.118.
  **Next 16 has breaking changes. Read `web/node_modules/next/dist/docs/` before writing Next code** (see `web/AGENTS.md`).
  - Server data reads are in `web/lib/data.ts`: `await connection()` then a `"use cache"` + `cacheLife("hours")` function.
    Builds never touch Supabase; pages wrap data in `<Suspense>`.
  - Student state: `web/lib/student-store.ts` (`useSyncExternalStore`). localStorage when signed out, Supabase when
    signed in (Google OAuth via Supabase, PKCE, client-side only, no proxy/middleware). Local data joins the account at sign-in only when the student
    says so (sign-in dialog), and only as many local colleges as the plan has room for; the dialog never offers, sends or deletes kept colleges (and
    their passwords) or passwords already agreed to move into the vault (`MOVE_KEY`). Rules and tests: `web/lib/sign-in-merge.ts`.
  - Activities (`student_profiles.activities`) are stored in the 2026-27 portal format, `"version": 2` (spec `docs/superpowers/specs/2026-10-28-activities-filler-design.md`).
    `upgradeActivities` in `web/lib/activities.ts` reads any older shape; migration 0038's `public.activities_v2(jsonb)` is its SQL twin (backfill +
    `portfolio_view`). Change one, change both: `node scripts/check_activities_sql.mjs --generate` rebuilds the parity patch
    `supabase/patches/2026-10-28-activities-v2-parity.sql` (fixtures `web/lib/fixtures/activities-v1.json` -> `activities-v2.json`); run it in one
    `execute_sql`, save the rows, then `node scripts/check_activities_sql.mjs <rows.json>` must exit 0. Script tests: `node --test scripts/check_activities_sql.test.mjs`.
  - Google Docs (Materials > Essays page, `/materials/essays`, one-click "+ New Google Doc"): `web/app/api/google/*` + `web/lib/google-docs.ts` / `google-server.ts`.
    Needs server env vars `GOOGLE_DOCS_CLIENT_ID`, `GOOGLE_DOCS_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
    `GOOGLE_TOKEN_ENCRYPTION_KEY` (base64, 32 bytes) and migration 0016 (`google_tokens`, applied).
    Without them the page keeps the docs.new + paste-link flow.
  - Roles (migration 0020, plan in `docs/superpowers/specs/2026-10-24-teacher-counselor-design.md`): each account is a `student` or a `teacher`,
    chosen once at `/welcome` via RPC `set_my_role` (tables `user_roles`, `teacher_profiles`; existing users were backfilled as students).
    `student-store.ts` loads the role first and only students load/merge list data. `RoleGate` redirects, `SiteNav` swaps the nav, `/teacher` is the
    teacher home. Teachers must never get SELECT on student tables (saved-login links and usernames live in them); later phases read through SECURITY DEFINER RPCs.
  - Linking (migration 0021): teachers make `classes` and `join_codes` (class code, or one personal "individual" code); a student redeems a code via
    `preview_code`/`redeem_code` (failures are returned as `{ok:false}`, not raised, so the 10/hour rate limit sticks) which creates a `teacher_links`
    row (the access grant later phases check) and a `class_members` row. All writes go through SECURITY DEFINER RPCs; client wrappers are in `web/lib/links-api.ts`.
  - Navigation (UX redesign phase 2): nav model in `web/lib/roles.ts` (`navFor`/`accountMenuFor`/`startedFrom`); sign-in is a dialog opened with `openSignIn()`;
    account, reminders and the role switch live at `/settings` (old `/account` and `#account` redirect); Essays, Activities and Transcript are under **Materials** (`/materials/*`, renamed from Writing 2026-11-03; old `/writing/*` and `/application/transcript` redirect); the Résumé generator moved to the **Tools** page (`/tools`, `/tools/resume`; `/resume` and `/writing/resume` redirect), which also offers the Common App filler download (Beta).
  - Switching role (migration 0025): `RoleSwitcher` (Settings page for students, dashboard for teachers) calls RPC `change_my_role`. It is refused while the
    account has links (a student must leave their teachers, a teacher must remove their students); leaving teacher mode revokes all join codes and archives
    classes. The other side's data is kept so switching back restores it.
  - Teacher read access (migrations 0022/0023): teachers read students only through `teacher_roster(p_today)`, `teacher_student(id, p_today)`,
    `teacher_deadlines(days, p_today)`; they return an explicit column list (never `portals`, `portal_*`, `notes`, `resume`, aid offers; essay titles/links
    are stripped when the student's `share_essays` is off). The client sends its local date as `p_today`. Flags/progress are computed in `web/lib/roster.ts`;
    teacher pages are `/teacher`, `/teacher/students` (`?s=<id>` for detail), `/teacher/deadlines`.
  - Teacher notes (migration 0024): `teacher_notes` are private to the author (RLS) and tied to the teacher<->student link by a composite FK, so they are
    deleted when the link ends. The roster CSV (`web/lib/roster-export.ts`, `csv.ts`) neutralises spreadsheet formulas in student-controlled text and
    exports only the rows shown. Teacher accounts (Phases 1-4) are done, including class/private tasks (0028) and the opt-in weekly digest (0029);
    idea not built: verified-school badges.
  - Classroom, both ways (phase 1, 2026-11-03; migration 0052 applied to the project 2026-11-04 (dry run + smoke test passed), merged as PR #105 without the signed-in live check; spec
    `docs/superpowers/specs/2026-11-03-classroom-two-way-design.md`, plan `docs/superpowers/plans/2026-11-03-classroom-phase1.md`, SQL smoke test
    `supabase/patches/2026-11-03_classroom_smoke_test.sql`; phases 2-5 are specified only). Same access pattern as 0028/0041: new tables have RLS on, no policy,
    no grant; everything goes through SECURITY DEFINER RPCs that start with `refuse_oauth_client()`; wrappers `web/lib/classroom-api.ts`, limits mirrored in `web/lib/classroom.ts`.
    The signed-in live check (spec §12) has still not been run.
  - Classroom restyle (2026-11-04; spec `docs/superpowers/specs/2026-11-04-classroom-google-style-design.md`, plan `docs/superpowers/plans/2026-11-04-classroom-google-style.md`): students see class cards on `/counselor`, then
    `/counselor/class/<id>?tab=` (stream, classwork, people), `/counselor/teacher/<id>` (1-on-1 page), `/counselor/task/<id>` and `/counselor/todo`; teachers get a class grid at `/teacher/classes` and `/teacher/classes/<id>`.
    Migration 0053 (`0053_classroom_gc`, applied 2026-11-04 as version 20261104042007; owner-run dry run + smoke test passed) adds task topics, a done note and link per completion and class banner themes; smoke test `supabase/patches/2026-11-04_classroom_gc_smoke_test.sql`.
    Pure logic in `web/lib/classwork.ts`, `class-theme.ts`, `classes-home.ts`, `class-page.ts`, `teacher-class.ts`; components in `web/components/classroom/gc/`. Signed-in screens have not been browser-checked.
  - Conversations (`conversations`, `conversation_messages`): one teacher + one linked student, general or about one item (one per item per pair), no read
    receipts, delete-own-message. Student: `/counselor` (class and 1-on-1 cards; the class, 1-on-1 and task pages hold announcements, tasks, comments, "what they can see", Leave class / Leave teacher;
    `?c=<id>` still opens a conversation). Teacher: `/teacher/messages` (Conversations + Announcements tabs), the student-detail Messages / Tasks / Notes tabs, and a
    "Replies waiting" tally on Home. Charts is now a tab of the Students page (`/teacher/charts` still exists).
  - Anchors and jump links: kind + ref (`web/lib/anchors.ts`: general, section, college, essay, activity, profile, task) on conversations, private notes
    (`teacher_notes.anchor_kind/_ref`, still written directly under RLS, format CHECK only) and private one-student tasks (`teacher_tasks.anchor_*` + saved label).
    `anchor_visible()` checks an anchor before a comment/task is saved and sets `anchor_available`; the teacher's label turns generic when the item stops being shared.
    Pages mark items `data-focus="<kind>:<ref>"`; `?focus=` (`web/components/classroom/useFocusTarget.ts`) scrolls to and highlights it, so the chips on a note,
    comment or task jump to the item on both sides (`/teacher/students?s=<id>&tab=<tab>&focus=...`). The item menu offers Comment / Private note / Assign a task.
  - Announcements (`class_posts`, `post_reads`): a teacher posts to one class or all students; students get unread dots, the teacher sees "Read by X of Y" and who hasn't.
    Invite links `/join#ABCD2345` keep the code in the URL fragment (never in server logs) and in sessionStorage across sign-in and `/welcome`
    (`web/lib/join-invite.ts`, `components/classroom/JoinInvite.tsx`); teachers also get Show on screen, Rename class and a name/school form in Settings.
    Leave class keeps the link; Leave teacher deletes the pair's conversations, read marks, notes and private tasks for both sides.
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
  - Legal pages (2026-10-29, DRAFT, not lawyer-reviewed): `/privacy`, `/terms`, `/security`, `/contact`, linked from the footer and from the consent line under
    every Google sign-in button. Text in `web/lib/i18n/messages/{privacy,security,legal}.ts` (each privacy item names its table in a comment; full map
    `docs/legal/2026-10-29-privacy-data-map.md`); operator name, contact email and "last updated" date in `web/lib/legal.ts` (name/email still null).
    The pages describe what the code does: when data handling changes (new table, teacher RPC field, AI tool, encryption), update them and `LEGAL_UPDATED`.
    Hashed tokens, one active link per kind; pure code in `web/lib/share-links.ts`, wrappers in `share-api.ts`.
  - Colors and buttons (UX redesign, spec `docs/superpowers/specs/2026-10-24-ux-redesign-design.md`; phases 0-1 done, 2-6 next):
    status tones in `web/lib/status.ts` (urgent ≤7 days, soon ≤21, done = application deadline submitted), classes in `web/lib/ui.ts`
    (`toneClass`, `fitClass`, `tierClass`, `buttonClass`), tokens in `globals.css`, components `StatusPill`/`DeadlineChip`/`FitBadge`/`TierBadge`.
    Never write raw red/amber/green/rose/emerald classes, and never leave `bg-white`/`border-zinc-*` next to a tone or button class
    (Tailwind stylesheet order wins). No dark mode.
  - Fit labels: `web/lib/fit.ts` (uses the international admit rate when the student is international). GPA percentile estimate: `web/lib/gpa.ts`.
- **Transcript** (migration 0030, applied; spec `docs/superpowers/specs/2026-10-26-transcript-design.md`, plan `docs/superpowers/plans/2026-10-26-transcript.md`):
  one standardized coursework record per student at `/materials/transcript` (tabs Edit / Import / View as). Tables `transcript_schools` and `transcript_courses`
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
  the student approves it at `/extension/connect`, which mints a **scoped token** (migration 0031, table `extension_tokens`, applied; students revoke it under Settings > Connected extensions, then Fill says "Sign in again"). Migration 0039 adds `scopes` (default `{transcript}`; new tokens get `{transcript,activities}`) and `extension_activities(p_token)` (v2 Common App + UC activities only; an old token gets `no_scope` and the panel says "Reconnect to allow activities").
  **Never test fills on the owner's real Common App account.** Use the throwaway test account (Purdue, nothing submitted) in a separate Chrome profile signed in only to it.
  The live end-to-end run has not been done yet: follow `extension/TESTING.md`.
  Schools are matched to the portal's school by `web/lib/school-match.ts`: the optional school code (CEEB, migration 0034 `transcript_schools.school_code`,
  also returned by `extension_transcript`) first, then the name word by word with abbreviations expanded (Intl, Sch, Cmp, HS, St...), never a guess between two close names.
  Other portals (2026-10-27): the panel's "Fill for" picker follows the active tab (`extension/src/sites.ts`). STARS
  (both coursework pages), Cal State Apply (High School Coursework, US schools) and UC (Enter courses & grades) get "Add courses", each verified
  on a live test account (plans `web/lib/stars-fill.ts`, `csu-fill.ts`, `uc-fill.ts`). UIUC's SRAR (myIllini, Courses Years 9-11 / Year 12)
  also gets "Add courses" (2026-10-28; plan `web/lib/uiuc-fill.ts`, one row per term grade; `extension/src/uiuc/*`): it adds rows with Add Course,
  presses Save Progress and never touches Submit (`#btn_submit` is the FINAL submit on /Preview; a unit test guards it), Education or Other
  Academic; page alerts are caught by a MAIN-world hook (`src/uiuc-main.ts`). Built from the live DOM facts in portal-dom.md §5 but not yet run
  end to end. UT gets the fill assistant (click a box, press a value; plans `web/lib/system-fill.ts`). Live DOM facts:
  `docs/superpowers/research/2026-10-27-portal-dom.md`. Portals sign out after ~15-20 min idle (UC also on a second tab); the agent cannot sign in.
  Activities filler (2026-10-28/29, spec `docs/superpowers/specs/2026-10-28-activities-filler-design.md`; needs a token with activities access, older
  transcript-only tokens get "Reconnect"): fills Common App Activities / Honors (`src/activities-flow.ts`, plans `web/lib/activities-fill.ts`) and UC's
  Activities & awards list (`src/uc/activities-run.ts` across page loads, `src/uc/activities.ts` page side, plans `web/lib/uc-activities-fill.ts`), with
  one shared question / toggle list / report (`src/activities-panel.ts`). Owner's rule: empty page = add all; entries = ask "replace all?", No = pick
  up to the room (CA 10/5, UC 20). Every save is read back. Never presses UC's `#no_activities`, Common App's Responsibilities page or any submit.
  UC was built from portal-dom.md §7; its live run is `extension/TESTING.md` §J (Common App §I).
- **Payments** (2026-10-29; spec `docs/superpowers/specs/2026-10-29-payments-design.md`, plan `docs/superpowers/plans/2026-10-29-payments.md`): Free = 5 colleges; the only
  paid product is the NT$990 **admission-year pass** (TWD, one payment, ECPay 綠界), valid from its start to July 31 of the entry year the student picks. The plan is decided by
  the server only. Edge Function `payments` (verify_jwt off; routes `/status`, `/checkout`, `/pay-links...`, `/notify`; code in `supabase/functions/_shared/payments-*.ts` + `ecpay.ts`,
  unit-tested from `web/lib/payments-*.test.ts`); web: `lib/plans.ts` (effective plan from `plan_windows`), `/pricing`, the parent page `/share/pay/<token>`, payment history in Settings.
  Tables `plan_orders`, `pay_links`, `private.payment_testers`; `student_profiles.plan_windows` is written only by the server (trigger `guard_plan_columns` resets client writes), and
  **the paid DB key stays `senior`** (only the display name changed). Migration **0045** (payments) is applied first, before the web deploy; **0046** (`enforce_plan_limit`, the server-side 5-college cap) only after the
  new web code is live, because the old client's first-sign-in merge aborts on any insert error (both are applied live now). Function secrets: `ECPAY_MODE` (`stage` unless `production`), `ECPAY_MERCHANT_ID`,
  `ECPAY_HASH_KEY`, `ECPAY_HASH_IV` (production only), optional `APP_ORIGINS`. Stage mode uses ECPay's public stage merchant and lets only users in `private.payment_testers` check out
  (the database is the live one); everyone else sees "Payment opens soon". Refunds are manual: refund in the ECPay back office, then run `supabase/patches/refund-order.sql`
  (`refund_order`; its `payments_needing_review` view lists double payments). Order records are kept up to 5 years (there is no purge job yet) and anonymized on account deletion.
  Smoke test: `supabase/patches/2026-10-29_payments_smoke_test.sql`. `OPERATOR_NAME` / `CONTACT_EMAIL` in `web/lib/legal.ts` are still null: fill them before payments open.
  Counselor / school plan is roadmap item 15 only.
- **AI for students = bring your own AI** (2026-11-02; spec `docs/superpowers/specs/2026-11-02-ai-subscribers-design.md`, llm-council verdict: **no in-app AI, no server-side LLM calls**;
  roadmap #9 is replaced by this). Home "AI guesses. We cite the source." section: `web/components/home/AskYourAi.tsx` + `AiChatDemo.tsx` (example chat; settles to its final state under reduced motion).
  - Prompt packs ("Copy for AI"): `web/lib/ai-prompts.ts` + `web/components/AiPromptPack.tsx`, on My list (`/application/list#ai`) and `/connect-ai`; Free users get a preview of the pass-only
    prompts. The same prompts are offered inside the AI app as MCP prompts (`web/lib/mcp/prompts.ts`, static text, no student data).
  - `/connect-ai` explains itself to everyone: sourced plan table `web/lib/ai-plans.ts` (checked 2026-11-02; research `docs/superpowers/research/2026-11-02-ai-connector-plans.md`; re-check the plans
    before they go stale) and a data-and-age note.
  - Freshness: college pages show "Last checked {date} · n sources" (`web/lib/freshness.ts`: `lastChecked`, `listedSources` = DB sources + supplement sources); public `/data-updates` renders
    `web/lib/data/refresh-log.json` through `web/lib/refresh-log.ts`.
  - Free public read-only connector `/public/mcp` (`web/app/public/mcp/route.ts`, tools `search_colleges` + `get_college` in `web/lib/mcp/public-tools.ts`, shared formatting `web/lib/mcp/college-format.ts`)
    and `/llms.txt` (`web/app/llms.txt/route.ts`). The owner's directory-submission steps: `docs/ai-directories.md`. The public route answers 429 past 60 requests / 10 min / address and refuses, before the SDK sees them,
    JSON-RPC batches, `subscriptions/listen` (a never-ending stream), bodies over 4 MiB (413) and non-JSON bodies (the SDK's 415); the pure checks are in `web/lib/jsonrpc-batch.ts`.
  - Private MCP tool `get_weekly_changes` (`web/lib/weekly-changes.ts`, pure): colleges updated in the window, deadlines due in 14 days with the checklist items still missing, overdue ones
    (a college with an undecided plan is overdue only when no round is left; a rolling round with no date counts as still open), listed colleges whose data was refreshed, site updates. The tracker keeps no history, so it reports current values only;
    `ai_student_colleges` now exposes `updated_at` for it (`AI_COLLEGE_COLUMNS`). **`getDeadlines()` has no cycle filter:** when a second admissions cycle is loaded, filter the deadlines by cycle
    before `get_weekly_changes` reads them, or it will report the old cycle's dates as overdue. The weekly student email (below) reads every cycle too: filter it in `sendStudentDigests` at the same time.
  - Weekly student summary email (PR 2, spec section 7; live 2026-11-03, function version 6): `student_profiles.weekly_digest` (0051, off by default) is switched in Settings > reminders (`WeeklyDigestToggle`, `setWeeklyDigest` in `student-store.ts`, which
    writes that one column through `weeklyDigestRow`; `fromProfile`, the signed-out copy and every Connect AI path never touch it, and the AI profile patch refuses it). The daily `deadline-reminders` run asks `due_student_digests(<Taipei today>)`
    and, for each student returned, builds the digest with `_shared/student-digest.ts`, a Deno twin of `buildWeeklyChanges` (updated this week, due in 14 days, overdue, data re-checked from `sources.accessed_on`; no site-update titles) that
    `web/lib/student-digest-parity.test.ts` runs against the web code on shared fixtures plus 600 seeded random cases: change both together. English only. Dry run without `RESEND_API_KEY` or `APP_URL`, never a log row in a dry run; the
    `student_digest_log` row is written after an accepted send with the `week_start` the database returned; an empty digest sends and logs nothing (like the teacher digest), so the student is looked at again the next day. A failure is reported in
    the response (`studentDigestError`, per-student `studentDigests`) and never breaks the reminders or the teacher digest. On the privacy page (`privacy.collect.weekly`) and the data map.
  - Connect AI free trial (PR 2, spec section 4): a Free student can connect (consent page, personal address and a trial box on `/connect-ai`), call every read tool and make `AI_TRIAL_WRITES` (3) successful changes. The database counts them
    (migration 0051: table `ai_trial_usage`, RPCs `ai_trial_writes_left()` / `consume_ai_trial_write()`; the 3 is a literal in both, `mcp-rules.test.ts` keeps it equal to `AI_TRIAL_WRITES` in `web/lib/connect-ai.ts`). In `web/lib/mcp/tools.ts`
    `guarded(handler, { read: true })` marks a read-only tool and **every tool without it counts as a write** (fail closed; `mcp-trial-guard.test.ts` checks the split against the source), so a new tool must say `{ read: true }` only if it never changes anything.
    A write spends one change only after it succeeded without `isError` (`trialDecision` / `trialAfterWrite` / `trialNote` in `web/lib/mcp/rules.ts`; a result registered in `unchanged` spends none) and a landed write is never turned into an error;
    every Free trial write result, spent or not (refused, failed, nothing changed), ends with a "Free trial: n changes left" block (`addNote`, which never changes `isError`). **Student accounts only:** both RPCs look the caller up in `user_roles`
    (not `is_role()`, which is false for OAuth clients) and answer NULL / -1 for a teacher (who keeps a profile row after `change_my_role`) or an account with no role row, so the MCP server blocks it as before the trial. Without the two RPCs (0051 not applied)
    Free stays fully blocked, as before the trial. Website: `useAiTrial` (`web/lib/use-ai-trial.ts`) feeds the trial box on `/connect-ai` and the consent page; if the counter can't be read both fall back to the pass-only view. Free `get_context_pack` is the Free-level pack
    (no activities, no college details). The trial is on the privacy page (`privacy.ai.trial`) and the data map.
  - Live since 2026-11-03: 0051 applied (function bodies checked against the file by md5), PR #99 merged, `deadline-reminders` version 6 deployed. Not yet seen end to end: a real Free student's
    trial (approve + 3 changes) and a real weekly email (nobody had opted in).
- **Data pipeline:** `data/colleges/<slug>.json` (CDS, or an IPEDS/College Scorecard baseline where no CDS was readable)
  + current cycle (tiers, tier_notes, deadlines, English, aid, codes) in `data/cycle_2026_27.json` (original 10 + `_tier_rules`)
  or one file per college in `data/cycle_2026_27/<slug>.json` → `python3 scripts/build_seed.py` (validates, incl. every
  DB enum) → `supabase/seed/10_colleges.sql` (idempotent: deletes + reinserts those colleges).
  - The full seed's leading DELETE cascades to students' `student_colleges` rows. To add NEW colleges, build insert-only:
    `build_seed.py --insert-only --only slug1,slug2 --out file.sql`. To change an existing college, prefer a targeted
    UPDATE patch in `supabase/patches/` over re-seeding it.
  - **Every data load adds an entry to `web/lib/data/refresh-log.json`** (newest first; `date`, `en` + `zh` each with `title` + `summary`, and `count` only where a number is stated; facts only, no promises, nothing this file doesn't state). It feeds
    `/data-updates` and the `get_weekly_changes` tool's site-updates list; `web/lib/refresh-log.test.ts` checks shape, order and text.
  - **UK / Canada / Australia extra steps** (2026-11-04): one file per non-US university in `data/application_steps_2026_27/<slug>.json` (`researched: false` until its steps are checked against official pages; every step needs a source URL and `verified_on`) -> `python -I scripts/build_application_steps.py` (validates; `--check` verifies both outputs) -> `web/lib/data/application-steps.json` and an identical copy for the edge function, read through `web/lib/application-steps.ts`.

## Commands
```bash
cd web && npm install && npm run dev        # http://localhost:3000 (needs web/.env.local = copy of .env.example)
cd web && npx tsc --noEmit && npm run lint && npm test && npm run build   # run all before committing
python3 scripts/build_seed.py               # after editing data/*.json
cd extension && npm test && npx tsc --noEmit && node build.mjs   # Common App filler extension; live check is extension/TESTING.md
cd extension && npm run package   # rebuilds web/public/downloads/common-app-filler.zip (live-site build) after extension changes
cd extension && node build.mjs   # ALSO rebuild dist/ (what the owner loads unpacked in Chrome; package does not touch it)
python -I scripts/build_application_steps.py [--check]   # data/application_steps_2026_27/*.json -> web/lib/data/application-steps.json + supabase/functions/_shared/application-steps.json
```

## Rules for this repo
- **Never invent data.** Every number needs an official source (CDS, admissions or financial-aid site), recorded in `sources`.
  If it can't be confirmed, leave it null and note why. Mark estimates as estimates (e.g. GPA percentiles).
- Edit `data/*.json`, not the generated SQL. Keep `scripts/build_seed.py --check` passing.
- **Display names:** the site shows `short_name ?? name`. Use the college's own common name ("Penn State", "Central Michigan", "UT Austin"), never a
  bare acronym that another school could share (CMU, UWA, NSU, UK...). `--check` fails on duplicate display names (case-insensitive) or one equal to a region code.
  The 2026-10-27 rename went out as `supabase/patches/2026-10-27-short-names.sql` (old -> new list in its header).
- Schema changes = a new file in `supabase/migrations/` (next number: **0055**; 0054 = `0054_uk_ca_au_steps`, deadlines.program_id / intake plus course-aware `upcoming_deadlines_for`, `due_reminders`, `parent_view` and `college_summary`, applied 2026-11-05 through the MCP (dry run + smoke test passed in the SQL Editor, function bodies md5-checked against the file); 0053 = `0053_classroom_gc`, the Google-style classroom restyle (see **Classroom restyle** above), applied 2026-11-04 (recorded as version 20261104042007); 0052 = `0052_classroom`, the classroom phase 1 tables and anchors (see **Classroom, both ways** above), applied 2026-11-04 (recorded as version 20261104002656); 0051 = `0051_ai_trial_and_weekly`, the Connect AI free-trial counter (`ai_trial_usage` + two RPCs + their two paths in `api_request_guard`) and the weekly student email opt-in (`weekly_digest`, `student_digest_log`, `due_student_digests`), written 2026-11-02, applied live 2026-11-03 before PR 2's web code (the profile select still falls back when `weekly_digest` is missing); 0049-0050 are already used; 0048 = `0048_vault_e1_only`, drops `portal_vault_meta` and allows only browser-locked `e1.` values in `portal_passwords` (written 2026-10-30, apply it AFTER the code that removes the v1 handover is deployed); 0047 = `0047_portal_vaults`, the browser-locked portal password vaults (see **Security model**), applied live 2026-10-30; 0045-0046 = `0045_payments` and `0046_plan_limit`, the payments migrations, both applied live (see **Payments**); 0044 = no default table grants (after it is applied); 0001-0038 are applied (0038 = activities v2); 0039 = extension activities access (branch feat/activities-v2, applied live 2026-10-28; 0041 hardens its two-argument create_extension_token); 0040-0043 are the 2026-10-28 security fixes, rollout order in `docs/superpowers/plans/2026-10-28-portal-password-encryption.md`) **and** apply it to the project.
  Since 0041 a new function in `public` gets no EXECUTE for anon/authenticated/PUBLIC, so grant each one explicitly to the roles that call it. Since 0044 the same holds for new tables and sequences: grant what clients need explicitly (and keep RLS on).
- **Security model (2026-10-28 audit, reports in the session scratchpad; summary in `docs/security-2026-10-28.md`):** portal passwords live only in
  `portal_passwords` (service-role only, served by `/api/portal-passwords`), never in profile/list rows or localStorage. Since 2026-10-29 they are
  **locked in the student's browser** with their vault passphrase (plus a recovery code; `web/lib/vault-*.ts`; `portal_passwords` holds "e1."
  values only (browser-locked ciphertext; migration 0048 makes the table refuse anything else), `portal_vaults` the wrapped keys and
  salts; migration 0047; design `docs/superpowers/specs/2026-10-29-e2e-portal-vault-design.md`), so the server, the database and the site owner
  can't open them. The old server-sealed "v1." path (the handover action, the server key `PORTAL_ENCRYPTION_KEY`, table `portal_vault_meta`) was removed on 2026-10-30
  after the last student's rows were handed over (0 "v1." rows live); that key can be deleted from Vercel once this is deployed (`DEPLOY.md`). `tokenSource`/`bearerToken`
  live in `web/lib/request-token.ts`. The Security and Privacy pages state
  the limits (offline guessing of weak passphrases; a changed version of the site's own code). AI-connection (MCP OAuth) tokens carry `client_id`: the `api_request_guard` pre-request hook lets them reach only
  the views `ai_student_profiles`/`ai_student_colleges` (no portals, portal_url/portal_username, reminder or essay columns) and transcript_*;
  after 0043 never the base student_profiles/student_colleges, so saved-login usernames and links are out of their reach too.
  Every RPC except the two trial-counter functions (`ai_trial_writes_left`, `consume_ai_trial_write`, 0051), the password route, the Google routes and account deletion refuse them. Every page
  sends a CSP (`web/lib/security-headers.ts`): a new third-party host the browser must reach needs adding there. Accounts are deleted at
  Settings > Delete account (`/api/account/delete`; every table cascades from auth.users).
- **AI connector containment (0041, 0043):** an OAuth token (JWT with a `client_id` claim, used by `web/lib/mcp/tools.ts`) may only use the views
  `ai_student_profiles` / `ai_student_colleges` and `transcript_schools` / `transcript_courses` (pre-request hook `api_request_guard`; 0041 still
  allows the base student tables for the old MCP code, 0043 removes them and adds a restrictive `no_oauth_clients` policy on both), only the
  columns/operations in `guard_oauth_student_writes`, and exactly two RPCs: `ai_trial_writes_left` and `consume_ai_trial_write` (migration 0051 redefines `api_request_guard` with those two `rpc/` paths added;
  `mcp-trial-guard.test.ts` checks that `tools.ts` calls only those and that the hook lists only those). The views are security-definer on purpose (owner postgres; isolation = their
  `user_id = auth.uid()` WHERE + `with local check option`); their columns equal `AI_PROFILE_COLUMNS` / `AI_COLLEGE_COLUMNS` in
  `web/lib/student-rows.ts` (`ai-views.test.ts` checks it). A new MCP tool that needs more must widen the hook, the trigger and the views in a migration.
  Smoke test (0041 state): `supabase/patches/2026-10-28_security_hardening_smoke_test.sql`; 0043 state: `2026-10-28_forbid_plaintext_dry_run.sql`.
- **Public connector containment (`/public/mcp`):** no sign-in and no OAuth wrapper (it never sends `WWW-Authenticate`; the `.well-known` metadata names `/mcp` only), and it touches **no student data**: its tools
  call only the public reference-data reads in `web/lib/data.ts` (`getSummaries`, `getCollege`, `getLookups`), never a student table or token. Abuse limits: 60 requests / 10 min per client address (first `x-forwarded-for` hop, 64 chars max) in this instance's memory
  (`web/lib/rate-limit.ts`; best-effort, a restart or another instance resets it), JSON-RPC batches are rejected (`web/lib/jsonrpc-batch.ts`: one POST must be one unit of the limit), and every link
  in an answer uses `SITE_ORIGIN`, never the request's host. College text it quotes is treated as data, not instructions (route `instructions`). `/public/mcp` is in `ROBOTS_DISALLOW` (`web/lib/seo.ts`).
  A new public tool must stay read-only and student-free; anything that reads a student's rows belongs on the private `/mcp` server.
- **Bulk reads page past the API's 1000-row cap** (`allRows` in `web/lib/data.ts`): deadlines, English requirements and score codes are already over it. Any new whole-table read goes through `allRows` with an order on a unique key.
- **Application systems per college** (Portals page, spec `docs/superpowers/specs/2026-10-28-portal-progress-design.md`): `data/application_systems_2026_27.json`
  (researched member lists with official sources: ApplyTexas, Cal State Apply, STARS = former SRAR, UCAS, OUAC, EducationPlannerBC) merged with
  `requirements.platforms` -> `python -I scripts/build_application_systems.py` (`--check` verifies) -> `web/lib/data/application-systems.json`.
  Every college gets exactly one `route` (Common App > Coalition > UC > Cal State Apply > ApplyTexas > UCAS > OUAC > EducationPlannerBC > ... > direct;
  spec `docs/superpowers/specs/2026-10-28-apply-groups-design.md`). **My list** is grouped by route, with the shared login in each group header;
  **Portals** holds only submitted colleges' portals and other accounts (tests, aid, visas, STARS). Done / Not done marks live in `profile.portals.progress`.
  STARS is an account on Portals and the `checklist.stars` item (never counted in progress/Ready) on the 18 colleges that require it; marking the
  account Done ticks them all (`useStarsSync`). Common App membership beyond `requirements.platforms` comes from commonapp.org/explore (86 added 2026-10-28).
- **Supplemental essays + international finance steps** (2026-27): one researched file per college in `data/supplements_2026_27/<file>.json` (contract and source rules:
  `docs/superpowers/research/2026-10-27-supplements-brief.md`; files are named after `data/colleges/` file names, output is keyed by the inner slug, e.g. cmu.json -> carnegie-mellon)
  -> `python -I scripts/build_supplements.py` (validates; `--check` verifies) -> `web/lib/data/supplements.json`, read through `web/lib/supplements.ts`. 102 popular US colleges
  are covered; "unknown"/not researched must never read as "no essays". Graduation rate and earnings: `scripts/build_outcomes.py` -> `web/lib/data/outcomes.json` (College Scorecard bulk files).
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
My list warns (`web/lib/uk-choices.ts`) when more than 5 UK universities are past "researching" and not withdrawn (UCAS limit), and when Oxford and Cambridge are both active (rule source and date next to `OXBRIDGE_RULE_SOURCE`). The 4-choice limit for medicine, dentistry and veterinary courses is not built: the data holds only 2 such courses (one course per university), so it can never fire; add it when more such courses are loaded.
UK / Canada / Australia applications, part 1 (live 2026-11-05; design `docs/superpowers/specs/2026-11-04-uk-ca-au-applications-design.md`, plan `docs/superpowers/plans/2026-11-04-uk-ca-au-part1-application-steps.md`): each country's own checklist (`web/lib/checklist.ts`; US pinned by `checklist-us-pin.test.ts`), a course (and Australian intake) picker whose deadline wins in rows, chips, reminders, the weekly email and teacher views (`web/lib/course-deadlines.ts`, mirrored in migration 0054 and `_shared/student-digest.ts`), the UK personal statement and reference copied into each UK college like STARS (`useUcasSync`), the UCAS personal statement with a browser-only character checker (Materials > Essays) and the teacher brief (Recommenders). 2027-entry deadlines and extra steps for the 38 universities were loaded 2026-11-05 (`supabase/patches/2026-11-05-uk-ca-au-deadlines.sql`, `2026-11-05-calgary-course-deadlines.sql`, `2026-11-05-leeds-note.sql`; the after-fingerprint matched all 201 rows). The Leeds note fix sets one row to its `2026-10-30-student-facing-notes.sql` wording; the rest of that patch is still unapplied. A cycle-file deadline row of any kind can name one course (`"course": "<programs slug>"` -> `program_id`; no plan; `build_seed.py` inserts it after programs for the composite FK): UCL's "LNAT must be taken by" is Law LLB's, and the college page still lists such rows (`collegePageDeadlines`). A Canadian `test` step is the SAT/ACT item only when its name says SAT or ACT (`isSatActStep`, twin in `_shared/student-digest.ts`); any other test (Western's Casper) is a plain step tick. Follow-up data patch `supabase/patches/2026-11-05-melbourne-s2-ucl-lnat.sql` (Melbourne Semester 2 row: 31 Mar 2027 per the BSc/BCom course pages, the general page says 31 May; LNAT scoped to Law), baseline from `build_seed.py --dump-deadlines --current`, checked with the `-fingerprint-before/-after.sql` queries. Signed-in screens (teacher and parent parity) were not checked by the owner yet. Part 2 (after-offer steps, citizenship, English test expiry, currencies) is next: `docs/superpowers/plans/2026-11-04-uk-ca-au-part2-after-offer.md`.

## Current status (2026-10-26)
2026-11-03: +123 popular US colleges (insert-only, DB-side fingerprint diff clean; one loader typo in Illinois Tech's major_admissions notes fixed by UPDATE 2026-11-03), 577 institutions live (539 US).
The new files' Scorecard cost blocks are labelled 2025-26: the College Scorecard file released 2026-10-15 holds 2025-26 charges (checked against
College Navigator and colleges' own 2025-26 tables). The 83 older files that labelled the same numbers "2023-2024" were relabelled 2025-2026
on 2026-11-03 (every number equals the file's row); live DB: `supabase/patches/2026-11-03-scorecard-cost-year.sql` applied 2026-11-03 (owner approved;
all 83 rows checked by md5 of notes and their numbers).
`supabase/patches/2026-10-30-student-facing-notes.sql` was never applied to the live DB (2026-11-03: 520 of 539 cost_aid notes joined with ".;"). The
cost-year patch already gave its 80 rows their final wording, so if the 10-30 file is run now its final check reports those 80 cost_aid rows as not updated (expected).
`test_score_percentiles` is numeric(6,1), so fractional CDS percentiles (29.75) are stored rounded.
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
