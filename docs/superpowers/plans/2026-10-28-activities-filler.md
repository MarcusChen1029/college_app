# Activities Filler (Common App + UC) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the tracker's activities data and Activities page up to the exact 2026-27 Common App and UC forms, then let the extension fill Common App Activities, Common App Honors and UC Activities & awards from it.

**Architecture:** Four parts, each shippable as its own PR to `main`: (1) the v2 data format, its converter, the Activities page and every reader, plus migration 0038 (backfill + `portfolio_view`); (2) token scopes and the `extension_activities` RPC (migration 0039); (3) the Common App filler (pure plan in `web/lib/activities-fill.ts`, page driver in `extension/src/commonapp/activities.ts`); (4) the UC filler (pure plan in `web/lib/uc-activities-fill.ts`, page handlers in `assist-content.ts`, a reload-surviving run in `extension/src/uc/activities-run.ts`). Pure planning code lives in `web/lib` like the existing `*-fill.ts` files so both the page and the extension use one set of rules.

**Tech Stack:** TypeScript, Next.js 16 / React 19 (web), Supabase Postgres (plpgsql), Chrome MV3 extension, `node --test` with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-10-28-activities-filler-design.md`. Live DOM facts (selectors, ids, option lists, limits): `docs/superpowers/research/2026-10-27-portal-dom.md` §6 (Common App Activities), §7 (UC Activities & awards), §8 (Common App Honors). Executors read all three.

## Global Constraints

- Every stored value must be accepted by the portal unchanged: Common App description ≤ 150, organization ≤ 100, role ≤ 50, honor title ≤ 100; hours 1-168, weeks 1-52 (decimals allowed); dates 1926-2027, afterStart ≤ afterEnd. UC names ≤ 60 (`edprep` Other name ≤ 30), 250/350 boxes counted as `length + number of "\n"`; hours 1-168, weeks 1-52.
- Never guess an answer the student did not give; unanswered required questions stay blank and are flagged "needs an answer".
- Stored Common App type, sport and UC program values are the portals' exact English labels (UC program stored as its option value, e.g. "6"); display translations live in `web/lib/i18n` only (en + zh-TW; `i18n.test.ts` fails on missing/unused keys).
- The extension never presses any submit, UC's `#no_activities`, or Common App's Responsibilities page, and never calls Common App's private API.
- Development and live checks use only the owner's throwaway Common App and UC accounts (memory `portal-test-accounts`), never the real ones.
- Before each PR: `cd web && npx tsc --noEmit && npm run lint && npm test` and, for extension changes, `cd extension && npm test && npx tsc --noEmit && node build.mjs`. Run them through the PowerShell tool and judge by exit code (RTK has masked failures, lessons 2026-10-26/28). Extension PRs also run `npm run package` and commit `web/public/downloads/common-app-filler.zip`.
- Migrations: new files `supabase/migrations/0038_activities_v2.sql`, `0039_extension_activities.sql` (the spec names one migration 0038
  for everything; the plan splits the token part into 0039 so PR 1 and PR 2 ship independently); update CLAUDE.md "next number" to 0040. Any UPDATE on live data waits for the owner's approval in the Supabase MCP prompt.
- Conventional commits (`feat:`, `fix:`, `data:`, `docs:`), ending with the session's Co-Authored-By line.

## Review Focus

1. A Common App slot that is re-added after an earlier Remove still holds old answers (Remove only lowers the counter): every question of every touched slot must be written, blanks as clears. Test in Task 10.
2. A value written by code past a limit is silently dropped by Common App and cut by UC: 151-char description, hours 0 or 200, weeks 53, start after end, a UC 350 box holding 349 chars + 1 newline must be blocked before typing, never typed. Tests in Tasks 1, 9 and 13.
3. The portal signs out mid-run (UC lands on `/my-application/login`, Common App on `/login`): the run stops with "Common App/UC signed you out" and never reports success. Tests in Tasks 11 and 14.
4. An extension token minted before this change (scope `{transcript}`): the panel says "Reconnect to allow activities" and the transcript fill keeps working. Test in Task 8.
5. "Keep" when the page is already full (10 activities / 5 honors / 20 UC entries): no toggle can be switched on and the panel says the page is full. Test in Task 9.

---

## Part 1: v2 data format (PR 1)

### Task 1: v2 types, option lists and validators

**Files:**
- Modify: `web/lib/activities.ts` (types, constants, factories; keep `move`)
- Test: `web/lib/activities.test.ts`

