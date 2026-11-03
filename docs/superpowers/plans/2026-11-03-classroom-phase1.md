# Classroom Phase 1 (two-way basics with anchors) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers post announcements, comment on, privately note and assign private tasks about specific items of a
linked student's record; students get a Counselors page (`/counselor`) and markers on their own items; every chip jumps
to its item on both sides; invite links replace typing codes.

**Architecture:** New tables behind SECURITY DEFINER RPCs (0028 pattern as amended by 0041), one SQL helper
`anchor_visible` deciding what an item reference may point at, pure TypeScript models in `web/lib/classroom.ts` and
`web/lib/anchors.ts`, client wrappers in `web/lib/classroom-api.ts`, client components in `web/components/classroom/`,
one shared focus hook for jump links, one shared unread store. No realtime, no email.

**Tech Stack:** Next.js 16 App Router (read `web/node_modules/next/dist/docs/` before Next code), React 19, Tailwind 4,
supabase-js 2, Postgres (Supabase), tests with `node:test` (`web/lib/*.test.ts`, run by `npm test`).

**Spec:** `docs/superpowers/specs/2026-11-03-classroom-two-way-design.md` (phase 1 = §11 item 1; rules in §3, §4, §5,
§6, §9). The spec is binding where this plan is narrower; give each task's reviewer the spec sections it names.

## Global Constraints

- Every new RPC: `security definer set search_path = ''`, starts with `perform public.refuse_oauth_client();`, checks
  `auth.uid()`, the caller's role (`user_roles`) and the link (`public.is_linked(teacher, student)`), returns an explicit
  column list. Execute is revoked from `public, anon` and granted to `authenticated` only for client RPCs (0028's grant
  block); internal helpers are granted to nobody.
- New tables: RLS on, no policies, `revoke all ... from public, anon, authenticated`, and a row cap with 0041's
  `enforce_row_cap` trigger: `class_posts ('teacher_id','2000')`, `conversations ('teacher_id','20000')`,
  `post_reads ('student_id','20000')`. Exception: `teacher_notes` stays a direct table under its "own notes" policy.
- New RPCs never return more student data than `teacher_student` / `teacher_roster` (0023); in lists a teacher sees the
  student's display name only. A saved anchor label goes to a teacher only while `anchor_visible` is true.
- Limits (spec §9), identical in SQL and `CLASSROOM_LIMITS`: post title 1-120, post body 1-4000, link ≤500 http(s) only,
  message 1-2000, anchor label 1-120, anchor ref ≤200, teacher 300 messages/day, student 50 messages/day, teacher 20
  posts/day, 200 active posts per teacher, 100 conversations per pair.
- Everything per pair (conversations, messages, post read marks, private tasks and their completions, notes) hangs off
  `teacher_links` with a composite FK `on delete cascade`.
- Timestamps written by new RPCs use `clock_timestamp()` (the smoke test runs in one transaction, where `now()` stands
  still, and real ordering needs it too).
- Text is plain text: React escapes it; only `splitLinks` output becomes `<a>` (http/https,
  `rel="noopener noreferrer nofollow"`, `target="_blank"`); long unbroken text wraps (`break-words`).
- UI copy: every string in `web/lib/i18n/messages/classroom.ts` (en + zh-TW) or its existing namespace;
  `i18n.test.ts` fails on missing and unused keys (it accepts `` `prefix.${x}` `` keys), so moved strings are deleted
  from their old place. Labels say who sees a thing: comment "Only <student> and you", private note "Only you",
  private task "Only <student>".
- No raw red/amber/green classes; use `toneClass` / `buttonClass` (`web/lib/ui.ts`).
- Not gated by the student's plan.
- Migration file `supabase/migrations/00NN_classroom.sql`, NN = next free at build time (0052 when written; 0051 is the AI-trial migration). Right
  before applying: `git fetch`, check `origin/main:supabase/migrations/` and Supabase `list_migrations`; renumber if
  taken. Applying needs the owner's OK.
- Branch `feat/classroom` in a worktree from `origin/main`. Ship (PR to `main`, merge) only after the migration is
  applied.
- Checks before each commit touching `web/`: `cd web; npx tsc --noEmit; npm run lint; npm test`, read through the
  PowerShell tool or with the exit code (RTK can print green text over a failing exit).

## Review Focus

- A student linked to two teachers: each card, marker and list shows only its own teacher's items; header counts add
  both. (Smoke test, Task 3.)
- Essay sharing turned off after a teacher commented on an essay and noted it: the teacher keeps the conversation,
  sees no essay label and no jump; the student still sees the label. (Smoke test, Task 3; Task 12 browser check.)
- Old activities without a stored id: no Comment/Note/Task action is offered for them and the server refuses a made-up
  `legacy-` id. (Smoke test, Task 3; `anchors.test.ts`, Task 1.)
- `javascript:` / `data:` text, URLs followed by `.`, `,` or `)`, 300-character words: only http(s) links, punctuation
  outside, no overflow. (`linkify.test.ts`, Task 1; browser check, Task 14.)
- Double-click Send / Post / Assign: one row each; buttons disabled while in flight. (Browser check, Task 14.)

---

### Task 1: Pure models: classroom, anchors, links, invites

**Files:**
- Create: `web/lib/classroom.ts` + `classroom.test.ts`, `web/lib/anchors.ts` + `anchors.test.ts`,
  `web/lib/linkify.ts` + `linkify.test.ts`, `web/lib/join-invite.ts` + `join-invite.test.ts`

**Interfaces (Produces):**
- `anchors.ts`
  - `ANCHOR_KINDS = ["general", "section", "college", "essay", "activity", "profile", "task"] as const; type AnchorKind`
  - `type Anchor = { kind: AnchorKind; ref: string | null }`
  - `SECTIONS = ["colleges", "essays", "activities", "profile"] as const` (phase 2 extends it)
  - `PROFILE_CARDS = ["gpa", "test", "english", "regions"] as const`
  - `validateAnchor(a: Anchor): boolean` — general: ref null; section: ref in `SECTIONS`; profile: ref in `PROFILE_CARDS`;
    essay: `ps` | `uc:1`…`uc:8` | `supp:<slug>:<id>` (slug `[a-z0-9-]+`, id non-empty, no spaces); college: `[a-z0-9-]+`;
    activity: non-empty, not starting with `legacy-`; task: a uuid; every ref ≤200. Mirrors the SQL CHECK in Task 4.
  - `anchorKey(a: Anchor): string` → `"general"` or `` `${kind}:${ref}` ``; `parseFocus(s: string | null): Anchor | null`
    (splits at the first `:`, validates; `"essay:supp:mit:e1"` → `{ kind: "essay", ref: "supp:mit:e1" }`)
  - `type TeacherTab = "overview" | "colleges" | "activities" | "essays" | "interested" | "tasks" | "messages" | "notes"`
  - `teacherTabFor(a: Anchor): TeacherTab` — per spec §6 table (`essay` `supp:` → `colleges`; `section:profile` → `overview`)
  - `studentHref(a: Anchor, conversationId?: string): string` and `teacherHref(a: Anchor, studentId: string): string` —
    URLs per spec §6 with `?focus=<anchorKey>` (`teacherHref` → `/teacher/students?s=<id>&tab=<tab>&focus=<key>`;
    `general` → student `/counselor?c=<conversationId>`, teacher `...&tab=messages`)
  - `genericLabelKey(kind: AnchorKind): string` — suffix for `classroom.anchor.generic.<kind>`
