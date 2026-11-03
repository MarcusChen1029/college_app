# Classroom, both ways: what teachers can do and what students receive

Status: design, 2026-11-03. Nothing built yet. The owner handed every decision to Claude ("do it on your own, I'll check it"),
so each choice below is Claude's call, written for the owner's review.

Builds on: `2026-10-24-teacher-counselor-design.md` (roles, links, privacy rules), migration 0028 (teacher tasks),
0029 (teacher digest), 0033 (class charts). Those rules still hold unless this document says otherwise.

## 1. Why

Today the classroom works in one direction only. A teacher gets a week view, a roster with flags, a detail page per
student, private notes, tasks, deadlines, charts and an opt-in weekly email. The student gets almost nothing back:

- The only place a student meets their teacher is a box in **Settings > Reminders** (`MyCounselors.tsx`): name, school,
  class names, a Leave button and the "let them see my essays" checkbox.
- Tasks show up on My list (`TeacherTasksForStudent.tsx`) and are never emailed.
- A teacher who spots a problem ("you have no safety school", "your Cornell ED essay hasn't started") has no way to tell
  the student inside the app. They have to use another channel, and the tracker loses the context.
- A student with a question for their counselor has no way to ask it here.

So the teacher's work stays invisible to the student, and the student has no reason to open a "class" at all. This design
makes it two-way while keeping it small and safe: **teachers can talk to their students, and students get one place where
everything from their teachers arrives.**

## 2. Goals, non-goals, anti-goals

Goals
- A student has one page, **Counselors**, that holds everything from their teachers: announcements, tasks, messages
  and, later, letter requests. Unread items are flagged in the header and on My list.
- A teacher can (a) post an announcement to a class or to all their students, (b) start a conversation with one student,
  optionally about a specific college, essay, task or the whole list, and (c) see who has replied and who hasn't read.
- A student can reply, and can start a conversation with a linked teacher (ask a question).
- Joining a class is one click from an invite link the teacher shares, instead of typing a code into Settings.
- A student can see exactly what each teacher can see about them.
- Later phases: email notifications (batched), stronger tasks, a college-list review, and letter-of-recommendation requests.

Non-goals (not in any phase here)
- Real-time chat, typing indicators, push notifications. Messages appear on page load or focus.
- Anything between students: no class roster visible to students, no student-to-student messages, no class comments.
- File uploads or attachments (the project has no storage buckets). Links only.
- Inline comments inside essays. Essays are Google Docs; inline comments belong in Google Docs. Here a teacher comments
  on the essay as a whole.
