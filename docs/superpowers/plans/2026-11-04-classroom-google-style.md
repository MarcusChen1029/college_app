# Classroom, Google Classroom style — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the classroom screens in Google Classroom's shape: class cards, class pages with Stream / Classwork /
People, a task page with Your work + private comments, a To-do page, and the same shape for teachers; plus topics,
done notes/links and banner colors in the database.

**Architecture:** Pure helpers in `web/lib/classwork.ts` (grouping, To-do buckets, stream merge, due labels) and
`web/lib/class-theme.ts` (palette + fallback); migration 0053 extends the phase-1 RPCs; new client components under
`web/components/classroom/gc/` reuse phase-1 pieces (`ConversationPanel`, `NewConversation`, `AnchorChip`,
`LinkedText`, `PostComposer`, `JoinBox`, `WhatTheySee`, `ShowCodeDialog`, `useFocusTarget`, `useClassroomUnread`).

**Tech Stack:** Next.js 16 App Router (read `web/node_modules/next/dist/docs/` before Next code), React 19, Tailwind 4,
supabase-js 2, Postgres (Supabase), `node:test` for `web/lib/*.test.ts`.

**Spec:** `docs/superpowers/specs/2026-11-04-classroom-google-style-design.md`; phase-1 rules in
`docs/superpowers/specs/2026-11-03-classroom-two-way-design.md` §3 still bind.

## Global Constraints

- Nothing on any page says "Google" or uses Google's logos, illustrations, colors, fonts or icons; inline SVG icons and
  the site's tokens only (`--color-ink #12304a`, `--color-coral #ff7a66`, `--color-mint #6fd9b3`, `--color-lilac
  #b9a8ff`, `--color-sun #ffd84d`, `--color-sky #cdeafc`); no raw red/amber/green classes (`toneClass` /
  `buttonClass`, `web/lib/ui.ts`); custom CSS in `@layer components`.
- Themes: exactly `ink`, `coral`, `mint`, `lilac`, `sun`, `sky`. Limits: topic 1-60, done note ≤500, done link ≤500
  http(s) only.
- Students never see classmates, class-wide comments or anything to post to a class.
- Every string in `web/lib/i18n/messages/classroom.ts` (en + zh-TW); `i18n.test.ts` rejects missing/unused keys;
  counselor = 升學輔導老師.
- New/changed RPCs: `security definer set search_path = ''`, start with `perform public.refuse_oauth_client();`,
  explicit columns, `clock_timestamp()`, drop before a new signature, re-grant to `authenticated` only.
- Migration `supabase/migrations/0053_classroom_gc.sql` (check `list_migrations` + origin/main first). No agent runs
  anything against the live project: the owner runs the dry run and the apply in the SQL Editor.
- Branch `feat/classroom-gc` (worktree `.claude/worktrees/classroom-design`). Ship only after 0053 is applied.
- Checks: `cd web; npx tsc --noEmit; npm run lint; npm test` (exit codes, PowerShell or `; echo exit=$?`), `npm run
  build` in the last task.

## Review Focus

- A student in two classes of the same teacher plus a private task: three cards (two class, one 1-on-1), each task
  appears once in the right place, and an all-students announcement lights only the 1-on-1 dot. (Task 1 tests.)
- Due dates at the edges: due today is Assigned "This week", due yesterday is Missing, no due date is Assigned "No due
  date", done overdue is Done. (Task 1 tests, with a fixed `today`.)
- A done task whose note is edited keeps its done date; Undo removes note and link. (Task 2 smoke test.)
- Archived class: no student card; a teacher still sees it under "Archived classes". (Task 1 / Task 7.)
- Long topic names and long class names on a 375 px phone: banners and rows wrap, no overflow. (Browser check, Task 9.)

---

### Task 1: Pure helpers: classwork grouping, To-do, stream, themes

**Files:** Create `web/lib/classwork.ts` + `classwork.test.ts`, `web/lib/class-theme.ts` + `class-theme.test.ts`

