-- Classroom, both ways, phase 1 (spec docs/superpowers/specs/2026-11-03-classroom-two-way-design.md §3.2, §6, §9;
-- plan docs/superpowers/plans/2026-11-03-classroom-phase1.md): teacher announcements with read marks, two-way
-- conversations about one item of a student's record, anchors on private notes and private tasks, and three small
-- actions (a student leaves a class, a teacher renames a class or edits their own name and school).
--
-- Same pattern as 0028 as amended by 0041: the new tables have RLS on, no policies and no table grants, and every read
-- and write goes through the SECURITY DEFINER functions below. Each client function refuses AI-connector tokens first
-- (refuse_oauth_client), then checks auth.uid(), the caller's role and the teacher<->student link. The one exception
-- is teacher_notes: the teacher keeps reading and writing it directly under its "own notes" policy (0024); it only
-- gains two anchor columns with a format check.
--
-- Who sees what
--   * Announcements (class_posts). A teacher sees their own posts, with read counts and the names of who hasn't read
--     one. A student sees a post while it is not archived, a teacher_links row joins them to its teacher, and it is
--     for all of that teacher's students or for a class (not archived) they are a member of. A post made before the
--     student joined (class_members.joined_at for a class post, teacher_links.created_at for an all-students post) is
--     shown to them as read and is left out of every count. Read marks (post_reads) are written only by the student;
--     the teacher gets counts and the display name teacher_roster (0023) already exposes, nothing else.
--   * Conversations: one teacher and one linked student. Each side sees the messages, the other side's display name
--     and an unread count; no read times are returned (no "seen" receipts). A deleted message keeps its place with no
--     body. The item a conversation is about (anchor_kind / anchor_ref) is checked with anchor_visible() when it is
--     started; the saved anchor_label goes to the teacher only while anchor_visible() is still true (an essay that
--     stops being shared keeps its conversation, but the teacher's chip turns generic).
--   * Private notes (teacher_notes): only their author, as before. Private tasks (teacher_tasks with a student_id):
--     that teacher and that student, as before; their anchor label follows the conversation rule.
--   * Leaving a class keeps the link: that class's announcements and class tasks stop showing, everything one-on-one
--     stays. When a link ends, the composite foreign keys to teacher_links delete that pair's conversations (and so
--     their messages), read marks, notes, private tasks and task completions, for both sides.
-- Limits are mirrored in web/lib/classroom.ts (CLASSROOM_LIMITS, validatePost, validateMessage) and the anchor format in
-- web/lib/anchors.ts (validateAnchor); keep them in step. Errors raised for the client start with "classroom: "
-- (limit, not linked, not found, invalid, rate; classroomErrorMessage maps them). Times written here use
-- clock_timestamp(), so ordering holds inside one transaction too.
-- Smoke test: supabase/patches/2026-11-03_classroom_smoke_test.sql.

-- ═════════════ part A: announcements, read marks, leave class, rename class, teacher profile, my_tasks ═════════════

create table public.class_posts (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id   uuid references public.classes(id) on delete cascade, -- null = all of the teacher's students
  title      text not null check (btrim(title) <> '' and char_length(title) <= 120),
  body       text not null check (btrim(body) <> '' and char_length(body) <= 4000),
  link_url   text check (link_url is null or (char_length(link_url) <= 500 and link_url ~* '^https?://[^[:space:]<>"]+$')),
  pinned     boolean not null default false,
  archived   boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, teacher_id)
);
create index on public.class_posts (teacher_id, created_at desc);
create index on public.class_posts (class_id);

-- teacher_id is copied from the post so the read mark hangs off the link: it is deleted when the link ends.
create table public.post_reads (
  post_id    uuid not null,
  student_id uuid not null,
  teacher_id uuid not null,
  read_at    timestamptz not null default clock_timestamp(),
  primary key (post_id, student_id),
  foreign key (post_id, teacher_id) references public.class_posts (id, teacher_id) on delete cascade,
  foreign key (teacher_id, student_id) references public.teacher_links (teacher_id, student_id) on delete cascade
);
create index on public.post_reads (student_id);

alter table public.class_posts enable row level security;
alter table public.post_reads enable row level security;
revoke all on table public.class_posts, public.post_reads from public, anon, authenticated;

create trigger row_cap before insert on public.class_posts for each row execute function public.enforce_row_cap('teacher_id', '2000');
create trigger row_cap before insert on public.post_reads for each row execute function public.enforce_row_cap('student_id', '20000');

-- ───────────── part A helpers (not callable by clients) ─────────────

-- The students who see a post right now, and whether it counts for them (they were there when it was posted).
-- The single teacher-side definition, used for audience, read counts and who hasn't read.
create function public.post_audience(p_post uuid) returns table (student_id uuid, counted boolean)
language sql stable security definer set search_path = '' as $$
  select l.student_id,
         case when p.class_id is null then l.created_at <= p.created_at else m.joined_at <= p.created_at end
    from public.class_posts p
    join public.teacher_links l on l.teacher_id = p.teacher_id
    left join public.classes c on c.id = p.class_id
    left join public.class_members m on m.class_id = p.class_id and m.student_id = l.student_id
   where p.id = p_post
     and not p.archived
     and (p.class_id is null or (not c.archived and m.student_id is not null))
$$;

