# Common App Fill Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that signs in once to the tracker with a transcript-only token and fills Common App's Courses & Grades (9th-12th, Other courses) and Education > Current or Most Recent Year Courses from the student's tracker transcript in one click.

**Architecture:** A pure, unit-tested fill-plan module in `web/lib/` turns the transcript into exact Common App option texts. A new migration adds hashed, revocable transcript-only tokens and two RPCs. The tracker gets an `/extension/connect` consent page and a "Connected extensions" list in Settings. The extension (`extension/`, MV3) has a background worker (sign-in + fetch), a side panel that runs the fill grade by grade, and a content script that fills one Common App page per command.

**Tech Stack:** TypeScript, Chrome MV3 (side panel, `chrome.identity`, `chrome.storage`), esbuild, linkedom (DOM tests), Supabase Postgres + pgcrypto, Next.js 16 / React 19 (tracker side), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-26-common-app-fill-extension-design.md` (read it before any task).

**Branch:** `feat/commonapp-fill-extension`, cut from `feat/transcript-subject-lists` (it carries the latest Common App map). Run `git branch --show-current` before the first commit.

## Global Constraints

- Grades are entered exactly as stored, using `Term.grade` / `finalGrade`, never `gradeWeighted`. No converting.
- No "closest" match, ever: a value Common App's list does not contain is left blank and goes in the report.
- **Never touch the owner's real Common App account** (it holds submitted applications). All live testing uses the owner's throwaway test account. The agent never types passwords or creates accounts.
- The extension acts only inside the Courses & Grades grade dialogs and the Current Year Courses page. It never clicks submit/pay/college-specific controls, and never ticks "I have reported all of my courses for this grade".
- The extension never holds a Supabase session. It only holds the opaque transcript-only token.
- Teachers get no new access. Token creation is students only.
- Schema change = `supabase/migrations/0031_extension_tokens.sql`, applied to the project (`eyvmtaggayqizllaseiu`).
- Tracker code: read `web/node_modules/next/dist/docs/` before writing Next code. Run `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build` before each web commit. No raw red/amber/green/rose/emerald classes; use `web/lib/ui.ts` helpers.
- Commits: conventional style (`feat:`, `fix:`, `docs:`), ending with the attribution line from the session.

## Review Focus

1. **Common App still loading** (dialog or dropdown overlay not rendered yet). Expected: wait for it, then fail that grade cleanly, never fill a half-rendered form. → Task 7 `waitFor` timeout test.
2. **The student closes the dialog or navigates away mid-run.** Expected: stop, no Continue pressed on a half-filled grade, report says where it stopped. → Task 8 runner test "driver error stops the run".
3. **Token expired or revoked between sign-in and Fill.** Expected: "Sign in again", nothing filled. → Task 6 parse test + Task 8 runner test "signed out never fills".
4. **Two tracker courses with the same name in one grade** (e.g., two "PE" semesters) in Keep mode. Expected: each existing Common App row cancels one tracker row, not all of them. → Task 2 `rowsToAdd` multiset test.
5. **Grade text with stray spaces or different case** (" a- " vs option "A-"). Expected: matches. "100.0" vs "100" must NOT match. → Task 2 `matchOption` tests.

---

### Task 1: Fill plan for Courses & Grades

**Files:**
- Create: `web/lib/commonapp-fill.ts`
- Test: `web/lib/commonapp-fill.test.ts`
- Modify: `docs/superpowers/research/2026-10-26-commonapp-uc-applytexas.md` (§1.2 Grading Scale row: mark VERIFIED with the list below, source "live account, read-only, 2026-10-26"), `web/lib/transcript-maps/common-app.ts:1-2` (header comment: Grading Scale list now verified, lives in `commonapp-fill.ts`)

**Interfaces:**
- Consumes: `TranscriptSchool`, `TranscriptCourse`, `GradeScale`, `emptySchool`, `emptyCourse` from `web/lib/transcript.ts`; `mapCourse("common_app", school, course)` from `web/lib/transcript-maps.ts` (handles `overrides.common_app`, `subjectFor`); `COMMON_APP_MAP.rules`.
- Produces:
  ```ts
  export const COMMON_APP_GRADING_SCALES = ["A-F", "1-100", "0.0-4.0", "0.0-5.0", "1-7", "1-10", "1-11", "1-20", "Other"] as const;
  export type CommonAppScale = (typeof COMMON_APP_GRADING_SCALES)[number];
  export type CgGradeKey = "9" | "10" | "11" | "12" | "other";
  export type ScheduleStem = "semester" | "trimester" | "quarter" | "year";
  export type TermColumn = "1" | "2" | "3" | "4" | "final";   // → grade{1..4}Control_T1Cn / gradeFinalControl_T1Cn
  export type FillRow = { trackerId: string; name: string; subject: string | null; level: string | null;
    grades: Partial<Record<TermColumn, string>>; credit: string | null; creditNA: boolean };
  export type Skipped = { where: CgGradeKey | "current"; course: string; field: string; reason: string };
  export type CgGradePlan = { grade: CgGradeKey; schoolName: string; schoolYear: string; scale: CommonAppScale;
    scheduleStem: ScheduleStem; rows: FillRow[]; skipped: Skipped[]; warnings: string[] };
  export function schoolYearLabel(year: number): string;
  export function gradingScaleFor(scale: GradeScale, max: number | null): CommonAppScale;
  export function buildCgPlan(schools: TranscriptSchool[], courses: TranscriptCourse[]): CgGradePlan[];
  ```

- [ ] **Step 1: Write the failing tests** in `web/lib/commonapp-fill.test.ts` (same helper style as `transcript-maps.test.ts`: `school(o)` / `course(o)` built from `emptySchool()` / `emptyCourse()`):
  - `schoolYearLabel(2023) === "2023-24"`, `schoolYearLabel(2099) === "2099-00"`.
  - `gradingScaleFor`: `percent_100,null → "1-100"`; `letter_plus_minus → "A-F"`; `letter → "A-F"`; `gpa_decimal,4 → "0.0-4.0"`; `gpa_decimal,5 → "0.0-5.0"`; `gpa_decimal,4.3 → "Other"`; `ib_7 → "1-7"`; `other,10/11/20 → "1-10"/"1-11"/"1-20"`; `a_level → "Other"`; `pass_fail → "Other"`.
  - "fills a graded 9th-grade semester course": school "Kang Chiao International School - Linkou Campus" (`high_school`); course Drama, gradeLevel 9, academicYear 2023, period semester, terms S1 "88" graded, S2 "93" graded, finalGrade "91", scale percent_100, level regular, subject other, credit 4, unit carnegie → one plan `{ grade: "9", schoolName: <that name>, schoolYear: "2023-24", scale: "1-100", scheduleStem: "semester" }`, `rows[0]` deep-equals `{ trackerId, name: "Drama", subject: "Other/Elective", level: "Regular/Standard", grades: { "1": "88", "2": "93", final: "91" }, credit: "4", creditNA: false }`.
  - "uses the printed grade, not the weighted one": S1 `{ grade: "B+", gradeWeighted: "A", status: "graded" }` → `grades["1"] === "B+"`.
  - "in-progress courses go to Current Year, not C&G": a grade-12 course whose only term is `in_progress` → no row; `skipped` has `{ where: "12", course, field: "course", reason: "in progress: goes to Current Year Courses" }`.
  - "college schools are left out": course under a `kind: "college"` school → appears in no plan and no skipped list.
  - "no grade level goes to Other courses": `gradeLevel: null` → plan `grade === "other"`.
  - "credit": unit `not_listed` → `creditNA: true, credit: null`; credit null + unit carnegie → `credit: null` and skipped `{ field: "credit", reason: "no credit in tracker" }`.
  - "second school in the same grade is reported, not filled": grade 10 with 3 courses at school A and 1 at school B → `schoolName` A, 3 rows, skipped has B's course with reason starting `"another school (B)"`.
  - "per-course override wins": `overrides: { common_app: { subject: "Religion" } }` → row subject `"Religion"`.
  - "plans come in order 9, 10, 11, 12, other and only for grades with courses".
  - "mixed scales in one grade": 2 percent_100 + 1 letter course → `scale: "1-100"` and `warnings` mentions the letter course name.
- [ ] **Step 2: Run** `cd web && node --test lib/commonapp-fill.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `web/lib/commonapp-fill.ts` per the Interfaces. Course filter, main school/year and term-column rules are in spec §5.3. Term → column: S1/T1/Q1 → "1", S2/T2/Q2 → "2", T3/Q3 → "3", Q4 → "4", FY or `finalGrade` → "final". Only `graded` terms with a non-empty grade. Subject/level come from `mapCourse(...).fields` (`value` of keys `subject`, `level`; a null or `none` value → null + skipped entry). Add `COMMON_APP_MAP.rules(...)` strings to `warnings`. Credit is formatted with `String(credit)`.
- [ ] **Step 4: Run** `cd web && node --test lib/commonapp-fill.test.ts`. Expected: PASS. Then `npx tsc --noEmit && npm run lint && npm test`. Expected: all green.
- [ ] **Step 5: Update** the research note row and the `common-app.ts` header comment (Files above).
- [ ] **Step 6: Commit** `feat: Common App courses & grades fill plan`.

