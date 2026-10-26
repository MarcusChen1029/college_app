# Teacher accounts — Phase 1 (roles & onboarding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Google sign-in chooses student or teacher at `/welcome`; teachers get their own nav and a placeholder dashboard; existing users are untouched.

**Architecture:** `user_roles` + `teacher_profiles` tables written only through a `SECURITY DEFINER` RPC. `student-store.ts` loads the role first and skips student tables (and the local-data merge) unless the role is `student`. A client `RoleGate` redirects by role; a client `SiteNav` swaps the nav.

**Tech Stack:** Next 16 (App Router, `cacheComponents`), React 19, Tailwind 4, supabase-js 2, Supabase Postgres/RLS, `node --test` for `lib/*.test.ts`.

**Spec:** `docs/superpowers/specs/2026-10-24-teacher-counselor-design.md` (§4.1, Phase 1)

## Global Constraints
- Read the relevant guide in `web/node_modules/next/dist/docs/` before writing Next code (`web/AGENTS.md`).
- Roles are exactly `'student'` and `'teacher'`; one role per account, set once in Phase 1.
- Migration number **0020**; apply it to Supabase project `eyvmtaggayqizllaseiu` and keep the file in `supabase/migrations/`.
- DB security lives in Postgres; UI gating is client-side (no proxy/middleware).
- `SECURITY DEFINER` functions use `set search_path = ''` and `revoke ... from public, anon`.
- Do **not** commit secrets; do not enter credentials anywhere. Commit style `feat:`/`docs:`; end with the Co-Authored-By line from the session.
- Before the first commit run `git branch --show-current` (branch is `claude/inspiring-hypatia-817lp8`).
- Pre-commit checks: `cd web && npx tsc --noEmit && npm run lint && npm test && npm run build`.

## Review Focus
- Existing user signs in → must NOT be sent to `/welcome` (backfill) and sees today's student nav.
- Signed-out visitor → local mode and student nav unchanged, no redirect.
- New teacher with leftover local student data → local data is not merged into the account and not wiped.
- Role RPC called twice / with `role='admin'` / blank teacher name → rejected, no partial rows.
- Teacher opens a student-only URL (`/profile`, `/application/...`) → redirected to `/teacher`.
- User reloads `/welcome` after choosing → redirected home, not shown the chooser again.

## File Structure
- Create `supabase/migrations/0020_user_roles.sql` — tables, RLS, RPC, backfill.
- Create `web/lib/roles.ts` (+ `roles.test.ts`) — pure helpers: types, parsing, validation, routing, nav.
- Modify `web/lib/student-store.ts` — `role` in state, role-first `loadRemote`, `setRole`.
- Create `web/components/RoleGate.tsx`, `web/components/SiteNav.tsx`, `web/components/WelcomeForm.tsx`, `web/components/TeacherHome.tsx`.
- Create `web/app/(app)/welcome/page.tsx`, `web/app/(app)/teacher/page.tsx`.
- Modify `web/app/layout.tsx` (use `SiteNav`, mount `RoleGate`), `web/components/AccountPanel.tsx` (`AccountLink` target by role).
- Modify `CLAUDE.md` (migration number → 0021; mention roles) at the end.

---

### Task 1: Migration 0020 — roles, teacher profiles, RPC

**Files:** Create `supabase/migrations/0020_user_roles.sql`

**Interfaces:**
- Produces tables `public.user_roles(user_id uuid pk → auth.users on delete cascade, role text check in ('student','teacher'), created_at timestamptz)`, `public.teacher_profiles(user_id uuid pk → auth.users on delete cascade, display_name text not null, school text, created_at, updated_at)`.
- Produces RPC `public.set_my_role(p_role text, p_display_name text default null, p_school text default null) returns void` (authenticated only).
- RLS: both tables `select`/own row for authenticated; `teacher_profiles` also `update` own row; **no** insert/update/delete policy on `user_roles`, no insert on `teacher_profiles` (RPC only).