- `classroom.ts`
  - `CLASSROOM_LIMITS = { postTitle: 120, postBody: 4000, link: 500, message: 2000, anchorLabel: 120, teacherMessagesPerDay: 300, studentMessagesPerDay: 50, teacherPostsPerDay: 20, activePostsPerTeacher: 200, conversationsPerPair: 100 } as const`
  - `type PostInput = { title: string; body: string; link: string | null; pinned: boolean }`; `validatePost(i: Partial<Record<keyof PostInput, unknown>>): { ok: true; value: PostInput } | { ok: false; error: string }`
  - `validateMessage(body: unknown): { ok: true; value: string } | { ok: false; error: string }`
  - `type StudentPost = { id: string; teacherId: string; classId: string | null; className: string | null; title: string; body: string; link: string | null; pinned: boolean; createdAt: string; read: boolean }`
  - `type TeacherPost = { id: string; classId: string | null; className: string | null; title: string; body: string; link: string | null; pinned: boolean; archived: boolean; createdAt: string; updatedAt: string; audience: number; readCount: number }`
  - `type AnchorInfo = { anchor: Anchor; label: string | null; available: boolean }`
  - `type Conversation = { id: string; otherId: string; otherName: string; about: AnchorInfo; status: "open" | "resolved"; startedBy: "teacher" | "student"; lastMessageAt: string; lastAuthor: "teacher" | "student"; lastBody: string | null; unread: number }`
  - `type Message = { id: string; author: "teacher" | "student"; body: string | null; deleted: boolean; createdAt: string }`
  - `type ClassroomUnread = { teachers: number; posts: number; conversations: number }`
  - `parseStudentPost`, `parseTeacherPost`, `parseConversation`, `parseMessage` (`(r: Record<string, unknown>) => T`; snake_case columns from Tasks 2-4), `parseAnchorInfo(r: Record<string, unknown>): AnchorInfo` (reads `anchor_kind`, `anchor_ref`, `anchor_label`, `anchor_available`; null kind → `general`), `parseUnread(r: unknown): ClassroomUnread` (zeros for null)
  - `sortPosts<T extends { pinned: boolean; createdAt: string }>(p: readonly T[]): T[]`; `shownPosts(p: readonly StudentPost[], max = 3): StudentPost[]` (all unread, then newest read up to `max` total)
  - `needsReply(c: Conversation): boolean` — `c.lastAuthor === "student" && c.unread > 0`
  - `type ConversationFilter = "needs_reply" | "open" | "resolved" | "all"`; `filterConversations(list: readonly Conversation[], f: ConversationFilter, studentIds: ReadonlySet<string> | null): Conversation[]` (newest first)
  - `findConversation(list: readonly Conversation[], otherId: string, a: Anchor): Conversation | null` (never for `general`)
  - `type Marker = { conversationId: string | null; unread: number; notes: number; openTasks: number; firstTaskId: string | null }`
  - `markersByAnchor(i: { conversations?: readonly Conversation[]; notes?: readonly { anchor: Anchor | null }[]; tasks?: readonly { id: string; about: AnchorInfo | null; done: boolean }[] }): Map<string, Marker>` keyed by `anchorKey`; `general` and null anchors are skipped; `firstTaskId` = the earliest open task on that item (input order)
  - `TEACHER_SEES` / `TEACHER_NEVER_SEES` (i18n suffixes; comment names `teacher_student` 0023:66-81 and `teacher_roster` 0023:29-39): sees `nameEmail, scores, plans, list, interested, activities, essays, lastActive, tasks, postReads, messages`; never `portals, notes, aid, transcript, recommenders, scholarships, resume, passwords`
  - `classroomErrorMessage(raw: string): string` — pattern of `taskErrorMessage` (`tasks.ts:139`) over `classroom: limit|not linked|not found|invalid|rate`
- `linkify.ts`: `type Piece = { kind: "text"; text: string } | { kind: "link"; href: string; text: string }`; `splitLinks(text: string): Piece[]`; `isHttpUrl(s: string): boolean`
- `join-invite.ts`: `PENDING_JOIN_KEY = "pending-join-code"`; `inviteUrl(origin, code): string` → `` `${origin}/join#${code}` ``; `parseInviteHash(hash: string): string | null` (via `normalizeCode` + `isPlausibleCode`, `join-codes.ts`); `savePendingCode(code, s?: Storage)`, `readPendingCode(s?: Storage): string | null`, `clearPendingCode(s?: Storage)` (default `sessionStorage`, all in try/catch); `type InviteStep = "loading" | "sign_in" | "welcome" | "teacher" | "no_code" | "preview"`; `inviteStep(s: { sessionChecked: boolean; signedIn: boolean; role: Role | null | undefined; code: string | null }): InviteStep`; `keepPendingAfter(r: CodeResult): boolean` (false for any `{ ok: false }`)

- [ ] **Step 1: Write the failing tests** (import style of `tasks.test.ts:1-2`)

`anchors.test.ts`:
- `validateAnchor`: `{general,null}` true, `{general,"x"}` false; `{section,"essays"}` true, `{section,"transcript"}` false (phase 2); `{profile,"gpa"}` true; essay `"ps"`, `"uc:8"`, `"supp:mit:e1"` true, `"uc:9"`, `"supp:mit:"`, `"supp::e1"` false; `{activity,"legacy-ca-0"}` false; `{task,"not-a-uuid"}` false; a 201-char college ref false.
- `parseFocus("essay:supp:mit:e1")` → `{ kind: "essay", ref: "supp:mit:e1" }`; `parseFocus("college:")` and `parseFocus("nope:x")` → null; `parseFocus("general")` → `{ kind: "general", ref: null }`.
- `teacherTabFor`: college → `colleges`, essay `ps` → `essays`, essay `supp:…` → `colleges`, profile → `overview`, `section:profile` → `overview`, task → `tasks`, general → `messages`.
- `studentHref({college,"mit"})` → `/application/list?focus=college%3Amit` (the key always goes through `encodeURIComponent`); `studentHref({general,null}, "c1")` → `/counselor?c=c1`; `teacherHref({activity,"a1"}, "s1")` → `/teacher/students?s=s1&tab=activities&focus=activity%3Aa1`; `parseFocus` receives the already-decoded value from `useSearchParams`.