### Task 2: Option matching, Keep mode and the Current Year plan

**Files:**
- Modify: `web/lib/commonapp-fill.ts`
- Test: `web/lib/commonapp-fill.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  ```ts
  export function matchOption(options: readonly string[], wanted: string): string | null; // trim, collapse spaces, case-insensitive EXACT
  export function matchStem(options: readonly string[], stem: ScheduleStem): string | null; // first option whose lowercased text starts with the stem
  export function rowsToAdd<T extends { name: string }>(rows: T[], existingNames: string[]): T[]; // multiset, names compared like matchOption
  export type CurrentYearRow = { trackerId: string; name: string; subject: string | null; level: string | null; schedule: string | null };
  export type CurrentYearPlan = { scheduleStem: ScheduleStem; rows: CurrentYearRow[]; skipped: Skipped[] };
  export function buildCurrentYearPlan(schools: TranscriptSchool[], courses: TranscriptCourse[]): CurrentYearPlan | null; // null = no high-school courses
  ```

- [ ] **Step 1: Write the failing tests:**
  - `matchOption(["A-", "A", "B+"], " a- ") === "A-"`; `matchOption(["105", "100"], "100.0") === null`; `matchOption(["Pass - (Pass/Fail)"], "P") === null`; `matchOption(["Math (Other)"], "math  (other)") === "Math (Other)"`.
  - `matchStem(["Semesters", "Trimesters", "Quarters", "Yearly"], "quarter") === "Quarters"`; `matchStem([...], "year") === "Yearly"`; `matchStem(["Semester", "Quarter"], "trimester") === null`.
  - `rowsToAdd([{name:"PE"},{name:"PE"},{name:"Math"}], ["pe "])` deep-equals `[{name:"PE"},{name:"Math"}]`; with `[]` existing returns all 3.
  - `buildCurrentYearPlan`: courses in 2025 (graded) and 2026 (one `semester` course with only S1 `in_progress`, one `full_year` course with FY `planned`) → rows are the two 2026 courses with `schedule` `"First Semester"` and `"Full Year"`; the 2025 course is absent.
  - Same, but every 2026 course is graded (student finished school) → all 2026 courses included (most recent year).
  - Course with only S2 → `"Second Semester"`. Trimester/quarter single-term courses → `schedule: null` + skipped `{ where: "current", field: "schedule", reason: "schedule wording not confirmed" }` (until Task 5 confirms the wording; then add the confirmed values here).
  - `scheduleStem` = the most common `period` among the rows (`full_year` → `"year"`).
- [ ] **Step 2: Run** `cd web && node --test lib/commonapp-fill.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the five exports. Latest year = max `academicYear` among high-school courses. Subject/level via `mapCourse` as in Task 1.
- [ ] **Step 4: Run** `cd web && npx tsc --noEmit && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: Common App option matching, keep mode and current-year plan`.