- [ ] **Step 1: Write the migration.** `set_my_role` raises if `auth.uid()` is null, if `p_role` not in the two values, if a role row already exists ("role already set"), or if `p_role='teacher'` and `btrim(p_display_name)` is empty; inserts `user_roles`, and for teachers a `teacher_profiles` row (trimmed name/school, school null if blank) in the same statement block. Backfill: `insert into user_roles select id,'student' from auth.users on conflict do nothing`. Add the `touch_updated_at` trigger (exists from 0001) on `teacher_profiles`.
- [ ] **Step 2: Apply** with `apply_migration` (name `user_roles`) on the project; then `list_tables` to confirm both tables exist with RLS enabled.
- [ ] **Step 3: RLS/RPC checks via `execute_sql`** (each in a transaction that is rolled back, using `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>"}', true)` with throwaway uuids inserted into `auth.users` inside the transaction):
  - new user with no role row: `select` on `user_roles` returns 0 rows
  - `set_my_role('teacher','  Ms Lee ','')` → role row `teacher`, profile `display_name='Ms Lee'`, `school is null`
  - second call → error "role already set"
  - `set_my_role('admin')` → error; `set_my_role('teacher','   ')` → error and **no** `user_roles` row left
  - user A cannot `select` user B's `user_roles`/`teacher_profiles`
  - direct `insert into user_roles` as authenticated → permission/RLS error
  - after the migration: `select count(*) from auth.users u left join user_roles r on r.user_id=u.id where r.user_id is null` = 0
  Expected: every case behaves as listed. Run `get_advisors` (security) and confirm no new warnings for the new objects.
- [ ] **Step 4: Commit** `feat: user roles and teacher profiles (migration 0020)`.

### Task 2: Pure role helpers (`web/lib/roles.ts`)

**Files:** Create `web/lib/roles.ts`, `web/lib/roles.test.ts`

**Interfaces — Produces:**
```ts
export type Role = "student" | "teacher";
export function parseRole(v: unknown): Role | null;                 // exact "student"/"teacher" else null
export function validateTeacher(i: { displayName: string; school: string }): { ok: true; value: { displayName: string; school: string | null } } | { ok: false; error: string };
export const STUDENT_ONLY_PATHS: readonly string[];                  // "/profile","/application","/activities","/resume","/connect-ai","/start","/pricing"
export function isStudentOnlyPath(pathname: string): boolean;       // prefix match on path segments ("/profile" and "/profile/x" yes; "/profiles" no)
export function homePathFor(role: Role | null): string;             // teacher "/teacher", student "/application/list", null "/welcome"
export function redirectFor(role: Role | null | undefined, pathname: string, signedIn: boolean): string | null;
export function navFor(role: Role | null | undefined): readonly (readonly [href: string, label: string])[];
```
`redirectFor` rules: not signed in or `role === undefined` (still loading) → `null`; signed in with `role === null` and path not `/welcome` → `"/welcome"`; role set and path `/welcome` → `homePathFor(role)`; teacher on a student-only path → `"/teacher"`; else `null`. `navFor`: signed-out/`undefined`/`student` → today's `NAV` list from `app/layout.tsx` (move it here unchanged); `teacher` → Colleges, Compare, Dashboard (`/teacher`).

- [ ] **Step 1: Write failing tests** (`node:test`, style of `plans.test.ts`) pinning: `parseRole("admin") === null`; `validateTeacher({displayName:"  ", school:""})` is `ok:false`; `validateTeacher({displayName:" Ms Lee ", school:" "})` → value `{displayName:"Ms Lee", school:null}`; `isStudentOnlyPath("/profiles") === false`, `("/application/list") === true`; every `redirectFor` rule above incl. signed-out → `null` and loading → `null`; `navFor("teacher")` has no `/profile`; `navFor(null)` equals `navFor("student")`.
- [ ] **Step 2: Run** `cd web && npm test` → FAIL (module missing).
- [ ] **Step 3: Implement** `roles.ts` to the signatures above.
- [ ] **Step 4: Run** `npm test` → all pass.
- [ ] **Step 5: Commit** `feat: role helpers`.

### Task 3: Store — role-first load and `setRole`

**Files:** Modify `web/lib/student-store.ts`

**Interfaces:**
- Consumes: `Role`, `parseRole` from `./roles`.
- Produces on `State`: `role: Role | null | undefined` (`undefined` = not loaded / signed out, `null` = signed in with no role yet); on `useStudent()` return: `role`, `setRole(role: Role, teacher?: { displayName: string; school: string | null }): Promise<string | null>` (error message or null), and `teacherProfile: { displayName: string; school: string | null } | null`.