`classroom.test.ts`:
- `CLASSROOM_LIMITS` deep-equals the object above.
- `validatePost`: trims title; 121-char title, 4001-char body, link `javascript:alert(1)` → error; link `""` → null; `https://x.org/a` kept.
- `validateMessage`: `""`, `"   "`, 2001 chars → error; 2000 → ok.
- `shownPosts`: 5 unread + 2 read, max 3 → the 5 unread; 1 unread + 4 read → 1 + 2 newest read; pinned read before newer unpinned read.
- `needsReply` truth table (student/2 → true; teacher/0 → false; student/0 → false); `filterConversations` per filter + class set; `findConversation` matches kind+ref+student, null for general and for another student.
- `markersByAnchor`: two notes and one open task `t1` on `college:mit` + a conversation with unread 2 → one entry `{ conversationId, unread: 2, notes: 2, openTasks: 1, firstTaskId: "t1" }`; a done task doesn't count; general/null anchors produce no entry.
- `parseConversation` with `anchor_available: false, anchor_label: null` keeps `about.label === null`; `parseUnread(null)` → zeros.

`linkify.test.ts`: `"see https://a.org/x."` → text, link `https://a.org/x`, `"."`; `"(https://a.org/x)"` → `"("`, link, `")"`; `"javascript:alert(1) data:text/html,x"` → one text piece; `HTTP://A.ORG` → link; `ftp://a.org` → text; `""` → `[]`.

`join-invite.test.ts` (fake `Storage`): `parseInviteHash("#abcd-2345")` → `"ABCD2345"`, `"#"`/`""`/`"#short"` → null; `inviteUrl` exact string; save/read/clear round trip; throwing Storage → read null, no throw; `inviteStep` six cases; `keepPendingAfter` false for `invalid`, `rate_limited`, `failed`, true for ok.

