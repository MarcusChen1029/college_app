# Classroom, both ways: what teachers can do and what students receive

Status: design, 2026-11-03 (revision 2, same day). Nothing built yet. The owner handed every decision to Claude ("do it
on your own, I'll check it"), then asked for more (revision 2):
- teachers can review most of the student's information, and leave notes or comments on it;
- clicking a note or comment jumps to the page and the item it is about;
- the student decides whether portal passwords are revealed to a teacher;
- teachers can give a private assignment or a private comment;
- "if I left something I didn't consider, add it" (section 10 lists what was added).

Every choice not in that list is Claude's call, marked as such, for the owner's review.

Builds on: `2026-10-24-teacher-counselor-design.md` (roles, links, privacy rules), migration 0028 (teacher tasks),
0029 (teacher digest), 0033 (class charts), the portal vault (`2026-10-29-e2e-portal-vault-design.md`, 0047-0049).
Those rules still hold unless this document says otherwise. **Two earlier rules change on the owner's request:**
"teachers never see portal logins/passwords" (teacher-counselor spec :23, vault spec :33 non-goal "sharing passwords
with teachers") becomes "only when the student chooses, per portal, end-to-end encrypted" (section 8); and the fixed
list of what teachers see becomes "today's list plus sections the student chooses to share" (section 7).

## 1. Why

Today the classroom works in one direction only. A teacher gets a week view, a roster with flags, a detail page per
student, private notes, tasks, deadlines, charts and an opt-in weekly email. The student gets almost nothing back:

- The only place a student meets their teacher is a box in **Settings > Reminders** (`MyCounselors.tsx`): name, school,
  class names, a Leave button and the "let them see my essays" checkbox.
- Tasks show up on My list (`TeacherTasksForStudent.tsx`) and are never emailed.
- A teacher who spots a problem ("you have no safety school", "your Cornell essay hasn't started") can't tell the
  student in the app, and can't point at the thing they mean. Teacher notes are free text with no link to anything.
- A student with a question for their counselor can't ask it here.
- A counselor can't see the transcript, recommenders, scholarships or portal logins, even when the student wants
  them to help with exactly those.

This design makes the classroom two-way, lets the student open up more of their record to a teacher they trust, and
ties every comment, note and task to the exact thing it is about.

## 2. Goals, non-goals, anti-goals

Goals
- A student has one page, **Counselors**, holding everything from their teachers: announcements, tasks, comments,
  what each teacher can see, and the switches that decide it.
- A teacher can review a student's record section by section and, on any item, **comment** (the student sees it),
  write a **private note** (only the teacher sees it) or **assign a private task** (only that student gets it).
- Every comment, note and task that is about an item shows on that item, and clicking it jumps to the item on the
  right page, scrolled into view and highlighted, for both the student and the teacher.
- The student decides, per teacher and per section, what more the teacher can see, including (per portal) saved
  passwords, which stay unreadable to the site operator.
- Announcements to a class or to all students, with read counts.
- Joining a class is one click from an invite link.
- Later phases: batched email notifications, stronger tasks, college-list balance, letter-of-recommendation requests.

Non-goals (not in any phase here)
- Real-time chat, typing indicators, push notifications. Messages appear on page load or focus.
- Anything between students: no class roster visible to students, no student-to-student messages.
- File uploads or attachments (the project has no storage buckets). Links only.
- Inline comments inside essay text. Essays are Google Docs; inline comments belong in Google Docs. Here a teacher
  comments on the essay as a whole.
- Teachers editing student data. Teachers read, and write their own posts, comments, notes and tasks.
- Co-teachers on one class, school/organisation accounts, seat billing (roadmap #15 stays "later").
- Sending letters, transcripts or school reports to colleges.
- Parents seeing comments or shared sections; the parent share link gains nothing.
- Sharing the vault passphrase, recovery code, payment data, AI-connector or extension tokens with anyone.
- AI-written feedback or letters, teacher access through the MCP/AI connector, meeting scheduling.

Anti-goals (a failure even if it works)
- A teacher seeing anything the student did not either have visible today (section 3.1) or turn on for that teacher.
- The site operator (anyone with database or server access) being able to read a password a student shared. Shared
  copies are encrypted in the student's browser for that one teacher's key.
- A teacher revealing a password without the student being able to see that it happened.
- A student surprised by what a teacher can see. The Counselors page lists it, per teacher, and every switch is there.
- Notification noise: at most one email per day per person, with counts and a link, never message text.
- Classroom features locked behind the student's paid plan. Teachers stay free.
- A teacher seeing another teacher's comments, notes, tasks or shares, or a student seeing another student's anything.

## 3. Who sees what

### 3.1 Sections of a student's record

| Section | Teacher sees it | Where the student turns it on/off |
|---|---|---|
| Name, email, scores, GPA, English test, test details, intended field, regions, "needs aid" flag | always (today) | - |
| College list: statuses, plans, deadlines, checklist progress | always (today) | - |
| Interested list, activities | always (today) | - |
| Last active time | always (today) | - |
| Essays: personal statement, UC questions, supplement titles and Doc links | **when shared** (today's "share essays": off by default for links made since 0041, while older links may still have it on from 0021's default) | per teacher |
| Transcript (schools, courses, grades as printed) | **when shared** (new, phase 2) | per teacher |
| Recommenders (who, status, dates) | **when shared** (new, phase 2) | per teacher |
| Scholarships | **when shared** (new, phase 2) | per teacher |
| Résumé | **when shared** (new, phase 2) | per teacher |
| Private college notes | **when shared** (new, phase 2) | per teacher |
| Aid offers (amounts per college) | **when shared** (new, phase 2) | per teacher |
| Portal logins (portal URLs and usernames) | **when shared** (new, phase 2) | per teacher |
| Portal passwords | **per portal, when shared** (new, phase 3), each reveal logged | per teacher, per portal |
| Vault passphrase/recovery, payments and plan, AI/extension tokens, reminder settings | **never** | - |

Default for the new switches: **off**. At join time the student sees a checklist "What can Ms. Lin see?" with
Essays, Transcript, Recommenders, Scholarships and Résumé pre-ticked, and College notes, Aid offers and Portal
logins not ticked; passwords are never part of the join step. Existing links keep their current essays setting and
everything new off; their card shows a one-time "Choose what Ms. Lin can see" prompt. Claude's call: nothing becomes visible without the student ticking or
confirming it, but the common case is one click.

### 3.2 Comments, notes, tasks, announcements

| Item | Teacher (author) | Student it is for | Other students | Other teachers |
|---|---|---|---|---|
| Announcement to a class | yes, plus read counts and who has not read | members of that class who are still linked | no | no |
| Announcement to "all my students" | yes, plus read counts | every student linked to that teacher | no | no |
| Comment (a conversation) | yes | yes | no | no |
| Private note | yes | **never** | no | no |
| Private task (one student) | yes, plus done/not done | yes | no | no |
| Class task (exists, 0028) | yes, plus done/not done | class members | no (not each other's status) | no |
| Shared password copy | can reveal; each reveal logged | sees each reveal | no | no |

- **Private** in the UI means exactly this: a comment and a private task reach only that one student; a private note
  reaches nobody but its author. Labels always say who will see it ("Only Amy and you", "Only you").
- When a link ends (student leaves, teacher removes them, or either account is deleted), that pair's conversations,
  messages, read marks, notes, private tasks, shares, shared password copies and logs are **deleted for both sides**
  (composite foreign key to `teacher_links`, `on delete cascade`, as 0024/0028 already do). Both confirm dialogs say
  so. Claude's call.
- Leaving a class (but keeping the link) hides that class's announcements and class tasks; everything one-on-one
  stays. Today only the teacher can take a student out of a class (`teacher_remove_from_class`, 0021) and the
  student's only exit is `leave_teacher`; phase 1 adds a student **Leave class** action.
- New class members see the class's earlier announcements. Posts made before the student joined (class membership
  time for a class post, link time for an all-students post) never count as unread for them and are left out of
  "read by X of Y". Claude's call.
- Teachers see read marks on announcements only. Comments show no "seen" receipts to either side.
- Turning a section off hides it from the teacher at once, labels included. Comments, notes and tasks about its items
  stay, and the messages already written stay readable to both (they were said to each other), but on the teacher's
  side the item chip becomes a generic "An essay" / "A transcript course" / "A portal" and doesn't jump; the student
  still sees the real label. Claude's call: nothing from an unshared section leaks through a label.

## 4. What students receive

### 4.1 The Counselors page (`/counselor`)

A new top-level page for students. The header link **Counselors** (zh-TW 輔導老師) appears while the student has at
least one linked teacher, with a dot when something is unread. With no teacher it shows the join box. Settings >
Reminders keeps a one-line pointer here instead of the full box.

```
Counselors                                                     [ Join with a code ]

┌ Ms. Lin · Taipei American School · Senior A [Leave class] ──────── [ Ask Ms. Lin ] ┐
│ ANNOUNCEMENTS                                                                      │
│ ● 📌 UC workshop Thursday 4 pm, room 204                   Nov 2   NEW            │
│   Common App fee waivers are open                          Oct 28    Show all (6)  │
│                                                                                    │
│ TO DO                                                                              │
│   ☐ Revise: Personal statement  ↗          due Nov 10 · only you                   │
│   ☐ Ask two teachers for letters           overdue 2 days · class                  │
│   ☑ Send SAT scores to UC                  done Oct 30                             │
│                                                                                    │
│ COMMENTS                                                                           │
│ ● on Cornell ↗        "Your why-Cornell draft is a good start, but..."   2 h ago   │
│   on Debate captain ↗ "Add the tournament result."         resolved · Oct 28       │
│   [ New message ]                                                                  │
│                                                                                    │
│ WHAT MS. LIN CAN SEE                                         [ Change ]            │
│   Always: profile, scores, college list, activities                               │
│   You share: essays, transcript, recommenders        Not shared: notes, aid, logins│
│   Passwords: UC (viewed 2×, last Nov 3) · Common App           [ Manage ]          │
│   Last looked at your record: Nov 3                                                │
│                                                                    Leave Ms. Lin   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

- One card per linked teacher, newest activity first. Each list shows every unread item plus the latest read ones up
  to 3 in total, with "Show all". Opening the page marks the shown announcements read.
- **To do:** that teacher's tasks, private and class ones (labelled), overdue in the urgent tone. A task about an item
  has a ↗ chip that jumps to it. Tick to mark done (existing `set_task_done`). Today `my_tasks` returns `teacher_name`
  but no `teacher_id` or `done_at` (0041:513-523), so phase 1 replaces it (also adding the item reference).
- **Comments:** one row per conversation with its item chip (↗ jumps to the item), last message and time; unread rows
  get a dot. Clicking the row opens the conversation (4.2).
- **What [teacher] can see:** the table in 3.1 for this teacher, written out; **Change** opens the section switches
  (phase 1 has only the essays switch, which exists today; phase 2 adds the rest), **Manage** opens password sharing
  (phase 3). From phase 2 it also shows pending access requests (7.3) and "last looked at your record" (7.4).
- **Join with a code** and **Leave [teacher]** (warns that everything between them is deleted for both sides).

### 4.2 A conversation

Opens as a panel over the page; its own URL is `/counselor?c=<id>`.

```
┌ Ms. Lin · on Cornell (ED) ↗ ───────────────────────────────── [ Mark resolved ] ┐
│ Ms. Lin · Nov 3, 10:12                                                          │
│   Your why-Cornell draft is a good start, but the second paragraph could be     │
│   about any school. What do you want to do in CALS specifically?                │
│                                                         You · Nov 3, 12:40       │
│                      I'll rewrite it around the plant science lab, thanks!       │
│ [ Write a reply…                                                    ] [ Send ]  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- **One conversation per item**: at most one per teacher-student pair for each item (section 6); starting one that
  exists opens it. "General" can have many.
- Either side can mark it resolved; a new message reopens it. An author can delete their own message ("Message
  removed" for both; the text is deleted). No editing. Claude's call.

### 4.3 On the student's own pages

- Every item a teacher commented on, or gave a task about, shows a small marker on that item (speech bubble with an
  unread count, or a task box); clicking it opens the conversation or the Counselors page at the task. Items:
  college rows on My list, essays on Materials > Essays, activities, profile cards, and (phase 2) transcript courses,
  recommenders, scholarships, portal rows.
- Following a ↗ chip lands on the page with the item scrolled into view and highlighted for two seconds, opening
  whatever it is inside (the college row, the Activities tab that holds it, the profile card).
- Header dot; a one-line strip at the top of My list: "From your counselors: 1 announcement, 2 comments · Open".
- **Invite link** `/join#ABCD1234`: the code is in the URL fragment so it never reaches server logs; the page copies
  it to `sessionStorage` first, because the steps before the preview can drop the fragment:
  - signed out → sign in (returns to `/join`, which reads the saved code);
  - signed in, no role → `/join` is exempted from today's "no role → /welcome" redirect (roles.ts:41) so it can save
    the code, then sends the user to `/welcome`, which says "You're joining a class: pick Student to continue" with
    Student preselected (no teacher name: `preview_code` only answers students); the user still presses the button;
    after that, back to `/join`;
  - signed in as a teacher → "This invite is for students"; no join (`preview_code` refuses, 0041:369);
  - the saved code is cleared after a join, a cancel, or a failed preview.
- **Email (phase 4):** at most one per day, counts plus a button, never message text; task reminders 3 days and 1 day
  before due in the same email; a Settings > Reminders switch, on by default.

## 5. What teachers can do

### 5.1 Header and home

- Nav: Home, Students, Classes, **Messages**, Tasks, **Letters** (phase 5), Deadlines, Explore, Compare. Charts
  becomes a tab of the Students page (`/teacher/charts` stays; the Students item is highlighted there). Messages
  carries a dot when a student has written something unread.
- Home (`TeacherWeek.tsx`): a fifth tally **Replies waiting**; a "Replies waiting" list (max 5) under Check in;
  **Post an announcement**. Later phases add overdue tasks, access answers, letters due.

### 5.2 Reviewing a student (`/teacher/students?s=<id>`)

Tabs become (shared-only tabs appear when the student shares that section, otherwise they show "Not shared" and,
from phase 2, a **Request access** button):

```
Overview  Colleges  Activities  Essays  Interested  Transcript  Recommenders  Scholarships  Résumé  Portals  Tasks  Messages ●  Notes 🔒
                                                   └──────────── phase 2 (shared only) ────────────┘ phase 2/3
```

`TeacherTabs` today is uncontrolled (`TeacherTabs.tsx:11`) and unmounts hidden panels (:60), so it gains a controlled
mode (selected tab from the URL) and the focus scroll runs after the selected panel has mounted.

The URL carries the tab and the item: `/teacher/students?s=<id>&tab=<tab>&focus=<kind>:<ref>`, so a teacher's own
note or a comment chip lands on the exact item.

**On every item** (a college, an essay, an activity, a profile card, and from phase 2 a course, a recommender, a
scholarship, a portal) a small **⋯** menu offers:

```
  Comment            (only Amy and you)
  Private note       (only you)
  Assign a task      (only Amy)
```

and the item shows markers for what already exists on it: 💬 2 (comments, a dot if a reply waits), 🔒 1 (your notes),
☐ 1 (your open tasks on it). Clicking a marker opens that comment, scrolls the Notes tab to the note, or the Tasks tab
to the task.

- **Messages tab:** this student's conversations with this teacher, newest first, "Shared with Amy" at the top, and
  New message with an item picker.
- **Notes tab:** "Only you can see these notes", a lock icon, no Send button (it must never look like Messages). Notes
  show their item chip (↗ jumps to the item in its tab); a filter: all / general / about an item.
- **Tasks tab:** "Private tasks for Amy" (create, edit, archive; due date, optional item) and the class tasks Amy is
  assigned, with done/not done.
- **Mark reviewed (phase 2):** each section has "Mark reviewed" with an optional comment (which becomes a comment on
  that section). The student sees "Reviewed by Ms. Lin on Nov 3" on that page; the teacher sees "changed since your
  review" when the section's data is newer than the review.

### 5.3 Roster, Messages page, Classes, Settings

- Roster: flag `reply_waiting`; later `task_overdue`, `list_unbalanced` (phase 4).
- Messages (`/teacher/messages`), two tabs:

```
Conversations   Show: (•) Needs reply  ( ) Open  ( ) Resolved  ( ) All     Class: [ All ▾ ]
 ● Amy Chen      on Cornell (ED) ↗        "I'll rewrite it around the lab…"     12:40
 ● Ben Wu        General                  "Can I still apply EA to Michigan?"   Yesterday

Announcements   [ + New announcement ]
 📌 UC workshop Thursday 4 pm, room 204     Senior A        Nov 2    Read by 18 of 25 ▸
```

  Composer: To (a class or All my students), Title ≤120, Text ≤4000, optional http(s) Link, Pin; Edit and Archive.
- Classes: **Copy invite link** for each code, **Show on screen** (the code in very large type plus the link, for a
  projector; no QR code, it would need a new dependency), **Rename**, the class's latest announcement and **Post**.
- Settings: edit display name and school; phase 3 adds "Receive shared passwords" (8.1); phase 4 adds "Email me
  when a student writes".

## 6. Items, anchors and jump links

Everything that can be "about" something carries an **anchor**: `kind` + `ref`. Comments and tasks also save a short
`label` at creation (≤120 chars, e.g. "Cornell", "Debate captain", "UC question 3"), written by the creator's browser
from what it shows, so lists outside the student's record (Messages page, Counselors page) can say what it was about.
The server returns that label to a teacher only while the anchor is available to them (3.2); otherwise the teacher's
UI shows a generic label for the kind. Private notes store no label: they only appear inside the student detail page,
which works the label out from the data it already has, or shows the generic one.

| kind | ref | phase | student page (`?focus=<kind>:<ref>`) | teacher tab |
|---|---|---|---|---|
| general | none | 1 | `/counselor?c=<conversation>` | messages |
| section | `colleges`, `essays`, `activities`, `profile`; phase 2 adds `transcript`, `recommenders`, `scholarships`, `resume`, `portals` | 1 | that section's page | that tab |
| college | list slug (`slug`, or `custom-<rowId>`) | 1 | `/application/list` (opens that row) | colleges |
| essay | `ps`, `uc:1`…`uc:8`, `supp:<college slug>:<essay id>` | 1 | `/materials/essays` | essays (`supp:` → colleges) |
| activity | the entry id (`CaActivity`/`CaHonor`/`UcEntry` `id`) | 1 | `/materials/activities` (switches to its tab) | activities |
| profile | `gpa`, `test`, `english`, `regions` | 1 | `/profile` (opens that card) | overview |
| task | task id | 1 | `/counselor?focus=task:<id>` | tasks |
| course / school | transcript course or school id | 2 | `/materials/transcript` | transcript |
| recommender | row id | 2 | `/application/recommenders` | recommenders |
| scholarship | row id | 2 | `/application/scholarships` | scholarships |
| portal | password slot (`portal-slots.ts`: `system:…`, `campus:…`, `custom:…`, `college:…`) | 2 | `/application/portals` | portals |

`section` covers "the whole thing": the college list as a whole (what revision 1 called "list"), essays as a whole,
the résumé, and the target of "Mark reviewed".

IDs that must match on both sides:
- Supplement essays are `checklist.essay_list` entries with their own `id` (`checklist.ts:23`); a prompt slot from
  `supplements.json` with no saved essay entry has no id, so comment on the college instead.
- Activities: some old entries have no stored id and get one made up on read (`idOf`, `ActivitiesEditor.tsx:591`
  gives `legacy-<list>-<i>`; check whether `upgradeActivities` saves ids). An anchor is offered only for an id that is
  stored in the saved data; the server check (the id exists in `student_profiles.activities`) refuses made-up ones.
- The existing helpers to build on: `data-entry-id` (`ActivitiesEditor.tsx:243`), `data-profile-card` / `revealCard`
  (`ProfileDashboard.tsx:28-36`), `hashTarget` (`EssaysPage.tsx:30`).

- A pure function maps an anchor + role (+ student id for teachers) to the URL. Pages mark items with
  `data-focus="<kind>:<ref>"` and use one shared hook that reads `focus`, opens what it needs (each page passes an
  "open this" callback: My list opens the row, Activities switches tab, Profile uses its `revealCard`, Essays reuses
  its hash logic), scrolls the element into view and highlights it briefly. Nothing like this exists today.
- The server checks an anchor before saving a comment or task: the item must exist and be visible to that teacher
  (college on the list, essays shared, activity id present, task visible, section shared). Lists return
  `anchor_available`; when false the chip says "no longer available" / "no longer shared" and does not jump.
- Private notes keep anchors too, checked only for format (they are the teacher's own words about what they saw).
  Notes stay as they are today: the teacher reads and writes `teacher_notes` directly under its "own notes" RLS policy
  (`0024_teacher_notes.sql:18`, `links-api.ts:190-209`); phase 1 adds `anchor_kind` / `anchor_ref` columns with format
  CHECK constraints and extends `addNote` / `updateNote` / `listNotes`. Claude's call: no need to move a teacher-only
  table behind RPCs.

## 7. Phase 2: wider review

### 7.1 Section switches

Per link, the student turns sections on or off (3.1): `essays` (today's `share_essays`), `transcript`,
`recommenders`, `scholarships`, `resume`, `college_notes`, `aid`, `portal_logins`. The join step (3.1) and the
Counselors card "Change" both edit them. New RPCs return each section's data to the teacher only while it is on, with
explicit column lists (for portal logins: per portal the URL and username, never the password or the vault rows).

### 7.2 Teacher tabs for the new sections

Read-only views of the shared sections in the student detail page, with ⋯ menus and markers on each item, as 5.2.
College notes and aid offers appear inside the Colleges tab rows when shared.

### 7.3 Access requests

A teacher looking at a section that isn't shared can press **Request access** (optional one-line reason). The student
sees it on the Counselors card: "Ms. Lin asks to see your transcript: Allow / Not now". Not now is silent to the
teacher (the request just stays pending). One pending request per section per pair; a teacher can't re-ask a declined
section for 7 days. Passwords can never be requested (the student starts that, section 8).

### 7.4 Review marks and the view log

- **Mark reviewed** per section (5.2) is stored per pair and section with the time and an md5 of that section's data
  exactly as the teacher's RPC returns it. "Changed since your review" = the current md5 differs. Claude's call:
  essays, activities and profile all live in one `student_profiles` row with a single `updated_at`, so timestamps
  would flag every section whenever any of them changes; a hash is exact and cheap.
- **View log:** opening a student's detail page records "viewed" at most once an hour per pair. The student's card
  shows "Last looked at your record: Nov 3". Claude's call: cheap transparency that fits "a student is never
  surprised".

## 8. Phase 3: sharing portal passwords

Saved passwords are end-to-end encrypted today (`vault-crypto.ts`: AES-256-GCM vault key wrapped by a PBKDF2
passphrase key and an HKDF recovery key; `e1.` values in `portal_passwords`, keyed by slot; or "this device only"
`d1.` values in IndexedDB). The server can't read them, and that must stay true for shared copies.

### 8.1 The teacher's receiving key

- A teacher who wants to receive passwords sets up a **receiving key** once (Settings > "Receive shared passwords"):
  the browser makes an ECDH P-256 key pair (Web Crypto), generated extractable only long enough to export the private
  key as pkcs8. That pkcs8 is wrapped the way the student vault key is (passphrase via PBKDF2 at the vault's iteration
  floor, recovery code via HKDF, AES-256-GCM) but with its own labels in the HKDF info and additional data, so a
  wrapped receiving key can never be mistaken for a vault key. On unlock it is imported back as a non-extractable ECDH
  key used only for `deriveBits`. The server stores the public key, the wrapped private key, the key id and the KDF
  parameters.
- `vault-crypto.ts` can't be reused as is: its `wrap`, `fromPassphrase`, `fromRecovery`, `verifySecret` and
  `unwrapToKey` are private (:87-197), every size check expects a 60-byte wrapped AES key (:179; `vault-format.ts:91,94`;
  0047:46,49), unwrap is hard-coded to raw AES-GCM (:193), and the labels say "vault" (:27, :71). Phase 3 therefore
  refactors it to export length-agnostic wrap/unwrap and KDF helpers that take a label, keeping the vault's own
  behaviour byte-for-byte (the existing vault tests must pass unchanged), and puts the new code in `share-crypto.ts`.
- **Key code:** both sides can see a 20-character code (100 bits, four groups of five) derived from the public key. The
  teacher's page computes it from the key pair it just unlocked, never from the database column; the student's share
  screen shows the code the server sent and says "Ask Ms. Lin to read you her key code; share only if they match."
  Written-down accepted risks: whoever runs the server could swap in another public key (the code check catches it),
  and, as with today's vault, whoever serves the site's JavaScript could change it; end-to-end protection holds only
  while that code is honest.
- A teacher who loses both passphrase and recovery code makes a new key; every copy made for the old key id becomes
  "needs sharing again" for the student.

### 8.2 Student shares, per portal

- Only in **vault** mode. "This device only" mode promises nothing leaves the device (`portal-vault-client.ts:13-18`)
  and each device holds its own copy, so it can't share; its share screen says "Your passwords are kept on this device
  only. To share one, switch to the vault." Claude's call: keeps an existing promise intact.
- From the Portals page (a "Share" control on each saved password) or the card's **Manage**: pick the teacher, pick
  portals. Needs the teacher to have a receiving key, the `portal_logins` section on (a password without its username
  is useless), and the vault unlocked.
- Strong confirmation, once per teacher: "Ms. Lin will be able to sign in to these portals as you. Share only if you
  trust her and your school allows it. You'll see each time her browser opens one, and you can stop sharing any time.
  Stopping doesn't undo what she has already seen: change the password if you need to."
- The student's browser opens each password with the unlocked vault key and encrypts it for the teacher: a one-time
  ECDH P-256 key, ECDH with the teacher's public key, HKDF-SHA-256 whose info names the format (`t1`), student, teacher,
  slot, teacher key id and the one-time public key, then AES-256-GCM with the same fields as additional data. The copy
  (`t1.<teacher key id>.<payload>`) is saved keyed by (student, teacher, slot) through an RPC only the student can call.
- **Keeping copies current is the server's job.** Passwords change through many paths besides `savePassword`
  (`forgetPassword` :715, `resetVault` → `portal_vault_reset` 0047:127-132, `switchToDevice` :831, `switchToVault` :863,
  `moveIntoVault` :894, `resolveConflict` :975, `deleteUnreadableServerCopies` :1012). So a trigger on
  `portal_passwords` does it in the same transaction: an insert or update of a slot marks that slot's copies
  **out of date**; a delete of a slot deletes its copies. The browser that just saved a password re-seals its copies
  right after (it has the plain text then), which clears "out of date". Consequences, by design: resetting the vault
  or switching to device mode deletes every shared copy (those screens say "sharing with your counselors stops"); an
  out-of-date copy shows the teacher "may be out of date" and the student "Share again" on that portal.
- **Stop sharing** per portal or per teacher deletes the copies at once.

### 8.3 Teacher reveals

- The Portals tab lists shared portals (URL, username, "password shared", "may be out of date"). **Reveal** asks for
  the receiving-key passphrase once per session, fetches the copy through the only RPC that returns it, which writes a
  **reveal log** row in the same call, decrypts in the browser, shows the password for 30 seconds with Copy. Teachers
  have no other way to read copies.
- The student sees each reveal on the card ("UC: opened 2×, last Nov 3 10:12"), and from phase 4 in their daily email.
  The log records fetches, which is the closest the server can get to "views"; the wording says "opened".
- Written-down accepted risk: copies aren't signed by the student, so someone with database access could plant a fake
  copy for a teacher; the RPC lets only the student write their own copies, which covers everyone else.

## 9. Data and access (for the builder)

Same pattern as 0028 as amended by 0041: tables with RLS on, **no policies and no table grants**, every read and
write through SECURITY DEFINER functions with `set search_path = ''` that check `auth.uid()`, the caller's role and the
teacher<->student link, and that start with `perform public.refuse_oauth_client();` like 0041's versions of
`my_tasks` / `set_task_done` / `leave_teacher` (0041:507-534), so AI-connector tokens can't reach any of it; new
tables get a row-cap trigger like 0041:290-293. The one exception is `teacher_notes` (section 6). Limits live in SQL and
are mirrored in `web/lib/classroom.ts`, like `TASK_LIMITS`.

Phase 1:
- `class_posts` (id, teacher_id, class_id null = all students, title 1-120, body 1-4000, link_url null/http(s) ≤500,
  pinned, archived, created_at, updated_at) and `post_reads` (post_id, student_id, teacher_id, read_at; composite FK to
  `teacher_links`).
- `conversations` (id, teacher_id, student_id, composite FK; anchor_kind, anchor_ref, anchor_label; status
  open|resolved; started_by; created_at, last_message_at, teacher_read_at, student_read_at; unique on pair + kind +
  coalesce(ref,'') except general) and `conversation_messages` (id, conversation_id, author, body 1-2000 or null when
  deleted, deleted_at, created_at).
- `teacher_notes` gains anchor_kind, anchor_ref (null = a general note; format check only; no label).
- `teacher_tasks` gains anchor_kind, anchor_ref, anchor_label (only on one-student tasks); `create_task` /
  `update_task` / `list_my_tasks` / `my_tasks` gain them. Old callers keep working (new parameters default to null).
- RPCs: posts (create, update, archive, teacher list with counts, who hasn't read, student list, mark read), leave
  class, rename class, update teacher profile, conversations (start, send, delete own message, set status, mark read,
  list, messages), one unread-count call per role, and one internal `anchor_visible(teacher, student, kind, ref)` used
  for both saving and `anchor_available`.
- Limits: teacher 300 messages and 20 posts per day; student 50 messages per day; 200 active posts per teacher; 100
  conversations per pair. Notes keep 0041's 2000 per teacher, tasks keep 500 active.

Phase 2: section switches on the link (a text array with a check on the allowed names, next to today's
`share_essays`), access requests, review marks, the view log, RPCs for each newly shareable section, anchors for the
new kinds. Phase 3: `teacher_password_keys`, `shared_passwords` (student, teacher, slot, sealed, teacher key id,
stale, updated_at; composite FK to `teacher_links`), `password_reveals` (student, teacher, slot, at). Phase 4: daily
notification pass in the `deadline-reminders` Edge Function. Phase 5: `letter_requests`.

Rendering: messages, notes and announcements are plain text (React escapes); http(s) URLs become links with
`rel="noopener noreferrer nofollow"`, nothing else. Polling, not realtime: unread counts refresh on navigation and
window focus.

Every new string goes through `web/lib/i18n/` in English and zh-TW. `docs/legal/2026-10-29-privacy-data-map.md` and the
privacy page's teacher section list each new table and who sees it, in the same PR as its migration; phase 3 also
updates the vault spec's non-goal line and the security page wording about passwords. Migration numbers: the next free
one at build time (0052 or later, since 0051 is taken; check `list_migrations` and origin/main right before applying). Applying a
migration and deploying the Edge Function need the owner's OK.

## 10. Added beyond the request (Claude's additions)

- Leave class (keep the teacher), and the deletion rule when a link ends.
- Section switches default off, with a pre-ticked checklist at join, and access requests a teacher can send.
- "What [teacher] can see" spelled out per teacher, and "last looked at your record".
- Reveal log for passwords, key fingerprints, out-of-date copies, re-sharing after a key reset.
- Markers on items on both sides, so nothing is only findable from a list.
- Review marks with "changed since your review".
- Invite links that survive sign-in and role choice; show-on-screen code; class rename; teacher profile edit.
- Rate limits and length caps on everything a teacher can send to a minor.

## 11. Phases

Each phase ships on its own and is useful alone.

1. **Two-way basics with anchors.** Counselors page, announcements with read counts, conversations both ways, private
   notes and private tasks on items (⋯ menu, markers, jump links on both sides for today's sections), teacher Messages
   page and detail tabs (Messages, Tasks, Notes with anchors), unread dots, invite links and `/join`, show-on-screen,
   class rename, teacher profile edit, leave class.
2. **Wider review.** Section switches (join checklist, Change), teacher tabs for transcript, recommenders,
   scholarships, résumé, portals (logins), college notes and aid in Colleges, anchors on them, access requests, review
   marks, view log.
3. **Passwords.** Receiving keys, per-portal sharing, reveal with log, re-seal on change, stop sharing.
4. **Reach.** Daily notification emails, task done-notes and links, task template pack, `task_overdue`, college-list
   balance (`fit.ts` labels; super reach counts as reach; flag when 4+ colleges with a fit label and no safety; needs
   one `college_summary` read on the roster).
5. **Letters.** Letter requests from the Recommenders page to a linked teacher, a Letters page, status synced to the
   student's own recommender row by the student-side code (teachers never touch `recommenders`).

## 12. How we know it works

Phase 1 is done when, with a throwaway teacher and student linked through an invite link: the teacher posts to a class
and to all, the student sees both with a dot that clears on opening and the teacher sees "read by 1 of 1"; on the
student's Cornell row the teacher adds a comment, a private note and a private task; the student sees a marker on the
Cornell row on My list, clicks it, replies, and the task's ↗ chip jumps back to the row; the teacher's note chip jumps
to Cornell in the Colleges tab; the student never sees the note (SQL and UI); Leave class keeps the comments; Leave
teacher deletes every conversation, message, read mark, note and private task for the pair (SQL count = 0). A SQL
smoke test in the style of `supabase/patches/2026-10-25_teacher_tasks_smoke_test.sql` shows a third account gets
nothing from any new RPC and that an anchor to an unshared essay is refused. `tsc`, lint, tests and build pass; unit
tests cover the limits mirror, anchor validation and URLs for both roles, "needs reply", gone-item labels and the link
splitter.

Phase 2 adds: each section is invisible until switched on and disappears when switched off (SQL); access request
allow/not now. Phase 3 adds: a shared copy cannot be opened with anything but the teacher's private key (unit test of
the seal/open pair, and a test that the stored value contains neither the password nor the student vault key), every
reveal writes a log row, re-saving a password re-seals copies, a key reset marks copies "needs sharing again".

## 13. Left to the builder

Component split, RPC names and argument order, panel vs. drawer, loading and empty states, the zh-TW wording, how the
header dot is fetched without slowing every page, "Show all" paging, and the exact icons.