- [ ] **Step 1:** Read `web/node_modules/next/dist/docs/` only if touching Next APIs (not needed here); re-read `loadRemote` (`student-store.ts:85-122`).
- [ ] **Step 2: Implement** — in `loadRemote`, first query `user_roles` (`maybeSingle`). If role is not `student` (null or teacher): for teacher also load `teacher_profiles`; `emit({ auth, role, teacherProfile, profile: {}, list: [], ready: true, syncing: false })` and **return without touching student tables, `local` data or `clearLocal()`**. If `student`, continue exactly as today and include `role` in the final `emit`. On sign-out (`onAuthStateChange` branch) reset `role: undefined, teacherProfile: null`. `setRole` calls `db().rpc("set_my_role", {...})`; on success re-runs `loadRemote(userId, email)` (so a new student gets today's merge of local data) and returns `null`; on error returns `error.message`. Change `signInWithGoogle`'s default `returnTo` to remain `/profile` (RoleGate redirects when needed).
- [ ] **Step 3: Verify** `npx tsc --noEmit` clean and `npm test` passes (existing tests untouched).
- [ ] **Step 4: Commit** `feat: load user role in the student store`.

### Task 4: Welcome page, gate, nav, teacher home

**Files:** Create `web/components/RoleGate.tsx`, `SiteNav.tsx`, `WelcomeForm.tsx`, `TeacherHome.tsx`, `web/app/(app)/welcome/page.tsx`, `web/app/(app)/teacher/page.tsx`; Modify `web/app/layout.tsx`, `web/components/AccountPanel.tsx`

**Interfaces — Consumes:** `useStudent()` (`auth`, `ready`, `role`, `teacherProfile`, `setRole`, `signOut`), `redirectFor`, `navFor`, `validateTeacher`, `GoogleSignIn` (`returnTo="/welcome"` when signed out).

- [ ] **Step 1: `RoleGate`** (`"use client"`, renders `null`): `usePathname` + `useRouter().replace` when `redirectFor(role, pathname, !!auth)` is non-null; mounted once in `app/layout.tsx` inside `<body>`.
- [ ] **Step 2: `SiteNav`** replaces the inline `NAV` map in `app/layout.tsx` (keep the same markup/classes); links from `navFor(role)`; hide the "Get started" pill when `role === "teacher"`. `AccountLink` points to `/teacher#account` for teachers, otherwise unchanged.
- [ ] **Step 3: `WelcomeForm`** — signed out: heading + `GoogleSignIn`; signed in with `role === null`: two large choice buttons "I'm a student" (calls `setRole("student")`, then `router.push(homePathFor("student"))`) and "I'm a teacher or counselor" (reveals name + school inputs, submit validated with `validateTeacher`, then `setRole("teacher", value)` and push `/teacher`); show the error string returned by `setRole`; disable buttons while busy. Page file: server component rendering `<WelcomeForm />` with `metadata.title = "Welcome"`.
- [ ] **Step 4: `TeacherHome`** — greeting with display name and school, a card "Classes and student links are coming next" (placeholder, no fake data), and an `#account` section with email and a Sign out button. Page file mirrors the welcome page (`metadata.title = "Teacher dashboard"`).
- [ ] **Step 5: Verify build** `npx tsc --noEmit && npm run lint && npm test && npm run build` → all exit 0.
- [ ] **Step 6: Commit** `feat: welcome page, role-based nav and teacher home`.

### Task 5: Verification & docs

- [ ] **Step 1: Dev server check** via `preview_start` (launch config `web` if present, else create `.claude/launch.json` entry for `npm run dev`): signed-out `/` shows today's nav and no redirect; `/welcome` shows the sign-in prompt; `/teacher` signed-out renders without error (shows sign-in prompt, not a crash); no console errors.
- [ ] **Step 2: Report honestly** that Google sign-in cannot be exercised by the agent (no credentials are entered); list the manual checks for the owner: (a) existing account → student nav, no `/welcome`; (b) new Google account → `/welcome` → student path; (c) new account → teacher path → `/teacher`, teacher nav, `/profile` redirects to `/teacher`; (d) reload `/welcome` → redirected.
- [ ] **Step 3: Update `CLAUDE.md`** — next migration `0021`; one line describing roles (`user_roles`, `set_my_role`, `RoleGate`) under Stack; commit `docs: note roles in CLAUDE.md`.
- [ ] **Step 4: Fresh reviewer** (T5 template, sonnet): review the branch diff against this plan's Review Focus; fix real findings.
