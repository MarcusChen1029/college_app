# Classroom Phase 1 (two-way basics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers can post announcements and hold conversations with linked students; students get one Counselors page
(`/counselor`) with announcements, tasks, messages and what each teacher can see; invite links replace typing codes.

**Architecture:** New tables behind SECURITY DEFINER RPCs (the 0028 pattern: RLS on, no policies, no table grants), pure
TypeScript models and validators in `web/lib/classroom.ts` mirrored from the SQL limits, client RPC wrappers in
`web/lib/classroom-api.ts`, and client components in `web/components/classroom/`. Unread counts come from one RPC,
shared across the header and pages by a small client store. No realtime, no email.

**Tech Stack:** Next.js 16 App Router (read `web/node_modules/next/dist/docs/` before Next code), React 19, Tailwind 4,
supabase-js 2, Postgres (Supabase), tests with `node:test` (`web/lib/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-03-classroom-two-way-design.md` (phase 1 = §7 item 1). The spec is binding where
this plan is narrower; reviewers get the spec section, not only the task.

## Global Constraints

- Teachers never get table access to anything new; every new read/write is an RPC with `set search_path = ''`, an explicit
  return column list, a check of `auth.uid()`, the caller's role (`user_roles`) and `public.is_linked(teacher, student)`.
- New RPCs never return more student data than `teacher_student` / `teacher_roster` do (0023); in conversation lists a
  teacher sees the student's display name only.
- Limits (spec §6), identical in SQL and `CLASSROOM_LIMITS`: post title 1-120, post body 1-4000, link ≤500 and http(s) only,
  message 1-2000, teacher 300 messages/day, student 50 messages/day, teacher 20 posts/day, 200 active (non-archived)
  posts per teacher, 100 conversations per teacher-student pair.
- Conversations, messages and post read marks hang off `teacher_links` with a composite FK `on delete cascade`.
- Text is plain text: React escapes it; only `splitLinks` output becomes `<a>` (http/https, `rel="noopener noreferrer
  nofollow"`, `target="_blank"`); long unbroken text wraps (`break-words`).
- Every user-facing string is in `web/lib/i18n/messages/classroom.ts` (en + zh-TW) or the namespace it already lives in;
  `i18n.test.ts` fails on missing AND unused keys, so moved strings are deleted from their old namespace.
- Never write raw red/amber/green classes; use `toneClass`/`buttonClass` from `web/lib/ui.ts` (CLAUDE.md rule).
- Classroom features are not gated by the student's plan.
- Migration number: the next free one at build time (0051 at time of writing). Right before applying, run
  `git fetch` + check `origin/main:supabase/migrations/` and the Supabase `list_migrations` tool; renumber if taken.
  Applying the migration needs the owner's OK.
- Work in a worktree on branch `feat/classroom` cut from `origin/main`. Ship (PR to `main`, merge) only after the
  migration is applied, because the UI calls the new RPCs.
- Checks before every commit that touches `web/`: `cd web; npx tsc --noEmit; npm run lint; npm test` (run through the
  PowerShell tool or read the exit code: RTK can print green text over a failing exit).

## Review Focus

- A student linked to two teachers: each card shows only its own teacher's posts, tasks and conversations, and the
  header counts add both up. (Smoke test, Task 3.)
- The student turns essay sharing off after a teacher started an essay conversation: the teacher still sees the
  conversation, the chip reads "no longer shared", and nothing about the essay leaks. (Smoke test, Task 3.)
- Text with `javascript:` / `data:` URLs, URLs followed by `.`, `,` or `)`, and 300-character unbroken words: only http(s)
  becomes a link, punctuation stays outside it, layout doesn't overflow. (`linkify.test.ts`, Task 1; browser check, Task 11.)
- Invite flow when the code is bad or rate-limited after sign-in: the saved code is cleared and the error is shown, and
  a later `/join` without a hash shows the empty join box. (`join-invite.test.ts`, Task 1.)
- Double-clicking Send / Post: one message, one post. Buttons are disabled while a request is in flight. (Browser
  check, Task 11.)

---

### Task 1: Pure models: classroom, links, invites

**Files:**
- Create: `web/lib/classroom.ts`, `web/lib/classroom.test.ts`
- Create: `web/lib/linkify.ts`, `web/lib/linkify.test.ts`
- Create: `web/lib/join-invite.ts`, `web/lib/join-invite.test.ts`

**Interfaces:**
- Produces (`classroom.ts`):
  - `CLASSROOM_LIMITS = { postTitle: 120, postBody: 4000, link: 500, message: 2000, teacherMessagesPerDay: 300, studentMessagesPerDay: 50, teacherPostsPerDay: 20, activePostsPerTeacher: 200, conversationsPerPair: 100 } as const`
  - `TOPICS = ["general", "college", "essay", "task", "list"] as const; type Topic = (typeof TOPICS)[number]`
  - `type PostInput = { title: string; body: string; link: string | null; pinned: boolean }`
  - `validatePost(i: Partial<Record<keyof PostInput, unknown>>): { ok: true; value: PostInput } | { ok: false; error: string }` (trims; empty link → null)
  - `validateMessage(body: unknown): { ok: true; value: string } | { ok: false; error: string }`
  - `isEssayRef(ref: string): boolean` — true for `"ps"` and `"uc:1"`…`"uc:8"` only
  - `type StudentPost = { id; teacherId; classId: string | null; className: string | null; title; body; link: string | null; pinned: boolean; createdAt: string; read: boolean }`
  - `type TeacherPost = { id; classId: string | null; className: string | null; title; body; link: string | null; pinned: boolean; archived: boolean; createdAt: string; updatedAt: string; audience: number; readCount: number }`
  - `type Conversation = { id; otherId; otherName; topic: Topic; topicRef: string | null; topicLabel: string | null; topicAvailable: boolean; status: "open" | "resolved"; startedBy: "teacher" | "student"; lastMessageAt: string; lastAuthor: "teacher" | "student"; lastBody: string | null; unread: number }`
  - `type Message = { id; author: "teacher" | "student"; body: string | null; deleted: boolean; createdAt: string }`
  - `type ClassroomUnread = { teachers: number; posts: number; conversations: number }`
  - `parseStudentPost(r: Record<string, unknown>): StudentPost`, `parseTeacherPost(...)`, `parseConversation(...)`, `parseMessage(...)`, `parseUnread(r: unknown): ClassroomUnread` (snake_case columns of Tasks 2-3 → these camelCase fields; `parseUnread` returns zeros for null)
  - `sortPosts<T extends { pinned: boolean; createdAt: string }>(p: readonly T[]): T[]` — pinned first, then newest
  - `shownPosts(p: readonly StudentPost[], max = 3): StudentPost[]` — every unread post, then the newest read ones until `max` total (unread are never cut)
  - `needsReply(c: Conversation): boolean` — `c.lastAuthor === "student" && c.unread > 0` (used on the teacher side)
  - `type ConversationFilter = "needs_reply" | "open" | "resolved" | "all"`
  - `filterConversations(list: readonly Conversation[], f: ConversationFilter, studentIds: ReadonlySet<string> | null): Conversation[]` — `null` = no class filter; result sorted newest `lastMessageAt` first
  - `findConversation(list: readonly Conversation[], otherId: string, topic: Topic, ref: string | null): Conversation | null` — never matches `general`
  - `TEACHER_SEES` and `TEACHER_NEVER_SEES`: readonly arrays of i18n key suffixes, with a comment naming `teacher_student` (0023:66-81) and `teacher_roster` (0023:29-39) as the source. Values per spec §4.1: sees `nameEmail, scores, plans, list, interested, activities, essays, lastActive, tasks, postReads, messages`; never `portals, notes, aid, transcript, recommenders, scholarships, resume`.
  - `classroomErrorMessage(raw: string): string` — same pattern as `taskErrorMessage` (`tasks.ts:139`), mapping the SQL error texts fixed in Tasks 2-3 (`classroom: limit`, `classroom: not linked`, `classroom: not found`, `classroom: invalid`, `classroom: rate`) to English fallback text; UI shows the i18n text via `ClassroomText.ts` (Task 5).
  - `type TopicDisplay = { kind: "general" } | { kind: "list"; own: boolean } | { kind: "college" | "task"; name: string | null } | { kind: "essay"; essay: { ps: true } | { uc: number } | null }` (`name`/`essay` null = gone or no longer shared)
  - `topicDisplay(c: Pick<Conversation, "topic" | "topicRef" | "topicLabel" | "topicAvailable">, role: "teacher" | "student"): TopicDisplay` — `list.own` is true for the student; a college/task with `topicAvailable` false or `topicLabel` null gives `name: null`; an essay with `topicAvailable` false gives `essay: null`.
- Produces (`linkify.ts`): `type Piece = { kind: "text"; text: string } | { kind: "link"; href: string; text: string }`; `splitLinks(text: string): Piece[]`; `isHttpUrl(s: string): boolean`
- Produces (`join-invite.ts`): `PENDING_JOIN_KEY = "pending-join-code"`; `inviteUrl(origin: string, code: string): string` → `${origin}/join#${code}`; `parseInviteHash(hash: string): string | null` (uses `normalizeCode` + `isPlausibleCode` from `join-codes.ts`); `savePendingCode(code: string, s?: Storage): void`; `readPendingCode(s?: Storage): string | null`; `clearPendingCode(s?: Storage): void` (default `sessionStorage`; every access in try/catch, failures are silent)
  - `type InviteStep = "loading" | "sign_in" | "welcome" | "teacher" | "no_code" | "preview"`; `inviteStep(s: { sessionChecked: boolean; signedIn: boolean; role: Role | null | undefined; code: string | null }): InviteStep` — not checked or role undefined while signed in → loading; signed out → sign_in; role null → welcome; teacher → teacher; student without code → no_code; else preview
  - `keepPendingAfter(r: CodeResult): boolean` — false for every `{ ok: false }` result (the caller then clears the saved code)

- [ ] **Step 1: Write the failing tests**

`classroom.test.ts` (import style as `tasks.test.ts:1-2`):
- `validatePost`: title `"  Hi  "` → `"Hi"`; title of 121 chars → error; body of 4001 → error; link `"javascript:alert(1)"` → error; link `""` → `null`; link `"https://x.org/a"` → kept.
- `validateMessage`: `""` and `"   "` → error; 2001 chars → error; 2000 → ok.
- `isEssayRef`: `"ps"`, `"uc:1"`, `"uc:8"` true; `"uc:0"`, `"uc:9"`, `"app:mit"`, `""` false.
- `shownPosts`: 5 unread + 2 read with max 3 → the 5 unread; 1 unread + 4 read → 1 unread + 2 newest read; pinned read post sorts before newer unpinned read.
- `needsReply`: last author student + unread 2 → true; last author teacher + unread 0 → false; last author student + unread 0 → false.
- `filterConversations`: `"needs_reply"` keeps only `needsReply`; `"resolved"` only resolved; class filter keeps only listed `otherId`s; output newest first.
- `findConversation`: finds college `"mit"` for that student; returns null for `general`; null for the same ref with another student.
- `parseUnread(null)` → `{ teachers: 0, posts: 0, conversations: 0 }`.
- `CLASSROOM_LIMITS` deep-equals the object in Interfaces (pins the SQL mirror).
- `topicDisplay`: college with label "MIT" → `{ kind: "college", name: "MIT" }`; college with `topicLabel: null` → `name: null`; task with `topicAvailable: false` → `name: null`; essay `"uc:3"` available → `{ uc: 3 }`; essay `"ps"` with `topicAvailable: false` → `essay: null`; list for role student → `own: true`, for teacher → `own: false`.

`linkify.test.ts`:
- `"see https://a.org/x."` → text `"see "`, link `https://a.org/x`, text `"."`.
- `"(https://a.org/x)"` → `"("`, link, `")"`.
- `"javascript:alert(1) data:text/html,x"` → one text piece.
- `"HTTP://A.ORG"` → link (scheme case-insensitive); `"ftp://a.org"` → text.
- Text with no URL → one text piece; empty string → `[]`.

`join-invite.test.ts` (pass a fake `Storage` object):
- `parseInviteHash("#abcd-2345")` → `"ABCD2345"`; `"#"` / `""` / `"#short"` → null.
- `inviteUrl("https://www.track-ur-college.com", "ABCD2345")` → `"https://www.track-ur-college.com/join#ABCD2345"`.
- save → read returns the code; clear → read returns null; a Storage whose methods throw → read returns null, save/clear don't throw.
- `inviteStep`: signed out → `"sign_in"`; signed in + role null → `"welcome"`; teacher → `"teacher"`; student + code → `"preview"`; student + no code → `"no_code"`; `sessionChecked: false` → `"loading"`.
- `keepPendingAfter`: `{ ok: false, error: "invalid" }`, `"rate_limited"`, `"failed"` → false; an ok preview → true.

- [ ] **Step 2: Run the tests and see them fail**

Run: `cd web; node --test lib/classroom.test.ts lib/linkify.test.ts lib/join-invite.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the three modules with the signatures above**

`splitLinks`: match `https?:\/\/[^\s<>"]+` case-insensitively, then move trailing `.,;:!?` and an unbalanced `)` back into the following text.

- [ ] **Step 4: Run the tests and see them pass**

Run: same command. Expected: PASS. Then `npx tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add web/lib/classroom.ts web/lib/classroom.test.ts web/lib/linkify.ts web/lib/linkify.test.ts web/lib/join-invite.ts web/lib/join-invite.test.ts
git commit -m "feat(classroom): models, limits, link splitting and invite helpers"
```

---

### Task 2: Migration part A: announcements, read marks, leave class, rename, profile, my_tasks

**Files:**
- Create: `supabase/migrations/00NN_classroom.sql` (NN per Global Constraints)
- Create: `supabase/patches/2026-11-03_classroom_smoke_test.sql`

**Interfaces:**
- Produces (SQL; argument names are part of the contract because supabase-js passes them by name):
  - Tables `class_posts`, `post_reads` exactly as spec §6. `class_posts` FK `(class_id)` → `classes(id) on delete cascade`; the RPCs check the class is the caller's.
  - `teacher_create_post(p_class uuid, p_title text, p_body text, p_link text, p_pinned boolean) returns uuid` (`p_class` null = all my students)
  - `teacher_update_post(p_post uuid, p_title text, p_body text, p_link text, p_pinned boolean) returns void`
  - `teacher_archive_post(p_post uuid, p_archived boolean) returns void`
  - `teacher_posts() returns table (post_id uuid, class_id uuid, class_name text, title text, body text, link_url text, pinned boolean, archived boolean, created_at timestamptz, updated_at timestamptz, audience int, read_count int)`
  - `teacher_post_unread(p_post uuid) returns table (student_id uuid, display_name text)`
  - `my_posts() returns table (post_id uuid, teacher_id uuid, class_id uuid, class_name text, title text, body text, link_url text, pinned boolean, created_at timestamptz, is_read boolean)`
  - `mark_posts_read(p_posts uuid[]) returns void` (ignores ids the caller can't see)
  - `leave_class(p_class uuid) returns void` (deletes the caller's `class_members` row; the link stays)
  - `teacher_rename_class(p_class uuid, p_name text) returns void` (same name check as `teacher_create_class`)
  - `update_my_teacher_profile(p_name text, p_school text) returns void` (same checks as `set_my_role`)
  - `drop function public.my_tasks(); create function public.my_tasks() returns table (task_id uuid, teacher_id uuid, teacher_name text, title text, details text, due_on date, done boolean, done_at timestamptz)` — same rows as 0041:513, two more columns.
  - Error texts start with `classroom: ` (`limit`, `not linked`, `not found`, `invalid`, `rate`) so `classroomErrorMessage` can map them.

The audience rule (spec §3), used by `my_posts`, `teacher_posts`, `teacher_post_unread`, `mark_posts_read` — put it in one
internal helper `public.post_audience(p_post uuid) returns table (student_id uuid, counted boolean)`, not granted to clients:
- visible to a student when the post is not archived, the student is linked to `p.teacher_id`, and either `p.class_id is
  null` or the student is in `class_members` for that class and the class is not archived;
- `counted` when, in addition, the join time (`class_members.joined_at` for a class post, `teacher_links.created_at` for
  an all-students post) is `<= p.created_at`.
- `my_posts.is_read` = not counted, or a `post_reads` row exists. `audience` = counted students; `read_count` = counted
  students with a read row; `teacher_post_unread` = counted students without one, with `teacher_profiles`-style display
  name exactly as `teacher_roster` exposes it.

- [ ] **Step 1: Write the smoke test first** (`supabase/patches/2026-11-03_classroom_smoke_test.sql`)

Copy the frame of `supabase/patches/2026-10-25_teacher_tasks_smoke_test.sql`: `begin;`, throwaway `auth.users` /
`user_roles` / `teacher_profiles` / `classes` / `teacher_links` / `class_members` rows as postgres, act as each user with
`select set_config('request.jwt.claims', '{"sub":"<id>","role":"authenticated"}', true); set local role authenticated;`,
`reset role;` between users, `raise exception` on any wrong result, a final `raise notice 'classroom smoke test passed'`,
`rollback;`. Accounts: teacher T1 (classes A, B), teacher T2, student S1 (linked to T1 and T2, member of A), student S2
(linked to T1, member of A, but joined after T1's first posts: insert S2's `teacher_links` row with
`created_at = clock_timestamp() + interval '1 minute'` and its `class_members` row with `joined_at` the same), student S3
(unlinked). The whole test is one transaction, where
`now()` never moves, so every timestamp the new RPCs write (`created_at`, `last_message_at`, `*_read_at`, `read_at`) uses
`clock_timestamp()`; that also keeps the order right in real use. Part A checks:
- T1 posts to A and to all; S1 `my_posts` sees both, both `is_read = false`; S2 sees both, both `is_read = true` (made
  before S2's link and membership); S3 sees nothing; T2 `teacher_posts` sees nothing of T1's; the all-students post has
  `audience = 1` (S1 only, S2 not counted).
- `teacher_posts` for T1's class post: `audience = 1`, `read_count = 0`; after S1 `mark_posts_read` → `read_count = 1`;
  `teacher_post_unread` empty.
- S1 `leave_class(A)` → class post gone from `my_posts`, all-students post still there, `teacher_links` row still there.
- 21st post in a day by T1 raises `classroom: rate`; title of 121 chars raises `classroom: invalid`; link `javascript:x`
  raises `classroom: invalid`; T1 `teacher_create_post` for T2's class raises `classroom: not found`.
- `my_tasks` returns `teacher_id` and `done_at` for S1 after `set_task_done`.
- S1 calling `teacher_create_post` raises (not a teacher); T1 calling `my_posts` returns nothing.

- [ ] **Step 2: Write part A of the migration**

Header comment in the style of 0028 ("Who sees what", limits mirrored in `web/lib/classroom.ts`). Tables with RLS on, no
policies, `revoke all ... from public, anon, authenticated`; functions `security definer set search_path = ''`; the
grant block as in 0028 (`revoke execute ... from public, anon; grant execute ... to authenticated` for client RPCs only;
`post_audience` granted to nobody). Indexes: `class_posts (teacher_id, created_at desc)`, `class_posts (class_id)`,
`post_reads (student_id)`. Limits enforced by counting the caller's rows from the last 24 hours / active rows.

- [ ] **Step 3: Check the SQL parses and the live code still works with it**

Run the migration and the smoke test together inside `begin; ... rollback;` through the Supabase `execute_sql` tool
(read-only effect; prove nothing persisted afterwards with `select to_regclass('public.class_posts')` → null).
Expected: the notice `classroom smoke test passed` (part A checks only so far). The live app calls `my_tasks` and
`parseStudentTask` reads columns by name, so the two added columns don't break the code that is live now.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00NN_classroom.sql supabase/patches/2026-11-03_classroom_smoke_test.sql
git commit -m "feat(classroom): announcements, read marks, leave class, rename class, teacher profile RPCs"
```

---

### Task 3: Migration part B: conversations and unread counts

**Files:**
- Modify: `supabase/migrations/00NN_classroom.sql` (append)
- Modify: `supabase/patches/2026-11-03_classroom_smoke_test.sql` (append part B checks before the final notice)

**Interfaces:**
- Produces (SQL):
  - Tables `conversations`, `conversation_messages` as spec §6, with the unique index
    `(teacher_id, student_id, topic, coalesce(topic_ref, '')) where topic <> 'general'`.
  - `start_conversation(p_other uuid, p_topic text, p_ref text, p_body text) returns uuid` — `p_other` is the student
    when the caller is a teacher and the teacher when the caller is a student. For a non-general topic that already
    exists, adds the message to it (reopening it) and returns its id. Ref checks: `college` ref must be a slug the
    student has on their list (`coalesce(i.slug, 'custom-' || sc.id::text)`, as 0023:84); `essay` ref must pass the
    `isEssayRef` rule and, when a teacher starts it, `share_essays` must be on; `task` ref must be a task of that
    teacher visible to that student (`visible_tasks`); `general`/`list` ref must be null.
  - `send_message(p_conversation uuid, p_body text) returns uuid` (reopens a resolved conversation)
  - `delete_message(p_message uuid) returns void` (author only; sets `body = null, deleted_at = clock_timestamp()`)
  - `set_conversation_status(p_conversation uuid, p_status text) returns void`
  - `mark_conversation_read(p_conversation uuid) returns void` (sets the caller's side `*_read_at = clock_timestamp()`)
  - `my_conversations() returns table (conversation_id uuid, other_id uuid, other_name text, topic text, topic_ref text, topic_label text, topic_available boolean, status text, started_by text, last_message_at timestamptz, last_author text, last_body text, unread int)` — role-aware. `other_name`: the teacher's `display_name` for a student caller; the student name exactly as `teacher_roster` returns it for a teacher caller. `topic_label`: the college name (as 0023:85) or the task title; null when the thing is gone. `topic_available`: false when the college/task is gone, or (teacher caller, essay topic) when `share_essays` is off. `last_body`: null when that message was deleted. `unread`: messages by the other side, not deleted, newer than the caller's read time. Neither side's read time is returned (no "seen" receipts, spec §3).
  - `conversation_messages_for(p_conversation uuid) returns table (message_id uuid, author text, body text, deleted boolean, created_at timestamptz)` — oldest first, caller must be one of the pair.
  - `classroom_unread() returns table (teachers int, posts int, conversations int)` — student: number of linked teachers, unread counted posts, conversations with `unread > 0`; teacher: `0, 0,` conversations where `needsReply` holds.

- [ ] **Step 1: Append the part B smoke checks** (same accounts as Task 2)

- T1 `start_conversation(S1, 'college', '<slug on S1 list>', 'hi')` → id; S1 `my_conversations` shows it with
  `unread = 1`, `topic_label` = the college name; `classroom_unread` for S1 → `conversations = 1`.
- S1 `send_message` → T1's `classroom_unread.conversations = 1`; T1 `mark_conversation_read` → 0.
- T1 starts the same college topic again → same id, now 2 teacher messages.
- T2 `my_conversations` → none of T1's; S2 → none of S1's; S3 → empty; T2 `conversation_messages_for(<T1-S1 id>)`
  raises `classroom: not found`.
- Essay: S1 turns sharing on, T1 starts `essay` / `ps`; S1 turns sharing off → T1's row has `topic_available = false`,
  the conversation still listed; T1 starting a new `essay` / `uc:2` now raises `classroom: invalid`.
- `delete_message` by the non-author raises; by the author → body null, `deleted = true` for both sides.
- 51st student message in a day raises `classroom: rate`; 2001-char body raises `classroom: invalid`.
- Student S1 `start_conversation(T1, 'general', null, 'question')` twice → two different ids.
- S2 (still in class A) and T1 get a General conversation; S2 `leave_class(A)` → the conversation is still in both
  sides' `my_conversations` and the `teacher_links` row is still there.
- `leave_teacher(T1)` as S1 → `select count(*)` over `conversations`, `conversation_messages`, `post_reads` for the
  pair (T1, S1) = 0; S1's conversations with T2 are untouched.

- [ ] **Step 2: Append part B to the migration**

Same conventions as Task 2. Indexes: `conversations (teacher_id, last_message_at desc)`, `conversations (student_id,
last_message_at desc)`, `conversation_messages (conversation_id, created_at)`.

- [ ] **Step 3: Run migration + smoke test inside `begin; ... rollback;`** (as Task 2 Step 3)

Expected: `classroom smoke test passed`; `to_regclass('public.conversations')` is null afterwards.

- [ ] **Step 4: Ask the owner to approve applying the migration, then apply it**

Re-check the migration number (Global Constraints), apply with `apply_migration`, run the smoke test once more (it rolls
back). Expected: the notice again. If the owner says not yet, continue with Task 4 and apply before Task 11.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00NN_classroom.sql supabase/patches/2026-11-03_classroom_smoke_test.sql
git commit -m "feat(classroom): conversations, messages and unread counts"
```

---

### Task 4: Client wrappers and the shared unread store

**Files:**
- Create: `web/lib/classroom-api.ts`
- Create: `web/components/classroom/useClassroomUnread.ts`
- Modify: `web/lib/tasks.ts` (`StudentTask`, `parseStudentTask`), `web/lib/tasks.test.ts`
- Modify: `web/lib/links-api.ts` (add `leaveClass`, `renameClass`, `updateTeacherProfile`)

**Interfaces:**
- Consumes: Task 1 parsers and types; Task 2-3 RPCs.
- Produces (`classroom-api.ts`, local `db`/`check` as in `tasks-api.ts:9-14`, `check` throwing `new Error(classroomErrorMessage(...))`):
  `createPost(classId: string | null, p: PostInput): Promise<string>`, `updatePost(id: string, p: PostInput): Promise<void>`,
  `archivePost(id: string, archived: boolean): Promise<void>`, `teacherPosts(): Promise<TeacherPost[]>`,
  `postUnread(id: string): Promise<{ id: string; name: string }[]>`, `myPosts(): Promise<StudentPost[]>`,
  `markPostsRead(ids: string[]): Promise<void>` (no call when empty), `startConversation(otherId: string, topic: Topic, ref: string | null, body: string): Promise<string>`,
  `sendMessage(conversationId: string, body: string): Promise<string>`, `deleteMessage(id: string): Promise<void>`,
  `setConversationStatus(id: string, status: "open" | "resolved"): Promise<void>`, `markConversationRead(id: string): Promise<void>`,
  `myConversations(): Promise<Conversation[]>`, `conversationMessages(id: string): Promise<Message[]>`, `classroomUnread(): Promise<ClassroomUnread>`
- Produces (`links-api.ts`): `leaveClass(classId: string): Promise<void>`, `renameClass(classId: string, name: string): Promise<void>`, `updateTeacherProfile(name: string, school: string | null): Promise<void>`
- Produces (`tasks.ts`): `StudentTask` gains `teacherId: string; doneAt: string | null`.
- Produces (`useClassroomUnread.ts`): `useClassroomUnread(): ClassroomUnread | null` (null while signed out, role unknown, or before the first load) and `refreshClassroomUnread(): void`. One module-level store (`useSyncExternalStore`, like `student-store.ts`), so the header and pages share one fetch; it loads when `useStudent()` has `auth` and a role, reloads on `refreshClassroomUnread()`, on pathname change and on window `focus`, and drops to null on sign-out.

- [ ] **Step 1: Write the failing test** in `tasks.test.ts`: `parseStudentTask({ task_id: "t", teacher_id: "u", teacher_name: "Ms Lin", title: "x", details: null, due_on: null, done: true, done_at: "2026-11-01T00:00:00Z" })` → `teacherId: "u"`, `doneAt: "2026-11-01T00:00:00Z"`; with `done_at` missing → `doneAt: null`.
- [ ] **Step 2: Run** `cd web; node --test lib/tasks.test.ts` → FAIL.
- [ ] **Step 3: Implement** the `tasks.ts` change, then `classroom-api.ts`, the three `links-api.ts` wrappers and the store with the signatures above.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` → both exit 0.
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): RPC wrappers and shared unread store"` (add the five files).

---

### Task 5: Shared conversation UI and the i18n namespace

**Files:**
- Create: `web/lib/i18n/messages/classroom.ts`; Modify: `web/lib/i18n/sections.ts` (import + `SECTIONS` entry like `teacher` at :25/:55), `web/lib/i18n/messages/en.ts` (`...S.classroom.en`), `web/lib/i18n/messages/zh-TW.ts` (`...S.classroom.zhTW`)
- Create: `web/components/classroom/ClassroomText.ts`, `LinkedText.tsx`, `TopicChip.tsx`, `ConversationPanel.tsx`, `NewConversation.tsx`

**Interfaces:**
- Consumes: Task 1 (`splitLinks`, `Conversation`, `Message`, `Topic`, `validateMessage`), Task 4 wrappers and `refreshClassroomUnread`.
- Produces:
  - `ClassroomText.ts` (pattern of `web/components/TeacherText.ts`): `topicText(t, d: TopicDisplay): string` over `topicDisplay` — general → "General", list → "Your college list" (own) / "Their college list", college/task → the name or "A college no longer on the list" / "A task that was removed", essay → "Personal statement" / "UC question N", or "An essay, no longer shared"; `classroomError(t, e: unknown): string`.
  - `<LinkedText text={string} />` — `whitespace-pre-line break-words`, links per Global Constraints.
  - `<TopicChip conversation={Conversation} role={"teacher" | "student"} />` — links to: student role, college → `/application/list`, essay → the Materials essays page (find its route under `web/app/(app)/materials`), task / list / general → no link; teacher role, anything but general → `/teacher/students?s=<otherId>`. Gone topics never link.
  - `<ConversationPanel conversation={Conversation} role={"teacher" | "student"} onClose={() => void} onChanged={() => void} />` — a dialog (spec §4.2 sketch) titled `<otherName> · <topicText>`: takes the row from the caller's `myConversations()` list (for `?c=<id>` the page looks the id up in that list; unknown id → closes quietly), loads `conversationMessages`, calls `markConversationRead` on open and then `refreshClassroomUnread()`, reply box with `validateMessage`, Send disabled while sending, delete on own messages only ("Message removed" placeholder), Mark resolved / Reopen from `conversation.status`; calls `onChanged` after any write so the caller reloads its list.
  - `type TopicOption = { topic: Topic; ref: string | null; label: string }`
  - `<NewConversation role={...} otherId={string} options={TopicOption[]} preset?={TopicOption} onStarted={(id: string) => void} onCancel={() => void} />` — topic select (General first) + first message; calls `startConversation`.
- i18n keys live under `classroom.*`; only keys used by this task are added now (the test rejects unused keys); later tasks add theirs.

- [ ] **Step 1:** Create the namespace with this task's strings (en + zh-TW), register it, run `cd web; node --test lib/i18n.test.ts` → PASS.
- [ ] **Step 2:** Build the five components with the props above.
- [ ] **Step 3:** `npx tsc --noEmit; npm run lint; npm test` → all exit 0.
- [ ] **Step 4: Commit** `git commit -m "feat(classroom): conversation panel, topic chip and linked text"`.

---

### Task 6: Student Counselors page and Settings pointer

**Files:**
- Create: `web/app/(app)/counselor/page.tsx` (thin page, `metadata = { title: "Counselors" }`, `<Suspense>` because it reads `?c=`)
- Create: `web/components/classroom/CounselorPage.tsx`, `TeacherCard.tsx`, `JoinBox.tsx`, `WhatTheySee.tsx`
- Modify: `web/lib/roles.ts` (`STUDENT_ONLY_PATHS` gains `"/counselor"`), `web/lib/roles.test.ts`
- Modify: `web/components/SettingsPage.tsx:205-214` (replace `<MyCounselors />` by a row linking to `/counselor`)
- Delete: `web/components/MyCounselors.tsx`; move its strings from `settings.counselors.*` to `classroom.*` and delete the unused old keys
- Modify: `web/lib/i18n/messages/classroom.ts`, `settings.ts`

**Interfaces:**
- Consumes: `myTeachers`, `setShareEssays`, `leaveTeacher`, `previewCode`, `redeemCode`, `leaveClass` (links-api), `myTasks`, `setTaskDone` (tasks-api), `myPosts`, `markPostsRead`, `myConversations` (classroom-api), `shownPosts`, `sortPosts`, `TEACHER_SEES`, `TEACHER_NEVER_SEES`, Task 5 components.
- Produces: `<JoinBox initialCode?={string} autoPreview?={boolean} onJoined={() => void} onPreview?={(r: CodeResult) => void} onCancel?={() => void} />` (the preview-then-confirm flow lifted from `MyCounselors.tsx:82-215`; Task 10 reuses it).

Page behaviour (spec §4.1): one `TeacherCard` per `myTeachers()` row, ordered by newest activity (latest post, task or
message); each card: header (name, school, class names each with a Leave class button), Announcements (`shownPosts`,
"Show all"), To do (tasks where `teacherId` matches; overdue in the urgent tone via `taskTone`), Messages (that teacher's
conversations, unread dot, "New message" / "Ask <name>" opening `NewConversation` with topics General, each college on the
student's list (`useStudent()` list, ref = slug or `custom-<id>`), Personal statement and chosen UC questions, each of
that teacher's tasks, My college list), and the `WhatTheySee` fold-out with the essay toggle and Leave <name> (confirm text
says conversations are deleted for both sides). `WhatTheySee` renders each `TEACHER_SEES` / `TEACHER_NEVER_SEES` entry
as ``t(`classroom.sees.${k}`)`` / ``t(`classroom.never.${k}`)`` (the i18n used-key test accepts a `prefix.${…}` key).
After rendering, call `markPostsRead` for the unread posts shown, then
`refreshClassroomUnread()`. `?c=<id>` opens `ConversationPanel`. No teachers → JoinBox + one explanatory paragraph.

- [ ] **Step 1: Write the failing test** in `roles.test.ts`: `redirectFor("teacher", "/counselor", true) === "/teacher"`.
- [ ] **Step 2: Run** `cd web; node --test lib/roles.test.ts` → FAIL.
- [ ] **Step 3: Implement** the roles change, the page and components, the Settings row, the string move.
- [ ] **Step 4: Run** `npx tsc --noEmit; npm run lint; npm test` → all exit 0 (i18n test proves no orphaned `settings.counselors.*` keys).
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): student Counselors page"`.

---

### Task 7: Unread in the header, on My list, and the Students/Charts tabs

**Files:**
- Modify: `web/lib/roles.ts` (`navFor`, nav arrays, new `navDots`, existing `activeNavHref` at :115), `web/lib/roles.test.ts`
- Modify: `web/components/SiteNav.tsx` (dots; `MenuSheet` too), `web/lib/i18n/messages/common.ts` (`NAV_LABEL_KEYS` + labels "Counselors", "Messages", "Roster")
- Modify: `web/components/MyList.tsx` (strip at the top; bubble on rows; replace both `<TeacherTasksForStudent />` mounts at :252 and :421 with a one-line "N tasks due this week · Open" link to `/counselor`), delete `web/components/TeacherTasksForStudent.tsx` and its unused strings
- Modify: `web/components/TeacherStudents.tsx`, `web/components/TeacherCharts.tsx` (both render `SectionTabs` with `[["/teacher/students", "Roster"], ["/teacher/charts", "Charts"]]`)

**Interfaces:**
- Consumes: `useClassroomUnread`, `myConversations`, `myTasks`.
- Produces (`roles.ts`):
  - `navFor(role, opts: { signedIn: boolean; started: boolean; linked?: boolean })` — student nav gets `["/counselor", "Counselors"]` right after `["/application", "My colleges"]` only when `linked`; `TEACHER_NAV` becomes Home, Students, Classes, `["/teacher/messages", "Messages"]`, Tasks, Deadlines, Explore, Compare (Charts removed).
  - `navDots(role: Role | null | undefined, u: ClassroomUnread | null): ReadonlySet<string>` — student: `"/counselor"` when `posts + conversations > 0`; teacher: `"/teacher/messages"` when `conversations > 0`; else empty.
  - The existing `activeNavHref` (`roles.ts:115`, used by SiteNav) treats `/teacher/charts` as `/teacher/students`; keep its signature, no second helper.
- SiteNav passes `linked: (unread?.teachers ?? 0) > 0`.

- [ ] **Step 1: Write the failing tests** in `roles.test.ts`: student nav without `linked` has no `/counselor`; with `linked: true` it is the 4th item; teacher nav has `/teacher/messages` and no `/teacher/charts`; `navDots("student", { teachers: 1, posts: 0, conversations: 2 })` has `/counselor`; `navDots("student", { teachers: 1, posts: 0, conversations: 0 })` is empty; `navDots("teacher", { teachers: 0, posts: 0, conversations: 1 })` has `/teacher/messages`; `activeNavHref` on `/teacher/charts` with the teacher nav gives `/teacher/students`, and the existing `activeNavHref` tests still pass.
- [ ] **Step 2: Run** `cd web; node --test lib/roles.test.ts lib/i18n.test.ts` → FAIL.
- [ ] **Step 3: Implement.** My list strip text "From your counselors: N announcements, M messages · Open" only when either is > 0; the row bubble shows when `myConversations()` has a college conversation whose `topicRef` equals the row's slug (number = `unread` when > 0) and links to `/counselor?c=<conversation id>`.
- [ ] **Step 4: Run** `npx tsc --noEmit; npm run lint; npm test` → all exit 0.
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): unread dots, My list strip, Students/Charts tabs"`.

---

### Task 8: Teacher Messages page (conversations and announcements)

**Files:**
- Create: `web/app/(app)/teacher/messages/page.tsx` (thin, `metadata = { title: "Messages" }`, `<Suspense>` for `?c=` / `?tab=`)
- Create: `web/components/classroom/TeacherMessages.tsx`, `TeacherConversationList.tsx`, `TeacherAnnouncements.tsx`, `PostComposer.tsx`
- Modify: `web/components/TeacherTabs.tsx` (optional controlled props `value?: string; onChange?: (id: string) => void`; uncontrolled behaviour unchanged)

**Interfaces:**
- Consumes: `myConversations`, `filterConversations`, `needsReply`, `listStudents` (for class membership: `class_ids` per student), `teacherPosts`, `postUnread`, `createPost`, `updatePost`, `archivePost`, `validatePost`, Task 5 components.
- Produces: `<PostComposer presetClassId?={string | null} post?={TeacherPost} onSaved={() => void} onCancel={() => void} />` — To (each non-archived class + "All my students"), Title, Text, Link, Pin; Post disabled while saving. Tasks 9 and 10 reuse it.

Behaviour (spec §5.4): wrapped in `<TeacherGate returnTo="/teacher/messages">`. Conversations tab: filter radios (default
Needs reply), class select (students whose `class_ids` include it), rows per the sketch, `?c=<id>` opens
`ConversationPanel`. Announcements tab: "+ New announcement", list via `sortPosts` with "Read by X of Y" opening the
`postUnread` names, Edit / Archive / Restore.

- [ ] **Step 1:** Implement the pages and components; add their `classroom.*` strings.
- [ ] **Step 2:** `npx tsc --noEmit; npm run lint; npm test` → all exit 0.
- [ ] **Step 3: Commit** `git commit -m "feat(classroom): teacher Messages page"`.

---

### Task 9: Teacher home, roster flag, student detail Messages tab

**Files:**
- Modify: `web/lib/roster.ts` (`FlagKey` gains `"reply_waiting"`, `FLAG_SEVERITY`, `computeFlags(s, now, ctx?: { replyWaiting?: ReadonlySet<string> })`), `web/lib/roster.test.ts`
- Modify: `web/lib/roster-week.ts` (`buildWeek(roster, deadlines, now, replyWaiting?: ReadonlySet<string>)` passes it to `computeFlags`), its test
- Modify: `web/components/TeacherText.ts` (`FLAG_LABEL` + detail for `reply_waiting`), `web/components/teacher/TeacherWeek.tsx` (5th tally "Replies waiting" = number of conversations where `needsReply`; "Replies waiting" list of up to 5 under Check in, newest first, "All messages" → `/teacher/messages`; "Post an announcement" button opening `PostComposer`), `web/components/TeacherRoster.tsx` (load `myConversations` and pass the set)
- Modify: `web/components/TeacherStudentDetail.tsx` (controlled tabs; new `messages` tab between `interested` and `notes`, with a speech-bubble icon and a dot when any of this student's conversations `needsReply`, and the line "Shared with <student>" at the top of its panel; Notes label gets a lock icon and "Only you can see these notes")
- Modify: `web/lib/i18n/messages/teacher.ts` (`teacher.classes.removeConfirm` also says their conversations with you are deleted, en + zh-TW)
- Create: `web/components/classroom/TeacherDetailMessages.tsx`
- Modify: `web/components/TeacherDetailColleges.tsx`, `web/components/TeacherDetailEssays.tsx` (a Comment button per college / per shown essay)

**Interfaces:**
- Consumes: `computeFlags`, `buildWeek`, `myConversations`, `findConversation`, `needsReply`, Task 5 and Task 8 components.
- Produces: `<TeacherDetailMessages studentId={string} studentName={string} options={TopicOption[]} openTopic?={TopicOption | null} />`; `TeacherStudentDetail` holds `openTopic` state: a Comment click sets it and switches the tab to `messages`; `TeacherDetailMessages` then opens the existing conversation (`findConversation`) or `NewConversation` with that preset.

- [ ] **Step 1: Write the failing tests:** `roster.test.ts` — `computeFlags(s, now, { replyWaiting: new Set([s.id]) })` contains `reply_waiting`; without ctx it doesn't. `roster-week.test.ts` (or the existing week test file) — a student in `replyWaiting` appears in `checkIns` with that reason.
- [ ] **Step 2: Run** `cd web; node --test lib/roster.test.ts lib/roster-week.test.ts` → FAIL.
- [ ] **Step 3: Implement** the lib changes, then the components.
- [ ] **Step 4: Run** `npx tsc --noEmit; npm run lint; npm test` → all exit 0 (CSV export header unchanged; if `roster-export.ts` lists flags, the new flag shows there too and its test is updated).
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): replies waiting on teacher home, roster and student detail"`.

---

### Task 10: Classes, invite links, /join, welcome hand-off, teacher profile

**Files:**
- Modify: `web/components/TeacherClassCard.tsx`, `web/components/TeacherClasses.tsx` (Copy invite link for class and one-on-one codes, Show on screen, Rename, latest announcement + Post)
- Create: `web/components/classroom/ShowCodeDialog.tsx`
- Create: `web/app/(app)/join/page.tsx` (thin, `metadata = { title: "Join a class" }`), `web/components/classroom/JoinInvite.tsx`
- Modify: `web/lib/roles.ts` (`redirectFor(null, "/join", true)` returns null), `web/lib/roles.test.ts`
- Modify: `web/components/WelcomeForm.tsx` (pending-code note, Student preselected, after `setRole("student")` go to `/join`)
- Create: `web/components/classroom/TeacherProfileForm.tsx`; Modify: `web/components/SettingsPage.tsx` (teacher view, next to the digest switch)

**Interfaces:**
- Consumes: `inviteUrl`, `parseInviteHash`, `savePendingCode`, `readPendingCode`, `clearPendingCode`, `JoinBox` (Task 6), `renameClass`, `updateTeacherProfile`, `teacherPosts`, `PostComposer`, `openSignIn` (`SignInDialog.tsx:12`; it already returns to `pathname + search`, i.e. `/join`).

`JoinInvite` behaviour (spec §4.3): on mount, `parseInviteHash(location.hash)` → `savePendingCode` and
`history.replaceState` to drop the hash; otherwise `readPendingCode()`. Then render by `inviteStep(...)`: `sign_in` →
explanation + Sign in button; `welcome` → `router.replace("/welcome")`; `teacher` → "This invite is for students…";
`no_code` → empty `JoinBox`; `preview` → `<JoinBox initialCode autoPreview onJoined={() => { clearPendingCode();
router.push("/counselor"); }} />`. When the preview result fails `keepPendingAfter`, or the student cancels, call
`clearPendingCode()` (JoinBox gets an `onPreview?: (r: CodeResult) => void` and `onCancel?: () => void` for this). `ShowCodeDialog`: full-screen, code in very large type via `formatCode`, the invite URL under it,
Esc closes.

- [ ] **Step 1: Write the failing tests** in `roles.test.ts`: `redirectFor(null, "/join", true) === null`; `redirectFor(null, "/colleges", true) === "/welcome"` (unchanged); `redirectFor("teacher", "/join", true) === null`.
- [ ] **Step 2: Run** `cd web; node --test lib/roles.test.ts` → FAIL.
- [ ] **Step 3: Implement** the roles change and the components.
- [ ] **Step 4: Run** `npx tsc --noEmit; npm run lint; npm test` → all exit 0.
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): invite links, show code, rename class, teacher profile"`.

---

### Task 11: Docs, build, live check, ship

**Files:**
- Modify: `docs/legal/2026-10-29-privacy-data-map.md` (new tables and who sees them, row "teacher" at :21), the privacy page's teacher section (find it with `grep -rn "teacher" web/app/(app)/privacy`)
- Modify: `CLAUDE.md` (teacher section: conversations, announcements, `/counselor`, `/join`, `/teacher/messages`; fix the stale "ideas not built" line that still lists tasks and digests; next migration number)
- Modify: `docs/competitor-analysis-and-roadmap.md` (status column for messaging/announcements if listed)

- [ ] **Step 1:** Update the three docs.
- [ ] **Step 2:** `cd web; npx tsc --noEmit; npm run lint; npm test; npm run build` → all exit 0 (no other dev server running in this folder while building).
- [ ] **Step 3: Live check against the applied migration** (spec §8). The agent cannot sign in with Google, so either (a) the owner signs in a throwaway teacher in one browser profile and a throwaway student in another on `localhost`, and the agent drives the pane, or (b) the agent uses the URL-level mock backend from the 2026-10-24 lesson for screens. Walk: invite link (signed out → sign in → join) → teacher posts to a class and to all → student sees both with the dot, opening clears it, teacher sees "Read by 1 of 1" → teacher Comment on a college from the detail page → student replies from `/counselor` → teacher home shows Replies waiting 1 → student asks a General question → resolve → Leave class keeps conversations → Leave teacher removes them (SQL count = 0). Also the Review Focus browser checks: 300-character word and `javascript:` text in a message, double-click Send and Post. Screenshot each step.
- [ ] **Step 4: Ship.** Re-run `git fetch` and check `origin/main` for new migrations or edits to the same files; merge `origin/main` if needed and re-run Step 2. Then push `feat/classroom`, open a PR to `main`, merge it (owner's standing rule), and confirm the live site shows `/counselor` for a linked student.
- [ ] **Step 5: Commit** (docs) `git commit -m "docs(classroom): privacy map, CLAUDE.md, roadmap status"` before Step 4's push.

---

## Later phases (separate plans, written after phase 1 ships)

Phase 2 (reach and review) and phase 3 (letters) are specified in the spec §5.7, §5.8 and §7. They get their own plans
once phase 1's real RPC names and components exist, so those plans can name them exactly.
