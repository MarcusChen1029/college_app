-- Classroom, Google Classroom style (spec docs/superpowers/specs/2026-11-04-classroom-google-style-design.md §5;
-- plan docs/superpowers/plans/2026-11-04-classroom-google-style.md, Task 2): a colour theme per class, a topic per
-- task, and an optional note and link a student adds when marking a task done.
--
-- Same pattern as 0052: no new tables, policies or table grants. The new task and completion columns are read and
-- written only through the SECURITY DEFINER functions below (both tables stay closed to clients, 0028). classes.theme
-- is like classes.name: its teacher reads it under "own classes read" and could also update it directly under "own
-- classes update" (0021); the column checks below hold for every write. Each new or changed client function refuses
-- AI-connector tokens first
-- (refuse_oauth_client), then checks auth.uid(), the caller's role and the teacher<->student link as before. This closes
-- the follow-up left from 0028: update_task, archive_task and task_progress now refuse AI-connector tokens with the same
-- error as the others (is_role() already failed for them since 0041, with 'teachers only').
--
-- Who sees what
--   * classes.theme (ink, coral, mint, lilac, sun or sky; null = the client derives one from the class id, themeFor in
--     web/lib/class-theme.ts): set by the class's teacher (teacher_set_class_theme). A member sees it in my_teachers(),
--     next to the class's school year and archived flag, all aligned index-for-index with class_ids.
--   * teacher_tasks.topic (1-60 characters, null = no topic): whoever already sees the task (list_my_tasks, my_tasks,
--     teacher_student_tasks).
--   * task_completions.note (at most 500 characters) and link (http(s), at most 500): written only by the student, on
--     their own completion (set_task_done); read back by that student (my_tasks) and by that task's teacher
--     (task_progress, teacher_student_tasks), never by other students. Marking done again keeps done_at and replaces
--     note and link; undo (p_done false) deletes the completion and both with it; a link ending deletes completions as
--     before (0028).
-- Limits are mirrored in web/lib/classwork.ts (DONE_LIMITS, validateDone), web/lib/tasks.ts (validateTask, topic 1-60)
-- and web/lib/class-theme.ts (CLASS_THEMES); the link format is class_posts.link_url's (0052). Keep them in step. Text
-- is trimmed and empty becomes null, as in the client. New errors are 'classroom: invalid' (a bad theme, topic, note or
-- link) and 'classroom: not found' (a class that isn't the caller's); every existing error keeps its wording. Times
-- written here use clock_timestamp().
-- Live code between applying 0053 and deploying the web keeps working: the new parameters default to null and the new
-- columns are read by name. Its update_task call (no p_topic) clears a topic, but no topic exists before the new web
-- code ships.
-- Smoke test: supabase/patches/2026-11-04_classroom_gc_smoke_test.sql.

-- ═════════════ part A: columns ═════════════

alter table public.classes
  add column theme text
    constraint classes_theme check (theme is null or theme in ('ink', 'coral', 'mint', 'lilac', 'sun', 'sky'));

alter table public.teacher_tasks
  add column topic text
    constraint teacher_tasks_topic check (topic is null or (btrim(topic) <> '' and char_length(topic) <= 60));

alter table public.task_completions
  add column note text
    constraint task_completions_note check (note is null or (btrim(note) <> '' and char_length(note) <= 500)),
  add column link text
    constraint task_completions_link
      check (link is null or (char_length(link) <= 500 and link ~* '^https?://[^[:space:]<>"]+$'));

-- ═════════════ part B: class themes ═════════════