**Interfaces (Produces):**
- `class-theme.ts`: `CLASS_THEMES = ["ink", "coral", "mint", "lilac", "sun", "sky"] as const; type ClassTheme`;
  `isClassTheme(v: unknown): v is ClassTheme`; `themeFor(id: string, theme?: string | null): ClassTheme` (valid
  theme wins, else a stable pick from a hash of `id`); `THEME_STYLE: Record<ClassTheme, { bg: string; fg: string;
  avatarBg: string; avatarFg: string }>` (CSS color values from the tokens; `sun`/`sky`/`mint` use ink text).
- `classwork.ts`:
  - `type WorkItem = { id: string; title: string; dueOn: string | null; done: boolean; doneAt: string | null; topic: string | null; createdAt: string }`
  - `DONE_LIMITS = { note: 500, link: 500 } as const`; `validateDone(i: { note?: unknown; link?: unknown }): { ok: true; note: string | null; link: string | null } | { ok: false; error: "note" | "link" }` (trim; empty → null; link must pass `isHttpUrl` from `linkify.ts`)
  - `type DueState = { kind: "none" } | { kind: "due"; days: number } | { kind: "missing"; daysLate: number } | { kind: "done"; at: string }`; `dueState(w: WorkItem, today: string): DueState` (`today` is `YYYY-MM-DD`; due today = `due` days 0)
  - `type TodoTab = "assigned" | "missing" | "done"`; `type TodoGroup = "this_week" | "next_week" | "later" | "no_date"`
  - `todoTab(w: WorkItem, today: string): TodoTab`; `todoGroup(w: WorkItem, today: string): TodoGroup` for Assigned items (this week = due in 0-6 days, next week = 7-13, later = 14+, no due date = `no_date`); Missing items are one list, most recently due first, with no groups (Claude's call: the spec's grouping is for Assigned)
  - `todoBuckets<T extends WorkItem>(items: readonly T[], today: string): { assigned: Record<TodoGroup, T[]>; missing: T[]; done: T[] }` (each list sorted: assigned by due date then title; missing by due date descending; done by `doneAt` descending)
  - `upcoming<T extends WorkItem>(items: readonly T[], today: string, max = 3): T[]` (not done, has a due date, not missing, nearest first)
  - `cardDue<T extends WorkItem>(items: readonly T[], today: string, max = 2): T[]` (not done, missing first then nearest due)
  - `byTopic<T extends WorkItem>(items: readonly T[]): { topic: string | null; items: T[] }[]` (no-topic group first; then topics ordered by their newest `createdAt` descending; items inside newest first)
  - `type StreamEntry<P, W> = { kind: "post"; at: string; pinned: boolean; post: P } | { kind: "task"; at: string; pinned: false; task: W }`
  - `streamOf<P extends { createdAt: string; pinned: boolean }, W extends WorkItem>(posts: readonly P[], tasks: readonly W[]): StreamEntry<P, W>[]` (pinned posts first by `createdAt` desc, then everything else by `at` desc)

- [ ] **Step 1: Write the failing tests** (style of `web/lib/tasks.test.ts`; fixed `today = "2026-11-04"`)
  - `themeFor("x", "coral") === "coral"`; `themeFor("x", "pink")` and `themeFor("x", null)` return a member of `CLASS_THEMES` and the same value on every call; two different ids can differ (check over 20 ids that more than one theme appears).
  - `validateDone`: `{ note: "  hi " }` → note `"hi"`, link null; 501-char note → `{ ok: false, error: "note" }`; link `javascript:x` → error `"link"`; link `https://a.org/x` kept; empty strings → nulls.
  - `dueState`: due `2026-11-04` not done → `{ kind: "due", days: 0 }`; due `2026-11-03` → `{ kind: "missing", daysLate: 1 }`; no due → `none`; done with `doneAt` → `{ kind: "done" }` even if overdue.
  - `todoBuckets`: due today and in 6 days → `this_week`; in 7 and 13 → `next_week`; in 14 → `later`; none → `no_date`; overdue not done → `missing`; overdue done → `done`; order rules as above.
  - `upcoming` excludes done, missing and undated, max 3 nearest; `cardDue` puts a missing item before a due one, max 2.
  - `byTopic`: `[null-topic task, "Applications" newer, "College list" older]` → groups `[null, "Applications", "College list"]`; empty input → `[]`.
  - `streamOf`: a pinned old post comes before a newer task; unpinned items interleave by time.
