# Teacher / counselor accounts — design & plan

Date: 2026-10-24 · Status: **draft for approval, nothing built yet**

## 1. Why
The tracker is student-only. Counselors and teachers (and private tutors) guide many students through
applications but can't see where anyone stands. Goal: a teacher signs in, picks "teacher" at registration,
gets a different UI, links students through **codes** (a class code or a personal/individual code), and can
see most of what a student has entered, so they can spot who is behind and help.

## 2. Goals / non-goals / anti-goals
**Goals**
- Role chosen at registration: student or teacher/counselor. Teachers get their own navigation and pages.
- Linking by code: **classes** (many students, one code per class) and **individuals** (one personal code per teacher, 1-on-1).
- Teacher sees most student data, read-only: profile, test scores, GPA, college list + statuses, deadlines, checklist, activities, essay status.
- Roster view that answers "who needs attention?" at a glance.
- Student stays in control: sees exactly what is shared, can leave any time.

**Non-goals (v1)**: messaging/chat, assigning tasks to classes, teacher email digests, school/admin
tiers, teachers editing student data, payments for teachers, teacher access through the AI/MCP connector.

**Anti-goals (failure even if it "works")**
- A teacher seeing **portal usernames/passwords** (Common App, college portals). Never exposed.
- Anyone reading another student's data because they claimed "teacher" or guessed a code.
- Existing students losing data or being forced through a broken flow.

## 3. Key facts about the current code (verified 2026-10-24)
- Sign-in is **Google OAuth only** via Supabase, client-side, no middleware (`web/lib/student-store.ts`). "Registering" = first sign-in. Signed-out use is local-only and stays student-style.
- Student data lives in `student_profiles` (one row; jsonb columns `test_details, interested, activities, resume, portals, essays, target_regions`) and `student_colleges` (per-college rows incl. `notes`, `portal_username`, `portal_password`). RLS: owner only.
- **Problem:** secrets sit in the *same rows* as shareable data (`portals` jsonb, `portal_password`, `notes`). Row-level RLS cannot hide a column, so a teacher "select" policy on those tables would leak passwords.
  → **Teachers never get SELECT policies on student tables.** All teacher reads go through `SECURITY DEFINER` functions that return an explicit, column-limited JSON shape.
- Next 16 + `cacheComponents`: read `web/node_modules/next/dist/docs/` before writing routes. Role gating in the UI is client-side (no proxy); **real security is in the database**.
- Next migration number: 0020.

## 4. Design

### 4.1 Roles & registration
- Table `user_roles(user_id pk → auth.users, role in ('student','teacher'), created_at)`.
- After Google sign-in, if the user has no role row → redirect to `/welcome`: "I'm a student" / "I'm a teacher or counselor" (+ name, school for teachers). Role is saved once.
- **Backfill:** every existing user with a `student_profiles` row gets `student`. Signed-out/local mode unchanged.
- `teacher_profiles(user_id pk, display_name, school, personal_code unique)`.
- One role per account. Changing role is only allowed with zero links, via Account page. (To try both sides, use two Google accounts.)
- A teacher claim is self-declared: it grants **nothing** by itself; access always needs a student redeeming a code.

### 4.2 Codes, classes, links
- `classes(id, teacher_id, name, school_year, code unique, archived, created_at)`.
- `class_members(class_id, student_id, joined_at)`.
- `teacher_links(teacher_id, student_id, via 'class'|'individual', share_essays bool default true, created_at, unique(teacher_id, student_id))` — **this row is the access grant**. One link per teacher/student pair no matter how many classes.
- Codes: 8 chars from an unambiguous alphabet (no 0/O/1/I), shown as `K7M4-QX2P`. Teacher can regenerate/disable a class code or the personal code, and set an optional expiry.
- `redeem_code(code)` RPC: validates, **returns a preview first** (teacher name, school, class name, what will be shared), student confirms → link created. Failed attempts are logged and rate-limited (e.g. 10/hour/user) so codes can't be brute-forced.
- Student can leave any time (deletes link + class membership). Teacher can remove a student. Deleting an account cascades.

### 4.3 What the teacher can see
| Data | Visible | Source of truth |
|---|---|---|
| Name, email, class year, target regions, international/aid flags | yes | profile, auth |
| SAT/ACT/GPA/English scores | yes | profile, `test_details` |
| College list, status, plan (ED/EA/RD), checklist, fit label, deadlines | yes | `student_colleges` |
| Activities & honors | yes | `activities` |
| Essay status, prompt choice, Google Doc links | yes, student can turn off (`share_essays`) | `essays` |
| Resume settings | no (v1) | |
| **Portal usernames/passwords** | **never** | `portals`, `portal_*` |
| Student's private college notes (`notes`) | no | |
- Teacher-only notes (new `teacher_notes`) are private to the teacher in v1.