- [ ] **Step 2: Run** `cd web; node --test lib/anchors.test.ts lib/classroom.test.ts lib/linkify.test.ts lib/join-invite.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement** the four modules. `splitLinks`: match `https?:\/\/[^\s<>"]+` case-insensitively, then move trailing `.,;:!?` and an unbalanced `)` back into the following text.
- [ ] **Step 4: Run** the same command → PASS; `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): models, anchors, link splitting and invite helpers"` (the eight files).

---

### Task 2: Migration A: announcements, read marks, leave class, rename, teacher profile, my_tasks

**Files:** Create `supabase/migrations/00NN_classroom.sql`, `supabase/patches/2026-11-03_classroom_smoke_test.sql`

**Interfaces (Produces, SQL; argument names are the contract, supabase-js passes them by name):**
- Tables `class_posts`, `post_reads` per spec §9; `class_posts.class_id` → `classes(id) on delete cascade`.
- `teacher_create_post(p_class uuid, p_title text, p_body text, p_link text, p_pinned boolean) returns uuid` (null class = all my students)
- `teacher_update_post(p_post uuid, p_title text, p_body text, p_link text, p_pinned boolean) returns void`
- `teacher_archive_post(p_post uuid, p_archived boolean) returns void`
- `teacher_posts() returns table (post_id uuid, class_id uuid, class_name text, title text, body text, link_url text, pinned boolean, archived boolean, created_at timestamptz, updated_at timestamptz, audience int, read_count int)`
- `teacher_post_unread(p_post uuid) returns table (student_id uuid, display_name text)`
- `my_posts() returns table (post_id uuid, teacher_id uuid, class_id uuid, class_name text, title text, body text, link_url text, pinned boolean, created_at timestamptz, is_read boolean)`
- `mark_posts_read(p_posts uuid[]) returns void` (ignores ids the caller can't see)
- `leave_class(p_class uuid) returns void` (deletes the caller's `class_members` row; the link stays)
- `teacher_rename_class(p_class uuid, p_name text) returns void` (same name rule as `teacher_create_class`)
- `update_my_teacher_profile(p_name text, p_school text) returns void` (same checks as `set_my_role`)
- `drop function public.my_tasks();` and recreate `my_tasks()` returning `(task_id uuid, teacher_id uuid, teacher_name text, class_id uuid, class_name text, title text, details text, due_on date, done boolean, done_at timestamptz)` — same rows as 0041:513; `class_id` null = a private (one-student) task (Task 4 adds the anchor columns to this same definition).
- Error texts start with `classroom: ` (`limit`, `not linked`, `not found`, `invalid`, `rate`).
- Internal `post_audience(p_post uuid) returns table (student_id uuid, counted boolean)`: visible when the post isn't
  archived, the student is linked to its teacher, and (`class_id` null, or member of that non-archived class);
  `counted` when also the join time (`class_members.joined_at` for a class post, `teacher_links.created_at` for an
  all-students post) `<= created_at`. `is_read` = not counted or a read row exists; `audience` / `read_count` /
  `teacher_post_unread` use counted students only; display names exactly as `teacher_roster` exposes them.

- [ ] **Step 1: Write the smoke test** — frame of `supabase/patches/2026-10-25_teacher_tasks_smoke_test.sql`
  (`begin;` … `rollback;`, act as a user with `select set_config('request.jwt.claims', '{"sub":"<id>","role":"authenticated"}', true); set local role authenticated;`, `reset role;` between users, `raise exception` on a wrong result, final `raise notice 'classroom smoke test passed'`).
  Accounts: T1 (classes A, B), T2, S1 (linked to T1 and T2, in A and B), S2 (linked to T1, in A; its `teacher_links.created_at` and `class_members.joined_at` set as postgres to `clock_timestamp() + interval '1 minute'`), S3 (unlinked). The file has parts A, B, C and a final part D (link deletion), so later parts never depend on a link an earlier part removed. Part A checks:
  - T1 posts to A and to all → S1 sees both unread; S2 sees both with `is_read = true`; S3 nothing; T2's `teacher_posts` has none of T1's; T1's all-students post has `audience = 1`.
  - S1 `mark_posts_read` → class post `read_count = 1`, `teacher_post_unread` empty.
  - S1 `leave_class(A)` → class post gone for S1, all-students post kept, `teacher_links` row kept.
  - 21st post in a day → `classroom: rate`; 121-char title and `javascript:x` link → `classroom: invalid`; T1 posting to T2's class → `classroom: not found`; S1 calling `teacher_create_post` raises; T1 calling `my_posts` returns nothing.
  - T2 already holds 200 active posts (inserted as postgres with `created_at` two days ago) → T2's next `teacher_create_post` → `classroom: limit`.
  - `my_tasks` for S1 returns `teacher_id`, and `done_at` after `set_task_done`.
- [ ] **Step 2: Write part A of the migration** — header comment in 0028's style ("Who sees what", limits mirrored in `web/lib/classroom.ts`), tables, triggers, functions, grants. Indexes `class_posts (teacher_id, created_at desc)`, `class_posts (class_id)`, `post_reads (student_id)`.
- [ ] **Step 3: Dry-run** migration + smoke test in one `begin; … rollback;` through Supabase `execute_sql` → notice `classroom smoke test passed`; then `select to_regclass('public.class_posts')` → null (nothing persisted). The live client's `parseStudentTask` reads columns by name, so the wider `my_tasks` doesn't break code that is live now.
- [ ] **Step 4: Commit** `git commit -m "feat(classroom): announcements, read marks, leave class, rename, teacher profile"`.

---

### Task 3: Migration B: anchors helper, conversations, unread

**Files:** Modify (append) the migration and the smoke test.

**Interfaces (Produces, SQL):**
- Internal `anchor_visible(p_teacher uuid, p_student uuid, p_kind text, p_ref text) returns boolean` (granted to
  nobody): general → ref null; section → ref in (`colleges`,`essays`,`activities`,`profile`) and for `essays`
  `share_essays`; college → `coalesce(i.slug, 'custom-' || sc.id::text) = p_ref` for one of the student's
  `student_colleges` (as 0023:84); essay → `share_essays` and (`ps` | `uc:[1-8]` | `supp:<slug>:<id>` where that
  college is on the list and its `checklist -> 'essay_list'` holds an entry with that `id`); activity →
  `jsonb_path_exists(sp.activities, '$.** ? (@.id == $id)', jsonb_build_object('id', p_ref))` and not `legacy-%`;
  profile → ref in (`gpa`,`test`,`english`,`regions`); task → a uuid of a task of `p_teacher` in
  `visible_tasks(p_student)`.
- Tables `conversations` (anchor_kind, anchor_ref, anchor_label + spec §9 columns; unique
  `(teacher_id, student_id, anchor_kind, coalesce(anchor_ref, ''))` where `anchor_kind <> 'general'`) and
  `conversation_messages`.
- `start_conversation(p_other uuid, p_kind text, p_ref text, p_label text, p_body text) returns uuid` — `p_other` is the
  student for a teacher caller, the teacher for a student caller; refuses unless `anchor_visible`; an existing
  non-general conversation gets the message and reopens; returns its id.
- `send_message(p_conversation uuid, p_body text) returns uuid` (reopens); `delete_message(p_message uuid) returns void`
  (author only; `body = null, deleted_at = clock_timestamp()`); `set_conversation_status(p_conversation uuid, p_status text) returns void`;
  `mark_conversation_read(p_conversation uuid) returns void` (caller's side, `clock_timestamp()`).
- `my_conversations() returns table (conversation_id uuid, other_id uuid, other_name text, anchor_kind text, anchor_ref text, anchor_label text, anchor_available boolean, status text, started_by text, last_message_at timestamptz, last_author text, last_body text, unread int)` — role-aware; `anchor_label` null for a teacher caller when not available; `last_body` null when that message was deleted; `unread` = the other side's non-deleted messages newer than the caller's read time; no read times returned.
- `conversation_messages_for(p_conversation uuid) returns table (message_id uuid, author text, body text, deleted boolean, created_at timestamptz)` (oldest first; caller must be one of the pair).
- `classroom_unread() returns table (teachers int, posts int, conversations int)` — student: linked teachers, unread counted posts, conversations with unread > 0; teacher: `0, 0,` conversations that need a reply.

- [ ] **Step 1: Append part B smoke checks**
  - T1 `start_conversation(S1,'college','<slug on S1 list>','MIT','hi')` → S1 sees it, `unread = 1`, label `MIT`; S1 `classroom_unread.conversations = 1`; S1 replies → T1 count 1; T1 `mark_conversation_read` → 0; T1 starts the same college again → same id.
  - T2 starts a general conversation with S1 → S1 sees two teachers' conversations, `classroom_unread.conversations = 2`; T2 sees none of T1's; S3 nothing; T2 `conversation_messages_for(<T1-S1>)` → `classroom: not found`; T1 `start_conversation(S3, …)` → `classroom: not linked`.
  - 100 conversations already between T2 and S1 (inserted as postgres) → T2's next general `start_conversation(S1, …)` → `classroom: limit`.
  - Essay: S1 sharing on, T1 starts `essay`/`ps`; S1 sharing off → T1 row `anchor_available = false`, `anchor_label` null, still listed; S1's row keeps the label; T1 starting `essay`/`uc:2` → `classroom: invalid`.
  - Activity: T1 `start_conversation(S1,'activity','legacy-ca-0',…)` → `classroom: invalid`; with an id present in S1's stored activities → ok.
  - Non-author `delete_message` raises; author → `deleted = true`, body null for both.
  - 51st student message in a day → `classroom: rate`; 2001-char body → `classroom: invalid`.
  - S1 general question twice → two ids.
  - S2 and T1 get a general conversation; S2 `leave_class(A)` → still listed for both, link kept.
- [ ] **Step 2: Append part B** to the migration; indexes `conversations (teacher_id, last_message_at desc)`, `(student_id, last_message_at desc)`, `conversation_messages (conversation_id, created_at)`.
- [ ] **Step 3: Dry-run** as Task 2 Step 3 → notice; `to_regclass('public.conversations')` null after.
- [ ] **Step 4: Commit** `git commit -m "feat(classroom): conversations about items, messages, unread counts"`.

---

### Task 4: Migration C: anchors on private notes and private tasks

**Files:** Modify (append) the migration and the smoke test.

**Interfaces (Produces, SQL):**
- `alter table public.teacher_notes add column anchor_kind text, add column anchor_ref text` with a CHECK mirroring
  `validateAnchor` (both null, or kind in the phase-1 list and ref per kind; ref ≤200). Its RLS policy is unchanged.
- `alter table public.teacher_tasks add column anchor_kind text, anchor_ref text, anchor_label text` with the same
  CHECK, label 1-120 when kind set, and `check (anchor_kind is null or student_id is not null)` (only one-student tasks
  carry an anchor).
- `drop function public.create_task(text, text, date, uuid, uuid)`; recreate as `create_task(p_title text, p_details text default null, p_due_on date default null, p_class uuid default null, p_student uuid default null, p_anchor_kind text default null, p_anchor_ref text default null, p_anchor_label text default null) returns uuid` — refuses an anchor unless `p_student` is set and `anchor_visible`. Old callers keep working. Re-grant.
- `list_my_tasks` (latest definition: 0028:153 or a later one — grep) and `my_tasks` gain `anchor_kind, anchor_ref, anchor_label, anchor_available`. Their return columns change, so `list_my_tasks` gets `drop function` + `create function` + re-grant, and Task 2's `my_tasks` definition is edited in place in the same (not yet applied) file to add the four columns, so the file holds one definition of each. Label null for the teacher when not available; the student keeps it.
- New `teacher_student_tasks(p_student uuid) returns table (task_id uuid, title text, details text, due_on date, class_id uuid, class_name text, anchor_kind text, anchor_ref text, anchor_label text, anchor_available boolean, done boolean, done_at timestamptz)` — the caller's tasks that reach that linked student (one-on-one and class); `anchor_label` null when not available.

- [ ] **Step 1: Append part C and part D smoke checks.**
  Part C: T1 inserts a note on `college:<slug>` (direct insert as T1, policy applies) → ok; a note with `anchor_kind = 'college'`, `anchor_ref = null` → CHECK fails; S1 `select` on `teacher_notes` → 0 rows. S1 turns essay sharing on; T1 `create_task(… p_student := S1, p_anchor_kind := 'essay', p_anchor_ref := 'ps', p_anchor_label := 'Personal statement')` → ok; an anchor with `p_class` → refused; old-style `create_task(p_title := 'x', p_class := B)` still works. `my_tasks` for S1 shows the private task (`class_id` null, anchor) and the class-B task; `teacher_student_tasks(S1)` lists both with done flags; S2 sees none of S1's private tasks; T2 `teacher_student_tasks(S2)` → `classroom: not linked`. S1 turns sharing off → T1's `list_my_tasks` and `teacher_student_tasks(S1)` show that task with `anchor_available = false` and `anchor_label` null, S1's `my_tasks` keeps the label; a new essay-anchored task → `classroom: invalid`. S1 `leave_class(B)` → class-B task gone from `my_tasks`, private task kept.
  Part D (last): first assert that rows exist for (T1, S1) in `conversations`, `conversation_messages`, `post_reads`, `teacher_notes`, `teacher_tasks` (one-student) and `task_completions` (S1 ticks the private task first); S1 `leave_teacher(T1)`; then every one of those counts for the pair = 0, and S1's conversation with T2 is still there.
- [ ] **Step 2: Append part C** to the migration.
- [ ] **Step 3: Dry-run** → notice; nothing persisted.
- [ ] **Step 4: Ask the owner to approve applying; apply** with `apply_migration` after re-checking the number; run the smoke test once more (it rolls back) → notice. If the owner says not yet, go on with Task 5 and apply before Task 14.
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): anchors on private notes and private tasks"`.

---

### Task 5: Client wrappers, task/note models, unread store

**Files:** Create `web/lib/classroom-api.ts`, `web/components/classroom/useClassroomUnread.ts`; Modify `web/lib/tasks.ts` + `tasks.test.ts`, `web/lib/tasks-api.ts`, `web/lib/links-api.ts`

**Interfaces:**
- Consumes: Task 1 types and parsers; Tasks 2-4 RPCs.
- Produces (`classroom-api.ts`, local `db`/`check` as `tasks-api.ts:9-14`, `check` throws `new Error(classroomErrorMessage(...))`):
  `createPost(classId: string | null, p: PostInput): Promise<string>`, `updatePost(id: string, p: PostInput): Promise<void>`,
  `archivePost(id: string, archived: boolean): Promise<void>`, `teacherPosts(): Promise<TeacherPost[]>`,
  `postUnread(id: string): Promise<{ id: string; name: string }[]>`, `myPosts(): Promise<StudentPost[]>`,
  `markPostsRead(ids: string[]): Promise<void>` (no call when empty),
  `startConversation(otherId: string, a: Anchor, label: string | null, body: string): Promise<string>`,
  `sendMessage(id: string, body: string): Promise<string>`, `deleteMessage(id: string): Promise<void>`,
  `setConversationStatus(id: string, s: "open" | "resolved"): Promise<void>`, `markConversationRead(id: string): Promise<void>`,
  `myConversations(): Promise<Conversation[]>`, `conversationMessages(id: string): Promise<Message[]>`,
  `classroomUnread(): Promise<ClassroomUnread>` (passes `data?.[0]` to `parseUnread`; the RPC returns one row), `studentTasksForTeacher(studentId: string): Promise<TeacherStudentTask[]>`
- Produces (`tasks.ts`): `StudentTask` gains `teacherId: string; classId: string | null; className: string | null; doneAt: string | null; about: AnchorInfo | null` (`classId` null = private task);
  `TeacherTask` gains `about: AnchorInfo | null`; new `type TeacherStudentTask = { id; title; details: string | null; dueOn: string | null; classId: string | null; className: string | null; about: AnchorInfo | null; done: boolean; doneAt: string | null }` + `parseTeacherStudentTask`. `tasks-api.ts` `createTask(target, task, about?: { anchor: Anchor; label: string })`.
- Produces (`links-api.ts`): `TeacherNote` gains `anchor: Anchor | null`; `addNote(studentId, body, anchor?: Anchor | null)`; `updateNote(id, body)` unchanged; `listNotes` selects the two columns; `leaveClass(classId: string)`, `renameClass(classId: string, name: string)`, `updateTeacherProfile(name: string, school: string | null)`.
- Produces (`useClassroomUnread.ts`): `useClassroomUnread(): ClassroomUnread | null`, `refreshClassroomUnread(): void` — one module-level store (`useSyncExternalStore`, like `student-store.ts`); loads when `useStudent()` has `auth` and a role; reloads on `refreshClassroomUnread()`, pathname change and window `focus`; null when signed out.

- [ ] **Step 1: Failing tests** in `tasks.test.ts`: `parseStudentTask` reads `teacher_id`, `done_at` (missing → null) and an anchor (`anchor_kind: "essay", anchor_ref: "ps", anchor_label: "Personal statement", anchor_available: true` → `about.anchor` `{ kind: "essay", ref: "ps" }`); no anchor columns → `about: null`; `parseTeacherStudentTask` on a class task row.
- [ ] **Step 2: Run** `cd web; node --test lib/tasks.test.ts` → FAIL.
- [ ] **Step 3: Implement** the model changes, wrappers and store.
- [ ] **Step 4: Run** `npm test; npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): RPC wrappers, task and note anchors, unread store"`.

---

### Task 6: Jump links: the focus hook and item targets on both sides

**Files:**
- Create `web/components/classroom/useFocusTarget.ts`
- Modify `web/components/MyList.tsx` (row `li.ml-row` at :487 gets `data-focus`; open the row), `web/components/EssaysPage.tsx` (PS section, each UC `li`, each supplement `EssayRow` in `CollegeEssayCard.tsx`; reuse `hashTarget` :30 logic), `web/components/ActivitiesEditor.tsx` (cards already carry `data-entry-id` :243; switch to the tab holding the id), `web/components/ProfileDashboard.tsx` (`revealCard` :28-36), the four section headings (`section:<name>`)
- Modify `web/components/TeacherTabs.tsx` (optional `value?: string; onChange?: (id: string) => void`; uncontrolled unchanged), `web/components/TeacherStudentDetail.tsx` (tab from `?tab=`, `focus` from `?focus=`), `TeacherDetailColleges.tsx`, `TeacherDetailActivities.tsx`, `TeacherDetailEssays.tsx`, `TeacherDetailOverview.tsx` (profile cards) — items get `data-focus` (Interested items are not anchorable)

**Interfaces:**
- Consumes: `parseFocus`, `anchorKey`, `teacherTabFor`.
- Produces: `useFocusTarget(opts: { ready: boolean; open?: (a: Anchor) => void }): void` — reads `focus` from `useSearchParams`, once `ready`, calls `open(anchor)` so the page can expand/switch, then on the next frame finds `[data-focus="<anchorKey>"]`, `scrollIntoView({ block: "center" })`, adds the class `focus-flash` for 2 s (a `@layer components` rule in `globals.css`, tone tokens only); does nothing if the element is missing. Remember: hidden panes freeze rAF; fall back to `setTimeout(0)` when `document.hidden`.
- Every item element rendered for an anchorable item carries `data-focus={anchorKey(anchor)}`. Activities: only ids stored in the saved data (not `legacy-`); check whether `upgradeActivities` (`activities.ts` ~:732) persists made-up ids and, if it doesn't, keep `legacy-` items unanchored.

- [ ] **Step 1:** Implement the hook and the `focus-flash` style.
- [ ] **Step 2:** Add `data-focus` + `open` callbacks on the four student pages and the teacher detail tabs; `TeacherStudentDetail` reads `tab` and `focus` and passes `value`/`onChange` to `TeacherTabs` (changing tab updates the URL with `router.replace`, no history spam).
- [ ] **Step 3:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 4:** Browser check on `localhost` with the dev server (`preview_start`): `/application/list?focus=college:<a slug on the list>` opens and flashes that row; `/materials/activities?focus=activity:<id of a UC entry>` switches to UC and flashes it; `/profile?focus=profile:test` opens the test card. Screenshot each. (Signed-out local data is enough for the student pages.)
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): jump-to-item focus links on student and teacher pages"`.

---

### Task 7: Shared conversation UI and the i18n namespace

**Files:** Create `web/lib/i18n/messages/classroom.ts`; Modify `web/lib/i18n/sections.ts` (import + `SECTIONS`, like `teacher` at :25/:55), `en.ts` (`...S.classroom.en`), `zh-TW.ts` (`...S.classroom.zhTW`); Create in `web/components/classroom/`: `ClassroomText.ts`, `LinkedText.tsx`, `AnchorChip.tsx`, `ConversationPanel.tsx`, `NewConversation.tsx`, `anchorOptions.ts` (the `AnchorOption` type only; Tasks 8 and 11 add the option builders)

**Interfaces:**
- Consumes: Task 1, Task 5 wrappers and `refreshClassroomUnread`.
- Produces:
  - `ClassroomText.ts` (pattern of `TeacherText.ts`): `anchorText(t, info: AnchorInfo, role: "teacher" | "student"): string` — label when present; else for `general` "General", `section:<x>` "Your/Their <section>", essay `ps` / `uc:N` from i18n, otherwise ``t(`classroom.anchor.generic.${kind}`)``; `classroomError(t, e: unknown): string`.
  - `<LinkedText text={string} />` (`whitespace-pre-line break-words`).
  - `<AnchorChip info={AnchorInfo} role={...} studentId?={string} conversationId?={string} />` — text from `anchorText`; links with `studentHref` / `teacherHref` when `available`; plain text otherwise.
  - `type AnchorOption = { anchor: Anchor; label: string }` (in `anchorOptions.ts`)
  - `<ConversationPanel conversation={Conversation} role={...} studentId?={string} onClose={() => void} onChanged={() => void} />` — dialog per spec §4.2: title `<otherName> · <AnchorChip>`, loads `conversationMessages`, `markConversationRead` then `refreshClassroomUnread()` on open, reply box (`validateMessage`, Send disabled in flight), delete own messages ("Message removed"), Mark resolved / Reopen from `conversation.status`, `onChanged` after any write.
  - `<NewConversation role={...} otherId={string} options={AnchorOption[]} preset?={AnchorOption} onStarted={(id: string) => void} onCancel={() => void} />` — item select (General first) + first message → `startConversation`.
- Only keys used by this task's components are added now.

- [ ] **Step 1:** Create and register the namespace; `node --test lib/i18n.test.ts` → PASS.
- [ ] **Step 2:** Build the five components.
- [ ] **Step 3:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 4: Commit** `git commit -m "feat(classroom): conversation panel, anchor chips, linked text"`.

---

### Task 8: Student Counselors page

**Files:** Create `web/app/(app)/counselor/page.tsx` (thin, `metadata = { title: "Counselors" }`, `<Suspense>` for search params), `web/components/classroom/CounselorPage.tsx`, `TeacherCard.tsx`, `JoinBox.tsx`, `WhatTheySee.tsx`; Modify `web/components/classroom/anchorOptions.ts` (+ `studentAnchorOptions`), `web/lib/roles.ts` (`STUDENT_ONLY_PATHS` + `"/counselor"`) + `roles.test.ts`, `web/components/SettingsPage.tsx:205-214` (pointer row instead of `<MyCounselors />`); Delete `web/components/MyCounselors.tsx` and its now-unused `settings.counselors.*` strings (moved to `classroom.*`)

**Interfaces:**
- Consumes: `myTeachers`, `setShareEssays`, `leaveTeacher`, `leaveClass`, `previewCode`, `redeemCode` (links-api); `myTasks`, `setTaskDone`; `myPosts`, `markPostsRead`, `myConversations`; `shownPosts`, `sortPosts`, `TEACHER_SEES`, `TEACHER_NEVER_SEES`; Task 7 components; `useFocusTarget` (for `focus=task:<id>`).
- Produces: `<JoinBox initialCode?={string} autoPreview?={boolean} onJoined={() => void} onPreview?={(r: CodeResult) => void} onCancel?={() => void} />` (lifted from `MyCounselors.tsx:82-215`), and `studentAnchorOptions(student, shareEssays: boolean): AnchorOption[]` in `anchorOptions.ts` — General; sections colleges, activities, profile, and essays when shared; each list college (ref = slug / `custom-<rowId>`); profile cards; when shared, PS, chosen UC questions and saved supplement essays; activities with stored ids. Task 11 adds the teacher counterpart in the same file.

To do rows label private tasks (`classId` null) "Only you" and class tasks with the class name.

Page per spec §4.1 sketch: one `TeacherCard` per `myTeachers()` row (newest activity first): header with class names + Leave class; Announcements (`shownPosts`, Show all); To do (that teacher's tasks, "only you"/class label, `AnchorChip` on anchored ones, `data-focus="task:<id>"`, overdue in urgent tone via `taskTone`); Comments (rows with `AnchorChip`, dot when unread; New message / Ask <name> → `NewConversation` with that teacher's options); `WhatTheySee` (``t(`classroom.sees.${k}`)`` lists, essays switch, Leave <name> whose confirm says everything between you is deleted for both sides). After render, `markPostsRead` for shown unread posts, then `refreshClassroomUnread()`. `?c=<id>` opens the panel (unknown id: ignore). No teachers → `JoinBox` + one paragraph.

- [ ] **Step 1: Failing test** `roles.test.ts`: `redirectFor("teacher", "/counselor", true) === "/teacher"`.
- [ ] **Step 2: Run** `node --test lib/roles.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx tsc --noEmit; npm run lint; npm test` → exit 0 (the i18n test proves no orphaned keys).
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): student Counselors page"`.

---

### Task 9: Student unread, nav and markers on the student's items

**Files:** Modify `web/lib/roles.ts` (`navFor`, nav arrays, `navDots`, `activeNavHref` at :115) + `roles.test.ts`; `web/components/SiteNav.tsx` (dots, `MenuSheet` too); `web/lib/i18n/messages/common.ts` (`NAV_LABEL_KEYS` + "Counselors", "Messages", "Roster"); `web/components/MyList.tsx` (strip at top; marker on rows; replace both `<TeacherTasksForStudent />` mounts :252/:421 with "N tasks due this week · Open"); delete `TeacherTasksForStudent.tsx` and its unused strings; `EssaysPage.tsx`, `ActivitiesEditor.tsx`, `ProfileCards.tsx` (markers); Create `web/components/classroom/ItemMarker.tsx`, `useStudentMarkers.ts`; `TeacherStudents.tsx`, `TeacherCharts.tsx` (`SectionTabs` `[["/teacher/students","Roster"],["/teacher/charts","Charts"]]`)

**Interfaces:**
- Consumes: `useClassroomUnread`, `myConversations`, `myTasks`, `markersByAnchor`, `studentHref`.
- Produces (`roles.ts`): `navFor(role, opts: { signedIn: boolean; started: boolean; linked?: boolean })` — student nav adds `["/counselor","Counselors"]` after `["/application","My colleges"]` only when `linked`; `TEACHER_NAV` = Home, Students, Classes, `["/teacher/messages","Messages"]`, Tasks, Deadlines, Explore, Compare. `navDots(role, u: ClassroomUnread | null): ReadonlySet<string>`. `activeNavHref` (existing signature) maps `/teacher/charts` to `/teacher/students`. SiteNav passes `linked: (unread?.teachers ?? 0) > 0`.
- Produces: `useStudentMarkers(): Map<string, { teacherId: string; teacherName: string; marker: Marker }[]> | null` keyed by `anchorKey` — one fetch of conversations + tasks (refreshed with the unread store), grouped by teacher (`Conversation.otherId`, `StudentTask.teacherId`) and run through `markersByAnchor` once per teacher, so two teachers on the same item give two entries; `<ItemMarker marker={Marker} teacherName?={string} />` (one per entry; the name shows only when there are several) — 💬 with unread count linking to `/counselor?c=<conversationId>`, ☐ with open task count linking to `/counselor?focus=task%3A<firstTaskId>`.

- [ ] **Step 1: Failing tests** `roles.test.ts`: student nav without `linked` lacks `/counselor`, with `linked` has it 4th; teacher nav has `/teacher/messages`, no `/teacher/charts`; `navDots` student (posts+conversations > 0 → `/counselor`, else empty), teacher (`conversations` > 0 → `/teacher/messages`); `activeNavHref("/teacher/charts", …)` → `/teacher/students`; existing `activeNavHref` tests still pass.
- [ ] **Step 2: Run** `node --test lib/roles.test.ts lib/i18n.test.ts` → FAIL.
- [ ] **Step 3: Implement.** My list strip "From your counselors: N announcements, M comments · Open" only when > 0.
- [ ] **Step 4: Run** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): unread dots, markers on student items, Students/Charts tabs"`.

