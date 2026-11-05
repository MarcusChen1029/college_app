-- Pre-launch hardening (security assessment 2026-11-05: findings 7 and 8, the hardening backlog, council items 4 and 8).
-- Smoke test: supabase/patches/2026-11-06_prelaunch_hardening_smoke_test.sql (begin ... rollback; paste this file after
-- its "begin;" to dry-run both together).
--
-- Every function below was re-created from its LIVE definition (pg_get_functiondef, read read-only on 2026-11-05) with
-- exactly one change each, named in its comment. Grants are restated explicitly (CLAUDE.md: since 0041 nothing is granted
-- by default) and equal the live ACLs.
--
-- 1. refuse_oauth_client() as the first statement of the 11 client RPCs that lacked it: teacher_archive_class,
--    teacher_create_class, teacher_deadlines, teacher_outcomes, teacher_remove_from_class, teacher_remove_student,
--    teacher_revoke_code, teacher_roster, teacher_student, teacher_students and set_my_digest. They were already closed to
--    an OAuth client_id token through is_role / is_linked (false for such a token, so they raised 'teachers only'), but
--    every other client RPC starts with the explicit refusal (errcode 42501), and so do these now.
-- 2. Table privileges. anon and authenticated lose TRUNCATE, TRIGGER and REFERENCES on every table in public (the 37
--    pre-0044 tables still granted them at table and column level; a REVOKE on the table also drops the column grants).
--    anon loses INSERT, UPDATE and DELETE on student_profiles, student_colleges, teacher_links and user_roles. Checked in
--    pg_policies on 2026-11-05: no policy on any public table grants anon (or public) a write, every write policy is for
--    {authenticated}, so nothing a client can do changes; the student tables just stop relying on RLS alone. anon keeps
--    the SELECT grants it had (RLS still returns no rows to it).
-- 3. teacher_links.share_essays default false. Already false live since 0041:644 (the assessment quoted 0021:34); restated
--    so the migration that documents the rule also pins it. Existing rows keep their value. redeem_code (0052) inserts a
--    link without naming the column, so every new link starts with essays off; the student turns it on per teacher.
-- 4. teacher_new_code (0041:325's definition): a code made without an expiry gets one, 365 days from now
--    (coalesce(p_expires, now() + interval '365 days')). teacher_create_class makes a class's first code through it, so class
--    codes get the same default. Codes that already exist with expires_at null stay valid (preview_code treats null as no
--    expiry); a teacher replaces them with "New code" or turns them off.
-- 5. recompute_plan (0045:144): only orders with mode = 'production' count towards plan_windows and plan. ECPay's stage keys
--    are public, so a stage "paid" order proves no payment; after go-live it must never read as a pass. Live on 2026-11-05
--    every paid order was production mode (4 orders, 3 students), so applying this changes no profile. The payments Edge
--    Function (payments-core.ts, same PR) refuses stage-merchant notices in production as well.

-- ───────────── 1. refuse_oauth_client() first in the 11 RPCs ─────────────

-- 0021's definition (live). Change: the refusal.
create or replace function public.teacher_archive_class(p_class uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  update public.classes set archived = p_archived where id = p_class and teacher_id = uid;
  if not found then raise exception 'class not found'; end if;
  if p_archived then update public.join_codes set revoked = true where class_id = p_class and not revoked; end if;
end $$;

-- 0021's definition (live). Change: the refusal. Its first code comes from teacher_new_code, so it gets the 365-day default.
create or replace function public.teacher_create_class(p_name text, p_school_year text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'class name required'; end if;
  insert into public.classes (teacher_id, name, school_year)
  values (uid, btrim(p_name), nullif(btrim(coalesce(p_school_year, '')), ''))
  returning id into cid;
  return jsonb_build_object('id', cid, 'code', public.teacher_new_code('class', cid));
end $$;

-- 0023's definition (live). Change: the refusal.
create or replace function public.teacher_deadlines(p_days int default 60, p_today date default null)
returns table (student_id uuid, student_name text, college_name text, college_slug text, due_date date, kind text, label text, status text)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := least(greatest(coalesce(p_today, current_date), current_date - 2), current_date + 2);
begin
  perform public.refuse_oauth_client();
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

-- 0033's definition (live). Change: the refusal.
create or replace function public.teacher_outcomes(p_class_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  min_students constant int := 5;
  scope uuid[];
  result jsonb;
begin
  perform public.refuse_oauth_client();
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

-- 0021's definition (live). Change: the refusal.
create or replace function public.teacher_remove_from_class(p_class uuid, p_student uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  delete from public.class_members m using public.classes c
   where m.class_id = c.id and c.id = p_class and c.teacher_id = uid and m.student_id = p_student;
end $$;

-- 0021's definition (live). Change: the refusal.
create or replace function public.teacher_remove_student(p_student uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  delete from public.class_members m using public.classes c where m.class_id = c.id and c.teacher_id = uid and m.student_id = p_student;
  delete from public.teacher_links where teacher_id = uid and student_id = p_student;
end $$;

-- 0021's definition (live). Change: the refusal.
create or replace function public.teacher_revoke_code(p_kind text, p_class uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if p_kind = 'class' then
    update public.join_codes set revoked = true where teacher_id = uid and class_id = p_class and not revoked;
  elsif p_kind = 'individual' then
    update public.join_codes set revoked = true where teacher_id = uid and kind = 'individual' and not revoked;
  else
    raise exception 'invalid kind';
  end if;
end $$;

-- 0023's definition (live). Change: the refusal.
create or replace function public.teacher_roster(p_today date default null)
returns table (student_id uuid, display_name text, email text, linked_at timestamptz, class_ids uuid[],
               sat_total smallint, act_composite smallint, gpa_unweighted numeric, is_international boolean,
               last_active timestamptz, colleges jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := least(greatest(coalesce(p_today, current_date), current_date - 2), current_date + 2);
begin
  perform public.refuse_oauth_client();
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

-- 0023's definition (live). Change: the refusal.
create or replace function public.teacher_student(p_student uuid, p_today date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := least(greatest(coalesce(p_today, current_date), current_date - 2), current_date + 2);
  l public.teacher_links;
  u_email text;
  sp public.student_profiles;
begin
  perform public.refuse_oauth_client();
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

-- 0022's definition (live). Change: the refusal.
create or replace function public.teacher_students()
returns table (student_id uuid, display_name text, email text, linked_at timestamptz, class_ids uuid[])
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  return query
    select l.student_id,
           coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)),
           u.email::text,
           l.created_at,
           coalesce((select array_agg(m.class_id) from public.class_members m
                     join public.classes c on c.id = m.class_id
                     where m.student_id = l.student_id and c.teacher_id = uid), '{}')
    from public.teacher_links l
    join auth.users u on u.id = l.student_id
    left join public.student_profiles sp on sp.user_id = l.student_id
    where l.teacher_id = uid
    order by 2;
end $$;

-- 0029's definition (live). Change: the refusal.
create or replace function public.set_my_digest(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  update public.teacher_profiles set digest_enabled = coalesce(p_enabled, false) where user_id = uid;
  if not found then raise exception 'teacher profile not found'; end if;
end $$;

-- ───────────── 4. join codes expire after a year unless the teacher picks a date ─────────────

-- 0041:325's definition (live). Change: p_expires null means now() + 365 days (it used to mean never).
create or replace function public.teacher_new_code(p_kind text, p_class uuid default null, p_expires timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c text;
  tries int := 0;
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  delete from public.join_codes where teacher_id = uid and revoked and created_at < now() - interval '30 days';
  if p_kind = 'class' then
    if p_class is null or not exists (select 1 from public.classes where id = p_class and teacher_id = uid and not archived) then
      raise exception 'class not found';
    end if;
    update public.join_codes set revoked = true where class_id = p_class and not revoked;
  elsif p_kind = 'individual' then
    p_class := null;
    update public.join_codes set revoked = true where teacher_id = uid and kind = 'individual' and not revoked;
  else
    raise exception 'invalid kind';
  end if;
  loop
    tries := tries + 1;
    c := public.make_code();
    begin
      insert into public.join_codes (code, teacher_id, kind, class_id, expires_at)
      values (c, uid, p_kind, p_class, coalesce(p_expires, now() + interval '365 days'));
      return c;
    exception when unique_violation then
      if tries >= 5 then raise exception 'could not create a code, try again'; end if; -- code collision: draw again
    end;
  end loop;
end $$;

-- The twelve client RPCs above: no anon or PUBLIC execute; authenticated and service_role as before (live ACLs).
do $$
declare f text;
begin
  foreach f in array array[
    'teacher_archive_class(uuid, boolean)', 'teacher_create_class(text, text)', 'teacher_deadlines(int, date)',
    'teacher_outcomes(uuid)', 'teacher_remove_from_class(uuid, uuid)', 'teacher_remove_student(uuid)',
    'teacher_revoke_code(text, uuid)', 'teacher_roster(date)', 'teacher_student(uuid, date)', 'teacher_students()',
    'set_my_digest(boolean)', 'teacher_new_code(text, uuid, timestamptz)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ───────────── 5. recompute_plan counts production orders only ─────────────

-- 0045's definition (live). Change: "and o.mode = 'production'". Service role only, as before.
create or replace function public.recompute_plan(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  windows jsonb;
  active boolean;
begin
  if p_user is null then return; end if;
  insert into public.student_profiles (user_id) values (p_user) on conflict (user_id) do nothing;
  -- Serializes rebuilds for one student: two paid notices at the same moment (say the student's card for one year and
  -- a parent's ATM for another) would otherwise each aggregate before the other commits and keep only their own window.
  -- The second waits here, and the select below (a new snapshot) then sees the first one's paid order.
  perform 1 from public.student_profiles where user_id = p_user for update;
  -- Stage-mode orders are test orders signed with ECPay's public stage keys: they never make a pass.
  select coalesce(jsonb_agg(jsonb_build_object('entry_year', o.entry_year, 'from', o.pass_from, 'until', o.pass_until)
                            order by o.pass_from, o.entry_year, o.created_at, o.id), '[]'::jsonb),
         coalesce(bool_or(o.pass_until >= (now() at time zone 'Asia/Taipei')::date), false)
    into windows, active
    from public.plan_orders o
   where o.user_id = p_user and o.status = 'paid' and o.mode = 'production';
  update public.student_profiles
     set plan_windows = windows, plan = case when active then 'senior' else 'free' end
   where user_id = p_user;
end $$;

revoke all on function public.recompute_plan(uuid) from public, anon, authenticated;
grant execute on function public.recompute_plan(uuid) to service_role;

comment on column public.student_profiles.plan_windows is
  'Paid passes as [{entry_year, from, until}] (Taipei dates, inclusive). Written only by public.recompute_plan (0045); since 0056 only paid orders with mode = ''production'' count.';

-- ───────────── 3. essays are shared only when the student turns it on ─────────────

-- Already false since 0041:644; pinned here. Existing rows keep their value.
alter table public.teacher_links alter column share_essays set default false;

-- ───────────── 2. table privileges ─────────────

-- Clients never create triggers or foreign keys or truncate; the pre-0044 tables still granted all of it (0044 only stopped
-- the default for new tables). Views in public are covered too (harmless: they never had a use for these). Existing
-- triggers and foreign keys keep working: the two privileges are only needed to CREATE one. A REVOKE removes the grants
-- postgres made (all of ours); the smoke test's D3 counts what is left, so a grant from another grantor would show up.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- Writes to the student tables are for signed-in users (every write policy is for {authenticated}; a signed-out visitor
-- keeps their list in localStorage). anon keeps SELECT, which RLS answers with no rows.
revoke insert, update, delete on table public.student_profiles, public.student_colleges, public.teacher_links, public.user_roles from anon;