### Task 3: Transcript-only extension tokens (migration 0031)

**Files:**
- Create: `supabase/migrations/0031_extension_tokens.sql`
- Modify: `CLAUDE.md` (next migration number → 0032)

**Interfaces:**
- Produces (SQL, all `security definer set search_path = ''`, style of `0021_teacher_links.sql`):
  - Table `public.extension_tokens(id uuid pk default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade, token_hash bytea not null unique, label text not null default 'Chrome extension' check (char_length(label) <= 100), created_at timestamptz not null default now(), last_used_at timestamptz, expires_at timestamptz not null default now() + interval '90 days', revoked_at timestamptz)`. RLS on; policy "own tokens" `for select to authenticated using ((select auth.uid()) = user_id)`; `revoke select ... from authenticated` then `grant select (id, label, created_at, last_used_at, expires_at, revoked_at)`. No insert/update/delete policies.
  - `create_extension_token(p_label text default 'Chrome extension') returns text`: refuses unless `auth.uid()` is not null and `public.is_role(uid, 'student')` (raise `'students only'`). Token = `encode(extensions.gen_random_bytes(32), 'hex')`; store `extensions.digest(token, 'sha256')`. If the user then has more than 5 unrevoked tokens, revoke the oldest. Returns the plain token (only time it exists in clear).
  - `extension_transcript(p_token text) returns jsonb`: finds an unrevoked, unexpired hash match; none → `{"ok": false, "error": "invalid_token"}`; owner no longer a student → `{"ok": false, "error": "students_only"}`. Else sets `last_used_at = now()` and returns `{"ok": true, "schools": [...], "courses": [...]}` with explicit column lists (every `transcript_schools` / `transcript_courses` column except `user_id`). Granted to `anon, authenticated`.
  - `revoke_extension_token(p_id uuid) returns void`: sets `revoked_at` on the caller's own token. Granted to `authenticated`.
  - `revoke all on function ... from public` before the grants.

