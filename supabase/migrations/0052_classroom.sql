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

-- 0041's my_tasks plus teacher_id, the class (class_id null = a private one-student task) and done_at. The live
-- client reads columns by name, so the wider result doesn't break it.
drop function public.my_tasks();
create function public.my_tasks()
returns table (task_id uuid, teacher_id uuid, teacher_name text, class_id uuid, class_name text, title text,
               details text, due_on date, done boolean, done_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  return query
    select t.id, t.teacher_id, tp.display_name, t.class_id, c.name, t.title, t.details, t.due_on,
           tc.done_at is not null, tc.done_at
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