**Interfaces:**
- Produces (exported from `web/lib/activities.ts`):
  ```ts
  export type Grade = "9" | "10" | "11" | "12" | "PG";            // unchanged; PG = "After graduating high school" / "After 12th grade"
  export type YearMonth = string;                                  // "YYYY-MM"
  export const CA_ACTIVITY_TYPES: readonly string[];               // the 30 labels of research §6 in display order
  export const CA_ATHLETIC_TYPES: readonly string[];               // ["Athletics (other)", "Athletics (JV or varsity)"]
  export const CA_SPORTS: readonly string[];                       // the 48 labels of research §6 in display order
  export type CaTiming = "school" | "break" | "all";
  export type CaContinue = "yes" | "no" | "not_sure";
  export type CaActivity = { id: string; type: string; sport: string; leadership: boolean | null; position: string; organization: string;
    description: string; grades: Grade[]; timing: CaTiming | null; afterStart: YearMonth | null; stillParticipating: boolean | null;
    afterEnd: YearMonth | null; hoursPerWeek: number | null; weeksPerYear: number | null; continueInCollege: CaContinue | null; legacy?: string };
  export type CaHonor = { id: string; title: string; grades: Grade[]; levels: HonorLevel[] };   // unchanged
  export const UC_EDPREP_PROGRAMS: readonly { value: string; label: string }[]; // the 28 options of research §7 incl. { value: "18", label: "Other" }
  export type UcAfterYears = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | "10+";
  export type UcWorkHours = Partial<Record<Grade, { schoolYear: number | null; summer: number | null }>>;
  export type UcEntry = { id: string; category: UcCategory; name: string; jobTitle: string; extra: string; description: string; grades: Grade[];
    hoursPerWeek: number | null; weeksPerYear: number | null; afterYears: UcAfterYears | null; afterMonths: number | null;
    awardLevels: UcAwardLevel[]; awardType: "academic" | "non_academic" | null; program: string | null; workHours: UcWorkHours;
    stillWorking: boolean | null; start: YearMonth | null; end: YearMonth | null; legacy?: string; fromId?: string };
  export type ActivityData = { version: 2; commonApp: { activities: CaActivity[]; honors: CaHonor[] }; uc: UcEntry[] };
  export const CA_LIMITS = { activities: 10, honors: 5, position: 50, organization: 100, description: 150, honorTitle: 100 };
  export const UC_LIMITS = { entries: 20, name: 60, otherProgramName: 30, description: 350, extra: 250 };
  export type Issue = { field: string; kind: "missing" | "invalid"; message: string };
  export function ucTextLength(s: string): number;                 // s.length + count of "\n"
  export function caActivityIssues(a: CaActivity): Issue[];
  export function caHonorIssues(h: CaHonor): Issue[];
  export function ucEntryIssues(e: UcEntry): Issue[];
  export function newCaActivity(): CaActivity; export function newCaHonor(): CaHonor; export function newUcEntry(c: UcCategory): UcEntry;
  ```
  `UC_CATEGORIES` keeps its labels but its per-category question text follows spec §3.2 (e.g. work `name` = "Where did you work?", `jobTitle` = "What was your job title?"). `organization` is removed from `UcEntry` (old work employer moves to `name`, Task 2).

- [ ] **Step 1: Write failing tests** in `activities.test.ts` (replace the v1 fixture with v2 factories):
  - `ucTextLength("ab\ncd") === 6`.
  - `caActivityIssues` on a fully answered Robotics activity → `[]`.
  - same activity with `description` of 151 chars → one `invalid` issue on `description`; `hoursPerWeek: 0` and `200` → `invalid` on `hoursPerWeek`; `weeksPerYear: 53` → `invalid`; `hoursPerWeek: 5.5` → no issue.
  - type `"Athletics (JV or varsity)"` with `sport: ""` → `missing` on `sport`; type `"Robotics"` with `sport: ""` → no sport issue.
  - `leadership: true, position: ""` → `missing` on `position`; `leadership: false` → no position issue.
  - grades `["10"]`, `timing: null` → `missing` on `timing`; grades `["PG"]` → no timing issue but `missing` on `afterStart` and `stillParticipating`; `stillParticipating: false, afterEnd: null` → `missing` on `afterEnd`; `afterStart: "2026-09", afterEnd: "2026-06"` → `invalid` on `afterEnd`; `afterStart: "1925-12"` → `invalid`.
  - `continueInCollege: null` → `missing`.
  - `caHonorIssues` with a 101-char title → `invalid` on `title`; empty levels → `missing` on `levels`.
  - `ucEntryIssues`: extracurricular with a description of 349 chars + `"\n"` → `invalid`; award with `awardLevels: []` → `missing`; edprep `program: "18", name: ""` → `missing` on `name`, `name` of 31 chars → `invalid`; work with `stillWorking: false, end: null` → `missing` on `end`; any category with grades incl. `"PG"` and `afterYears: null` → `missing` on `afterYears` (not for award).
- [ ] **Step 2: Run** `cd web && node --test lib/activities.test.ts` → FAIL (exports missing).
- [ ] **Step 3: Implement** the types, constants (copy the three option lists verbatim from research §6/§7) and validators. Messages are plain English sentences naming the portal limit, e.g. "Common App allows 150 characters (this has 151).".
- [ ] **Step 4: Run** the same command → PASS (other web tests may fail until Task 3-4; that is expected inside this PR only).
- [ ] **Step 5: Commit** `feat(activities): 2026-27 Common App and UC activity format`.

### Task 2: `upgradeActivities` (v1 → v2) and UC drafts