- [ ] **Step 2: Run** `cd web; node --test lib/classwork.test.ts lib/class-theme.test.ts` → FAIL (missing modules).
- [ ] **Step 3: Implement** both modules with the signatures above.
- [ ] **Step 4: Run** the same command → PASS; `npx tsc --noEmit` → exit 0.
- [ ] **Step 5: Commit** `feat(classroom): classwork grouping, to-do buckets, stream merge and class themes`.

---

### Task 2: Migration 0053 and smoke test

**Files:** Create `supabase/migrations/0053_classroom_gc.sql`, `supabase/patches/2026-11-04_classroom_gc_smoke_test.sql`

**Interfaces (Produces, SQL; argument names are the contract):**
- Columns per spec §5: `classes.theme` (check in the six), `teacher_tasks.topic` (1-60), `task_completions.note` (≤500),
  `task_completions.link` (http(s), ≤500 — same regex as `class_posts.link_url` in 0052).
- `teacher_set_class_theme(p_class uuid, p_theme text) returns void` (own class; null clears).
- `create_task(... existing 8 params ..., p_topic text default null) returns uuid`.
- `update_task(p_task uuid, p_title text, p_details text default null, p_due_on date default null, p_topic text default null) returns void`.
- `archive_task(p_task uuid, p_archived boolean) returns void` (unchanged behaviour + OAuth refusal).
- `set_task_done(p_task uuid, p_done boolean, p_note text default null, p_link text default null) returns void` —
  done: insert, or if a completion exists update `note`/`link` only (keep `done_at`); not done: delete the completion.
- `task_progress(p_task uuid) returns table (student_id uuid, display_name text, done boolean, done_at timestamptz, note text, link text)`.
- `my_tasks()` = the 0052 columns + `created_at timestamptz, topic text, note text, link text`.
- `list_my_tasks()` = the 0052 columns + `topic text`.
- `teacher_student_tasks(p_student uuid)` = the 0052 columns + `topic text, note text, link text`.
- `my_teachers()` = the 0052 columns + `class_themes text[], class_years text[], class_archived boolean[]`, aligned
  index-for-index with `class_ids` (one ordered aggregation, as 0052 does).
- Base every recreated body on its latest definition (0052 for `my_tasks`, `create_task`, `list_my_tasks`,
  `teacher_student_tasks`, `my_teachers`; 0041 for `set_task_done`; 0028 for `update_task`, `archive_task`,
  `task_progress`) and change only what is listed.

- [ ] **Step 1: Write the smoke test first** (frame of `supabase/patches/2026-11-03_classroom_smoke_test.sql`: one
  transaction, throwaway `.invalid` users, impersonation via `request.jwt.claims` + `set local role authenticated`,
  `raise exception 'FAIL: …'`, final notice, `rollback;`). Checks:
  - T1 sets class A's theme `coral` → visible in S1's `my_teachers().class_themes`; `teacher_set_class_theme(A, 'pink')` → refused; T2 setting A's theme → refused.
  - T1 creates a class task with topic `College list`; `my_tasks` for S1 shows `topic` and `created_at`; 61-char topic → refused; `update_task` changes the topic and `p_topic` null clears it.
  - S1 `set_task_done(task, true, 'draft', 'https://a.org/d')` → T1's `task_progress` shows the note and link; S1 calls again with a new note → note changes, `done_at` unchanged; `set_task_done(task, false)` → no completion row (note and link gone); link `javascript:x` and a 501-char note → refused.
  - S2 (another student) cannot change S1's completion (no RPC path; `set_task_done` only touches the caller's row): after S2's own call, S1's note is unchanged.
  - Archive class B → S1's `my_teachers().class_archived` marks it true.
  - OAuth refusal: with a claims JSON containing `"client_id":"x"` (or whatever claim `refuse_oauth_client()` checks — read 0041:51 and copy it), `update_task`, `archive_task`, `task_progress` raise.