-- Sets or (p_theme null) clears the theme of one of the caller's classes, archived or not. Same checks and errors as
-- teacher_rename_class (0052).
create function public.teacher_set_class_theme(p_class uuid, p_theme text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  if p_theme is not null and p_theme not in ('ink', 'coral', 'mint', 'lilac', 'sun', 'sky') then
    raise exception 'classroom: invalid';
  end if;
  update public.classes c set theme = p_theme where c.id = p_class and c.teacher_id = uid;
  if not found then raise exception 'classroom: not found'; end if;
end $$;

-- 0052's my_teachers plus class_themes, class_years (school_year) and class_archived. Every array comes from the same
-- rows in one aggregation pass with the same order (name, then id), so index i of each array is the same class as
-- class_ids[i]; a class with no theme or year has a null there. The rows (every class of that teacher the caller is a
-- member of, archived ones too) and the checks are 0052's. The live client reads columns by name.
drop function public.my_teachers();
create function public.my_teachers()
returns table (teacher_id uuid, display_name text, school text, linked_at timestamptz, share_essays boolean,
               class_names text[], class_ids uuid[], class_themes text[], class_years text[], class_archived boolean[])
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  return query
    select l.teacher_id, tp.display_name, tp.school, l.created_at, l.share_essays, k.names, k.ids, k.themes, k.years,
           k.archived_flags
    from public.teacher_links l
    join public.teacher_profiles tp on tp.user_id = l.teacher_id
    cross join lateral (
      select coalesce(array_agg(c.name order by c.name, c.id), '{}') as names,
             coalesce(array_agg(c.id order by c.name, c.id), '{}') as ids,
             coalesce(array_agg(c.theme order by c.name, c.id), '{}') as themes,
             coalesce(array_agg(c.school_year order by c.name, c.id), '{}') as years,
             coalesce(array_agg(c.archived order by c.name, c.id), '{}') as archived_flags
        from public.class_members m
        join public.classes c on c.id = m.class_id
       where m.student_id = uid and c.teacher_id = l.teacher_id
    ) k
    where l.student_id = uid
    order by l.created_at;
end $$;

-- ═════════════ part C: task topics ═════════════

-- 0052's create_task plus an optional topic (trimmed; blank = none; more than 60 characters raises
-- 'classroom: invalid'). p_topic defaults to null, so existing callers keep working.
drop function public.create_task(text, text, date, uuid, uuid, text, text, text);
create function public.create_task(p_title text, p_details text default null, p_due_on date default null,
                                   p_class uuid default null, p_student uuid default null,
                                   p_anchor_kind text default null, p_anchor_ref text default null,
                                   p_anchor_label text default null, p_topic text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := auth.uid();
  tid     uuid;
  v_ref   text := case when p_anchor_kind = 'task' then lower(p_anchor_ref) else p_anchor_ref end;
  v_label text := nullif(btrim(coalesce(p_anchor_label, '')), '');
  v_topic text := nullif(btrim(coalesce(p_topic, '')), '');
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
  if char_length(v_topic) > 60 then raise exception 'classroom: invalid'; end if;
  if p_anchor_kind is null then
    if v_ref is not null or v_label is not null then raise exception 'classroom: invalid'; end if;
  elsif p_student is null or v_label is null or char_length(v_label) > 120
        or not public.anchor_visible(uid, p_student, p_anchor_kind, v_ref) then
    raise exception 'classroom: invalid';
  end if;
  perform public.check_task_cap(uid);
  v_at := clock_timestamp();
  insert into public.teacher_tasks (teacher_id, class_id, student_id, title, details, due_on,
                                    anchor_kind, anchor_ref, anchor_label, topic, created_at, updated_at)
  values (uid, p_class, p_student, btrim(p_title), nullif(btrim(coalesce(p_details, '')), ''), p_due_on,
          p_anchor_kind, v_ref, v_label, v_topic, v_at, v_at)
  returning id into tid;
  return tid;
end $$;

-- 0028's update_task plus the topic (null or blank = no topic; the new client always sends it) and the OAuth refusal.
-- The target and the anchor still can't change (make a new task instead).
drop function public.update_task(uuid, text, text, date);
create function public.update_task(p_task uuid, p_title text, p_details text default null, p_due_on date default null,
                                   p_topic text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := auth.uid();
  v_topic text := nullif(btrim(coalesce(p_topic, '')), '');
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  perform public.check_task_text(p_title, p_details);
  if char_length(v_topic) > 60 then raise exception 'classroom: invalid'; end if;
  update public.teacher_tasks
     set title = btrim(p_title), details = nullif(btrim(coalesce(p_details, '')), ''), due_on = p_due_on, topic = v_topic
   where id = p_task and teacher_id = uid;
  if not found then raise exception 'task not found'; end if;
end $$;

-- 0028's archive_task plus the OAuth refusal. Same signature, so it is replaced in place (its grants are kept, and given
-- again below).
create or replace function public.archive_task(p_task uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if not exists (select 1 from public.teacher_tasks where id = p_task and teacher_id = uid) then raise exception 'task not found'; end if;
  if not coalesce(p_archived, true) then perform public.check_task_cap(uid); end if;
  update public.teacher_tasks set archived = coalesce(p_archived, true) where id = p_task and teacher_id = uid;
end $$;

-- 0052's list_my_tasks plus topic.
drop function public.list_my_tasks();
create function public.list_my_tasks()
returns table (task_id uuid, class_id uuid, class_name text, class_archived boolean, student_id uuid, student_name text,
               title text, details text, due_on date, archived boolean, created_at timestamptz, done_count int,
               total_count int, anchor_kind text, anchor_ref text, anchor_label text, anchor_available boolean,
               topic text)
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
           t.anchor_kind, t.anchor_ref, case when av.ok then t.anchor_label end, av.ok, t.topic
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

-- ═════════════ part D: done notes and links ═════════════

-- 0041's set_task_done plus an optional note and link. Done: inserts the completion (done_at = clock_timestamp()),
-- or, when the caller already has one, replaces its note and link and keeps done_at. Not done: deletes the completion,
-- note and link with it. Note and link are trimmed (blank = none) and checked only when marking done: note at most 500,
-- link http(s) and at most 500, else 'classroom: invalid'. Only the caller's own row is ever touched
-- (student_id = auth.uid()). Tasks the caller can't see look like unknown ones, as before.
drop function public.set_task_done(uuid, boolean);
create function public.set_task_done(p_task uuid, p_done boolean, p_note text default null, p_link text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := auth.uid();
  tid    uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  select t.teacher_id into tid from public.visible_tasks(uid) t where t.id = p_task;
  if tid is null then raise exception 'task not found'; end if;
  if coalesce(p_done, true) then
    if char_length(v_note) > 500 or char_length(v_link) > 500 or v_link !~* '^https?://[^[:space:]<>"]+$' then
      raise exception 'classroom: invalid';
    end if;
    insert into public.task_completions (task_id, student_id, teacher_id, done_at, note, link)
    values (p_task, uid, tid, clock_timestamp(), v_note, v_link)
    on conflict (task_id, student_id) do update set note = excluded.note, link = excluded.link;
  else
    delete from public.task_completions where task_id = p_task and student_id = uid;
  end if;
end $$;

-- 0028's task_progress plus each student's note and link, and the OAuth refusal.
drop function public.task_progress(uuid);
create function public.task_progress(p_task uuid)
returns table (student_id uuid, display_name text, done boolean, done_at timestamptz, note text, link text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if not exists (select 1 from public.teacher_tasks where id = p_task and teacher_id = uid) then raise exception 'task not found'; end if;
  return query
    select a.sid,
           coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)),
           tc.done_at is not null,
           tc.done_at,
           tc.note,
           tc.link
      from public.task_audience(p_task) as a(sid)
      join auth.users u on u.id = a.sid
      left join public.student_profiles sp on sp.user_id = a.sid
      left join public.task_completions tc on tc.task_id = p_task and tc.student_id = a.sid
     order by 2, 1;
end $$;

-- 0052's teacher_student_tasks plus topic and that student's note and link.
drop function public.teacher_student_tasks(uuid);
create function public.teacher_student_tasks(p_student uuid)
returns table (task_id uuid, title text, details text, due_on date, class_id uuid, class_name text, anchor_kind text,
               anchor_ref text, anchor_label text, anchor_available boolean, done boolean, done_at timestamptz,
               topic text, note text, link text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'classroom: not found (teachers only)'; end if;
  if not public.is_linked(uid, p_student) then raise exception 'classroom: not linked'; end if;
  return query
    select t.id, t.title, t.details, t.due_on, t.class_id, c.name,
           t.anchor_kind, t.anchor_ref, case when av.ok then t.anchor_label end, av.ok,
           tc.done_at is not null, tc.done_at,
           t.topic, tc.note, tc.link
      from public.visible_tasks(p_student) t
      left join public.classes c on c.id = t.class_id
      left join public.task_completions tc on tc.task_id = t.id and tc.student_id = p_student
      cross join lateral (select case when t.anchor_kind is not null
                                      then public.anchor_visible(uid, p_student, t.anchor_kind, t.anchor_ref) end as ok
                           offset 0) av
     where t.teacher_id = uid
     order by t.due_on nulls last, t.created_at, t.id;
end $$;

-- 0052's my_tasks plus the task's created_at and topic and the caller's own note and link.
drop function public.my_tasks();
create function public.my_tasks()
returns table (task_id uuid, teacher_id uuid, teacher_name text, class_id uuid, class_name text, title text,
               details text, due_on date, done boolean, done_at timestamptz,
               anchor_kind text, anchor_ref text, anchor_label text, anchor_available boolean,
               created_at timestamptz, topic text, note text, link text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  if not public.is_role(uid, 'student') then return; end if;
  return query
    select t.id, t.teacher_id, tp.display_name, t.class_id, c.name, t.title, t.details, t.due_on,
           tc.done_at is not null, tc.done_at,
           t.anchor_kind, t.anchor_ref, t.anchor_label,
           case when t.anchor_kind is not null then public.anchor_visible(t.teacher_id, uid, t.anchor_kind, t.anchor_ref) end,
           t.created_at, t.topic, tc.note, tc.link
      from public.visible_tasks(uid) t
      join public.teacher_profiles tp on tp.user_id = t.teacher_id
      left join public.classes c on c.id = t.class_id
      left join public.task_completions tc on tc.task_id = t.id and tc.student_id = uid
     order by t.due_on nulls last, t.created_at, t.id;
end $$;

-- ═════════════ grants ═════════════

-- Client-callable functions: signed-in users only. Every function dropped above is granted again; archive_task (replaced
-- in place) too, so the block states the whole set.
do $$
declare f text;
begin
  foreach f in array array[
    'teacher_set_class_theme(uuid, text)', 'my_teachers()',
    'create_task(text, text, date, uuid, uuid, text, text, text, text)', 'update_task(uuid, text, text, date, text)',
    'archive_task(uuid, boolean)', 'list_my_tasks()',
    'set_task_done(uuid, boolean, text, text)', 'task_progress(uuid)', 'teacher_student_tasks(uuid)', 'my_tasks()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
