-- Phase 3 of teacher accounts: what a linked teacher can read about a student.
-- Teachers get NO select policy on student tables (portal passwords, private notes and the résumé's contact
-- details live in the same rows). Instead these SECURITY DEFINER functions build an explicit, column-limited
-- JSON for students the caller is linked to. Never exposed: student_profiles.portals/resume/plan/reminder_*,
-- student_colleges.portal_*/notes/aid_offer_usd. Essay titles/links are hidden when the student turned sharing off.

-- ───────────── internal helpers (not callable by clients) ─────────────

create function public.is_linked(p_teacher uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_role(p_teacher, 'teacher')
     and exists (select 1 from public.teacher_links where teacher_id = p_teacher and student_id = p_student)
$$;

-- Essay titles and Google Doc links are removed from a checklist when the student doesn't share essays;
-- only each essay's status stays, so "essays done" still computes.
create function public.redact_checklist(p jsonb, p_share boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_share or p is null or jsonb_typeof(p -> 'essay_list') is distinct from 'array' then p
    else jsonb_set(p, '{essay_list}',
           coalesce((select jsonb_agg(jsonb_build_object('status', e ->> 'status')) from jsonb_array_elements(p -> 'essay_list') e), '[]'::jsonb))
  end
$$;

-- A date from free text, or null when it isn't a real date (one bad custom deadline must not break a roster).
create function public.safe_date(t text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  return t::date;
exception when others then
  return null;
end $$;

-- Deadlines still ahead for the students' colleges, using the same rules as the reminder emails
-- (due_reminders): application deadlines only while the student hasn't applied and only for the chosen plan;
-- deposits only once admitted; nothing for withdrawn/rejected/enrolled. Custom colleges use custom.deadline.
create function public.upcoming_deadlines_for(p_students uuid[], p_from date, p_to date)
returns table (student_id uuid, college_id uuid, college_name text, college_slug text, due_date date, kind text, label text, plan_key text, status text)
language sql stable security definer set search_path = '' as $$
  select sc.user_id, sc.id, i.name, i.slug, d.due_date, d.kind,
         coalesce(d.label, ap.label, initcap(replace(d.kind, '_', ' '))), d.plan_key, sc.status
  from public.student_colleges sc
  join public.institutions i on i.id = sc.institution_id
  join public.deadlines d on d.institution_id = sc.institution_id and d.due_date between p_from and p_to
  left join public.application_plans ap on ap.key = d.plan_key
  where sc.user_id = any (p_students)
    and sc.status not in ('withdrawn', 'rejected', 'enrolled')
    and (d.kind <> 'application' or (
          sc.status in ('researching', 'planning', 'in_progress')
          and (sc.plan_key is null or d.plan_key = sc.plan_key)))
    and (d.kind <> 'deposit' or sc.status = 'admitted')
  union all
  select sc.user_id, sc.id, coalesce(sc.custom ->> 'name', 'Custom college'), 'custom-' || sc.id::text,
         public.safe_date(sc.custom ->> 'deadline'), 'application', 'Application deadline', null, sc.status
  from public.student_colleges sc
  where sc.user_id = any (p_students)
    and sc.institution_id is null
    and sc.status in ('researching', 'planning', 'in_progress')
    and public.safe_date(sc.custom ->> 'deadline') between p_from and p_to
$$;

revoke all on function public.is_linked(uuid, uuid), public.redact_checklist(jsonb, boolean), public.safe_date(text),
  public.upcoming_deadlines_for(uuid[], date, date) from public, anon, authenticated;

-- ───────────── teacher-facing functions ─────────────

-- One row per linked student with headline scores and a minimal college list (status, plan, redacted
-- checklist, next deadline). The client turns this into progress bars and attention flags.
create function public.teacher_roster()
returns table (
  student_id uuid, display_name text, email text, linked_at timestamptz, class_ids uuid[],
  sat_total smallint, act_composite smallint, gpa_unweighted numeric, is_international boolean,
  last_active timestamptz, colleges jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
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
                                         from public.upcoming_deadlines_for(array[l.student_id], current_date, current_date + 400) x
                                         where x.college_id = sc.id and x.kind in ('application', 'priority'))
                     ) order by sc.created_at)
                     from public.student_colleges sc
                     left join public.institutions i on i.id = sc.institution_id
                     where sc.user_id = l.student_id), '[]'::jsonb)
    from public.teacher_links l
    join auth.users u on u.id = l.student_id
    left join public.student_profiles sp on sp.user_id = l.student_id
    where l.teacher_id = uid
    order by 2;
end $$;

-- Everything a teacher may see about one linked student. Unlinked and unknown students look identical.
create function public.teacher_student(p_student uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
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
                                   from public.upcoming_deadlines_for(array[p_student], current_date, current_date + 400) x
                                   where x.college_id = sc.id), '[]'::jsonb)
                  ) order by sc.created_at)
                  from public.student_colleges sc
                  left join public.institutions i on i.id = sc.institution_id
                  where sc.user_id = p_student), '[]'::jsonb)
  );
end $$;

-- Deadlines coming up across all of the teacher's students, soonest first (p_days is capped to 1..365).
create function public.teacher_deadlines(p_days int default 60)
returns table (student_id uuid, student_name text, college_name text, college_slug text, due_date date, kind text, label text, status text)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  return query
    select l.student_id,
           coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)),
           x.college_name, x.college_slug, x.due_date, x.kind, x.label, x.status
    from public.teacher_links l
    join auth.users u on u.id = l.student_id
    left join public.student_profiles sp on sp.user_id = l.student_id
    cross join lateral public.upcoming_deadlines_for(array[l.student_id], current_date, current_date + least(greatest(coalesce(p_days, 60), 1), 365)) x
    where l.teacher_id = uid
    order by x.due_date, 2, x.college_name;
end $$;

revoke all on function public.teacher_roster(), public.teacher_student(uuid), public.teacher_deadlines(int) from public, anon;
grant execute on function public.teacher_roster(), public.teacher_student(uuid), public.teacher_deadlines(int) to authenticated;