- [ ] **Step 1: Check pgcrypto** with the Supabase MCP `list_extensions` (project `eyvmtaggayqizllaseiu`). Expected: `pgcrypto` installed in schema `extensions`. If not, add `create extension if not exists pgcrypto with schema extensions;` at the top of the migration.
- [ ] **Step 2: Write** `0031_extension_tokens.sql` per the Interfaces.
- [ ] **Step 3: Apply** it with MCP `apply_migration` (name `extension_tokens`).
- [ ] **Step 4: Probe** with MCP `execute_sql`, inside `begin; ... rollback;` so nothing remains. Pick one existing student id read-only (`select user_id from public.user_roles where role = 'student' limit 1`). Set `set local role authenticated; set local request.jwt.claims = '{"sub":"<id>","role":"authenticated"}';`, then:
  - `select public.create_extension_token('probe')` → 64 hex chars.
  - `select public.extension_transcript('<that token>')->>'ok'` → `true`; `select public.extension_transcript('nope')` → `{"ok": false, "error": "invalid_token"}`.
  - `select token_hash from public.extension_tokens` → permission denied.
  - As a teacher id: `create_extension_token` → error `students only`.
  Expected: all four as stated. Paste the outputs into the task report.
- [ ] **Step 5: Run** MCP `get_advisors` (security). Expected: no new warning naming `extension_tokens` or the three functions.
- [ ] **Step 6: Commit** `feat: transcript-only extension tokens (migration 0031)`.

### Task 4: Tracker side: connect page and Settings list

**Files:**
- Create: `web/lib/extension-api.ts`, `web/lib/extension-api.test.ts`, `web/app/(app)/extension/connect/page.tsx`, `web/components/ExtensionConnect.tsx`, `web/components/ConnectedExtensions.tsx`
- Modify: `web/components/SettingsPage.tsx` (render `<ConnectedExtensions />` for students), `web/.env.example` (add `NEXT_PUBLIC_EXTENSION_ID=`)