- [ ] **Step 2: Write the migration** (header comment in 0052's style; drop+create+grant for each signature change).
- [ ] **Step 3: Self-review** every function against Global Constraints; no live DB calls.
- [ ] **Step 4: Commit** `feat(classroom): topics, done notes and class themes (0053)`.

---

### Task 3: Client models and wrappers

**Files:** Modify `web/lib/tasks.ts` + `tasks.test.ts`, `web/lib/tasks-api.ts`, `web/lib/links-api.ts`, `web/lib/anchors.ts` + `anchors.test.ts`

**Interfaces:**
- `StudentTask` gains `createdAt: string; topic: string | null; note: string | null; link: string | null`;
  `TeacherTask` gains `topic: string | null`; `TeacherStudentTask` gains `topic`, `note`, `link`; `TaskProgress` rows
  gain `note: string | null; link: string | null`. `TaskInput` gains `topic: string | null` and `validateTask` checks
  1-60 (empty → null).
- `createTask(target, task, about?)` sends `p_topic`; `updateTask(id, task)` always sends `p_topic`;
  `setTaskDone(id: string, done: boolean, note?: string | null, link?: string | null): Promise<void>`.
- `MyTeacher` gains `classThemes: (string | null)[]; classYears: (string | null)[]; classArchived: boolean[]`
  (defensive parse, aligned with `classIds`); new `setClassTheme(classId: string, theme: ClassTheme | null): Promise<void>`.
- `studentHref({ kind: "task", ref })` → `/counselor/task/<ref>` (no `focus`).
- A `StudentTask` is a `WorkItem` (Task 1) by shape: `dueOn`, `done`, `doneAt`, `topic`, `createdAt`, `id`, `title`.

- [ ] **Step 1: Failing tests:** `parseStudentTask` reads `created_at`, `topic`, `note`, `link` (missing → null);
  `validateTask` rejects a 61-char topic and maps `""` to null; `studentHref({kind:"task",ref:"t1"}) === "/counselor/task/t1"`.
- [ ] **Step 2: Run** `node --test lib/tasks.test.ts lib/anchors.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test; npx tsc --noEmit` → exit 0 (fix callers that construct these types).
- [ ] **Step 5: Commit** `feat(classroom): task topics, done notes and class themes in the client`.

---

### Task 4: Shared look: banner, class card, tabs, task row

**Files:** Create in `web/components/classroom/gc/`: `ClassBanner.tsx`, `ClassCard.tsx`, `ClassTabs.tsx`,
`WorkRow.tsx`, `UpcomingBox.tsx`, `gcIcons.tsx`; Modify `web/lib/i18n/messages/classroom.ts`, `web/app/globals.css`
(`@layer components` rules if needed)

**Interfaces (Produces):**
- `<ClassBanner theme={ClassTheme} title={string} subtitle?={string} size={"card" | "page"} avatar?={string} actions?={ReactNode} />`
- `<ClassCard href={string} theme={ClassTheme} title={string} subtitle?={string} who={string} avatar={string} due={{ title: string; label: string; urgent: boolean; href: string }[]} empty={string} icons={{ label: string; href: string; dot?: boolean; icon: "classwork" | "stream" | "comments" }[]} menu?={ReactNode} />`
- `<ClassTabs tabs={{ id: string; label: string }[]} />` — reads/writes `?tab=` with `history.replaceState`; unknown
  or missing → first tab; exports `useClassTab(ids: readonly string[]): string`.
- `<WorkRow item={WorkItem & { classLabel?: string }} today={string} href={string} expandable?={boolean} details?={ReactNode} />`
  — icon (filled when done), title, due label from `dueState` (urgent tone for missing), expands in place when `expandable`.
- `<UpcomingBox items={WorkItem[]} today={string} hrefFor={(id: string) => string} viewAllHref={string} />`
- `dueLabel(t, state: DueState, locale)` in `web/components/classroom/ClassroomText.ts`.

- [ ] **Step 1:** Implement the components (look: spec §2 and the approved mockups — banner with soft circles, white
  cards with `--color-neutral-line` borders, round initial avatar overlapping the banner on cards). Strings in i18n.
- [ ] **Step 2:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 3: Commit** `feat(classroom): class banner, card, tabs and work rows`.

---

### Task 5: Student Classes home and 1-on-1 page

**Files:** Create `web/components/classroom/gc/useStudentClassroom.ts`, `StudentClassesHome.tsx`,
`StudentOneOnOne.tsx`, `web/app/(app)/counselor/teacher/[teacherId]/page.tsx`; Modify
`web/app/(app)/counselor/page.tsx` (render `StudentClassesHome`), delete `web/components/classroom/CounselorPage.tsx`
and `TeacherCard.tsx` when nothing imports them (move what they still provide).

**Interfaces:**
- `useStudentClassroom(): { ready: boolean; error: string | null; teachers: MyTeacher[]; posts: StudentPost[]; tasks: StudentTask[]; conversations: Conversation[]; reload: () => void }` — one load of `myTeachers`, `myPosts`, `myTasks`, `myConversations`; reload after writes and on `refreshClassroomUnread` events; keyed by user.
- Classes home per spec §3.1 (class cards for non-archived classes, a 1-on-1 card per teacher, To-do link with count,
  Join a class dialog with `JoinBox`, ⋮ Leave class / Leave <teacher> with the phase-1 confirms, `?c=` opens
  `ConversationPanel`, empty state). Card dots: class card = unread class posts; 1-on-1 card = unread all-students
  posts or unread comments.
- 1-on-1 page per spec §3.3 (WhatTheySee + Leave; all-students announcements; private tasks as `WorkRow`s linking to
  the task page; comments with `NewConversation`).

- [ ] **Step 1:** Implement. Mark shown unread posts read (as phase 1) on the 1-on-1 page.
- [ ] **Step 2:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 3: Commit** `feat(classroom): classes home and 1-on-1 page for students`.

---

### Task 6: Student class page, task page, To-do

**Files:** Create `web/app/(app)/counselor/class/[classId]/page.tsx`, `web/app/(app)/counselor/task/[taskId]/page.tsx`,
`web/app/(app)/counselor/todo/page.tsx`; `web/components/classroom/gc/StudentClassPage.tsx`, `StudentTaskPage.tsx`,
`StudentTodo.tsx`, `YourWork.tsx`, `PrivateComments.tsx`

**Interfaces:**
- Class page per spec §3.2 (`ClassTabs` stream/classwork/people; Stream = `streamOf(class posts + that teacher's
  all-students posts tagged, class tasks)` with Reply privately → `NewConversation` general, label = post title cut to
  120; Classwork = `byTopic` of class tasks with expandable `WorkRow`s; People = the teacher). Unknown or archived
  class id → a "This class isn't available" panel with a link back. Marks shown unread posts read.
- `<YourWork task={StudentTask} onChanged={() => void} />` — status, note + link inputs (`validateDone`), Mark as done /
  Edit → Save / Undo via `setTaskDone`; buttons disabled while saving.
- `<PrivateComments teacherId={string} teacherName={string} taskId={string} taskTitle={string} conversations={Conversation[]} onChanged={() => void} />`
  — uses `findConversation(list, teacherId, {kind:"task", ref: taskId})`; shows that conversation's messages
  (`conversationMessages`, mark read) and a one-line reply; first comment calls `startConversation`.
- Task page per spec §3.4; To-do per spec §3.5 (`todoBuckets`, tabs via `ClassTabs`, rows link to the task page).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 3: Commit** `feat(classroom): class page, task page and to-do for students`.

---

### Task 7: Teacher Classes grid and class page Stream

**Files:** Modify `web/components/TeacherClasses.tsx`, `web/components/TeacherClassCard.tsx` (grid cards; or replace
with `gc/TeacherClassGridCard.tsx`), Create `web/app/(app)/teacher/classes/[classId]/page.tsx`,
`web/components/classroom/gc/TeacherClassPage.tsx`, `TeacherClassStream.tsx`, `ClassCodeBox.tsx`,
`CustomizeClassDialog.tsx`

**Interfaces:**
- Grid per spec §4.1 (cards with theme, name, year, "N students", next due class task; Create class card; archived
  fold; the one-on-one code card with Copy invite link / Show on screen).
- Class page shell per spec §4.2 with `ClassTabs` (stream/classwork/people; Classwork and People panels come in
  Task 8 — render a placeholder until then), banner with Customize (rename via `renameClass`, theme via
  `setClassTheme`) and ⋮ Archive. Stream: `ClassCodeBox` (code, Copy invite link, Show on screen, New code, Turn off —
  the phase-1 actions), Upcoming, "Announce something to your class" → `PostComposer presetClassId`, feed via
  `streamOf` (class posts + all-students posts tagged, class tasks), each post with Read by / Edit / Archive as on the
  Messages page.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 3: Commit** `feat(classroom): teacher class grid and class stream`.

---

### Task 8: Teacher Classwork and People tabs; Topic on the Tasks page

**Files:** Create `web/components/classroom/gc/TeacherClassClasswork.tsx`, `TeacherClassPeople.tsx`; Modify
`TeacherClassPage.tsx`, `web/components/TeacherTasks.tsx` (Topic field with a datalist of the teacher's topics)

**Interfaces:**
- Classwork per spec §4.2: + Create task (the TeacherTasks form preset to this class, with Topic), `byTopic` groups,
  rows with due and "N done of M" (`list_my_tasks` counts), expanding shows `taskProgress` rows with done date, note
  (LinkedText) and link.
- People: Teachers (you); Students = `listStudents()` filtered by `classIds` containing this class (name → 
  `/teacher/students?s=<id>`, ⋮ Remove from class via `removeFromClass`); Invite line with code + Copy invite link.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `npx tsc --noEmit; npm run lint; npm test` → exit 0.
- [ ] **Step 3: Commit** `feat(classroom): teacher classwork and people tabs`.

---

### Task 9: Docs, build, browser look, owner DB step, ship

- [ ] **Step 1:** Docs: `docs/legal/2026-10-29-privacy-data-map.md` (task note/link visible to the task's teacher;
  class theme; topics), privacy page copy if it lists what a task holds (en + zh-TW), `CLAUDE.md` (Google-style
  layout, routes, 0053, next number 0054).
- [ ] **Step 2:** `npx tsc --noEmit; npm run lint; npm test; npm run build` → exit 0.
- [ ] **Step 3:** Browser look (signed out, `npm run dev -- -p <port>` + `playwright-cli`): `/counselor` empty state at
  1280 and 375 px; a throwaway route rendering `ClassCard`, `ClassBanner`, `WorkRow` with long names (deleted before
  commit).
- [ ] **Step 4:** Owner: dry run (0053 + smoke in one begin…rollback) then apply (0053 + schema_migrations record +
  smoke), pasted in the SQL Editor; controller verifies the catalog afterwards.
- [ ] **Step 5:** Merge origin/main, re-run Step 2, PR to `main`, merge, check the live routes respond.