-- The student-side twin of post_audience (same joins and conditions, filtered by student instead of by post), as
-- visible_tasks is to task_audience in 0028. Used by my_posts, mark_posts_read and classroom_unread. Keep the two in step.
create function public.visible_posts(p_student uuid) returns table (post_id uuid, counted boolean)
language sql stable security definer set search_path = '' as $$
  select p.id,
         case when p.class_id is null then l.created_at <= p.created_at else m.joined_at <= p.created_at end
    from public.teacher_links l
    join public.class_posts p on p.teacher_id = l.teacher_id
    left join public.classes c on c.id = p.class_id
    left join public.class_members m on m.class_id = p.class_id and m.student_id = l.student_id
   where l.student_id = p_student
     and not p.archived
     and (p.class_id is null or (not c.archived and m.student_id is not null))
$$;

-- Checks an announcement's text, after trimming (the callers store it trimmed). Mirrors validatePost and isHttpUrl
-- (web/lib/linkify.ts): title 1-120, body 1-4000, link empty or http(s) and at most 500.
create function public.check_post_text(p_title text, p_body text, p_link text) returns void
language plpgsql immutable set search_path = '' as $$
declare v_link text := btrim(coalesce(p_link, ''));
begin
  if btrim(coalesce(p_title, '')) = '' or char_length(btrim(p_title)) > 120
     or btrim(coalesce(p_body, '')) = '' or char_length(btrim(p_body)) > 4000
     or char_length(v_link) > 500
     or (v_link <> '' and v_link !~* '^https?://[^[:space:]<>"]+$') then
    raise exception 'classroom: invalid';
  end if;
end $$;

-- At most 200 active (not archived) posts per teacher. The advisory lock serialises one teacher's creates, so the
-- daily-rate count that follows it is serialised too.
create function public.check_post_cap(p_teacher uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('classroom_posts:' || p_teacher::text, 0));
  if (select count(*) from public.class_posts p where p.teacher_id = p_teacher and not p.archived) >= 200 then
    raise exception 'classroom: limit';
  end if;
end $$;

revoke all on function public.post_audience(uuid), public.visible_posts(uuid), public.check_post_text(text, text, text),
  public.check_post_cap(uuid) from public, anon, authenticated;

-- ───────────── part A teacher functions ─────────────

-- p_class null = all of the caller's students; otherwise one of the caller's classes that is not archived.
-- At most 20 posts per teacher in any 24 hours (archived ones count) and 200 active ones. Returns the post id.
create function public.teacher_create_post(p_class uuid, p_title text, p_body text, p_link text, p_pinned boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := auth.uid();
  v_at  timestamptz;
  v_id  uuid;
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  if p_class is not null and not exists (select 1 from public.classes c
                                          where c.id = p_class and c.teacher_id = uid and not c.archived) then
    raise exception 'classroom: not found';
  end if;
  perform public.check_post_text(p_title, p_body, p_link);
  perform public.check_post_cap(uid);
  if (select count(*) from public.class_posts p
       where p.teacher_id = uid and p.created_at > clock_timestamp() - interval '1 day') >= 20 then
    raise exception 'classroom: rate';
  end if;
  v_at := clock_timestamp();
  insert into public.class_posts (teacher_id, class_id, title, body, link_url, pinned, created_at, updated_at)
  values (uid, p_class, btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''), coalesce(p_pinned, false),
          v_at, v_at)
  returning id into v_id;
  return v_id;
end $$;