**Interfaces:**
- Consumes: Task 3 RPCs; `browserSupabase()` from `web/lib/supabase-browser.ts`; the role from `web/lib/student-store.ts`; `openSignIn()` for signed-out visitors.
- Produces:
  ```ts
  export function extensionRedirect(redirectUri: string | null, extensionId: string, token: string): string | null;
  // exactly "https://<extensionId>.chromiumapp.org/" is accepted (null redirectUri = that default); returns `${uri}#token=${token}`, else null
  export async function createExtensionToken(label?: string): Promise<string>;
  export type ExtensionToken = { id: string; label: string; createdAt: string; lastUsedAt: string | null; expiresAt: string; revokedAt: string | null };
  export async function listExtensionTokens(): Promise<ExtensionToken[]>;
  export async function revokeExtensionToken(id: string): Promise<void>;
  ```

- [ ] **Step 1: Write the failing test** `extension-api.test.ts` for `extensionRedirect` only (`ID = "abcdefghijklmnopabcdefghijklmnop"`): exact URI → `https://${ID}.chromiumapp.org/#token=t`; `null` → same; other id → `null`; `http://` → `null`; path `/evil` → `null`; `https://${ID}.chromiumapp.org.evil.com/` → `null`.
- [ ] **Step 2: Run** `cd web && node --test lib/extension-api.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `extension-api.ts` (wrappers in the style of `web/lib/links-api.ts`).
- [ ] **Step 4: Read** the Next 16 docs for client pages / `searchParams` in `web/node_modules/next/dist/docs/`, then build `/extension/connect`. Signed out → sign-in dialog. Teacher → "This extension is for students." Student → consent card with exactly this copy: "**Common App filler** wants to read your transcript (schools, courses, grades). It cannot see anything else in your account." Buttons: "Allow" (primary, `buttonClass`) and "Cancel". Allow → `createExtensionToken()` → `location.replace(extensionRedirect(...))`. A null redirect → error text "This link didn't come from the extension." `NEXT_PUBLIC_EXTENSION_ID` missing → "Extension sign-in isn't set up yet."
- [ ] **Step 5: Build** `ConnectedExtensions`: lists unrevoked, unexpired tokens (label, connected date, last used) with "Disconnect" → `revokeExtensionToken`. Empty → nothing rendered.
- [ ] **Step 6: Verify in the browser** with the fake-backend pattern from `rules/lessons.md` (2026-10-24 entry: mock Supabase REST + fake `sb-localhost-auth-token`), dev server via `preview_start`: the consent page renders for a student and refuses a teacher, and Settings shows a token and removes it on Disconnect. Take a screenshot as proof.
- [ ] **Step 7: Run** `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build`. Expected: green.
- [ ] **Step 8: Commit** `feat: extension connect page and connected extensions in settings`.

### Task 5: Record Common App facts on the test account (owner prerequisite)

Needs the owner's **throwaway** Common App account, signed in by the owner in the built-in browser pane, with a Courses & Grades college on the list and a school in Education. If it isn't ready, stop and ask. Tasks 6 and 8 can go ahead in the meantime. Before acting, confirm on the dashboard that this is NOT the real account (the real one shows "11 submitted").

**Files:**
- Create: `docs/superpowers/research/2026-10-27-commonapp-dom.md`, `extension/test/fixtures/cg-dialog.html`, `extension/test/fixtures/cg-overlay-grades.html`, `extension/test/fixtures/current-year.html`

- [ ] **Step 1: Record URLs.** Grade pages (expected `/common/13/55`-`59`: 9th, 10th, 11th, 12th, Other) and Current Year (`/common/4/24`). Note each page's heading text.
- [ ] **Step 2: Record option texts** read from open overlays: Schedule options in the dialog; grade lists for scales A-F, 0.0-4.0, 1-7 (switching the scale is fine here); the Remove-course confirm dialog's button texts; Current Year scheduling radios, the schedule type-ahead options (incl. trimester/quarter wording), and whether subject/level lists equal the C&G lists.
- [ ] **Step 3: Record behavior.** Does a new "Add another course" row get ids `…_T1C{n+1}`? Does the Final grade column exist for every schedule? Does Quarterly give `grade4Control`? Does Current Year save on blur, or on Continue?
- [ ] **Step 4: Save fixtures**: `document.querySelector('mat-dialog-container').outerHTML` with 2+ rows (and once with a grade overlay open), and the Current Year `main` element. Remove the test student's name/email from the HTML.
- [ ] **Step 5: Update** `buildCurrentYearPlan` schedule values and `matchStem` stems (Task 2) if the observed wording differs, and re-run `cd web && npm test`.
- [ ] **Step 6: Commit** `docs: Common App DOM facts and fixtures from the test account`.

### Task 6: Extension scaffold, sign-in and transcript fetch

**Files:**
- Create: `extension/package.json`, `extension/tsconfig.json`, `extension/build.mjs`, `extension/manifest.json`, `extension/scripts/extension-id.mjs`, `extension/src/config.ts`, `extension/src/messages.ts`, `extension/src/auth.ts`, `extension/src/auth.test.ts`, `extension/src/background.ts`, `extension/README.md`
- Modify: root `.gitignore` (`extension/dist/`, `extension/node_modules/`, `*.pem`)

**Interfaces:**
- Consumes: `toTranscriptSchool`, `toTranscriptCourse` from `web/lib/student-rows.ts` (imported by relative path and bundled by esbuild); Task 3 RPC; Task 4 page.
- Produces:
  ```ts
  // config.ts
  export const TRACKER_URL: string;           // build-time define, default "http://localhost:3000"
  export const SUPABASE_URL = "https://eyvmtaggayqizllaseiu.supabase.co";
  export const SUPABASE_KEY: string;          // publishable key from web/.env.example
  // auth.ts
  export function parseTokenFromRedirect(url: string): string | null;
  export type TranscriptResult = { ok: true; schools: TranscriptSchool[]; courses: TranscriptCourse[] } | { ok: false; reason: "signed_out" | "students_only" | "network" };
  export function parseTranscriptResponse(body: unknown): TranscriptResult;
  export async function signIn(): Promise<boolean>;   // launchWebAuthFlow(`${TRACKER_URL}/extension/connect?redirect_uri=${chrome.identity.getRedirectURL()}`), stores token in chrome.storage.local "token"
  export async function signOut(): Promise<void>;
  export async function loadTranscript(): Promise<TranscriptResult>; // POST `${SUPABASE_URL}/rest/v1/rpc/extension_transcript` {p_token}; invalid_token → removes the stored token
  // messages.ts: the panel ↔ background ↔ content message union (types only), extended by Tasks 7-8
  ```
- Manifest: MV3, `"name": "Common App filler"`, `permissions: ["identity", "storage", "sidePanel", "tabs"]`, `host_permissions: ["https://apply.commonapp.org/*", "https://eyvmtaggayqizllaseiu.supabase.co/*"]`, `side_panel.default_path: "panel.html"`, content script on `https://apply.commonapp.org/*` (`dist/content.js`), `"key"` = the public key (Step 1).