**Files:**
- Modify: `web/lib/activities.ts`
- Create: `web/lib/fixtures/activities-v1.json`, `web/lib/fixtures/activities-v2.json` (same students before/after; reused by Task 7's SQL parity check)
- Test: `web/lib/activities.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `export function upgradeActivities(raw: unknown): ActivityData` (accepts v1, v2, `{}`, null; never throws; keeps ids and order; idempotent on v2) and `export function ucDraftsFromCommonApp(data: ActivityData): UcEntry[]` (new mapping).

- [ ] **Step 1: Write failing tests:**
  - Every old type in spec §3.1's mapping converts to its new label (table-driven over all 30 old labels; "Music: Instrumental" and "Music: Vocal" → "Music").
  - Old `timing` `["school","break"]` → `"all"`, `["school"]` → `"school"`, `[]` → `null`; `position: "Captain"` → `leadership: true`, `position: ""` → `leadership: null`; `continueInCollege: true` → `"yes"`, `false` → `"no"`, `null` → `null`.
  - UC `awardLevel: "national"` → `awardLevels: ["national"]`, `null` → `[]`; old work `{ name: "Cashier", organization: "Corner Cafe", hoursPerWeek: 10, weeksPerYear: 40 }` → `{ jobTitle: "Cashier", name: "Corner Cafe", workHours: {}, legacy: "From your earlier version: 10 hours/week, 40 weeks/year" }`.
  - edprep `name: "EAOP"` → `program: "6", name: ""`; `name: "Early Academic Outreach Program (EAOP)"` → `program: "6"`; `name: "Local STEM camp"` → `program: "18", name: "Local STEM camp"`; a 40-char unknown name → `program: "18", name: "", legacy: "From your earlier version: <name>"`.
  - `upgradeActivities(upgradeActivities(v1))` deep-equals `upgradeActivities(v1)`; `upgradeActivities(null)` → empty v2; the v1 fixture upgrades to the v2 fixture exactly.
  - `ucDraftsFromCommonApp`: "Employment or work (paid)" and "Internship" → `work` (activity organization → `name`, position → `jobTitle`), "Community service or volunteer work" → `volunteer`, others → `extracurricular`; an honor with levels `["school","state_regional"]` → award with `awardLevels: ["school","state"]` and `legacy: "Check the level: Common App's State/Regional was copied as State."`.
- [ ] **Step 2: Run** `cd web && node --test lib/activities.test.ts` → FAIL.
- [ ] **Step 3: Implement** both functions; acronym match = the text inside the last "( )" of a program label, case-insensitive; full-label match case-insensitive and whitespace-collapsed.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(activities): convert stored activities to the 2026-27 format`.

### Task 3: Store, rows and MCP on v2

**Files:**
- Modify: `web/lib/student-rows.ts` (`toProfile` / `fromProfile` around :116/:134), `web/lib/student-store.ts` (:178 load, :187 local merge, :387/:396 upsert/merge), `web/lib/mcp/rules.ts` (:203-296), `web/lib/mcp/tools.ts` (`activityFields` :611-631, tools :633/:651/:669, `get_activities` :293)
- Test: `web/lib/mcp-rules.test.ts`, `web/lib/profile-tests.test.ts`

**Interfaces:**
- Consumes: `upgradeActivities`, `caActivityIssues`, `caHonorIssues`, `ucEntryIssues`.
- Produces: profiles always carry v2 `activities`; MCP `add_activity` / `update_activity` accept every v2 field (zod enums from `CA_ACTIVITY_TYPES`, `CA_SPORTS`, `UC_EDPREP_PROGRAMS` values) and reject what the validators mark `invalid` (missing answers are allowed and reported back as "needs an answer").

- [ ] **Step 1: Write failing tests** in `mcp-rules.test.ts`: adding a Common App activity with type `"Work (Paid)"` is rejected naming the valid list; with `"Employment or work (paid)"` and `hoursPerWeek: 200` rejected with the 1-168 message; a v1 profile passed through `normalizeActivities` comes back v2; `update_activity` setting `awardLevels: ["state","regional"]` on a UC award stores both. In `profile-tests.test.ts`: a row with v1 `activities` maps to a profile with `activities.version === 2`.
- [ ] **Step 2: Run** `cd web && node --test lib/mcp-rules.test.ts lib/profile-tests.test.ts` → FAIL.
- [ ] **Step 3: Implement**: every load and the first-sign-in merge pass both sides through `upgradeActivities`; saves write v2; MCP schema/rules follow Task 1 types.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(activities): store and MCP tools use the 2026-27 format`.

### Task 4: Readers (résumé, teacher view, AI context, fit, share links)

**Files:**
- Modify: `web/lib/resume.ts` (:56 type strings → new labels, :71 `fromCa`, :81 `fromUc` with `awardLevels`, `jobTitle`), `web/components/TeacherDetailActivities.tsx` (:26/:40/:52), `web/lib/ai-context.ts` (:93-106; add the new fields as plain lines), `web/lib/fit.ts` (:29 type check), `web/lib/share-links.ts` `normalizePortfolioView` (:199-256, run the result through `upgradeActivities` so both RPC shapes work), `web/components/ShareViews.tsx` (:217), `web/lib/roster.ts` (:139 upgrade the teacher payload)
- Test: `web/lib/resume.test.ts`, `web/lib/share-links.test.ts`, `web/lib/roster.test.ts`, `web/lib/fields.test.ts`

**Interfaces:** Consumes Task 1-2 types; produces nothing new.

- [ ] **Step 1: Update failing tests**: résumé puts an "Employment or work (paid)" activity in the work section and shows "Captain" only when `leadership` is true; a UC work entry shows job title + workplace; `normalizePortfolioView` given a v1-shaped payload and a v2-shaped payload yields the same v2 activities; roster detail of a v1 teacher payload is v2.
- [ ] **Step 2: Run** `cd web && node --test lib/resume.test.ts lib/share-links.test.ts lib/roster.test.ts lib/fields.test.ts` → FAIL.
- [ ] **Step 3: Implement** the reader changes (no reader may read a v1 key).
- [ ] **Step 4: Run** the full web checks (Global Constraints) → exit 0 except the editor (Task 5-6).
- [ ] **Step 5: Commit** `feat(activities): readers use the 2026-27 format`.

### Task 5: Activities page, Common App tab

**Files:**
- Modify: `web/components/ActivitiesEditor.tsx` (Common App section ~:223, label maps :37/:73-101, save :433-438)
- Modify: `web/lib/i18n/messages/writing.ts` (en :76-164, zh-TW :260-326), `web/lib/i18n/messages/teacher.ts` (:159-170, :470-481)
- Test: `web/lib/i18n.test.ts` (existing key check), `web/lib/activities.test.ts` (visibility helper)

**Interfaces:**
- Consumes: Task 1 lists/validators.
- Produces: `export function caVisibleQuestions(a: CaActivity): (keyof CaActivity)[]` in `web/lib/activities.ts` (the show/hide rules of spec §3.4, in portal order), used by the editor and by Task 9.

- [ ] **Step 1: Write failing test**: `caVisibleQuestions` for type Robotics / leadership null / grades [] → `["type","description","organization","leadership","grades","hoursPerWeek","weeksPerYear","continueInCollege"]`; Athletics (other) adds `"sport"` after `"type"`; leadership true adds `"position"`; grades ["11"] adds `"timing"`; grades ["PG"] adds `"afterStart","stillParticipating"`; stillParticipating false adds `"afterEnd"`.
- [ ] **Step 2: Run** `cd web && node --test lib/activities.test.ts` → FAIL.
- [ ] **Step 3: Implement** the helper and the tab: portal wording and order, type `<select>` with `CA_ACTIVITY_TYPES` shown through translated labels, sport `<select>` with `CA_SPORTS`, month inputs for dates (`type="month"`), character counters, inline errors from `caActivityIssues` (saving is allowed with "missing" issues, blocked on "invalid"), "needs an answer" badge per item and a count at the top, the `legacy` note with a "Dismiss" button that clears it. Use `buttonClass`/tone helpers per CLAUDE.md (no raw colour classes).
- [ ] **Step 4: Run** the web checks → exit 0; then `npm run dev` via `preview_start` and check the tab in the browser pane (show/hide rules, a 151-char description shows the error and does not save).
- [ ] **Step 5: Commit** `feat(activities): Common App tab matches the 2026-27 form`.

### Task 6: Activities page, UC tab

**Files:**
- Modify: `web/components/ActivitiesEditor.tsx` (UC section ~:280), i18n files as in Task 5
- Test: `web/lib/activities.test.ts`

**Interfaces:** Produces `export function ucVisibleQuestions(e: UcEntry): (keyof UcEntry)[]` (per category, spec §3.2; `afterYears`/`afterMonths` only with PG and not for award; `end` only when `stillWorking === false`; `name` for edprep only when `program === "18"`).

- [ ] **Step 1: Write failing tests** for `ucVisibleQuestions`: award → `["name","awardLevels","awardType","grades","extra","description"]`; edprep program "6" omits `name`, "18" includes it; work with grades ["10"] → includes `"workHours"` and `"stillWorking","start"`, `stillWorking: false` adds `"end"`; extracurricular with ["PG"] adds `"afterYears","afterMonths"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the helper and the tab: award level checkboxes (multi), UC program `<select>`, work grid (per ticked grade: School year hours / Summer hours), years (0-10, "10+") and months (0-11) selects, counters using `ucTextLength`, the "Copy from Common App" button on the new `ucDraftsFromCommonApp`.
- [ ] **Step 4: Run** web checks → exit 0; check the tab in the browser pane.
- [ ] **Step 5: Commit** `feat(activities): UC tab matches the UC form`.

### Task 7: Migration 0038 (SQL converter, backfill, `portfolio_view`)

**Files:**
- Create: `supabase/migrations/0038_activities_v2.sql`
- Modify: `supabase/patches/2026-10-27_share_links_smoke_test.sql` (:24, :158 to v2 keys), `CLAUDE.md` (next migration number; activities v2 note)

**Interfaces:**
- Produces: `public.activities_v2(p jsonb) returns jsonb` (immutable, SQL twin of `upgradeActivities`, same rules); `portfolio_view` redefined to read `public.activities_v2(sp.activities)` and return the v2 keys; a backup table `private.activities_backup_0038(user_id uuid, activities jsonb, saved_at timestamptz)`; the backfill `update public.student_profiles set activities = public.activities_v2(activities) where coalesce((activities->>'version')::int, 1) < 2`.

- [ ] **Step 1: Write the parity check first**: a script `scripts/check_activities_sql.mjs` that prints `select public.activities_v2('<v1 fixture>'::jsonb)` SQL for each student in `web/lib/fixtures/activities-v1.json` and compares a pasted result file with `activities-v2.json`, exit 1 on any difference.
- [ ] **Step 2: Write the migration** (function + `portfolio_view` + backup table + backfill as separate statements, backfill last).
- [ ] **Step 3: Apply** the function and `portfolio_view` statements with `apply_migration` (DDL runs without approval); run the parity SELECTs through `execute_sql`; save the results; `node scripts/check_activities_sql.mjs <results>` → exit 0.
- [ ] **Step 4: Backfill** after the web part of PR 1 is live: run the backup INSERT (`insert into private.activities_backup_0038 select user_id, activities, now() from public.student_profiles`), then the UPDATE; the owner approves the MCP prompt. Verify: `select count(*) from public.student_profiles where coalesce((activities->>'version')::int,1) < 2` → 0, and the backup row count equals the profile count.
- [ ] **Step 5: Run** the share-links smoke test patch → passes.
- [ ] **Step 6: Commit** `feat(db): activities v2 converter, backfill and portfolio view`; open PR 1 (Tasks 1-7), run all web checks, merge.

## Part 2: extension access (PR 2)

### Task 8: Token scopes and `extension_activities`

**Files:**
- Create: `supabase/migrations/0039_extension_activities.sql`
- Modify: `web/lib/extension-api.ts` (:35 `createExtensionToken(label?, scopes = ["transcript","activities"])`), `web/components/ExtensionConnect.tsx` (:106 consent text names activities and honors; en + zh-TW), `extension/src/auth.ts` (new `loadActivities`), `extension/src/messages.ts` (`PanelRequest` + `PanelResponse` `loadActivities`), `extension/src/background.ts` (:6-20 handle it), `extension/src/panel.ts` (:101 consent text)
- Test: `extension/src/auth.test.ts`

**Interfaces:**
- Produces: `extension_tokens.scopes text[] not null default '{transcript}'`; `create_extension_token(p_label text default 'Chrome extension', p_scopes text[] default '{transcript}')`; `public.extension_activities(p_token text) returns jsonb` → `{ ok: true, activities: <v2 commonApp + uc via public.activities_v2> }` or `{ ok: false, error: "invalid_token" | "students_only" | "no_scope" }` (anon-callable, same checks as `extension_transcript` + `'activities' = any(scopes)`).
  ```ts
  export type ActivitiesResult = { ok: true; data: ActivityData } | { ok: false; reason: "signed_out" | "students_only" | "reconnect" | "network" };
  export function parseActivitiesResponse(body: unknown): ActivitiesResult;  // "no_scope" → "reconnect", "invalid_token" → "signed_out"
  export async function loadActivities(): Promise<ActivitiesResult>;
  ```
- [ ] **Step 1: Write failing tests** for `parseActivitiesResponse`: `{ok:false,error:"no_scope"}` → `reconnect`; `invalid_token` → `signed_out`; a v1-shaped `activities` → `data.version === 2` (runs `upgradeActivities`); garbage → `network`.
- [ ] **Step 2: Run** `cd extension && node --test src/auth.test.ts` → FAIL.
- [ ] **Step 3: Implement** the migration (apply with `apply_migration`; DDL only), the web wrapper and consent text, and the extension functions. The panel shows "Reconnect to allow activities" with the existing sign-in button when the result is `reconnect`; the transcript fill is untouched.
- [ ] **Step 4: Verify**: tests PASS; with `execute_sql`, an old token (scopes `{transcript}`) gets `no_scope`, a new one gets `ok: true`; `extension_transcript` unchanged for both.
- [ ] **Step 5: Commit** `feat(extension): activities access for new extension tokens`; PR 2 with all checks, merge.

## Part 3: Common App filler (PR 3)

### Task 9: Common App fill plan (pure)

**Files:**
- Create: `web/lib/activities-fill.ts`
- Test: `web/lib/activities-fill.test.ts`

**Interfaces:**
- Consumes: Task 1 types/validators, `caVisibleQuestions`.
- Produces:
  ```ts
  export type CaPage = "activities" | "honors";
  export const CA_PAGE_LIMIT: Record<CaPage, number>;                // { activities: 10, honors: 5 }
  export type CaAnswer = { question: string; kind: "select" | "text" | "radio" | "checks" | "date"; value: string | string[] | null };
  // question = the portal label text to match (contains-match, case-insensitive), e.g. "Activity or experience type", "Sport/team",
  // "Describe this activity", "Organization or group", "specific position or leadership role", "What was your role?",
  // "When did you participate?", "Time of year", "Start date", "still participating", "End date", "Hours spent per week",
  // "Weeks spent per year", "participating in this activity in college"; honors: "title", "Grade level", "Level(s) of recognition".
  // value null = clear the question. Dates as "Month YYYY" (e.g. "September 2025"). Checks as the portal's labels.
  export type CaSlotPlan = { sourceId: string; label: string; answers: CaAnswer[] };   // answers cover EVERY question of the slot, in reveal order
  export type PlanProblem = { label: string; reasons: string[] };
  export type CaPagePlan = { page: CaPage; slots: CaSlotPlan[]; blocked: PlanProblem[]; blanks: PlanProblem[] };
  export function buildCaPagePlan(data: ActivityData, page: CaPage, pickIds?: string[]): CaPagePlan;
  export function itemLabel(page: CaPage, item: CaActivity | CaHonor): string;  // organization, else type; honor title
  export function keepRoom(page: CaPage, existing: number): number;              // max(0, limit - existing)
  export function replacedNote(portal: "Common App" | "UC", what: string, names: string[]): string;
  // → `Replaced the ${n} ${what} that were already on ${portal}: ${names.join(", ")}.`
  export function readBackMismatches(plan: CaPagePlan, shown: Record<string, string | string[]>[]): string[];
  ```
- [ ] **Step 1: Write failing tests**: a Robotics activity → 14 answers in reveal order with `sport`, `position`, `timing`, dates as `null` clears where hidden; Athletics + Soccer → sport answer "Soccer"; PG with afterStart "2025-09" → date "September 2025"; continueInCollege "not_sure" → radio "Not sure"; an item with a 151-char description lands in `blocked` (reason names the 150 limit) and not in `slots`; an item missing hours lands in both `slots` (hours `null`) and `blanks`; `pickIds` limits and orders slots; `keepRoom("activities", 10) === 0`, `keepRoom("honors", 2) === 3`; `replacedNote("Common App","activities",["A","B"])` exact text; `readBackMismatches` reports `Activity 2: Hours spent per week shows "" (sent "10")`.
- [ ] **Step 2: Run** `cd web && node --test lib/activities-fill.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(extension): Common App activities fill plan`.

### Task 10: Common App page driver

**Files:**
- Create: `extension/src/commonapp/activities.ts`, `extension/src/commonapp/fake-activities.ts` (fake page in the style of `fake-commonapp.ts`: gate radios, slots with every control type, Add another, Remove + confirm, Continue, `ng-invalid` marking, a hidden slot pre-filled with stale answers)
- Modify: `extension/src/commonapp/pages.ts` (`CA_ACTIVITIES_PATH = "/common/7/232"`, `CA_HONORS_PATH = "/common/4/25"`, continue ids `sectionContinue232` / `sectionContinue25`, gate questions 1788 / 1970, add buttons `addQues1020` / `addQues1971`)
- Test: `extension/src/commonapp/activities.test.ts`

**Interfaces:**
- Consumes: Task 9 types; `commonapp/dom.ts` (`waitFor`, `need`, `click`, `isChecked`, `isShown`, `setText`, `selectNgOption`, `clearNg`, `checkStop`, `PageChanged`, `TIMING`, `PageResult`).
- Produces:
  ```ts
  export function inspectCaPage(doc: Document, page: CaPage): { existing: string[] };   // one label per visible slot with any answer
  export async function fillCaPage(doc: Document, plan: CaPagePlan, mode: FillMode, existing: number): Promise<PageResult>;
  export function readCaPage(doc: Document, page: CaPage): Record<string, string | string[]>[];  // per visible slot: question → shown value
  ```
  `fillCaPage`: gate Yes; replace = write slots 1..M in place (add slots as needed), then remove surplus from the end (Remove + `#alert_rc_r`); keep = add after `existing`. Every answer of every touched slot is written (null → clear: `setText("")`, `clearNg`, the group's `Clear answer`, untick). Before Continue, any touched control with `ng-invalid` → stop with `stoppedReason` naming slot + question, Continue NOT pressed. Never navigates.
- [ ] **Step 1: Write failing tests** on the fake page: replace with 2 items over 3 existing → slots 1-2 hold the new values, slot 3 removed via the confirm dialog, Continue pressed once; keep with 1 existing + 2 picks → slots 2-3 filled, slot 1 untouched; **re-added slot holding stale answers ends with exactly the plan's answers (stale organization cleared)**; an answer the fake marks `ng-invalid` → `stoppedReason` set and Continue not pressed; ng-select type-ahead picks "Soccer"; dates typed as "September 2025"; stop requested mid-fill → `StopRequested`, Continue not pressed.
- [ ] **Step 2: Run** `cd extension && node --test src/commonapp/activities.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit` exit 0.
- [ ] **Step 5: Commit** `feat(extension): fill Common App activities and honors pages`.

### Task 11: Panel flow for Common App (ask, toggles, read-back, report)

**Files:**
- Create: `extension/src/activities-flow.ts`
- Modify: `extension/src/messages.ts` (`ContentMessage`: `{ type: "caInspect"; page: CaPage }`, `{ type: "caFill"; plan: CaPagePlan; mode: FillMode; existing: number }`, `{ type: "caRead"; page: CaPage }` and responses), `extension/src/content.ts` (handle them), `extension/src/sites.ts` / `panel.ts` (offer "Fill activities" on `/common/7/232`, "Fill honors" on `/common/4/25`, otherwise say which page to open)
- Test: `extension/src/activities-flow.test.ts`

**Interfaces:**
- Consumes: Tasks 8-10 (`loadActivities`, `buildCaPagePlan`, `keepRoom`, `replacedNote`, `readBackMismatches`, content messages).
- Produces:
  ```ts
  export type Decision = { mode: "replace" } | { mode: "keep"; pickIds: string[] };
  export type AskUi = { askReplace(existing: string[], incoming: number): Promise<boolean>;
                        pick(items: { id: string; label: string }[], max: number): Promise<string[]> };
  export async function decide(existing: string[], items: { id: string; label: string }[], limit: number, ui: AskUi): Promise<Decision>;
  export type CaDriver = { inspect(): Promise<string[]>; fill(plan: CaPagePlan, mode: FillMode, existing: number): Promise<PageResult>;
                           reopen(): Promise<void>; read(): Promise<Record<string, string | string[]>[]>; path(): Promise<string> };
  export async function runCaPage(page: CaPage, data: ActivityData, driver: CaDriver, ui: AskUi): Promise<ActivitiesReport>;
  export type ActivitiesReport = { filled: string[]; replaced: string | null; blocked: PlanProblem[]; blanks: PlanProblem[];
                                   notAdded: string[]; mismatches: string[]; stopped: string | null };
  ```
  Owner's rule: no existing → keep with all items, no question. Existing → `askReplace` (panel text: "Common App already has N activities. Replace all of them with the M in your tracker?"); yes → replace, `replaced = replacedNote(...)`; no → `pick` with `max = keepRoom`; if `max === 0` the panel says "This page is full (10 of 10). Nothing can be added." and nothing runs. After a fill with no `stoppedReason`: `reopen()` (navigate back to the page; nothing is dirty), `read()`, `mismatches = readBackMismatches(...)`. If `path()` starts with `/login` at any step → `stopped = "Common App signed you out. Sign in again; nothing after this point was saved."`.
- [ ] **Step 1: Write failing tests** with fake driver/ui: empty page never calls `askReplace`; 4 existing + yes → `replaced` text lists the 4 names; no + 7 items + 6 room → `pick` called with max 6; full page → no `pick`, no fill, report says full; a read-back difference → listed in `mismatches`; driver `path()` returning `/login` mid-run → `stopped` with the signed-out text and `filled` empty.
- [ ] **Step 2: Run** `cd extension && node --test src/activities-flow.test.ts` → FAIL.
- [ ] **Step 3: Implement** the flow, the content-script handlers and the panel UI (question dialog, toggle list with remaining-room counter, report listing filled / replaced / blocked with reasons / blanks / not added / mismatches; en + zh-TW).
- [ ] **Step 4: Run** extension checks → exit 0; build `dist`.
- [ ] **Step 5: Live check** on the throwaway Common App account: activities replace (overwrites Activity 1 test data, see memory), keep with toggles, honors fill; read-back clean. Note results in `extension/TESTING.md` (new section "Activities & honors").
- [ ] **Step 6: Commit** `feat(extension): Common App activities and honors fill`; `npm run package`, commit the zip; PR 3 with all checks, merge.

## Part 4: UC filler (PR 4)

### Task 12: UC fill plan (pure)

**Files:**
- Create: `web/lib/uc-activities-fill.ts`
- Test: `web/lib/uc-activities-fill.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type UcFieldSet = { id: string; kind: "text" | "select" | "check" | "radio"; value: string | boolean };  // ids from research §7
  export type UcFormPlan = { sourceId: string; label: string; category: "Award" | "EdPrep" | "ExtraCurr" | "OtherCourse" | "Volunteer" | "WorkExp";
                             fields: UcFieldSet[]; expect: Record<string, string[]> };   // expect = list-page "subsectionheader" → descriptions
  export function buildUcFormPlans(entries: UcEntry[], pickIds?: string[]): { forms: UcFormPlan[]; blocked: PlanProblem[]; blanks: PlanProblem[] };
  export function ucItemLabel(e: UcEntry): string;                    // "<category label>: <name>"
  export function ucReadBackMismatches(plan: UcFormPlan, shown: Record<string, string[]>): string[];
  ```
  Field order = reveal order (category first, grades before the after-12th selects, `isWorkExp<G>` before its school/summer boxes, `isWorkExpCurrWorking` before dates). Grade ids: `is<Prefix><9th|10th|11th|12th|After12th>` with prefixes Award, EdPrep, ExtraCurr, OtherCourse, Volunteer, WorkExp; after-12th selects `<prefix>YearsAfter12` / `<prefix>MonthsAfter12` (work: `workExpAfter12thYears/Months`), "10+" → value "11"; award type `#Academic` = "A", `#Non-academic` = "O"; still working `N`/`Y`; dates split into month "01"-"12" + year.
- [ ] **Step 1: Write failing tests**: extracurricular with grades 10/11, 5.5 h, 30 wk → fields `typeofactivity=ExtraCurr`, `extraCurName`, `extraCurrDescription`, `isExtraCurr10th=true`, `isExtraCurr11th=true`, hours "5.5", weeks "30", and `expect["Time you spent"] = ["5.5 hours per week","30.0 weeks per year"]`; award with levels state+national → both level checks true; work with `stillWorking: false`, start "2025-06", end "2026-08" → month/year selects "06"/"2025", "08"/"2026"; PG with `afterYears: "10+"` → select value "11"; a 349-char description + 1 newline → `blocked`; edprep Other → `edPrepId=18` + `edPrep_other`.
- [ ] **Step 2: Run** `cd web && node --test lib/uc-activities-fill.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(extension): UC activities fill plan`.

### Task 13: UC page handlers

**Files:**
- Create: `extension/src/uc/activities.ts`, `extension/src/uc/fake-activities.ts` (fake list page with items, Delete popup `#mdl`; fake add page with `#typeofactivity` change showing one set, `char_count_N` truncation on keyup, `#save` with the hours/weeks error labels)
- Modify: `extension/src/assist-content.ts` (:90-104 style handlers), `extension/src/messages.ts` (`AssistMessage`: `ucActList`, `ucActDelete { activityId }`, `ucActAdd`, `ucActFill { plan }`; responses)
- Test: `extension/src/uc/activities.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type UcListed = { activityId: string; category: string; index: number; name: string; shown: Record<string, string[]> };
  export function readUcList(doc: Document): UcListed[];             // from div.acordion sections, button ids edit_/delete_<Cat>_<N>_<id>
  export function deleteUcEntry(doc: Document, activityId: string): void;   // Delete, then #warningYesButton
  export function fillUcForm(doc: Document, plan: UcFormPlan): { ok: true } | { ok: false; error: string };  // sets fields, jQuery-style change events, clicks #save
  ```
  `fillUcForm` re-checks `ucTextLength` of every textarea before saving and refuses (no `#save`) if anything would be cut.
- [ ] **Step 1: Write failing tests**: `readUcList` on the fake list returns id 13836651, category ExtraCurr, name "Test Club (filler research)", shown "Time you spent" values; `deleteUcEntry` clicks Delete then Yes (never No); `fillUcForm` selects the category before any field, ticks grades before after-12th selects, clicks `#save` once; a plan whose text the fake would truncate → `ok: false`, `#save` not clicked.
- [ ] **Step 2: Run** `cd extension && node --test src/uc/activities.test.ts` → FAIL.
- [ ] **Step 3: Implement**, reusing `uc/fill.ts` `pick`/`fire` (export them).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(extension): UC activities page handlers`.

### Task 14: UC run across page loads, panel and live check

**Files:**
- Create: `extension/src/uc/activities-run.ts`
- Modify: `extension/src/panel.ts` / `extension/src/uc/panel.ts` (offer "Fill activities & awards" on `/my-application/introactivitiesawards`), `extension/TESTING.md`, `CLAUDE.md` (extension section: activities filler)
- Test: `extension/src/uc/activities-run.test.ts`

**Interfaces:**
- Consumes: `UcTab` (`uc/run.ts`: `send`, `go`, `afterReload`), Task 11 `decide` / `AskUi` / `ActivitiesReport` / `replacedNote`, Tasks 12-13.
- Produces: `export async function runUcActivities(tab: UcTab, data: ActivityData, ui: AskUi): Promise<ActivitiesReport>`. Steps: `ucActList` → `decide` (limit 20) → replace: `ucActDelete` each listed entry (one reload each) → per form: `ucActAdd` (reload) → `ucActFill` (reload) → back on the list; after all, `ucActList` and `ucReadBackMismatches` per added entry. Only the original tab; a page path containing `/login` → stop with "UC signed you out. Sign in again; entries listed as added were saved."; a fill error → stop, the rest listed in `notAdded`.
- [ ] **Step 1: Write failing tests** with a fake `UcTab`: replace deletes 3 then adds 2 in tracker order; keep with 18 existing → `pick` max 2; a fill error on the 2nd form stops the run with forms 3+ in `notAdded`; a `/login` path after a reload stops with the signed-out text; read-back difference listed.
- [ ] **Step 2: Run** `cd extension && node --test src/uc/activities-run.test.ts` → FAIL.
- [ ] **Step 3: Implement** the run and the panel offer (same dialog, toggle list and report as Task 11).
- [ ] **Step 4: Run** extension checks + web checks → exit 0; `node build.mjs`.
- [ ] **Step 5: Live check** on the throwaway UC account (it holds "Test Club (filler research)"): keep run adding 2, then replace run; read-back clean; record in `TESTING.md`.
- [ ] **Step 6: Commit** `feat(extension): UC activities & awards fill`; `npm run package`, commit the zip; PR 4 with all checks, merge.