---

### Task 10: Teacher Messages page

**Files:** Create `web/app/(app)/teacher/messages/page.tsx` (thin, `metadata = { title: "Messages" }`, `<Suspense>`), `web/components/classroom/TeacherMessages.tsx`, `TeacherConversationList.tsx`, `TeacherAnnouncements.tsx`, `PostComposer.tsx`

**Interfaces:**
- Consumes: `myConversations`, `filterConversations`, `needsReply`, `listStudents` (`class_ids` per student), `teacherPosts`, `postUnread`, `createPost`, `updatePost`, `archivePost`, `validatePost`, Task 7 components.
- Produces: `<PostComposer presetClassId?={string | null} post?={TeacherPost} onSaved={() => void} onCancel={() => void} />` (To: non-archived classes + All my students; Title, Text, Link, Pin; disabled while saving). Reused by Tasks 11 and 13.

Per spec §5.3: `<TeacherGate returnTo="/teacher/messages">`; tabs Conversations (filter radios, default Needs reply; class select; rows with `AnchorChip` using `teacherHref`; `?c=<id>` opens the panel) and Announcements ("+ New", `sortPosts` list, "Read by X of Y ▸" → names from `postUnread`, Edit / Archive / Restore).

- [ ] **Step 1:** Implement with its `classroom.*` strings.
- [ ] **Step 2:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 3: Commit** `git commit -m "feat(classroom): teacher Messages page"`.