- Co-teachers on one class, school/organisation accounts, seat billing (roadmap #15 stays "later").
- Teachers editing student data. Teachers still only read, plus write their own posts, messages and tasks.
- Sending letters, transcripts or school reports to colleges (roadmap section D: realistically cannot).
- Parents seeing messages, or the parent share link gaining any classroom data.
- AI-written feedback or letters, and teacher access through the MCP/AI connector.
- Meeting scheduling or video calls.

Anti-goals (a failure even if it works)
- A teacher reaching anything the 2026-10-24 rules forbid: portal logins and passwords, private college notes, aid
  offers, transcript, the student's recommender and scholarship tables, the vault. New RPCs return explicit column
  lists and never widen what `teacher_student` returns.
- A student surprised by what a teacher can see. The Counselors page says it plainly, per teacher.
- Notification noise: one email per day at most per person, carrying counts and a link, never message bodies.
- Classroom features locked behind the student's paid plan. Free students get all of it; the plan limit stays on
  "number of colleges" only. Teachers stay free.
- A teacher seeing another teacher's conversations or posts, or a student seeing another student's anything.

## 3. Who sees what (the rules every phase follows)

| Item | Teacher (author) | Student it is for | Other students | Other teachers |
|---|---|---|---|---|
| Announcement to a class | yes, plus read counts and who has not read | members of that class who are still linked | no | no |
| Announcement to "all my students" | yes, plus read counts | every student linked to that teacher | no | no |
| Conversation and its messages | yes | yes | no | no |
| Teacher notes (exists, 0024) | yes | **never** | no | no |
| Task + done/not done (exists, 0028) | yes | yes | no | no |
| Letter request (phase 3) | the teacher it was sent to | yes | no | no |

- When a link ends (student leaves, teacher removes them, or either account is deleted), that pair's conversations,
  messages, read marks and letter requests are **deleted for both sides**, the same as notes, tasks and completions
  today (composite foreign key to `teacher_links`, `on delete cascade`). Both confirm dialogs say so. Claude's call:
  consistent with 0024/0028, nothing lingers after access ends, and there is no "orphaned thread" state to design.
- Leaving a class (but keeping the link) hides that class's announcements; conversations stay, because they belong to
  the link, not the class. Today only the teacher can take a student out of a class (`teacher_remove_from_class`,
  0021) and the student's only exit is `leave_teacher`, which ends the whole link. Phase 1 adds a student
  **Leave class** action (keeps the link and the other classes).
- A new class member sees the class's earlier announcements (like a class stream). Claude's call. Posts made before
  the student joined (class membership time for a class post, link time for an "all my students" post) never count
  as unread for that student and are left out of that post's "read by X of Y" and "hasn't read" list.
- Teachers see **read marks** on announcements only ("read by 18 of 25", and who hasn't). The student page says so.
  Conversations show no "seen" receipts to either side; each side just sees its own unread state.

## 4. What students receive

### 4.1 The Counselors page (`/counselor`)

A new top-level page for students. The header link **Counselors** (zh-TW 輔導老師) appears only while the student has
at least one linked teacher, with a dot when something is unread. The page itself always works: with no teacher it shows
the join box and a short explanation. Settings > Reminders keeps a one-line pointer here instead of the full box.

```
Counselors                                                     [ Join with a code ]

┌ Ms. Lin · Taipei American School · Senior A, Senior B ───────── [ Ask Ms. Lin ] ┐
│                                                                                    │
│ ANNOUNCEMENTS                                                                      │
│ ● 📌 UC workshop Thursday 4 pm, room 204                   Nov 2   NEW            │
│      Bring your activities list. https://...                                       │
│   Common App fee waivers are open                          Oct 28                  │
│   Show all (6)                                                                     │
│                                                                                    │
│ TO DO                                                                              │
│   ☐ Finalise your college list            due Nov 10 · 7 days                      │
│   ☐ Ask two teachers for letters          overdue 2 days                           │
│   ☑ Send SAT scores to UC                 done Oct 30                              │
│                                                                                    │
│ MESSAGES                                                                           │
│ ● About: Cornell (ED)   "Your why-Cornell draft is a good start, but..."  2 h ago  │
│   About: your list      "Looks balanced now, nice work."   resolved · Oct 28       │
│   [ New message ]                                                                  │
│                                                                                    │
│ ▸ What Ms. Lin can see          Essays: [■ shared]          Leave Ms. Lin          │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- One card per linked teacher, newest activity first. Each section shows every unread item plus the latest read ones
  up to 3 in total, with "Show all".
- **Announcements:** pinned first, then newest. Plain text with line breaks; http(s) links are clickable; nothing else
  is rendered. Opening the page marks the shown announcements read (that is the read mark the teacher sees); since
  every unread one is shown, the dot always clears.
- **To do:** the teacher's tasks (moved here from My list, which keeps a compact "2 tasks due this week" line linking
  here). Tick to mark done (existing `set_task_done`). Overdue items use the urgent tone. Today `my_tasks` returns
  `teacher_name` but no `teacher_id` or `done_at` (0041:513-523), so phase 1 replaces it with a version that also
  returns both (drop and recreate, the return type changes) and updates its caller.
- **Messages:** one row per conversation with its topic, the last message and its time; unread rows get a dot.
  Clicking opens the conversation (4.2).
- **What [teacher] can see:** a fold-out list that matches what `teacher_student` (0023:66-81) and `teacher_roster`
  (0023:29-39) really return. Today that is: your name and email; SAT/ACT, GPA, English test and score, test details;
  intended field, target regions, whether you said you need financial aid; your college list with statuses, plan,
  checklist progress and deadlines; your interested list; your activities; essay status (titles and links only while
  "shared" is on); when you were last active; whether you finished their tasks; whether you opened their
  announcements; your messages to them. Never sees: portal logins or passwords, your private college notes, aid offers
  and amounts, your transcript, your recommender and scholarship lists, your résumé settings. This design does not
  change what those RPCs return; it only says it out loud. The list lives in one constant in `web/lib/classroom.ts`
  with a comment naming the RPCs, so a later RPC change has one place to update.
- **Join with a code:** the existing preview-then-confirm flow from `MyCounselors.tsx`, moved here.
- **Leave class** next to each class name on the card (keeps the teacher); **Leave [teacher]** ends the link and warns
  that the conversations with them are deleted for both sides.

### 4.2 A conversation

Opens as a panel over the Counselors page (and as its own URL, `/counselor?c=<id>`, so email links can point at it).

```
┌ Ms. Lin · About: Cornell (ED) ─────────────────────────────── [ Mark resolved ] ┐
│ Ms. Lin · Nov 3, 10:12                                                          │
│   Your why-Cornell draft is a good start, but the second paragraph could be     │
│   about any school. What do you want to do in CALS specifically?                │
│                                                         You · Nov 3, 12:40       │
│                      I'll rewrite it around the plant science lab, thanks!       │
│ ─────────────────────────────────────────────────────────────────────────────── │
│ [ Write a reply…                                                    ] [ Send ]  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- Topic chip links to the thing it is about (the college on My list, the essay, the task). If the thing is gone
  (college removed, essay no longer shared, task archived) the chip says so ("An essay, no longer shared") and the
  conversation stays.
- **One conversation per thing.** For a college, an essay, a task or "my college list" there is at most one
  conversation per teacher-student pair (unique on pair + topic + ref, except General). Starting one that exists opens
  it instead. General can have many (each "Ask" with General starts a new one).
- Either side can mark it resolved; a new message reopens it.
- An author can delete their own message; it becomes "Message removed" for both sides (the text is deleted, not hidden).
  No editing. Claude's call: simpler, and nothing said can be silently changed afterwards.
- **Ask [teacher]** / **New message** start a conversation: pick a topic (General, one of my colleges, one of my essays,
  one of their tasks, My college list), write the first message.

### 4.3 Elsewhere for the student

- **Header:** the Counselors link carries a dot while anything is unread (announcements or conversations).
- **My list:** a one-line strip at the top when something is unread: "From your counselors: 1 announcement, 2 messages ·
  Open". A college row with a conversation about it shows a small speech-bubble count that opens the conversation.
- **My list:** the speech-bubble count is the number of unread messages in that college's conversation (no number
  when all are read, just the bubble).
- **Invite link:** `/join#ABCD1234` opens the join preview with the code filled in. The code is in the URL fragment so
  it never reaches server logs. Claude's call. The page first copies the code to `sessionStorage`, because the steps
  before the preview can drop the fragment:
  - Signed out: sign in (Google OAuth lands back on the site without the fragment), then return to `/join`, which reads
    the saved code.
  - Signed in with no role yet: today `redirectFor` sends every page but `/welcome`, `/oauth/*` and `/extension/*` to
    `/welcome` (roles.ts:40). `/join` is exempted from that redirect so it can save the code first, then it sends the
    user to `/welcome`, which shows "You're joining a class: pick Student to continue" with Student preselected (the
    teacher's name can't be shown yet: `preview_code` only answers students). The user still presses the button (a
    role is never set without the user choosing it). After the role is set, they go back to `/join`.
  - Signed in as a teacher: "This invite is for students. You're signed in as a teacher." No join (`preview_code`
    refuses non-students, 0041:369).
  - The saved code is cleared after a join, a cancel, or a failed preview.
- **Email (phase 2):** at most one email per day: "Ms. Lin posted 1 announcement and sent you 2 messages" plus a button
  to `/counselor`. Never the message text (essay feedback stays out of inboxes and email previews). Task reminders
  (3 days and 1 day before a task is due) go in the same daily email. A new switch in Settings > Reminders, on by
  default, uses the existing reminder email address and unsubscribe handling.

## 5. What teachers can do

### 5.1 Header

Teacher nav becomes: Home, Students, Classes, **Messages**, Tasks, **Letters** (phase 3), Deadlines, Explore, Compare.
Charts moves to a tab on the Students page (route `/teacher/charts` stays, the Students item is highlighted there) so the
header does not grow past nine items. Messages carries a dot when a student has written something unread.

### 5.2 Home (`/teacher`, extends `TeacherWeek.tsx`)

- A fifth tally, **Replies waiting**: conversations whose last message is the student's and the teacher hasn't read.
- A **Replies waiting** list under "Check in" (student, topic, first line, time), newest first, max 5, "All messages".
- A **Post an announcement** button that opens the composer (5.4).
- Phase 2: overdue tasks join the week view; phase 3: letters due this week join it.

### 5.3 Students

- **Roster** (`TeacherRosterTable.tsx`): a new flag `reply_waiting` (same rule as the tally). Phase 2 adds
  `task_overdue` and `list_unbalanced` (5.7).
- **Student detail** gets a **Messages** tab between Interested and Notes:

```
Overview  Colleges  Activities  Essays  Interested  Messages ●  Notes 🔒
```

  - Messages: that student's conversations with this teacher, newest first, plus **New message** with the topic picker.
  - Notes keeps a lock icon and the line "Only you can see these notes". Messages says "Shared with <student>". The two
    must never look alike: different tab icon, and the composer in Notes has no Send button.
  - On the Colleges tab every college row gets a **Comment** button that starts (or opens) the conversation about that
    college; on the Essays tab the same per essay while sharing is on.
- Phase 2: the detail page gets an **Assign a task** button (today a teacher must go to the Tasks page).

### 5.4 Messages (`/teacher/messages`)

Two tabs.

```
Messages            [ Conversations ]  [ Announcements ]

Conversations       Show: (•) Needs reply  ( ) Open  ( ) Resolved  ( ) All     Class: [ All ▾ ]
 ● Amy Chen      About: Cornell (ED)      "I'll rewrite it around the lab…"     12:40
 ● Ben Wu        General                  "Can I still apply EA to Michigan?"   Yesterday
   Cathy Liu     About: your list         You: "Looks balanced now…"           Oct 28 ✓
```

```
Announcements       [ + New announcement ]

 📌 UC workshop Thursday 4 pm, room 204     Senior A        Nov 2    Read by 18 of 25 ▸
    Common App fee waivers are open         All students    Oct 28   Read by 40 of 41 ▸
```

- "Read by 18 of 25 ▸" opens the names who haven't read it.
- Composer: **To** (a class, or All my students), Title (≤120), Text (≤4000), optional Link (http/https), Pin.
  Edit and Archive on the teacher's own posts; archived posts disappear for students. No "also email" option: from
  phase 2 every new announcement goes into the next daily email of each student who has that email on. Claude's call:
  an on-demand send would need a second trigger for the Edge Function and would break the one-email-a-day rule.

### 5.5 Classes (`TeacherClasses.tsx`, `TeacherClassCard.tsx`)

- **Copy invite link** next to each code (`https://<site>/join#<code>`), and on the one-on-one code.
- **Show on screen**: a full-screen view of the code in very large type plus the invite URL, for a projector. No QR code
  in phase 1 (it would need a new dependency); can be added later.
- **Rename** a class (missing today).
- Each class card shows its latest announcement and a **Post** button prefilled with that class.

### 5.6 Settings

- Edit display name and school (missing today; `teacher_profiles` has an update policy from 0020, check whether 0041
  revoked the grant).
- Phase 2: "Email me when a student writes" (daily batch, on by default), next to the existing weekly digest switch.
  The weekly digest gains a "replies waiting" count.

### 5.7 Phase 2: tasks and list review

- **Tasks:** students can add a short note (≤500) and a link when ticking a task done ("draft here: <link>"); the
  teacher's progress view shows them. Assign from the student detail page. A built-in **template pack** (a senior-year
  checklist in en and zh-TW: finalise list, request letters, send scores, FAFSA/CSS where relevant, submit ED/EA,
  thank recommenders...) that the teacher loads into a class and then edits the dates. Templates live in code
  (`web/lib/task-templates.ts`), not the database. New roster flag `task_overdue`.