-- Changes the text, link and pin of one of the caller's posts. The audience can't change (make a new post instead).
create function public.teacher_update_post(p_post uuid, p_title text, p_body text, p_link text, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  if not exists (select 1 from public.class_posts p where p.id = p_post and p.teacher_id = uid) then
    raise exception 'classroom: not found';
  end if;
  perform public.check_post_text(p_title, p_body, p_link);
  update public.class_posts p
     set title = btrim(p_title), body = btrim(p_body), link_url = nullif(btrim(coalesce(p_link, '')), ''),
         pinned = coalesce(p_pinned, false), updated_at = clock_timestamp()
   where p.id = p_post and p.teacher_id = uid;
end $$;

-- Archiving hides the post from students; read marks are kept, so un-archiving restores them. Un-archiving counts
-- against the 200 active posts.
create function public.teacher_archive_post(p_post uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  if not exists (select 1 from public.class_posts p where p.id = p_post and p.teacher_id = uid) then
    raise exception 'classroom: not found';
  end if;
  if not coalesce(p_archived, true)
     and exists (select 1 from public.class_posts p where p.id = p_post and p.archived) then
    perform public.check_post_cap(uid);
  end if;
  update public.class_posts p set archived = coalesce(p_archived, true) where p.id = p_post and p.teacher_id = uid;
end $$;

-- The caller's posts. audience / read_count are over the students the post counts for right now (post_audience), so
-- an archived post, or one to an archived class, shows 0.
create function public.teacher_posts()
returns table (post_id uuid, class_id uuid, class_name text, title text, body text, link_url text, pinned boolean,
               archived boolean, created_at timestamptz, updated_at timestamptz, audience int, read_count int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  return query
    select p.id, p.class_id, c.name, p.title, p.body, p.link_url, p.pinned, p.archived, p.created_at, p.updated_at,
           x.n_audience, x.n_read
      from public.class_posts p
      left join public.classes c on c.id = p.class_id
      cross join lateral (
        select count(*)::int as n_audience, count(r.student_id)::int as n_read
          from public.post_audience(p.id) a
          left join public.post_reads r on r.post_id = p.id and r.student_id = a.student_id
         where a.counted) x
     where p.teacher_id = uid
     order by p.archived, p.pinned desc, p.created_at desc, p.id;
end $$;

-- The counted students who haven't read one of the caller's posts, by display name. Other posts look like unknown ones.
create function public.teacher_post_unread(p_post uuid)
returns table (student_id uuid, display_name text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  if not exists (select 1 from public.class_posts p where p.id = p_post and p.teacher_id = uid) then
    raise exception 'classroom: not found';
  end if;
  return query
    select a.student_id, coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1))
      from public.post_audience(p_post) a
      join auth.users u on u.id = a.student_id
      left join public.student_profiles sp on sp.user_id = a.student_id
     where a.counted
       and not exists (select 1 from public.post_reads r where r.post_id = p_post and r.student_id = a.student_id)
     order by 2, 1;
end $$;

-- Renames one of the caller's classes. Same name rule as teacher_create_class (0021) plus 0041's length check.
create function public.teacher_rename_class(p_class uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  if v_name = '' or char_length(v_name) > 120 then raise exception 'classroom: invalid'; end if;
  update public.classes c set name = v_name where c.id = p_class and c.teacher_id = uid;
  if not found then raise exception 'classroom: not found'; end if;
end $$;

-- The caller's teacher name and school. Same checks as set_my_role (name required) plus 0041's length checks.
create function public.update_my_teacher_profile(p_name text, p_school text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid      uuid := auth.uid();
  v_name   text := btrim(coalesce(p_name, ''));
  v_school text := nullif(btrim(coalesce(p_school, '')), '');
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  if v_name = '' or char_length(v_name) > 120 or char_length(v_school) > 200 then raise exception 'classroom: invalid'; end if;
  insert into public.teacher_profiles (user_id, display_name, school) values (uid, v_name, v_school)
  on conflict (user_id) do update set display_name = excluded.display_name, school = excluded.school;
end $$;

-- ───────────── part A student functions ─────────────
-- These act only on rows where the caller is the student: any other account gets nothing back and changes nothing.

-- The caller's visible posts. is_read is true for a post that doesn't count for them (posted before they joined).
create function public.my_posts()
returns table (post_id uuid, teacher_id uuid, class_id uuid, class_name text, title text, body text, link_url text,
               pinned boolean, created_at timestamptz, is_read boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'classroom: not found (not signed in)'; end if;
  if not public.is_role(uid, 'student') then return; end if;
  return query
    select p.id, p.teacher_id, p.class_id, c.name, p.title, p.body, p.link_url, p.pinned, p.created_at,
           (not v.counted) or exists (select 1 from public.post_reads r where r.post_id = p.id and r.student_id = uid)
      from public.visible_posts(uid) v
      join public.class_posts p on p.id = v.post_id
      left join public.classes c on c.id = p.class_id
     order by p.pinned desc, p.created_at desc, p.id;
end $$;

-- Marks visible posts read. Ids the caller can't see (and posts that don't count for them) are ignored.
create function public.mark_posts_read(p_posts uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'classroom: not found (not signed in)'; end if;
  if not public.is_role(uid, 'student') then return; end if;
  insert into public.post_reads (post_id, student_id, teacher_id, read_at)
  select p.id, uid, p.teacher_id, clock_timestamp()
    from public.visible_posts(uid) v
    join public.class_posts p on p.id = v.post_id
   where v.counted and p.id = any (coalesce(p_posts, '{}'::uuid[]))
  on conflict do nothing;
end $$;

-- Leaves one class. The teacher link stays (leave_teacher ends it), and so do read marks and completions.
create function public.leave_class(p_class uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'classroom: not found (not signed in)'; end if;
  if not public.is_role(uid, 'student') then return; end if;
  delete from public.class_members m where m.class_id = p_class and m.student_id = uid;
end $$;

-- 0041's my_tasks plus teacher_id, the class (class_id null = a private one-student task), done_at and the task's
-- anchor (part C). The student always gets the saved label; anchor_available is anchor_visible() (part B), null for a
-- task without an anchor. The live client reads columns by name, so the wider result doesn't break it. (PL/pgSQL
-- resolves anchor_visible and the anchor columns when it runs, so defining this before parts B and C is fine.)
drop function public.my_tasks();
create function public.my_tasks()
returns table (task_id uuid, teacher_id uuid, teacher_name text, class_id uuid, class_name text, title text,
               details text, due_on date, done boolean, done_at timestamptz,
               anchor_kind text, anchor_ref text, anchor_label text, anchor_available boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  return query
    select t.id, t.teacher_id, tp.display_name, t.class_id, c.name, t.title, t.details, t.due_on,
           tc.done_at is not null, tc.done_at,
           t.anchor_kind, t.anchor_ref, t.anchor_label,
           case when t.anchor_kind is not null then public.anchor_visible(t.teacher_id, uid, t.anchor_kind, t.anchor_ref) end
      from public.visible_tasks(uid) t
      join public.teacher_profiles tp on tp.user_id = t.teacher_id
      left join public.classes c on c.id = t.class_id
      left join public.task_completions tc on tc.task_id = t.id and tc.student_id = uid
     order by t.due_on nulls last, t.created_at, t.id;
end $$;

-- Part A client-callable functions: signed-in users only.
do $$
declare f text;
begin
  foreach f in array array[
    'teacher_create_post(uuid, text, text, text, boolean)', 'teacher_update_post(uuid, text, text, text, boolean)',
    'teacher_archive_post(uuid, boolean)', 'teacher_posts()', 'teacher_post_unread(uuid)',
    'teacher_rename_class(uuid, text)', 'update_my_teacher_profile(text, text)',
    'my_posts()', 'mark_posts_read(uuid[])', 'leave_class(uuid)', 'my_tasks()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ═════════════ part B: anchors, conversations, messages, unread counts ═════════════

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  teacher_id      uuid not null,
  student_id      uuid not null,
  anchor_kind     text not null,
  anchor_ref      text,
  anchor_label    text check (anchor_label is null or (btrim(anchor_label) <> '' and char_length(anchor_label) <= 120)),
  status          text not null default 'open' check (status in ('open', 'resolved')),
  started_by      text not null check (started_by in ('teacher', 'student')),
  created_at      timestamptz not null default clock_timestamp(),
  last_message_at timestamptz not null default clock_timestamp(),
  teacher_read_at timestamptz,
  student_read_at timestamptz,
  -- The format part of validateAnchor (web/lib/anchors.ts) for the phase-1 kinds; whether the item exists and may be
  -- seen is anchor_visible()'s job. coalesce: a null anywhere fails the check instead of passing it.
  constraint conversations_anchor_format check (coalesce(
       (anchor_kind = 'general' and anchor_ref is null)
    or (anchor_ref <> '' and char_length(anchor_ref) <= 200 and (
            (anchor_kind = 'section'  and anchor_ref in ('colleges', 'essays', 'activities', 'profile'))
         or (anchor_kind = 'profile'  and anchor_ref in ('gpa', 'test', 'english', 'regions'))
         or (anchor_kind = 'college'  and anchor_ref ~ '^[a-z0-9-]+$')
         or (anchor_kind = 'essay'    and anchor_ref ~ '^(ps|uc:[1-8]|supp:[a-z0-9-]+:[^[:space:]]+)$')
         or (anchor_kind = 'activity' and anchor_ref not like 'legacy-%')
         or (anchor_kind = 'task'     and anchor_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))),
    false)),
  -- A conversation only exists for a linked pair and goes away (with its messages) when the link ends.
  foreign key (teacher_id, student_id) references public.teacher_links (teacher_id, student_id) on delete cascade
);
-- One conversation per pair and item; general questions can be many.
create unique index conversations_one_per_item on public.conversations
  (teacher_id, student_id, anchor_kind, (coalesce(anchor_ref, ''))) where anchor_kind <> 'general';
create index on public.conversations (teacher_id, last_message_at desc);
create index on public.conversations (student_id, last_message_at desc);

-- A deleted message keeps its row (and place) with body null.
create table public.conversation_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author          text not null check (author in ('teacher', 'student')),
  body            text check (body is null or (btrim(body) <> '' and char_length(body) <= 2000)),
  deleted_at      timestamptz,
  created_at      timestamptz not null default clock_timestamp(),
  check ((body is null) = (deleted_at is not null))
);
create index on public.conversation_messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
revoke all on table public.conversations, public.conversation_messages from public, anon, authenticated;

create trigger row_cap before insert on public.conversations for each row execute function public.enforce_row_cap('teacher_id', '20000');

-- ───────────── part B helpers (not callable by clients) ─────────────

-- Whether an anchor points at an item this teacher may see for this linked student right now (spec §6). The single
-- check used before saving an anchor (start_conversation, create_task) and for anchor_available in every list:
--   general   ref null                          section  colleges | activities | profile, or essays while shared
--   college   a slug on the student's list      profile  gpa | test | english | regions
--             (as teacher_student, 0023)
--   essay     while essays are shared: ps | uc:1..uc:8 | supp:<college slug>:<essay id>, that college on the list
--             and its checklist.essay_list holding an entry with that id
--   activity  an entry id stored in student_profiles.activities (never a made-up legacy-<list>-<i>)
--   task      the id of one of this teacher's tasks the student can see (visible_tasks)
-- The format part mirrors validateAnchor (web/lib/anchors.ts) and the anchor CHECK constraints.
create function public.anchor_visible(p_teacher uuid, p_student uuid, p_kind text, p_ref text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_share boolean;
  v_slug  text;
  v_id    text;
begin
  if not public.is_linked(p_teacher, p_student) then return false; end if;
  select l.share_essays into v_share from public.teacher_links l where l.teacher_id = p_teacher and l.student_id = p_student;
  if p_kind = 'general' then return p_ref is null; end if;
  if p_ref is null or p_ref = '' or char_length(p_ref) > 200 then return false; end if;
  case p_kind
    when 'section' then
      return p_ref in ('colleges', 'activities', 'profile') or (p_ref = 'essays' and v_share);
    when 'profile' then
      return p_ref in ('gpa', 'test', 'english', 'regions');
    when 'college' then
      return exists (select 1 from public.student_colleges sc
                       left join public.institutions i on i.id = sc.institution_id
                      where sc.user_id = p_student and coalesce(i.slug, 'custom-' || sc.id::text) = p_ref);
    when 'essay' then
      if not v_share then return false; end if;
      if p_ref = 'ps' or p_ref ~ '^uc:[1-8]$' then return true; end if;
      if p_ref !~ '^supp:[a-z0-9-]+:[^[:space:]]+$' then return false; end if;
      v_slug := substring(p_ref from '^supp:([a-z0-9-]+):');
      v_id := substring(p_ref from '^supp:[a-z0-9-]+:(.+)$');
      return exists (select 1 from public.student_colleges sc
                       left join public.institutions i on i.id = sc.institution_id
                      where sc.user_id = p_student and coalesce(i.slug, 'custom-' || sc.id::text) = v_slug
                        and jsonb_path_exists(sc.checklist, '$.essay_list[*] ? (@.id == $id)', jsonb_build_object('id', v_id)));
    when 'activity' then
      if p_ref like 'legacy-%' then return false; end if;
      return exists (select 1 from public.student_profiles sp
                      where sp.user_id = p_student
                        and jsonb_path_exists(sp.activities, '$.** ? (@.id == $id)', jsonb_build_object('id', p_ref)));
    when 'task' then
      -- Format first, in its own statement, so the uuid cast below never sees a malformed ref.
      if p_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
      return exists (select 1 from public.visible_tasks(p_student) t where t.id = p_ref::uuid and t.teacher_id = p_teacher);
    else
      return false;
  end case;
end $$;

-- The caller's side ('teacher' or 'student') in one conversation, with the role and the link checked. Anything else
-- raises 'classroom: not found', so other people's conversations look like unknown ones.
create function public.conversation_side(p_conversation uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  uid       uuid := auth.uid();
  v_teacher uuid;
  v_student uuid;
begin
  if uid is null then raise exception 'classroom: not found (not signed in)'; end if;
  select c.teacher_id, c.student_id into v_teacher, v_student from public.conversations c where c.id = p_conversation;
  if v_teacher is not null and public.is_linked(v_teacher, v_student) then
    if uid = v_teacher and public.is_role(uid, 'teacher') then return 'teacher'; end if;
    if uid = v_student and public.is_role(uid, 'student') then return 'student'; end if;
  end if;
  raise exception 'classroom: not found';
end $$;

-- At most 300 messages from a teacher and 50 from a student in any 24 hours, over all their conversations (deleted
-- ones count). The advisory lock serialises one account's sends.
create function public.check_message_rate(p_user uuid, p_side text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare n bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('classroom_messages:' || p_user::text, 0));
  if p_side = 'teacher' then
    select count(*) into n
      from public.conversation_messages m join public.conversations c on c.id = m.conversation_id
     where c.teacher_id = p_user and m.author = 'teacher' and m.created_at > clock_timestamp() - interval '1 day';
    if n >= 300 then raise exception 'classroom: rate'; end if;
  else
    select count(*) into n
      from public.conversation_messages m join public.conversations c on c.id = m.conversation_id
     where c.student_id = p_user and m.author = 'student' and m.created_at > clock_timestamp() - interval '1 day';
    if n >= 50 then raise exception 'classroom: rate'; end if;
  end if;
end $$;

-- Adds a checked message from one side, reopens the conversation and marks it read for its author up to that message.
create function public.add_message(p_conversation uuid, p_side text, p_body text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_at timestamptz := clock_timestamp();
begin
  insert into public.conversation_messages (conversation_id, author, body, created_at)
  values (p_conversation, p_side, p_body, v_at)
  returning id into v_id;
  update public.conversations c
     set last_message_at = v_at, status = 'open',
         teacher_read_at = case when p_side = 'teacher' then v_at else c.teacher_read_at end,
         student_read_at = case when p_side = 'student' then v_at else c.student_read_at end
   where c.id = p_conversation;
  return v_id;
end $$;

-- The other side's messages, not deleted, newer than the reader's read time.
create function public.unread_messages(p_conversation uuid, p_reader text, p_read_at timestamptz) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.conversation_messages m
   where m.conversation_id = p_conversation and m.author <> p_reader and m.deleted_at is null
     and m.created_at > coalesce(p_read_at, '-infinity'::timestamptz)
$$;

revoke all on function public.anchor_visible(uuid, uuid, text, text), public.conversation_side(uuid),
  public.check_message_rate(uuid, text), public.add_message(uuid, text, text),
  public.unread_messages(uuid, text, timestamptz) from public, anon, authenticated;

-- ───────────── part B client functions (both roles) ─────────────

-- Starts a conversation with the first message. p_other is the student for a teacher caller and the teacher for a
-- student caller. The anchor must be visible to that teacher (anchor_visible). A conversation about an item that the
-- pair already has gets the message instead (and reopens); a general one is always new. Returns the conversation id.
-- At most 100 conversations per pair.
create function public.start_conversation(p_other uuid, p_kind text, p_ref text, p_label text, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := auth.uid();
  v_side  text;
  v_t     uuid;
  v_s     uuid;
  v_ref   text := case when p_kind = 'task' then lower(p_ref) else p_ref end;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_body  text := btrim(coalesce(p_body, ''));
  v_id    uuid;
  v_at    timestamptz;
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'classroom: not found (not signed in)'; end if;
  if public.is_role(uid, 'teacher') then
    v_side := 'teacher'; v_t := uid; v_s := p_other;
  elsif public.is_role(uid, 'student') then
    v_side := 'student'; v_t := p_other; v_s := uid;
  else
    raise exception 'classroom: not found (no role)';
  end if;
  if p_other is null or not public.is_linked(v_t, v_s) then raise exception 'classroom: not linked'; end if;
  if v_body = '' or char_length(v_body) > 2000 or char_length(v_label) > 120 then raise exception 'classroom: invalid'; end if;
  if not public.anchor_visible(v_t, v_s, p_kind, v_ref) then raise exception 'classroom: invalid'; end if;
  perform public.check_message_rate(uid, v_side);
  -- One pair at a time, so the item lookup and the 100-per-pair count can't race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('conversations:' || v_t::text || ':' || v_s::text, 0));
  if p_kind <> 'general' then
    select c.id into v_id from public.conversations c
     where c.teacher_id = v_t and c.student_id = v_s and c.anchor_kind = p_kind
       and coalesce(c.anchor_ref, '') = coalesce(v_ref, '');
  end if;
  if v_id is null then
    if (select count(*) from public.conversations c where c.teacher_id = v_t and c.student_id = v_s) >= 100 then
      raise exception 'classroom: limit';
    end if;
    v_at := clock_timestamp();
    insert into public.conversations (teacher_id, student_id, anchor_kind, anchor_ref, anchor_label, started_by,
                                      created_at, last_message_at)
    values (v_t, v_s, p_kind, v_ref, v_label, v_side, v_at, v_at)
    returning id into v_id;
  end if;
  perform public.add_message(v_id, v_side, v_body);
  return v_id;
end $$;

-- Adds a message to one of the caller's conversations (reopening it). Returns the message id.
create function public.send_message(p_conversation uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := auth.uid();
  v_side text;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public.refuse_oauth_client();
  v_side := public.conversation_side(p_conversation);
  if v_body = '' or char_length(v_body) > 2000 then raise exception 'classroom: invalid'; end if;
  perform public.check_message_rate(uid, v_side);
  return public.add_message(p_conversation, v_side, v_body);
end $$;

-- Deletes one of the caller's own messages: the row stays, without its body, for both sides.
create function public.delete_message(p_message uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_conversation uuid;
  v_author       text;
begin
  perform public.refuse_oauth_client();
  select m.conversation_id, m.author into v_conversation, v_author
    from public.conversation_messages m where m.id = p_message;
  if v_conversation is null then raise exception 'classroom: not found'; end if;
  if public.conversation_side(v_conversation) <> v_author then raise exception 'classroom: not found'; end if;
  update public.conversation_messages m set body = null, deleted_at = clock_timestamp()
   where m.id = p_message and m.deleted_at is null;
end $$;

-- Either side may resolve or reopen a conversation.
create function public.set_conversation_status(p_conversation uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.refuse_oauth_client();
  perform public.conversation_side(p_conversation);
  if p_status is null or p_status not in ('open', 'resolved') then raise exception 'classroom: invalid'; end if;
  update public.conversations c set status = p_status where c.id = p_conversation;
end $$;

-- Marks the conversation read for the caller's side. The time is never shown to the other side.
create function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_side text;
begin
  perform public.refuse_oauth_client();
  v_side := public.conversation_side(p_conversation);
  if v_side = 'teacher' then
    update public.conversations c set teacher_read_at = clock_timestamp() where c.id = p_conversation;
  else
    update public.conversations c set student_read_at = clock_timestamp() where c.id = p_conversation;
  end if;
end $$;

-- The caller's conversations, newest first. A teacher sees the student's display name (as teacher_roster) and the
-- saved anchor label only while anchor_visible() is true; a student sees the teacher's name and always the label.
-- anchor_available is anchor_visible() for both sides (a student's chip can say "no longer shared").
-- last_author / last_body are the newest message's (body null when it was deleted); unread counts the other side's
-- messages that aren't deleted and are newer than the caller's read time. No read times are returned.
create function public.my_conversations()
returns table (conversation_id uuid, other_id uuid, other_name text, anchor_kind text, anchor_ref text, anchor_label text,
               anchor_available boolean, status text, started_by text, last_message_at timestamptz, last_author text,
               last_body text, unread int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'classroom: not found (not signed in)'; end if;
  if public.is_role(uid, 'teacher') then
    return query
      select c.id, c.student_id, coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)),
             c.anchor_kind, c.anchor_ref, case when av.ok then c.anchor_label end, av.ok,
             c.status, c.started_by, c.last_message_at, lm.author, lm.body,
             public.unread_messages(c.id, 'teacher', c.teacher_read_at)
        from public.conversations c
        join auth.users u on u.id = c.student_id
        left join public.student_profiles sp on sp.user_id = c.student_id
        cross join lateral (select public.anchor_visible(c.teacher_id, c.student_id, c.anchor_kind, c.anchor_ref) as ok
                             offset 0) av
        left join lateral (select m.author, m.body from public.conversation_messages m
                            where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1) lm on true
       where c.teacher_id = uid
       order by c.last_message_at desc, c.id;
  elsif public.is_role(uid, 'student') then
    return query
      select c.id, c.teacher_id, tp.display_name,
             c.anchor_kind, c.anchor_ref, c.anchor_label,
             public.anchor_visible(c.teacher_id, c.student_id, c.anchor_kind, c.anchor_ref),
             c.status, c.started_by, c.last_message_at, lm.author, lm.body,
             public.unread_messages(c.id, 'student', c.student_read_at)
        from public.conversations c
        join public.teacher_profiles tp on tp.user_id = c.teacher_id
        left join lateral (select m.author, m.body from public.conversation_messages m
                            where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1) lm on true
       where c.student_id = uid
       order by c.last_message_at desc, c.id;
  end if;
end $$;

-- The messages of one of the caller's conversations, oldest first. A deleted one has body null.
create function public.conversation_messages_for(p_conversation uuid)
returns table (message_id uuid, author text, body text, deleted boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.refuse_oauth_client();
  perform public.conversation_side(p_conversation);
  return query
    select m.id, m.author, m.body, m.deleted_at is not null, m.created_at
      from public.conversation_messages m
     where m.conversation_id = p_conversation
     order by m.created_at, m.id;
end $$;

-- One row of badge counts. Student: linked teachers, unread posts that count for them, conversations with unread
-- messages. Teacher: 0, 0, conversations that need a reply (the newest message is the student's and is unread).
create function public.classroom_unread()
returns table (teachers int, posts int, conversations int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'classroom: not found (not signed in)'; end if;
  if public.is_role(uid, 'teacher') then
    return query
      select 0, 0, count(*)::int
        from public.conversations c
       where c.teacher_id = uid
         and (select m.author from public.conversation_messages m
               where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1) = 'student'
         and public.unread_messages(c.id, 'teacher', c.teacher_read_at) > 0;
  elsif public.is_role(uid, 'student') then
    return query
      select (select count(*)::int from public.teacher_links l where l.student_id = uid),
             (select count(*)::int from public.visible_posts(uid) v
               where v.counted
                 and not exists (select 1 from public.post_reads r where r.post_id = v.post_id and r.student_id = uid)),
             (select count(*)::int from public.conversations c
               where c.student_id = uid and public.unread_messages(c.id, 'student', c.student_read_at) > 0);
  else
    return query select 0, 0, 0;
  end if;
end $$;

-- Part B client-callable functions: signed-in users only.
do $$
declare f text;
begin
  foreach f in array array[
    'start_conversation(uuid, text, text, text, text)', 'send_message(uuid, text)', 'delete_message(uuid)',
    'set_conversation_status(uuid, text)', 'mark_conversation_read(uuid)', 'my_conversations()',
    'conversation_messages_for(uuid)', 'classroom_unread()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ═════════════ part C: anchors on private notes and private tasks ═════════════

-- Notes: both null = a general note. Format only, no label (spec §6: a note is the teacher's own words, shown only on
-- the student detail page, which works the label out itself). The "own notes" policy (0024) is unchanged and the
-- teacher keeps writing the table directly; the CHECK uses only built-in operators, so it runs for those writes too.
-- The format is the one on conversations (part B), i.e. validateAnchor in web/lib/anchors.ts.
alter table public.teacher_notes
  add column anchor_kind text,
  add column anchor_ref  text,
  add constraint teacher_notes_anchor_format check ((anchor_kind is null and anchor_ref is null) or coalesce(
       (anchor_kind = 'general' and anchor_ref is null)
    or (anchor_ref <> '' and char_length(anchor_ref) <= 200 and (
            (anchor_kind = 'section'  and anchor_ref in ('colleges', 'essays', 'activities', 'profile'))
         or (anchor_kind = 'profile'  and anchor_ref in ('gpa', 'test', 'english', 'regions'))
         or (anchor_kind = 'college'  and anchor_ref ~ '^[a-z0-9-]+$')
         or (anchor_kind = 'essay'    and anchor_ref ~ '^(ps|uc:[1-8]|supp:[a-z0-9-]+:[^[:space:]]+)$')
         or (anchor_kind = 'activity' and anchor_ref not like 'legacy-%')
         or (anchor_kind = 'task'     and anchor_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))),
    false));

-- Tasks: only one-student (private) tasks carry an anchor, always with a label of 1-120 characters. Same format check.
alter table public.teacher_tasks
  add column anchor_kind  text,
  add column anchor_ref   text,
  add column anchor_label text,
  add constraint teacher_tasks_anchor_format check ((anchor_kind is null and anchor_ref is null) or coalesce(
       (anchor_kind = 'general' and anchor_ref is null)
    or (anchor_ref <> '' and char_length(anchor_ref) <= 200 and (
            (anchor_kind = 'section'  and anchor_ref in ('colleges', 'essays', 'activities', 'profile'))
         or (anchor_kind = 'profile'  and anchor_ref in ('gpa', 'test', 'english', 'regions'))
         or (anchor_kind = 'college'  and anchor_ref ~ '^[a-z0-9-]+$')
         or (anchor_kind = 'essay'    and anchor_ref ~ '^(ps|uc:[1-8]|supp:[a-z0-9-]+:[^[:space:]]+)$')
         or (anchor_kind = 'activity' and anchor_ref not like 'legacy-%')
         or (anchor_kind = 'task'     and anchor_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))),
    false)),
  add constraint teacher_tasks_anchor_label check (
       (anchor_kind is null and anchor_label is null)
    or (anchor_kind is not null and anchor_label is not null and btrim(anchor_label) <> '' and char_length(anchor_label) <= 120)),
  add constraint teacher_tasks_anchor_one_student check (anchor_kind is null or student_id is not null);

-- 0028's create_task plus an optional anchor, allowed only on a one-student task, with a label, and only while
-- anchor_visible() (part B); a refused anchor raises 'classroom: invalid'. The new parameters default to null, so
-- existing callers (web/lib/tasks-api.ts, by name) keep working. Now also refuses OAuth clients first. The other
-- errors keep 0028's wording.
drop function public.create_task(text, text, date, uuid, uuid);
create function public.create_task(p_title text, p_details text default null, p_due_on date default null,
                                   p_class uuid default null, p_student uuid default null,
                                   p_anchor_kind text default null, p_anchor_ref text default null,
                                   p_anchor_label text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := auth.uid();
  tid     uuid;
  v_ref   text := case when p_anchor_kind = 'task' then lower(p_anchor_ref) else p_anchor_ref end;
  v_label text := nullif(btrim(coalesce(p_anchor_label, '')), '');
  v_at    timestamptz;
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if (p_class is null) = (p_student is null) then raise exception 'choose a class or a student'; end if;
  if p_class is not null and not exists (select 1 from public.classes c
                                          where c.id = p_class and c.teacher_id = uid and not c.archived) then
    raise exception 'class not found';
  end if;
  if p_student is not null and not public.is_linked(uid, p_student) then raise exception 'student not found'; end if;
  perform public.check_task_text(p_title, p_details);
  if p_anchor_kind is null then
    if v_ref is not null or v_label is not null then raise exception 'classroom: invalid'; end if;
  elsif p_student is null or v_label is null or char_length(v_label) > 120
        or not public.anchor_visible(uid, p_student, p_anchor_kind, v_ref) then
    raise exception 'classroom: invalid';
  end if;
  perform public.check_task_cap(uid);
  v_at := clock_timestamp();
  insert into public.teacher_tasks (teacher_id, class_id, student_id, title, details, due_on,
                                    anchor_kind, anchor_ref, anchor_label, created_at, updated_at)
  values (uid, p_class, p_student, btrim(p_title), nullif(btrim(coalesce(p_details, '')), ''), p_due_on,
          p_anchor_kind, v_ref, v_label, v_at, v_at)
  returning id into tid;
  return tid;
end $$;

-- 0028's list_my_tasks plus the anchor. The saved label comes back only while anchor_visible() is true;
-- anchor_available is null for a task without an anchor. Now also refuses OAuth clients first.
drop function public.list_my_tasks();
create function public.list_my_tasks()
returns table (task_id uuid, class_id uuid, class_name text, class_archived boolean, student_id uuid, student_name text,
               title text, details text, due_on date, archived boolean, created_at timestamptz, done_count int,
               total_count int, anchor_kind text, anchor_ref text, anchor_label text, anchor_available boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  return query
    select t.id, t.class_id, c.name, coalesce(c.archived, false), t.student_id,
           case when t.student_id is null then null
                else coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)) end,
           t.title, t.details, t.due_on, t.archived, t.created_at,
           (select count(*)::int from public.task_audience(t.id) as a(sid)
             where exists (select 1 from public.task_completions tc where tc.task_id = t.id and tc.student_id = a.sid)),
           (select count(*)::int from public.task_audience(t.id)),
           t.anchor_kind, t.anchor_ref, case when av.ok then t.anchor_label end, av.ok
      from public.teacher_tasks t
      left join public.classes c on c.id = t.class_id
      left join auth.users u on u.id = t.student_id
      left join public.student_profiles sp on sp.user_id = t.student_id
      cross join lateral (select case when t.anchor_kind is not null
                                      then public.anchor_visible(uid, t.student_id, t.anchor_kind, t.anchor_ref) end as ok
                           offset 0) av
     where t.teacher_id = uid
     order by t.archived, t.due_on nulls last, t.created_at desc, t.id;
end $$;

-- The caller's tasks that reach one linked student right now (private and class tasks, as visible_tasks), with that
-- student's done flag. The saved label comes back only while anchor_visible() is true.
create function public.teacher_student_tasks(p_student uuid)
returns table (task_id uuid, title text, details text, due_on date, class_id uuid, class_name text, anchor_kind text,
               anchor_ref text, anchor_label text, anchor_available boolean, done boolean, done_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  if not public.is_linked(uid, p_student) then raise exception 'classroom: not linked'; end if;
  return query
    select t.id, t.title, t.details, t.due_on, t.class_id, c.name,
           t.anchor_kind, t.anchor_ref, case when av.ok then t.anchor_label end, av.ok,
           tc.done_at is not null, tc.done_at
      from public.visible_tasks(p_student) t
      left join public.classes c on c.id = t.class_id
      left join public.task_completions tc on tc.task_id = t.id and tc.student_id = p_student
      cross join lateral (select case when t.anchor_kind is not null
                                      then public.anchor_visible(uid, p_student, t.anchor_kind, t.anchor_ref) end as ok
                           offset 0) av
     where t.teacher_id = uid
     order by t.due_on nulls last, t.created_at, t.id;
end $$;

-- Part C client-callable functions: signed-in users only (create_task and list_my_tasks were dropped above, so
-- their grants are given again).
do $$
declare f text;
begin
  foreach f in array array[
    'create_task(text, text, date, uuid, uuid, text, text, text)', 'list_my_tasks()', 'teacher_student_tasks(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
