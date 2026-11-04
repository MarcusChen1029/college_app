# Classroom, Google Classroom style

Status: design, 2026-11-04. Builds on `2026-11-03-classroom-two-way-design.md` (phase 1, shipped as PR #105 with
migration 0052). The owner asked to "copy the format and the style from Google Classroom, anything that makes it look
better and more convenient", approved the student mockups (class cards; class page with Stream / Classwork / People
tabs; task page with "Your work" and private comments; one To-do list) and handed every other call to Claude. Choices
marked "Claude's call" are for the owner's review.

## 1. Why

Phase 1 groups everything by teacher: the student's `/counselor` page is one long card per teacher, and the teacher's
Classes page is a list of codes. Students and teachers already know Google Classroom's shape: a class is a place, with
its own banner, a feed, a list of work and a list of people. Borrowing that shape makes the classroom easier to read
and to find things in, without changing who can see what.

## 2. What is borrowed, and what isn't

Borrowed (layout and interaction patterns, drawn in this site's own colors, fonts and icons):
- A grid of **class cards**: colored banner with the class name, a subtitle, the teacher's name and a round initial
  avatar; the next due tasks in the card body; small icon buttons at the bottom with a dot when something is new.
- A **class page**: a large colored banner; **Stream / Classwork / People** tabs; a left column with an **Upcoming**
  box; a feed where announcements and "new task" items appear together.
- **Classwork** grouped under teacher-chosen **topics**, a task row that expands in place, and a **task page** with the
  instructions on the left and a **Your work** box (Mark as done, optional note and link) plus **Private comments** on
  the right.
- A **To-do** page across all classes with **Assigned / Missing / Done** tabs, grouped This week / Next week / Later /
  No due date.
- On the teacher side: **Announce something to your class** at the top of the Stream, a **Class code** box, a
  **Create** button on Classwork, "N done of M" on each task, a **People** tab, and a **Customize** choice of banner
  color.

Not borrowed:
- Google's name, logo, illustrations, banner images, colors, fonts or icons. Nothing on the page may say "Google".
- Class-wide comments, a classmates list, or anything a student can post to the whole class (phase 1 rule: nothing
  between students). "Reply privately" replaces class comments.
- Grades, points, rubrics, "turn in" with files, Meet links, guardian emails, calendar sync.

## 3. Student screens

### 3.1 Classes home (`/counselor`)
- Heading "Classes", a **To-do** link with the count of open tasks due within 7 days or overdue, and **Join a class**
  (opens today's `JoinBox` in a dialog).
- Cards, newest activity first:
  - One **class card** per class the student is a member of: banner in the class's theme color, class name, the
    class's school year as subtitle when set, teacher's name, initial avatar; body: up to two tasks of that class that
    are not done and have the nearest due dates ("Due Thursday" / "Due Nov 15" / "Missing" in the urgent tone), else
    "Nothing due soon"; footer: Classwork icon and Stream icon (dot when the class has unread announcements); a ⋮ menu
    with **Leave class**.
  - One **1-on-1 card** per linked teacher ("1-on-1 with Ms. Lin", "Just you and your counselor"), banner in a color
    derived from the teacher id: body: up to two open private tasks; footer: Classwork icon and Comments icon (dot when
    a comment is unread); ⋮ menu with **Leave Ms. Lin** (same confirm as today: everything between you is deleted).
- No teacher yet: the join box and one paragraph, as today.
- Archived classes get no card (their tasks and announcements are already hidden from students, 0028:78 and
  0052:94); `my_teachers` returns which classes are archived so the grid can skip them. Claude's call.
- `?c=<conversation>` still opens that conversation in a panel (old links keep working).
- Announcements a teacher sends to **all their students** (no class) appear on that teacher's 1-on-1 page and at the
  top of each of that teacher's class Streams, tagged "To all of Ms. Lin's students"; their unread dot shows on the
  1-on-1 card only, so one post never lights up several cards. Claude's call.

### 3.2 Class page (`/counselor/class/<classId>?tab=stream|classwork|people`)
- Banner: class name, subtitle line "school year · teacher · school".
- **Stream**: left column: **Upcoming** (this class's next three not-done tasks with due dates, "View all" →
  Classwork) and **What Ms. Lin can see** (the phase-1 list for that teacher, with the essays switch). Main column:
  the class's announcements and its class tasks merged newest first, pinned announcements on top. An announcement
  card shows the teacher, date, title, text (LinkedText) and **Reply privately to Ms. Lin**, which opens a new
  General conversation whose first line quotes the announcement title (Claude's call: no new anchor kind). A task item
  reads "Ms. Lin posted a new task: <title>" with its due date and opens the task page. Opening the Stream marks the
  shown announcements read, as today.
- **Classwork**: this class's tasks grouped by topic, in the order of each topic's newest task; tasks without a topic
  first, under no heading. A row shows the task icon (filled when done), title, and due date / "Missing · N days late"
  / "Done <date>"; clicking expands instructions, the item chip if the task is about an item, and **View task**.
- **People**: the class's teacher (name, school). Never classmates.

### 3.3 1-on-1 page (`/counselor/teacher/<teacherId>`)
- Banner "1-on-1 with Ms. Lin". Left: **What Ms. Lin can see**, **Leave Ms. Lin**. Main: **Private tasks** (same rows
  as Classwork) and **Comments** (today's conversation rows, with New message / Ask Ms. Lin).

### 3.4 Task page (`/counselor/task/<taskId>`)
- Left: icon, title, "teacher · posted date · Due …", a rule, the instructions (LinkedText), the item chip when
  anchored, and the class name or "Only you".
- Right, **Your work**: status (Assigned / Missing / Done <date>), an optional note (≤500 chars) and an optional link
  (http/https, ≤500), **Mark as done** / **Undo**. The note and link are saved with the completion and shown to the
  teacher. After marking done the student can **Edit** the note and link and **Save** without losing the done date
  (Claude's call); Undo clears both.
- Right, **Private comments**: the conversation about this task with its teacher (anchor `task:<id>`), newest last,
  a one-line reply box; the first comment starts it. "Only you and Ms. Lin can see these."
- The task links that phase 1 points at `/counselor?focus=task:<id>` now go to this page (anchors' `studentHref` for
  `task`).

### 3.5 To-do (`/counselor/todo`)
- Tabs **Assigned** (not done, due today or later, or no due date), **Missing** (not done, past due; count in the
  tab), **Done** (newest first). Assigned groups This week / Next week / Later / No due date; Missing is one list, most
  recently due first. Each row:
  title, class name or "1-on-1 with <teacher>", due; clicking opens the task page.

### 3.6 Elsewhere
- The header link stays "Counselors" and goes to `/counselor`; My list's strip and markers keep working, with task
  markers linking to the task page.

## 4. Teacher screens

### 4.1 Classes (`/teacher/classes`)
- A grid of the teacher's class cards (banner in the theme color, name, school year, "N students"; body: the next due
  class task; footer: Stream and Classwork icons), plus a dashed **Create class** card. Archived classes fold into
  "Archived classes" below, as today. The one-on-one code area stays on this page as its own card ("Students you
  coach one-on-one", with the code, Copy invite link and Show on screen).

### 4.2 Class page (`/teacher/classes/<classId>?tab=stream|classwork|people`)
- Banner: class name, school year; a **Customize** button (rename; pick a banner color from six: ink, coral, mint,
  lilac, sun, sky — Claude's call: the site's own palette); a ⋮ with Archive.
- **Stream**: left column: **Class code** box (code in large type, Copy invite link, Show on screen, New code, Turn
  off) and **Upcoming**. Main: an **Announce something to your class** box that opens today's `PostComposer` preset to
  this class; then the feed: this class's announcements (with "Read by X of Y ▸", Edit, Archive) and its task items
  ("You posted a new task: …"), newest first, pinned first, plus the teacher's all-students announcements tagged
  "To all your students". The composer keeps the "All my students" choice.
- **Classwork**: **+ Create task** (today's task form, preset to this class, plus a **Topic** field with the class's
  existing topics as suggestions); tasks grouped by topic; each row shows due date and "N done of M"; expanding shows
  the instructions and the student list with done / not done, done date, and the student's note and link.
- **People**: Teachers (you); Students (this class's members: name → student detail page; ⋮ Remove from class); an
  **Invite students** line with the code and Copy invite link.

### 4.3 Elsewhere
- Teacher Home, Students, Messages and the all-tasks Tasks page keep working. The Tasks page form gains the Topic field.

## 5. Data changes (migration 0053)

Same pattern as 0052 (RLS, SECURITY DEFINER RPCs starting with `refuse_oauth_client()`, explicit columns,
`clock_timestamp()`), limits mirrored in TypeScript.
- `classes.theme text` null, check in (`ink`,`coral`,`mint`,`lilac`,`sun`,`sky`); RPC
  `teacher_set_class_theme(p_class uuid, p_theme text)`. Null = a color derived from the class id in the client.
- `teacher_tasks.topic text` null, check `btrim(topic) <> '' and char_length(topic) <= 60`.
- `task_completions.note text` (≤500) and `.link text` (http/https, ≤500).
- Recreate (drop + create + re-grant; a drop is required before each new signature, or PostgREST sees two overloads):
  `create_task` (+ `p_topic text default null`), `update_task` (+ `p_topic text default null`, null = no topic, the
  new client always sends it; and `refuse_oauth_client()`), `archive_task` (+ `refuse_oauth_client()`),
  `set_task_done(p_task, p_done, p_note text default null, p_link text default null)` (done on an existing completion
  updates note and link and keeps `done_at`; undo deletes the completion, so note and link go with it),
  `task_progress` (+ `note`, `link`, and `refuse_oauth_client()`), `my_tasks` (+ `created_at`, `topic`, `note`,
  `link`), `list_my_tasks` (+ `topic`), `teacher_student_tasks` (+ `topic`, `note`, `link`), `my_teachers`
  (+ `class_themes text[]`, `class_years text[]`, `class_archived boolean[]`, aligned with `class_ids`).
- Live code during the gap between applying 0053 and deploying the web: new parameters default to null and new
  columns are read by name, so it keeps working. Its `update_task` call (no `p_topic`) would clear a topic, but no
  topic can exist before the new web code ships.
- This also closes the follow-up left from 0028: `update_task`, `archive_task`, `task_progress` refuse AI-connector
  tokens.
- A smoke test patch in the style of `supabase/patches/2026-11-03_classroom_smoke_test.sql`; the owner runs the dry
  run and the apply in the SQL Editor (as with 0052).

## 6. Rules kept from phase 1

Who sees what does not change (spec 2026-11-03 §3): announcements to class members who are linked; private tasks and
comments only between that teacher and that student; notes never shown to students; no classmates; everything per
pair deleted when the link ends. The task note and link a student adds are visible to that task's teacher only.

## 7. Done when

- Student: with one class and one private task, the Classes home shows a class card and a 1-on-1 card; the class page
  shows the announcement and the task in the Stream, the task under its topic in Classwork, the teacher in People;
  the task page marks done with a note and the teacher sees the note; a private comment on the task reaches the
  teacher; To-do shows it under Assigned, then Done, and an overdue one under Missing.
- Teacher: the Classes grid shows the class with its color; Customize changes the color; the class Stream posts an
  announcement; Classwork creates a task with a topic and shows "0 done of 1", then "1 done of 1" with the note.
- `tsc`, lint, tests, build pass; unit tests cover To-do grouping and Missing, topic grouping and order, the stream
  merge order, theme fallback, and the done-note/link validation. The smoke test covers the new columns, the RPC
  changes, a student unable to set another student's note, and the OAuth refusals.
- Signed-out pages are browser-checked; signed-in screens need the owner (the owner merged phase 1 without that check).

## 8. Left to the builder

Component split, exact spacing and icons (inline SVG like phase 1), loading and empty states, zh-TW wording, how the
class page's tabs sync with the URL, and whether Upcoming shows three or four items.