- **List balance:** the roster gets a **List** column with reach / target / safety counts computed with
  `web/lib/fit.ts` (its labels are `super_reach | reach | target | safety`; super reach counts as reach). The roster
  does not load college stats today (`TeacherRoster.tsx:11` calls only `teacherRoster` and `loadTeacherOverview`, and
  `teacher_roster` returns slug, name, status, plan, checklist and next deadline per college), so the page adds one
  read of `college_summary` for the colleges on the roster (through `allRows` if it can pass 1000 rows). Custom and
  non-US colleges have no fit and are not counted. Flag `list_unbalanced`: 4 or more colleges with a fit label and no
  safety.
- **Mark list reviewed:** a button on the detail page's Colleges tab. It posts a message in the "your list" conversation
  (the teacher writes the text) and stores the review date on the link. The student's My list header shows
  "Reviewed by Ms. Lin on Nov 3"; any later change to the list does not clear it, but the teacher's roster shows
  "changed since review".

### 5.8 Phase 3: letters of recommendation

- **Student:** on the existing Recommenders page, a recommender can be a linked teacher. "Send request" sends a
  **letter request** to that teacher: which colleges (picked from My list, preselected: everything not yet submitted),
  how they submit (Common App teacher evaluation, Coalition, direct, other), an optional note (≤1000). The earliest
  deadline among the chosen colleges becomes the due date. The student sees the request status on the Recommenders
  page and the Counselors page.