---

### Task 11: Teacher home, roster flag, student detail Messages / Tasks / Notes tabs

**Files:** Modify `web/lib/roster.ts` (`FlagKey` + `"reply_waiting"`, `FLAG_SEVERITY`, `computeFlags(s, now, ctx?: { replyWaiting?: ReadonlySet<string> })`) + `roster.test.ts`; `web/lib/roster-week.ts` (`buildWeek(roster, deadlines, now, replyWaiting?)`) + its test; `web/components/TeacherText.ts` (label + detail); `web/components/teacher/TeacherWeek.tsx` (5th tally "Replies waiting", list of up to 5, Post an announcement); `web/components/TeacherRoster.tsx` (pass the set); `web/components/TeacherStudentDetail.tsx` (tabs `tasks`, `messages` before `notes`; Messages tab has a speech-bubble icon and a dot when any of this student's conversations `needsReply`, "Shared with <student>" at the top; Notes tab keeps a lock icon and "Only you can see these notes"); `web/components/TeacherNotes.tsx` (anchor chip per note via `teacherHref`, filter all / general / about an item; the add form takes an optional preset anchor); `web/lib/i18n/messages/teacher.ts` (`teacher.classes.removeConfirm` adds that comments, notes and private tasks with the student are deleted, en + zh-TW); `web/components/classroom/anchorOptions.ts` (+ `teacherAnchorOptions`); Create `web/components/classroom/TeacherDetailMessages.tsx`, `TeacherDetailTasks.tsx`

**Interfaces:**
- Consumes: `myConversations`, `findConversation`, `needsReply`, `studentTasksForTeacher`, `createTask` (with `about`), `listNotes`, `addNote(…, anchor)`, Task 7 and Task 10 components.
- Produces: `teacherAnchorOptions(detail: StudentDetail): AnchorOption[]` — mirrors `studentAnchorOptions` from the teacher's `StudentDetail` (essay items only when `shareEssays`; activities only with ids stored in the raw `activities` json, read before `upgradeActivities`); `TeacherStudentDetail` builds it once and passes it to both new tabs and (Task 12) the item menus. `TeacherStudentDetail` holds `pending: { action: "comment" | "note" | "task"; option: AnchorOption } | null`; `<TeacherDetailMessages studentId studentName options={AnchorOption[]} preset?={AnchorOption | null} />` (opens the existing conversation via `findConversation` or `NewConversation` with the preset); `<TeacherDetailTasks studentId studentName options={AnchorOption[]} preset?={AnchorOption | null} />` ("Private tasks for <name>": create/edit/archive with due date and optional item; then the class tasks reaching this student with done/not done); `TeacherNotes` gains `preset?: AnchorOption | null`. Task 12 sets `pending` and switches the tab.
- Note chip text: from the loaded student detail when the item is there, otherwise the generic label (notes have no saved label).

- [ ] **Step 1: Failing tests:** `computeFlags(s, now, { replyWaiting: new Set([s.id]) })` includes `reply_waiting`, without ctx not; `buildWeek` with that set puts the student in `checkIns` with that reason.
- [ ] **Step 2: Run** `node --test lib/roster.test.ts lib/roster-week.test.ts` → FAIL (use the existing week test file name).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx tsc --noEmit; npm run lint; npm test` → exit 0 (if `roster-export.ts` lists flags, update its test).
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): replies waiting, student Messages, private Tasks and anchored Notes tabs"`.

---

### Task 12: The ⋯ menu and markers on items in the teacher's review

**Files:** Create `web/components/classroom/ItemActions.tsx`, `useTeacherMarkers.ts`; Modify `TeacherDetailOverview.tsx` (profile cards + section), `TeacherDetailColleges.tsx` (each college, each supplement essay, section), `TeacherDetailActivities.tsx` (each entry with a stored id, section), `TeacherDetailEssays.tsx` (PS, each UC question, section; only while shared), `TeacherStudentDetail.tsx`

**Interfaces:**
- Consumes: `markersByAnchor`, `myConversations`, `listNotes`, `studentTasksForTeacher`, `anchorKey`, `teacherHref`, `teacherAnchorOptions` and the `pending` state from Task 11.
- Produces: `<ItemActions option={AnchorOption} studentName={string} marker?={Marker} onAction={(action: "comment" | "note" | "task") => void} onMarker={(what: "comments" | "notes" | "tasks") => void} />` — the ⋯ menu with the three actions and who-sees text (spec §5.2), and the markers 💬 n (dot if a reply waits) / 🔒 n / ☐ n. `useTeacherMarkers(studentId: string): Map<string, Marker> | null` (this teacher's conversations with that student, notes and tasks; one teacher, so keyed by `anchorKey` alone).

Clicking an action sets `pending` and switches to the messages / notes / tasks tab with the item preset; clicking a marker opens the comment, or switches to Notes / Tasks scrolled to the first matching row (`data-focus` on rows).

- [ ] **Step 1:** Implement; add strings.
- [ ] **Step 2:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 3: Commit** `git commit -m "feat(classroom): comment, private note and private task on any item"`.

---

### Task 13: Classes, invite links, /join, welcome hand-off, teacher profile

**Files:** Modify `web/components/TeacherClassCard.tsx`, `TeacherClasses.tsx` (Copy invite link for class and one-on-one codes, Show on screen, Rename, latest announcement + Post); Create `web/components/classroom/ShowCodeDialog.tsx`, `web/app/(app)/join/page.tsx` (thin, `metadata = { title: "Join a class" }`), `web/components/classroom/JoinInvite.tsx`, `TeacherProfileForm.tsx`; Modify `web/lib/roles.ts` + test (`redirectFor(null, "/join", true)` → null), `web/components/WelcomeForm.tsx` (pending-code note `classroom.join.welcomeNote`, Student preselected, after `setRole("student")` → `/join`), `web/components/SettingsPage.tsx` (teacher view: `TeacherProfileForm` next to the digest switch)

**Interfaces:** Consumes `inviteUrl`, `parseInviteHash`, `savePendingCode`, `readPendingCode`, `clearPendingCode`, `inviteStep`, `keepPendingAfter`, `JoinBox`, `renameClass`, `updateTeacherProfile`, `teacherPosts`, `PostComposer`, `formatCode`, `openSignIn` (`SignInDialog.tsx:12`; it returns to `pathname + search`, i.e. `/join`).

`JoinInvite`: on mount `parseInviteHash(location.hash)` → `savePendingCode` + `history.replaceState` to drop the hash;
else `readPendingCode()`. Render by `inviteStep`: `sign_in` → explanation + Sign in; `welcome` →
`router.replace("/welcome")`; `teacher` → "This invite is for students…"; `no_code` → empty `JoinBox`; `preview` →
`JoinBox initialCode autoPreview onJoined={() => { clearPendingCode(); router.push("/counselor"); }}` with `onPreview`
clearing when `!keepPendingAfter(r)` and `onCancel` clearing. `ShowCodeDialog`: full screen, `formatCode` in very
large type, the invite URL under it, Esc closes.

- [ ] **Step 1: Failing tests** `roles.test.ts`: `redirectFor(null, "/join", true) === null`; `redirectFor(null, "/colleges", true) === "/welcome"`; `redirectFor("teacher", "/join", true) === null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 5: Commit** `git commit -m "feat(classroom): invite links, show code, rename class, teacher profile"`.

---

### Task 14: Docs, build, live check, ship

**Files:** Modify `docs/legal/2026-10-29-privacy-data-map.md` (row "teacher" :21: posts, read marks, conversations, note/task anchors, who sees each), the privacy page's teacher section (`grep -rn "teacher" "web/app/(app)/privacy"`), `CLAUDE.md` (teacher section: conversations, announcements, anchors, `/counselor`, `/join`, `/teacher/messages`; fix the stale "ideas not built" line that still lists tasks and digests; next migration number), `docs/competitor-analysis-and-roadmap.md` (status column)

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** `cd web; npx tsc --noEmit; npm run lint; npm test; npm run build` → all exit 0 (no other dev server in this folder while building).
- [ ] **Step 3: Live check against the applied migration** (spec §12). The agent can't sign in with Google: either the owner signs in a throwaway teacher and a throwaway student in two browser profiles on `localhost` and the agent drives the pane, or the agent uses the URL-level mock backend from the 2026-10-24 lesson for screenshots. Walk: invite link signed out → sign in → join; teacher posts to a class and to all; student dot clears on opening; "Read by 1 of 1"; on the student's Cornell row the teacher adds a comment, a private note and a private task; the student sees the Cornell marker on My list, opens it, replies; the task's ↗ chip jumps to the row; the teacher's note chip jumps to Cornell in the Colleges tab; the student never sees the note; Leave class keeps the comments; Leave teacher removes everything for the pair (SQL count = 0). Review Focus checks: `javascript:` text and a 300-character word in a message; double-click Send / Post / Assign. Screenshot each step.
- [ ] **Step 4: Commit docs** `git commit -m "docs(classroom): privacy map, CLAUDE.md, roadmap status"`.
- [ ] **Step 5: Ship:** `git fetch`; check `origin/main` for new migrations and edits to the same files; merge `origin/main` if needed and re-run Step 2; push `feat/classroom`, open a PR to `main`, merge (owner's standing rule); confirm the live site shows `/counselor` for a linked student.

---

## Later phases (separate plans, written after phase 1 ships)

Phase 2 (wider review: section switches, new tabs, access requests, review marks, view log), phase 3 (password sharing:
receiving keys, the `vault-crypto.ts` refactor, per-portal copies, the `portal_passwords` trigger, reveal log), phase 4
(emails, task notes, templates, list balance) and phase 5 (letters) are specified in spec §7, §8 and §11. Each gets its
own plan once the phase before it has shipped, so it can name the real RPCs and components.