- [ ] **Step 1: Pin the extension id.** `extension-id.mjs` generates an RSA keypair with node `crypto`, prints the base64 DER public key (for `manifest.key`) and the derived id (sha256 of the DER, first 32 hex chars mapped 0-f → a-p). Run it once. Put the key in the manifest and the id in `web/.env.example` / `web/.env.local` as `NEXT_PUBLIC_EXTENSION_ID`. Do not save the private key.
- [ ] **Step 2: Write the failing tests** `auth.test.ts`: `parseTokenFromRedirect("https://x.chromiumapp.org/#token=ab12")==="ab12"`; no fragment → `null`; `#error=denied` → `null`. `parseTranscriptResponse({ok:false,error:"invalid_token"})` → `{ok:false,reason:"signed_out"}`; `"students_only"` → that reason; garbage (`"x"`) → `{ok:false,reason:"network"}`; an ok body with one school row and one course row (shape of `TranscriptSchoolRow` / `TranscriptCourseRow` in `student-rows.ts`) → camel-cased objects (`academicYear`, `gradeLevel`).
- [ ] **Step 3: Run** `cd extension && npm install && node --test src/*.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `config.ts`, `auth.ts`, `background.ts` (opens the side panel on the action click, answers `signIn` / `signOut` / `loadTranscript` messages) and `build.mjs` (esbuild: `src/background.ts`, `src/content.ts` (stub for now), `src/panel.ts` (stub) → `dist/`; copies `manifest.json` and `panel.html`; `--define` `TRACKER_URL`).
- [ ] **Step 5: Run** `cd extension && node --test src/*.test.ts && npx tsc --noEmit && node build.mjs`. Expected: PASS and `dist/` built.
- [ ] **Step 6: Manual check**: load unpacked in Chrome, then sign in against the local tracker (Task 4 page). `chrome.storage.local` now holds a token. Confirm the extension id equals the pinned one. Write the load steps into `extension/README.md`.
- [ ] **Step 7: Commit** `feat: extension scaffold with transcript-only sign-in`.

### Task 7: Content script: fill one Common App page

**Files:**
- Create: `extension/src/commonapp/dom.ts`, `extension/src/commonapp/dom.test.ts`, `extension/src/commonapp/cg.ts`, `extension/src/commonapp/current-year.ts`, `extension/src/commonapp/pages.ts`, `extension/src/content.ts` (replaces the stub)
- Modify: `extension/package.json` (devDependency `linkedom`)

**Interfaces:**
- Consumes: Task 1-2 plans and `matchOption` / `matchStem` / `rowsToAdd`; Task 5 fixtures and facts.
- Produces:
  ```ts
  // dom.ts
  export async function waitFor<T>(probe: () => T | null, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<T>; // rejects Error("timeout")
  export function cgFieldId(field: "subject" | "courseName" | "level" | "credit" | "creditNA" | `grade${TermColumn}`, t: number, c: number): string;
  //   grade "final" → "gradeFinalControl_T1C3"; credit → "creditFinalControl_T1C3"; creditNA → "creditNA_T1C3-input"
  export function readOverlayOptions(doc: Document): string[];          // texts of .cdk-overlay-pane mat-option, without "Clear selection"
  export function setText(input: HTMLInputElement | HTMLTextAreaElement, value: string): void; // sets value, dispatches input + change + blur
  export async function selectMatOption(el: Element, wanted: string): Promise<string | null>; // opens, matchOption, clicks; Escape + null if no match; returns the shown text
  export function readCgDialog(doc: Document): { courseCount: number; names: string[] } | null; // null = dialog not open
  // pages.ts
  export const CG_GRADE_PATH: Record<CgGradeKey, string>; export const CURRENT_YEAR_PATH: string;  // from Task 5
  // cg.ts / current-year.ts
  export type PageResult = { filled: number; blanks: Skipped[]; stoppedReason?: string };
  export async function inspectCgGrade(): Promise<{ existing: string[] }>;
  export async function fillCgGrade(plan: CgGradePlan, mode: "replace" | "keep"): Promise<PageResult>;
  export async function inspectCurrentYear(): Promise<{ existing: string[] }>;
  export async function fillCurrentYear(plan: CurrentYearPlan, mode: "replace" | "keep"): Promise<PageResult>;
  ```
  `fillCgGrade` opens "Edit", optionally removes rows (Replace), sets the 4 header selects, adds and fills rows, and presses **Continue** only if no locator failed. Any missing element → `stoppedReason: "Common App's page changed"` and the dialog is closed with the X (unsaved). Every `selectMatOption` that returns null adds a blank (`reason: "'<value>' is not in Common App's list"`). `content.ts` answers `ready`, `inspect` and `fill` messages.

- [ ] **Step 1: Write the failing tests** `dom.test.ts` (linkedom parsing the Task 5 fixtures): `cgFieldId("grade1",1,3)==="grade1Control_T1C3"`, `("gradefinal",1,2)==="gradeFinalControl_T1C2"`, `("credit",1,1)==="creditFinalControl_T1C1"`; `readCgDialog(fixture)` returns the fixture's row count and names; `readCgDialog(emptyDoc) === null`; `readOverlayOptions(overlayFixture)` includes `"100"` and `"Pass - (Pass/Fail)"` and not `"Clear selection"`; `setText` fires an `input` listener and sets `.value`; `waitFor(() => null, { timeoutMs: 50 })` rejects with `"timeout"`; `waitFor` resolves once a probe starts returning a value.
- [ ] **Step 2: Run** `cd extension && node --test src/**/*.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `dom.ts`, `pages.ts`, `cg.ts`, `current-year.ts`, `content.ts`.
- [ ] **Step 4: Run** `cd extension && node --test src/**/*.test.ts && npx tsc --noEmit && node build.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: content script fills a Common App grade and the current-year page`.

