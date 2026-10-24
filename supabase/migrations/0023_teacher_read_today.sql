-- Fixes for 0022 found in review: (1) the teacher's own "today" is passed in (clamped to +-2 days of the server's
-- UTC day) so deadlines around midnight aren't dropped or kept a day early for teachers far from UTC;
-- (2) stable ordering when two students share a name or a deadline day.

drop function public.teacher_roster();
drop function public.teacher_student(uuid);
drop function public.teacher_deadlines(int);

create function public.teacher_roster(p_today date default null)
returns table (
  student_id uuid, display_name text, email text, linked_at timestamptz, class_ids uuid[],
  sat_total smallint, act_composite smallint, gpa_unweighted numeric, is_international boolean,
  last_active timestamptz, colleges jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := least(greatest(coalesce(p_today, current_date), current_date - 2), current_date + 2);
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  return query
    select l.student_id,
           coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)),
           u.email::text,
           l.created_at,
           coalesce((select array_agg(m.class_id) from public.class_members m
                     join public.classes c on c.id = m.class_id
                     where m.student_id = l.student_id and c.teacher_id = uid), '{}'),
           sp.sat_total, sp.act_composite, sp.gpa_unweighted, coalesce(sp.is_international, false),
           greatest(sp.updated_at, (select max(sc.updated_at) from public.student_colleges sc where sc.user_id = l.student_id)),
           coalesce((select jsonb_agg(jsonb_build_object(
                       'slug', coalesce(i.slug, 'custom-' || sc.id::text),
                       'name', coalesce(i.name, sc.custom ->> 'name', 'Custom college'),
                       'status', sc.status,
                       'plan', sc.plan_key,
                       'checklist', public.redact_checklist(sc.checklist, l.share_essays),
                       'next_deadline', (select min(x.due_date)
                                         from public.upcoming_deadlines_for(array[l.student_id], today, today + 400) x
                                         where x.college_id = sc.id and x.kind in ('application', 'priority'))
                     ) order by sc.created_at)
                     from public.student_colleges sc
                     left join public.institutions i on i.id = sc.institution_id
                     where sc.user_id = l.student_id), '[]'::jsonb)
    from public.teacher_links l
    join auth.users u on u.id = l.student_id
    left join public.student_profiles sp on sp.user_id = l.student_id
    where l.teacher_id = uid
    order by 2, l.student_id;
end $$;

-- Everything a teacher may see about one linked student. Unlinked and unknown students look identical.
create function public.teacher_student(p_student uuid, p_today date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := least(greatest(coalesce(p_today, current_date), current_date - 2), current_date + 2);
  l public.teacher_links;
  u_email text;
  sp public.student_profiles;
begin
  if uid is null or not public.is_linked(uid, p_student) then raise exception 'student not found'; end if;
  select * into l from public.teacher_links where teacher_id = uid and student_id = p_student;
  select email::text into u_email from auth.users where id = p_student;
  select * into sp from public.student_profiles where user_id = p_student;

  return jsonb_build_object(
    'student_id', p_student,
    'display_name', coalesce(nullif(btrim(sp.display_name), ''), split_part(u_email, '@', 1)),
    'email', u_email,
    'linked_at', l.created_at,
    'share_essays', l.share_essays,
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                         from public.class_members m join public.classes c on c.id = m.class_id
                         where m.student_id = p_student and c.teacher_id = uid), '[]'::jsonb),
    'profile', jsonb_build_object(
      'sat_total', sp.sat_total, 'act_composite', sp.act_composite, 'gpa_unweighted', sp.gpa_unweighted,
      'english_test_key', sp.english_test_key, 'english_score', sp.english_score,
      'intended_category', sp.intended_category, 'is_international', coalesce(sp.is_international, false),
      'needs_aid', coalesce(sp.needs_aid, false), 'target_regions', coalesce(sp.target_regions, '[]'::jsonb),
      'test_details', coalesce(sp.test_details, '{}'::jsonb), 'interested', coalesce(sp.interested, '[]'::jsonb),
      'updated_at', sp.updated_at),
    'activities', coalesce(sp.activities, '{}'::jsonb),
    'essays', case when l.share_essays then coalesce(sp.essays, '{}'::jsonb) else null end,
    'colleges', coalesce((select jsonb_agg(jsonb_build_object(
                    'slug', coalesce(i.slug, 'custom-' || sc.id::text),
                    'name', coalesce(i.name, sc.custom ->> 'name', 'Custom college'),
                    'custom', sc.institution_id is null,
                    'status', sc.status,
                    'plan', sc.plan_key,
                    'checklist', public.redact_checklist(sc.checklist, l.share_essays),
                    'added_at', sc.created_at,
                    'updated_at', sc.updated_at,
                    'deadlines', coalesce((select jsonb_agg(jsonb_build_object(
                                     'due_date', x.due_date, 'kind', x.kind, 'label', x.label, 'plan', x.plan_key) order by x.due_date)
                                   from public.upcoming_deadlines_for(array[p_student], today, today + 400) x
                                   where x.college_id = sc.id), '[]'::jsonb)
                  ) order by sc.created_at)
                  from public.student_colleges sc
                  left join public.institutions i on i.id = sc.institution_id
                  where sc.user_id = p_student), '[]'::jsonb)
  );
end $$;

-- Deadlines coming up across all of the teacher's students, soonest first (p_days is capped to 1..365).
create function public.teacher_deadlines(p_days int default 60, p_today date default null)
returns table (student_id uuid, student_name text, college_name text, college_slug text, due_date date, kind text, label text, status text)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := least(greatest(coalesce(p_today, current_date), current_date - 2), current_date + 2);
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  return query
    select l.student_id,
           coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)),
           x.college_name, x.college_slug, x.due_date, x.kind, x.label, x.status
    from public.teacher_links l
    join auth.users u on u.id = l.student_id
    left join public.student_profiles sp on sp.user_id = l.student_id
    cross join lateral public.upcoming_deadlines_for(array[l.student_id], today, today + least(greatest(coalesce(p_days, 60), 1), 365)) x
    where l.teacher_id = uid
    order by x.due_date, 2, x.college_name, l.student_id;
end $$;

revoke all on function public.teacher_roster(date), public.teacher_student(uuid, date), public.teacher_deadlines(int, date) from public, anon;
grant execute on function public.teacher_roster(date), public.teacher_student(uuid, date), public.teacher_deadlines(int, date) to authenticated;