- **Teacher:** a **Letters** page: requests sorted by due date with student, colleges, platform, note and actions
  Accept / Decline (with an optional message, which goes into a conversation) / Mark submitted. Home week view and the
  weekly digest include letters due in 7 days.
- The student's own `recommenders` row stays student-owned and private (0026 rule). The request is a separate table the
  teacher reads through RPCs; when its status changes, the student's recommender row status follows (`asked` →
  `in_progress` on accept → `submitted`), done by the student-side code or a trigger on the request table, never by
  letting the teacher touch `recommenders`.
- A subject teacher who writes letters but isn't a counselor makes a teacher account and gives the student their
  one-on-one code; nothing else is needed.

## 6. Data and access (for the builder)

Same pattern as 0028: tables with RLS on, **no policies and no table grants**, every read and write through
SECURITY DEFINER functions with `set search_path = ''` that check `auth.uid()`, the caller's role and the
teacher<->student link. Limits live in the SQL and are mirrored in one TypeScript file (`web/lib/classroom.ts`), like
`TASK_LIMITS` in `web/lib/tasks.ts`.

Phase 1 tables (names are suggestions):

- `class_posts`: id, teacher_id, class_id (null = all my students; when set, the class must be the teacher's),
  title (1-120), body (1-4000), link_url (null, http/https, ≤500), pinned, archived, created_at, updated_at.
- `post_reads`: post_id, student_id, teacher_id, read_at; primary key (post_id, student_id); composite FK
  (teacher_id, student_id) → `teacher_links` on delete cascade.
- `conversations`: id, teacher_id, student_id (composite FK → `teacher_links` on delete cascade), topic
  (`general | college | essay | task | list`), topic_ref (text: college id, essay key, task id; null for general/list),
  status (`open | resolved`), started_by (`teacher | student`), created_at, last_message_at, teacher_read_at,
  student_read_at. Unique on (teacher_id, student_id, topic, coalesce(topic_ref, '')) where topic <> 'general'.
- `conversation_messages`: id, conversation_id (cascade), author (`teacher | student`), body (1-2000, null once
  deleted), deleted_at, created_at.
- `classes`: no new column for rename; a `teacher_rename_class(id, name)` RPC.

Limits (Claude's call, mirrored in `classroom.ts`): a teacher may send 300 messages and 20 announcements per day; a
student 50 messages per day; at most 200 active announcements per teacher and 100 conversations per teacher-student pair.
Failures return `{ok:false, error}` the way `redeem_code` does where a rate limit must stick; otherwise raise.

RPCs, phase 1 (the builder may merge or rename; each returns an explicit column list):
- Teacher: create / update / archive post; list my posts with read and audience counts; who hasn't read a post;
  list my conversations (filter: needs reply / open / resolved / all, class); one conversation's messages.
- Student: my posts (from linked teachers, class membership respected, with a read flag); mark posts read; my
  conversations; one conversation.
- Both roles, role-checked inside: start conversation (topic + ref + first message; a college ref must be on the
  student's list, an essay ref must be shared at the time of starting if the teacher starts it, a task ref must be
  the teacher's task assigned to that student), send message, delete own message, set status, mark read.
- Unread counts for the header dot: one call per role returning {posts, conversations}.
- Student: leave one class (keeps the link). Replace `my_tasks` to add `teacher_id` and `done_at`.
- Display data in conversation lists for teachers: the student's display name the roster already exposes, nothing more.

Polling, not realtime: unread counts refresh on navigation and when the tab regains focus. Claude's call: realtime would
need table-level grants this design avoids.

Rendering: message and announcement text is plain text. React escapes it; a small helper turns http(s) URLs into links
with `rel="noopener noreferrer nofollow"` and `target="_blank"`. No markdown, no HTML.

Phase 2 adds: a daily notification pass in the existing `deadline-reminders` Edge Function (both roles, counts only,
dry-run until the Resend secrets are set, a log table so nobody gets two in a day), the two email switches,
`task_completions.note` / `link`, a review date on `teacher_links`, the new flags. Phase 3 adds `letter_requests` (+ a
child table or array for its colleges) and its RPCs.

Every new user-facing string goes through `web/lib/i18n/` in English and zh-TW (`i18n.test.ts` enforces it).
`docs/legal/2026-10-29-privacy-data-map.md` and the privacy page's teacher section must list the new tables and who
sees them, in the same PR as each migration. Migration numbers: the next free one at build time (0051 or later; check
`list_migrations` and origin/main right before applying, other sessions add migrations too). Applying a migration and
deploying the Edge Function need the owner's OK.

## 7. Phases

Each phase ships on its own and is useful alone.

1. **Two-way basics.** Counselors page (cards, announcements, tasks, messages, what-they-see, join/leave/share moved
   from Settings, leave class), conversations both ways with topics, announcements with read counts, unread dots
   (student header, My list strip, teacher Messages, home tally, roster flag), teacher Messages page, student-detail
   Messages tab and Comment buttons, invite links (incl. the sign-in and `/welcome` hand-off), show-on-screen code,
   class rename, teacher profile edit, the replaced `my_tasks`. In-app only, no email.
2. **Reach and review.** Daily notification emails (both sides, new announcements included), task notes and links,
   assign-from-detail, template pack, `task_overdue`, list balance column and `list_unbalanced`, mark list reviewed,
   digest additions.
3. **Letters.** Letter requests end to end, the Letters page, week view and digest entries, the recommender row sync.

## 8. How we know it works

- Phase 1 is done when, with two test accounts (one teacher, one student, linked through an invite link): the teacher
  posts to a class and to all students, the student sees both with an unread dot, opening the page clears the dot and the
  teacher sees "read by 1 of 1"; the teacher comments on a college from the detail page, the student replies from the
  Counselors page, the teacher's home shows "Replies waiting 1"; the student asks a General question; either side
  resolves; the student uses Leave class and stops seeing that class's posts while the conversations stay; then the
  student leaves the teacher and every conversation, message and read mark for that pair is gone (a SQL count proves
  it). A second student who joins after a post was made has no unread dot for it and is not in its "read by" count.
- A SQL smoke test in the style of the 0028 one shows a third account (another teacher, another student) gets nothing
  from any new RPC, and that a student who left a class no longer sees its posts.
- `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build` pass; unit tests cover the limits mirror, the
  "needs reply" rule, topic labels when the ref is gone, and the link-autolink helper (rejects `javascript:` and other
  schemes).

## 9. Left to the builder

Exact component split, RPC names and argument order, how the conversation panel is built (dialog vs. drawer),
loading and empty states, the zh-TW wording, how the header dot is fetched without slowing every page, and whether the
"Show all" lists paginate or just expand.
