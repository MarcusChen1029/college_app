-- Class charts (roadmap #11): anonymous, Naviance-style scattergram data for a teacher. For each college, how the
-- teacher's own linked students did (GPA / SAT / ACT vs admitted, waitlisted, denied).
-- Spec: docs/superpowers/specs/2026-10-27-class-charts-design.md
--
-- Privacy rules (mirrored in web/lib/class-charts.ts, MIN_STUDENTS; keep the two in step):
--   * Only the calling teacher's linked students (teacher_links), optionally narrowed to one of the teacher's own
--     classes (class_members). Another teacher's class id is refused like an unknown one.
--   * Floor: nothing at all is returned unless at least 5 distinct students in scope have a final outcome, and a
--     college is returned only when at least 5 distinct students in scope have a final outcome there.
--   * A point carries only: GPA rounded to 0.05, SAT total, ACT composite, outcome, plan key. Never a student id,
--     name, email, class, year, date, or any other column that could be joined back to a person.
--   * Points are sorted by their own values, so row order says nothing about who is who.
--   * Custom colleges (no institution) are left out: their names are free text typed by one student.
-- Final outcomes: admitted + enrolled -> 'admitted', waitlisted -> 'waitlisted', rejected -> 'denied'.
-- Deferred and withdrawn are not final and are not counted.
-- Like every teacher read, this goes through SECURITY DEFINER with an explicit column list; teachers still have
-- no SELECT on student tables.

create function public.teacher_outcomes(p_class_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  min_students constant int := 5;
  scope uuid[];
  result jsonb;
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if p_class_id is not null and not exists (select 1 from public.classes c where c.id = p_class_id and c.teacher_id = uid) then
    raise exception 'class not found';
  end if;

  select coalesce(array_agg(l.student_id), '{}') into scope
  from public.teacher_links l
  where l.teacher_id = uid
    and (p_class_id is null
         or exists (select 1 from public.class_members m where m.class_id = p_class_id and m.student_id = l.student_id));

  with o as (
    select sc.user_id, sc.institution_id, sc.plan_key,
           case sc.status when 'admitted' then 'admitted' when 'enrolled' then 'admitted'
                          when 'waitlisted' then 'waitlisted' when 'rejected' then 'denied' end as outcome
    from public.student_colleges sc
    where sc.user_id = any (scope)
      and sc.institution_id is not null
      and sc.status in ('admitted', 'enrolled', 'waitlisted', 'rejected')
  ),
  n as (select count(distinct o.user_id)::int as students, count(distinct o.institution_id)::int as colleges from o),
  per as (
    select o.institution_id from o group by o.institution_id having count(distinct o.user_id) >= min_students
  )
  select jsonb_build_object(
    'min_students', min_students,
    'students_with_outcomes', n.students,
    'enough', n.students >= min_students,
    'hidden_colleges', case when n.students >= min_students then n.colleges - (select count(*)::int from per) else 0 end,
    'colleges', case when n.students < min_students then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'college_id', i.id,
               'slug', i.slug,
               'name', coalesce(i.short_name, i.name),
               'points', (
                 select jsonb_agg(jsonb_build_object('gpa', p.gpa, 'sat', p.sat, 'act', p.act, 'outcome', p.outcome, 'plan', p.plan)
                                  order by p.gpa nulls last, p.sat nulls last, p.act nulls last, p.outcome, p.plan nulls last)
                 from (select (round(sp.gpa_unweighted * 20) / 20)::numeric(3, 2) as gpa,
                              sp.sat_total as sat, sp.act_composite as act, x.outcome, x.plan_key as plan
                       from o x
                       left join public.student_profiles sp on sp.user_id = x.user_id
                       where x.institution_id = per.institution_id) p)
             ) order by coalesce(i.short_name, i.name), i.id)
      from per join public.institutions i on i.id = per.institution_id), '[]'::jsonb) end
  ) into result
  from n;

  return result;
end $$;

revoke all on function public.teacher_outcomes(uuid) from public, anon;
grant execute on function public.teacher_outcomes(uuid) to authenticated;