### Task 8: Side panel, runner and report

**Files:**
- Create: `extension/panel.html`, `extension/src/panel.ts` (replaces the stub), `extension/src/runner.ts`, `extension/src/runner.test.ts`, `extension/src/panel.css`

**Interfaces:**
- Consumes: Task 6 `loadTranscript` / `signIn` / `signOut`; Task 1-2 `buildCgPlan`, `buildCurrentYearPlan`; Task 7 messages.
- Produces:
  ```ts
  export type Target = CgGradeKey | "current";
  export type Driver = { open(target: Target): Promise<void>; inspect(target: Target): Promise<{ existing: string[] }>;
    fill(target: Target, mode: "replace" | "keep"): Promise<PageResult> };
  export type ReportItem = { target: Target; filled: number; blanks: Skipped[]; note?: string };
  export async function runFill(targets: Target[], driver: Driver,
    ask: (target: Target, existingCount: number) => Promise<"replace" | "keep">,
    shouldStop: () => boolean): Promise<{ items: ReportItem[]; stopped: boolean }>;
  ```
- [ ] **Step 1: Write the failing tests** `runner.test.ts` with a fake driver:
  - "asks only for targets that already have courses": inspect returns `["Drama"]` for "9", `[]` for "10" → `ask` called once with `("9", 1)`.
  - "driver error stops the run": `fill("10")` rejects `Error("dialog closed")` → `stopped: true`, no `fill("11")` call, the last item has `note` "Stopped: dialog closed".
  - "stoppedReason ends the run" the same way.
  - "Stop button": `shouldStop` true after the first target → only one fill.
  - "signed out never fills" (in `panel.ts` logic exposed as `export async function startFill(load: () => Promise<TranscriptResult>, run: typeof runFill, ...)`): `load` returns `{ok:false,reason:"signed_out"}` → `run` not called, status `"Sign in again"`.