### 4.4 Teacher UI (different navigation)
Route group `(teacher)`; student-only pages (My list, Profile, Application, Resume, Connect AI) are hidden for teachers; College explorer/compare stay available.
- **Dashboard / Roster**: table of linked students — name, class, #colleges, next deadline, checklist %, flags. Filter by class / individual, sort, search.
- **Attention flags** (computed in SQL): no colleges yet; deadline ≤ 14 days with incomplete checklist; no test scores; no activity in 30 days (`updated_at`); essay not started within 30 days of a deadline.
- **Classes**: create/rename/archive, show/copy/regenerate code, member list, remove student.
- **Individuals**: personal code, list of 1-on-1 students.
- **Student detail** (read-only tabs mirroring the student's own pages): Overview, College list, Deadlines, Activities, Essays, Scores, Private notes.
- **Upcoming deadlines** across all students (one calendar/list).
- Student side: Account → **"My counselors"** (enter code, see linked teachers, toggle essay sharing, leave).

### 4.5 Data access (how it's secured)
- All teacher reads: `teacher_roster()`, `teacher_student(student_id)`, `teacher_deadlines()` — `SECURITY DEFINER`, `set search_path = ''`, check caller has role `teacher` **and** a `teacher_links` row; return only the §4.3 fields. `REVOKE ALL … FROM public, anon; GRANT EXECUTE … TO authenticated`.
- RLS on the new tables: teachers manage their own `classes`/`teacher_notes`; students read/delete only their own `class_members`/`teacher_links`; codes resolved only through RPC (no table read for others).
- The existing MCP/AI connector keeps student-only scope; teachers get no MCP access.

## 5. Phases (each ends with tests + a working app)
1. **Roles & onboarding** — migration 0020 (`user_roles`, `teacher_profiles`, backfill), `/welcome`, role in the store, role-based nav shell, teacher placeholder dashboard. *Done when:* new Google account can pick either role; existing users are untouched; RLS tested.
2. **Linking** — migration 0021 (`classes`, `class_members`, `teacher_links`, `redeem_code`, rate limit), teacher Classes/Individuals pages, student "My counselors" UI. *Done when:* student joins via class code and personal code with a confirm screen; leave/remove works; wrong/expired/revoked codes fail cleanly.
3. **Read access** — migration 0022 (read RPCs), roster, student detail, upcoming deadlines, attention flags. *Done when:* a linked teacher sees correct data, an unlinked teacher sees nothing, **portal secrets are provably absent** from every RPC response.
4. **Teacher notes + polish** — migration 0023, notes, CSV export of roster (no secrets), empty/error states.
5. **Later (separate brainstorms)**: counselor→student comments, assigning tasks to classes, email digests via the existing reminder function, verified-school badges, co-counselors.

## 6. Testing & verification
- Unit tests (vitest) for flag logic, code format/normalization, role routing helpers.
- **SQL/RLS tests** run against the Supabase project with `set local role authenticated` + fake JWT claims: student A cannot read B; unlinked teacher gets 0 rows; linked teacher gets no `portal*`/`notes` keys; student can leave; code brute-force limited.
- Browser check of both roles in the preview; `npx tsc --noEmit && npm run lint && npm test && npm run build` before each commit.
- Supabase quirk: UPDATE/DELETE via MCP may need owner approval — put such SQL in `supabase/patches/` if it times out.

## 7. Risks / things to flag
- **Minors & privacy:** many users are under 18 and this shares their data with adults. Needs a clear consent screen (built in §4.2) and a privacy-policy/ToS update before launch — suggest running the website-legal-review skill after Phase 3.
- **Fake teacher:** a student could be tricked into using a bad actor's code. Mitigation v1: confirm screen showing teacher name + school; v2: verified-school badge.
- **Portal passwords are stored in plain text today** (migrations 0007/0013). Out of scope here, but the teacher feature raises the stakes; worth a separate hardening task.
- jsonb shapes (`activities`, `essays`, `test_details`) are defined in `web/lib/*.ts`; the read RPCs must stay in sync with them (add a test that fails if keys drift).

## 8. Calls I made (change any you disagree with)
1. Role is chosen right after the first Google sign-in (there is no separate sign-up form), one role per account.
2. Teachers are free in v1 (no plan limits); students' existing plan limits unchanged.
3. Essays shared by default, student can opt out; portals and private notes never shared.
4. A student can be linked to many teachers; a teacher to many students.
5. Teacher access is read-only.
6. Codes don't expire by default; the teacher can set expiry/revoke.
7. Existing users are backfilled as students.
