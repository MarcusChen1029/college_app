-- Opt-in weekly email digest for teachers (roadmap #6). Off by default. A teacher turns it on in Settings
-- (set_my_digest), and the deadline-reminders Edge Function sends at most one digest per teacher per 7 days.
--
-- What a digest may contain: per currently linked student (a teacher_links row), the student's display name plus
--   * tasks from this teacher (0028) that the student can see, have a due date that is past or within 7 days, and
--     aren't ticked off: title + due date;
--   * application/priority deadlines within 7 days for colleges the student is still working on (not submitted):
--     college name + deadline label + date.
-- Every value is one the teacher can already read through teacher_roster / teacher_deadlines / list_my_tasks.
-- Nothing from portals, notes, résumé, aid offers, scholarships, recommenders or essays is read here.
-- The data functions are service_role only: the Edge Function never reads student tables itself.

alter table public.teacher_profiles
  add column digest_enabled   boolean not null default false,
  add column digest_frequency text    not null default 'weekly' check (digest_frequency in ('weekly'));

-- One row per digest sent. Used only by the Edge Function (service_role); RLS on, no policies, no client grants.
create table public.teacher_digest_log (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  sent_on    date not null,
  sent_at    timestamptz not null default now(),
  primary key (teacher_id, sent_on)
);
alter table public.teacher_digest_log enable row level security;
revoke all on table public.teacher_digest_log from public, anon, authenticated;
grant select, insert, delete on table public.teacher_digest_log to service_role;

-- Turns the caller's digest on or off. Teachers only.
create function public.set_my_digest(p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  update public.teacher_profiles set digest_enabled = coalesce(p_enabled, false) where user_id = uid;
  if not found then raise exception 'teacher profile not found'; end if;
end $$;

revoke all on function public.set_my_digest(boolean) from public, anon;
grant execute on function public.set_my_digest(boolean) to authenticated;

-- Teachers due a digest on p_today: digest on, still a teacher, an email address, at least one linked student,
-- and no digest sent in the 6 days before (so a daily cron sends weekly).
create function public.due_teacher_digests(p_today date default current_date)
returns table (teacher_id uuid, email text, teacher_name text)
language sql stable security definer set search_path = '' as $$
  select tp.user_id, u.email::text, tp.display_name
    from public.teacher_profiles tp
    join auth.users u on u.id = tp.user_id and u.email is not null
   where tp.digest_enabled
     and tp.digest_frequency = 'weekly'
     and public.is_role(tp.user_id, 'teacher')
     and exists (select 1 from public.teacher_links l where l.teacher_id = tp.user_id)
     and not exists (select 1 from public.teacher_digest_log g
                      where g.teacher_id = tp.user_id and g.sent_on > coalesce(p_today, current_date) - 7)
   order by tp.user_id
$$;

-- What one teacher's digest lists. Empty unless p_teacher is a teacher with the digest on.
-- item 'task':     title = task title,   label = null,           due_on = task due date (may be in the past)
-- item 'deadline': title = college name, label = deadline label, due_on = deadline date
create function public.teacher_digest_data(p_teacher uuid, p_today date default null)
returns table (student_id uuid, student_name text, item text, title text, label text, due_on date)
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := least(greatest(coalesce(p_today, current_date), current_date - 2), current_date + 2);
begin
  if p_teacher is null or not public.is_role(p_teacher, 'teacher')
     or not exists (select 1 from public.teacher_profiles where user_id = p_teacher and digest_enabled) then
    return;
  end if;
  return query
    with students as (
      select l.student_id,
             coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)) as student_name
        from public.teacher_links l
        join auth.users u on u.id = l.student_id
        left join public.student_profiles sp on sp.user_id = l.student_id
       where l.teacher_id = p_teacher
    )
    select s.student_id, s.student_name, 'task'::text, t.title, null::text, t.due_on
      from students s
      cross join lateral public.visible_tasks(s.student_id) t
     where t.teacher_id = p_teacher
       and t.due_on is not null
       and t.due_on <= today + 7
       and not exists (select 1 from public.task_completions tc where tc.task_id = t.id and tc.student_id = s.student_id)
    union all
    select s.student_id, s.student_name, 'deadline'::text, x.college_name, x.label, x.due_date
      from students s
      cross join lateral public.upcoming_deadlines_for(array[s.student_id], today, today + 7) x
     where x.kind in ('application', 'priority')
       and x.status in ('researching', 'planning', 'in_progress')
    order by 2, 1, 6, 3, 4;
end $$;

revoke all on function public.due_teacher_digests(date), public.teacher_digest_data(uuid, date) from public, anon, authenticated;
grant execute on function public.due_teacher_digests(date), public.teacher_digest_data(uuid, date) to service_role;