- [ ] **Step 2: Run** `cd extension && node --test src/*.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `runner.ts` and the panel: signed-out view (Sign in), and signed-in view with a checkbox per grade that has courses ("9th grade (12 courses)"), "Current year courses", all ticked, "Fill selected", "Stop", "Sign out". Replace/Keep prompt shows "10th grade already has 5 courses on Common App." with buttons "Replace them" / "Keep them, add the rest". The report lists each target: "Filled 12 courses", each blank with its reason, and a link that opens that grade, plus the line "On each grade, tick 'I have reported all of my courses for this grade' yourself." The driver uses `chrome.tabs.update` + waits for the content script's `ready`, then sends `inspect` / `fill`.
- [ ] **Step 4: Run** `cd extension && node --test src/**/*.test.ts && npx tsc --noEmit && node build.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: side panel with fill runner and report`.

### Task 9: End-to-end on the test account, then docs

- [ ] **Step 1:** In the tracker (local, or deployed with `NEXT_PUBLIC_EXTENSION_ID` set), give a test student a transcript covering grades 9-12, an in-progress 12th-grade course, one course with a grade not in Common App's list, and one with no credit.
- [ ] **Step 2:** On the **test** Common App account (re-check it is not the real one), run Fill for all targets. Expected: every grade saved, the report lists exactly the planted blanks, Current Year shows the in-progress course.
- [ ] **Step 3:** Run again with Keep. Expected: no duplicate rows. Then run with Replace on one grade. Expected: the rows equal the tracker's.
- [ ] **Step 4:** Disconnect in tracker Settings, then Fill. Expected: "Sign in again" and nothing filled.
- [ ] **Step 5:** Record a short screen capture or screenshots of the report as proof.
- [ ] **Step 6:** Update `CLAUDE.md` (an "Extension" bullet: dir, build, token flow, the test-account rule) and the status column in `docs/competitor-analysis-and-roadmap.md` if it has a matching item.
- [ ] **Step 7: Commit** `docs: Common App filler extension in CLAUDE.md`.
