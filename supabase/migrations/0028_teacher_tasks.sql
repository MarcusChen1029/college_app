-- Teacher-assigned tasks (roadmap #5): a teacher gives a class or one linked student a task with an optional due
-- date, and each student ticks it off. Both tables have RLS on, no policies, and no table grants: every read and
-- write goes through the SECURITY DEFINER functions below, which check the caller and the teacher<->student link.
--
-- Who sees what
--   * A student sees a task only while it is not archived, its class (if any) is not archived, they are its target
--     (the student, or a member of the class) AND a teacher_links row joins them to the task's teacher.
--   * A teacher sees their own tasks, and per task only whether each CURRENTLY linked student in its audience is done.
--     The only student data returned is the display name the roster RPCs already expose. Students never see others.
--   * When a link ends, the composite foreign keys (as in teacher_notes, 0024) delete that student's one-on-one tasks
--     and all their completions for that teacher. Leaving a class keeps the link, so the class task just stops being
--     visible (the completion is kept but never returned).
-- Limits are mirrored in web/lib/tasks.ts (TASK_LIMITS, validateTask); keep the two in step.

create table public.teacher_tasks (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  class_id   uuid references public.classes(id) on delete cascade,
  student_id uuid,
  title      text not null check (btrim(title) <> '' and char_length(title) <= 120),
  details    text check (char_length(details) <= 1000),
  due_on     date,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((class_id is null) <> (student_id is null)),
  -- One-on-one tasks only exist for a linked student and go away with the link (null student_id = not checked).
  foreign key (teacher_id, student_id) references public.teacher_links (teacher_id, student_id) on delete cascade,
  unique (id, teacher_id)
);
create index on public.teacher_tasks (teacher_id, created_at desc);
create index on public.teacher_tasks (class_id) where class_id is not null;
create index on public.teacher_tasks (student_id) where student_id is not null;

-- teacher_id is copied from the task so the row can hang off the link: it is deleted when the link ends.
create table public.task_completions (
  task_id    uuid not null,
  student_id uuid not null,
  teacher_id uuid not null,
  done_at    timestamptz not null default now(),
  primary key (task_id, student_id),
  foreign key (task_id, teacher_id) references public.teacher_tasks (id, teacher_id) on delete cascade,
  foreign key (teacher_id, student_id) references public.teacher_links (teacher_id, student_id) on delete cascade
);
create index on public.task_completions (teacher_id, student_id);
create index on public.task_completions (student_id);

alter table public.teacher_tasks enable row level security;
alter table public.task_completions enable row level security;
revoke all on table public.teacher_tasks, public.task_completions from public, anon, authenticated;

create trigger touch before update on public.teacher_tasks
  for each row execute function public.touch_updated_at();

-- ───────────── helpers (not callable by clients) ─────────────

-- Students a task is currently assigned to: the one student, or the class members, and only while still linked.
create function public.task_audience(p_task uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select l.student_id
    from public.teacher_tasks t
    join public.teacher_links l on l.teacher_id = t.teacher_id
   where t.id = p_task
     and (l.student_id = t.student_id
          or (t.class_id is not null and exists (select 1 from public.class_members m
                                                  where m.class_id = t.class_id and m.student_id = l.student_id)))
$$;

-- Tasks a student may see and complete. The single definition of "visible" used by my_tasks and set_task_done.
create function public.visible_tasks(p_student uuid) returns setof public.teacher_tasks
language sql stable security definer set search_path = '' as $$
  select t.*
    from public.teacher_tasks t
    join public.teacher_links l on l.teacher_id = t.teacher_id and l.student_id = p_student
    left join public.classes c on c.id = t.class_id
   where not t.archived
     and (t.student_id = p_student
          or (t.class_id is not null and not c.archived
              and exists (select 1 from public.class_members m where m.class_id = t.class_id and m.student_id = p_student)))
$$;

-- Trims and checks a title/details pair; raises with a message the client can show.
create function public.check_task_text(p_title text, p_details text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if btrim(coalesce(p_title, '')) = '' then raise exception 'task title required'; end if;
  if char_length(btrim(p_title)) > 120 then raise exception 'task title too long'; end if;
  if char_length(btrim(coalesce(p_details, ''))) > 1000 then raise exception 'task details too long'; end if;
end $$;

-- At most 500 active (not archived) tasks per teacher. The advisory lock serialises one teacher's creates.
create function public.check_task_cap(p_teacher uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('teacher_tasks:' || p_teacher::text, 0));
  if (select count(*) from public.teacher_tasks where teacher_id = p_teacher and not archived) >= 500 then
    raise exception 'task limit reached';
  end if;
end $$;

revoke all on function public.task_audience(uuid), public.visible_tasks(uuid), public.check_task_text(text, text),
  public.check_task_cap(uuid) from public, anon, authenticated;

-- ───────────── teacher functions ─────────────

-- Exactly one of p_class (one of the caller's active classes) or p_student (a linked student). Returns the task id.
create function public.create_task(p_title text, p_details text default null, p_due_on date default null,
                                   p_class uuid default null, p_student uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tid uuid;
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if (p_class is null) = (p_student is null) then raise exception 'choose a class or a student'; end if;
  if p_class is not null and not exists (select 1 from public.classes where id = p_class and teacher_id = uid and not archived) then
    raise exception 'class not found';
  end if;
  if p_student is not null and not public.is_linked(uid, p_student) then raise exception 'student not found'; end if;
  perform public.check_task_text(p_title, p_details);
  perform public.check_task_cap(uid);
  insert into public.teacher_tasks (teacher_id, class_id, student_id, title, details, due_on)
  values (uid, p_class, p_student, btrim(p_title), nullif(btrim(coalesce(p_details, '')), ''), p_due_on)
  returning id into tid;
  return tid;
end $$;

-- Changes the text and due date of one of the caller's tasks. The target can't change (make a new task instead).
create function public.update_task(p_task uuid, p_title text, p_details text default null, p_due_on date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  perform public.check_task_text(p_title, p_details);
  update public.teacher_tasks
     set title = btrim(p_title), details = nullif(btrim(coalesce(p_details, '')), ''), due_on = p_due_on
   where id = p_task and teacher_id = uid;
  if not found then raise exception 'task not found'; end if;
end $$;

-- Archiving hides the task from students; completions are kept, so un-archiving restores them.
create function public.archive_task(p_task uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if not exists (select 1 from public.teacher_tasks where id = p_task and teacher_id = uid) then raise exception 'task not found'; end if;
  if not coalesce(p_archived, true) then perform public.check_task_cap(uid); end if;
  update public.teacher_tasks set archived = coalesce(p_archived, true) where id = p_task and teacher_id = uid;
end $$;

-- The caller's tasks with the target's name and done/total counts over the current audience.
create function public.list_my_tasks()
returns table (task_id uuid, class_id uuid, class_name text, class_archived boolean, student_id uuid, student_name text,
               title text, details text, due_on date, archived boolean, created_at timestamptz, done_count int, total_count int)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  return query
    select t.id, t.class_id, c.name, coalesce(c.archived, false), t.student_id,
           case when t.student_id is null then null
                else coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)) end,
           t.title, t.details, t.due_on, t.archived, t.created_at,
           (select count(*)::int from public.task_audience(t.id) as a(sid)
             where exists (select 1 from public.task_completions tc where tc.task_id = t.id and tc.student_id = a.sid)),
           (select count(*)::int from public.task_audience(t.id))
      from public.teacher_tasks t
      left join public.classes c on c.id = t.class_id
      left join auth.users u on u.id = t.student_id
      left join public.student_profiles sp on sp.user_id = t.student_id
     where t.teacher_id = uid
     order by t.archived, t.due_on nulls last, t.created_at desc, t.id;
end $$;

-- Per currently-assigned student of one of the caller's tasks: name, done, done_at. Other tasks look like unknown ones.
create function public.task_progress(p_task uuid)
returns table (student_id uuid, display_name text, done boolean, done_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if not exists (select 1 from public.teacher_tasks where id = p_task and teacher_id = uid) then raise exception 'task not found'; end if;
  return query
    select a.sid,
           coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)),
           tc.done_at is not null,
           tc.done_at
      from public.task_audience(p_task) as a(sid)
      join auth.users u on u.id = a.sid
      left join public.student_profiles sp on sp.user_id = a.sid
      left join public.task_completions tc on tc.task_id = p_task and tc.student_id = a.sid
     order by 2, 1;
end $$;

-- ───────────── student functions ─────────────

-- The caller's visible tasks. Only these columns: no other student's data, no class membership list.
create function public.my_tasks()
returns table (task_id uuid, teacher_name text, title text, details text, due_on date, done boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  return query
    select t.id, tp.display_name, t.title, t.details, t.due_on,
           exists (select 1 from public.task_completions tc where tc.task_id = t.id and tc.student_id = uid)
      from public.visible_tasks(uid) t
      join public.teacher_profiles tp on tp.user_id = t.teacher_id
     order by t.due_on nulls last, t.created_at, t.id;
end $$;

-- Ticks a visible task off (or back on). Tasks the caller can't see look like unknown ones.
create function public.set_task_done(p_task uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tid uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select t.teacher_id into tid from public.visible_tasks(uid) t where t.id = p_task;
  if tid is null then raise exception 'task not found'; end if;
  if coalesce(p_done, true) then
    insert into public.task_completions (task_id, student_id, teacher_id) values (p_task, uid, tid) on conflict do nothing;
  else
    delete from public.task_completions where task_id = p_task and student_id = uid;
  end if;
end $$;

-- Client-callable functions: signed-in users only.
do $$
declare f text;
begin
  foreach f in array array[
    'create_task(text, text, date, uuid, uuid)', 'update_task(uuid, text, text, date)', 'archive_task(uuid, boolean)',
    'list_my_tasks()', 'task_progress(uuid)', 'my_tasks()', 'set_task_done(uuid, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
