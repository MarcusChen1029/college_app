-- Smoke test for migration 00NN_uk_ca_au_steps (course and intake deadlines). Run AFTER applying it, owner present
-- (it deletes one fixture row inside the transaction). Everything happens in one transaction that ROLLS BACK; a last
-- block after the rollback proves nothing was kept. Success = the final notice "uk_ca_au_steps smoke test passed".
-- Any failed check raises 'FAIL: ...'.
--
-- The rules under test mirror web/lib/course-deadlines.ts (Task 8) and its test fixture (course-deadlines.test.ts):
--   1. a row is kept when its program is none or the picked course, and its intake is none / not picked / the same;
--   2. the picked course's own application row (any date) replaces the university's application row of the same intake;
--   3. a course row has no plan, so the plan filter never drops it.
-- Parts A-E use explicit dates and work on any day. Parts F-G use the server's today (teacher and parent windows):
-- run before 2027-01-13, when CX / U13 fall out of those windows.
--
-- Fixture (ids 00000000-0000-4000-8000-000000000xxx):
--   smoke-gb a01 (GB), programs x b01, y b02. Rows: U13 c01 application 2027-01-13 plan RD; U15 c02 application
--                      2026-10-15 plan RD; S c03 scholarship 2027-02-01; CX c04 course x application 2027-01-13;
--                      CY c05 course y application 2027-01-20.
--   smoke-au a02 (AU), program x b03. Rows: A1 c11 application s1 2026-11-30; A2 c12 application s2 2027-04-30;
--                      K1 c13 course x application s1 2026-10-31.
--   smoke-us a03 (US). Rows: ED c21 2026-11-01 plan ED; RD c22 2027-01-05 plan RD; S c23 scholarship 2027-02-15.
--   smoke-sum a04 (GB), program z b04. Rows: c31 application plan RD at today + 60; c32 course z application at
--                      today + 30 with plan EA (a plan on purpose, so a missing "program_id is null" in plans shows).
-- Cast (every student: status planning, reminder_emails true, reminder_days {14}, an email; one college each):
--   T1 9e0 teacher, linked to G1 and G2
--   G1 9e1 GB {course:x} + parent-view keys, plan RD (CX has no plan, so rule 3 decides whether G1 sees it)
--   G2 9e2 GB {}                 G3 9e3 GB {course:nope}          G4 9e4 GB {course:y} (the only one who sees CY)
--   AU1 9f1 AU {course:x, intake:s2}   AU2 9f2 AU {course:x}   AU3 9f3 AU {}   AU4 9f4 AU {course:x, intake:s3}
--   U1 9d1 US {} plan ED         U2 9d2 US {course:"Bad Course", intake:s1} plan RD (the only one who sees RD)
-- Every row is expected for at least one student, so no "row absent" check passes because the row can't show at all.

begin;

-- ── setup, as the SQL Editor's postgres role, with no JWT claims (the plan-limit trigger then lets inserts pass) ──
select set_config('request.jwt.claims', '', true);

insert into public.countries (code, name) values ('GB', 'United Kingdom'), ('AU', 'Australia'), ('US', 'United States')
  on conflict (code) do nothing;
insert into public.application_plans (key, label, binding) values
  ('ED', 'Early Decision', true), ('EA', 'Early Action', false), ('RD', 'Regular Decision', false)
  on conflict (key) do nothing;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000009e0', 'ukcaau-smoke-t1@example.invalid'),
  ('00000000-0000-4000-8000-0000000009e1', 'ukcaau-smoke-g1@example.invalid'),
  ('00000000-0000-4000-8000-0000000009e2', 'ukcaau-smoke-g2@example.invalid'),
  ('00000000-0000-4000-8000-0000000009e3', 'ukcaau-smoke-g3@example.invalid'),
  ('00000000-0000-4000-8000-0000000009e4', 'ukcaau-smoke-g4@example.invalid'),
  ('00000000-0000-4000-8000-0000000009f1', 'ukcaau-smoke-au1@example.invalid'),
  ('00000000-0000-4000-8000-0000000009f2', 'ukcaau-smoke-au2@example.invalid'),
  ('00000000-0000-4000-8000-0000000009f3', 'ukcaau-smoke-au3@example.invalid'),
  ('00000000-0000-4000-8000-0000000009f4', 'ukcaau-smoke-au4@example.invalid'),
  ('00000000-0000-4000-8000-0000000009d1', 'ukcaau-smoke-u1@example.invalid'),
  ('00000000-0000-4000-8000-0000000009d2', 'ukcaau-smoke-u2@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000009e0', 'teacher'),
  ('00000000-0000-4000-8000-0000000009e1', 'student'), ('00000000-0000-4000-8000-0000000009e2', 'student'),
  ('00000000-0000-4000-8000-0000000009e3', 'student'), ('00000000-0000-4000-8000-0000000009e4', 'student'),
  ('00000000-0000-4000-8000-0000000009f1', 'student'), ('00000000-0000-4000-8000-0000000009f2', 'student'),
  ('00000000-0000-4000-8000-0000000009f3', 'student'), ('00000000-0000-4000-8000-0000000009f4', 'student'),
  ('00000000-0000-4000-8000-0000000009d1', 'student'), ('00000000-0000-4000-8000-0000000009d2', 'student');
insert into public.student_profiles (user_id, display_name, reminder_emails, reminder_days)
select u, n, true, '{14}'::smallint[] from (values
  ('00000000-0000-4000-8000-0000000009e1'::uuid, 'Smoke G1'), ('00000000-0000-4000-8000-0000000009e2'::uuid, 'Smoke G2'),
  ('00000000-0000-4000-8000-0000000009e3'::uuid, 'Smoke G3'), ('00000000-0000-4000-8000-0000000009e4'::uuid, 'Smoke G4'),
  ('00000000-0000-4000-8000-0000000009f1'::uuid, 'Smoke AU1'), ('00000000-0000-4000-8000-0000000009f2'::uuid, 'Smoke AU2'),
  ('00000000-0000-4000-8000-0000000009f3'::uuid, 'Smoke AU3'), ('00000000-0000-4000-8000-0000000009f4'::uuid, 'Smoke AU4'),
  ('00000000-0000-4000-8000-0000000009d1'::uuid, 'Smoke U1'), ('00000000-0000-4000-8000-0000000009d2'::uuid, 'Smoke U2')
) v(u, n);

insert into public.institutions (id, slug, name, country_code) values
  ('00000000-0000-4000-8000-000000000a01', 'smoke-gb', 'UK CA AU Smoke GB', 'GB'),
  ('00000000-0000-4000-8000-000000000a02', 'smoke-au', 'UK CA AU Smoke AU', 'AU'),
  ('00000000-0000-4000-8000-000000000a03', 'smoke-us', 'UK CA AU Smoke US', 'US'),
  ('00000000-0000-4000-8000-000000000a04', 'smoke-sum', 'UK CA AU Smoke Summary', 'GB');
insert into public.programs (id, institution_id, slug, name, source_url, retrieved_on) values
  ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000a01', 'x', 'Smoke X', 'https://example.invalid/x', '2026-11-05'),
  ('00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-000000000a01', 'y', 'Smoke Y', 'https://example.invalid/y', '2026-11-05'),
  ('00000000-0000-4000-8000-000000000b03', '00000000-0000-4000-8000-000000000a02', 'x', 'Smoke X', 'https://example.invalid/x', '2026-11-05'),
  ('00000000-0000-4000-8000-000000000b04', '00000000-0000-4000-8000-000000000a04', 'z', 'Smoke Z', 'https://example.invalid/z', '2026-11-05');
insert into public.deadlines (id, institution_id, cycle, kind, plan_key, label, due_date, program_id, intake) values
  ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000a01', '2026-27', 'application', 'RD', 'U13', '2027-01-13', null, null),
  ('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000a01', '2026-27', 'application', 'RD', 'U15', '2026-10-15', null, null),
  ('00000000-0000-4000-8000-000000000c03', '00000000-0000-4000-8000-000000000a01', '2026-27', 'scholarship', null, 'S', '2027-02-01', null, null),
  ('00000000-0000-4000-8000-000000000c04', '00000000-0000-4000-8000-000000000a01', '2026-27', 'application', null, 'CX', '2027-01-13', '00000000-0000-4000-8000-000000000b01', null),
  ('00000000-0000-4000-8000-000000000c05', '00000000-0000-4000-8000-000000000a01', '2026-27', 'application', null, 'CY', '2027-01-20', '00000000-0000-4000-8000-000000000b02', null),
  ('00000000-0000-4000-8000-000000000c11', '00000000-0000-4000-8000-000000000a02', '2026-27', 'application', null, 'A1', '2026-11-30', null, 's1'),
  ('00000000-0000-4000-8000-000000000c12', '00000000-0000-4000-8000-000000000a02', '2026-27', 'application', null, 'A2', '2027-04-30', null, 's2'),
  ('00000000-0000-4000-8000-000000000c13', '00000000-0000-4000-8000-000000000a02', '2026-27', 'application', null, 'K1', '2026-10-31', '00000000-0000-4000-8000-000000000b03', 's1'),
  ('00000000-0000-4000-8000-000000000c21', '00000000-0000-4000-8000-000000000a03', '2026-27', 'application', 'ED', 'ED', '2026-11-01', null, null),
  ('00000000-0000-4000-8000-000000000c22', '00000000-0000-4000-8000-000000000a03', '2026-27', 'application', 'RD', 'RD', '2027-01-05', null, null),
  ('00000000-0000-4000-8000-000000000c23', '00000000-0000-4000-8000-000000000a03', '2026-27', 'scholarship', null, 'S', '2027-02-15', null, null),
  ('00000000-0000-4000-8000-000000000c31', '00000000-0000-4000-8000-000000000a04', '2026-27', 'application', 'RD', 'SUM-U', current_date + 60, null, null),
  ('00000000-0000-4000-8000-000000000c32', '00000000-0000-4000-8000-000000000a04', '2026-27', 'application', 'EA', 'SUM-Z', current_date + 30, '00000000-0000-4000-8000-000000000b04', null);
insert into public.student_colleges (user_id, institution_id, status, plan_key, checklist) values
  ('00000000-0000-4000-8000-0000000009e1', '00000000-0000-4000-8000-000000000a01', 'planning', 'RD',
   -- {course:x} for the deadline checks; the other keys only feed part F (none of them changes a deadline rule).
   '{"course":"x","ucas_ps":true,"ucas_reference":"yes","admissions_test":false,"recommendations":true,
     "extra_steps":{"ok":true,"bad":"yes","Bad-Key":true},
     "essay_list":[{"title":"Secret essay","url":"https://docs.google.com/document/d/smoke","status":"drafting"}]}'),
  ('00000000-0000-4000-8000-0000000009e2', '00000000-0000-4000-8000-000000000a01', 'planning', null, '{}'),
  ('00000000-0000-4000-8000-0000000009e3', '00000000-0000-4000-8000-000000000a01', 'planning', null, '{"course":"nope"}'),
  ('00000000-0000-4000-8000-0000000009e4', '00000000-0000-4000-8000-000000000a01', 'planning', null, '{"course":"y"}'),
  ('00000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-000000000a02', 'planning', null, '{"course":"x","intake":"s2"}'),
  ('00000000-0000-4000-8000-0000000009f2', '00000000-0000-4000-8000-000000000a02', 'planning', null, '{"course":"x"}'),
  ('00000000-0000-4000-8000-0000000009f3', '00000000-0000-4000-8000-000000000a02', 'planning', null, '{}'),
  ('00000000-0000-4000-8000-0000000009f4', '00000000-0000-4000-8000-000000000a02', 'planning', null, '{"course":"x","intake":"s3"}'),
  ('00000000-0000-4000-8000-0000000009d1', '00000000-0000-4000-8000-000000000a03', 'planning', 'ED', '{}'),
  ('00000000-0000-4000-8000-0000000009d2', '00000000-0000-4000-8000-000000000a03', 'planning', 'RD', '{"course":"Bad Course","intake":"s1"}');
insert into public.teacher_links (teacher_id, student_id, via, created_at) values
  ('00000000-0000-4000-8000-0000000009e0', '00000000-0000-4000-8000-0000000009e1', 'individual', now()),
  ('00000000-0000-4000-8000-0000000009e0', '00000000-0000-4000-8000-0000000009e2', 'individual', now());

-- ═════════════ part A: the schema, function headers, grants and view options ═════════════
do $$
declare
  f record;
  p record;
begin
  if (select format_type(atttypid, atttypmod) from pg_attribute
       where attrelid = 'public.deadlines'::regclass and attname = 'program_id' and not attisdropped) is distinct from 'uuid' then
    raise exception 'FAIL: deadlines.program_id missing or not uuid';
  end if;
  if (select format_type(atttypid, atttypmod) from pg_attribute
       where attrelid = 'public.deadlines'::regclass and attname = 'intake' and not attisdropped) is distinct from 'text' then
    raise exception 'FAIL: deadlines.intake missing or not text';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'programs_id_institution_key'
                  and conrelid = 'public.programs'::regclass and contype = 'u') then
    raise exception 'FAIL: unique (id, institution_id) on programs missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deadlines_program_fkey' and conrelid = 'public.deadlines'::regclass
                  and contype = 'f' and confrelid = 'public.programs'::regclass and confdeltype = 'c') then
    raise exception 'FAIL: deadlines_program_fkey missing, or not ON DELETE CASCADE';
  end if;
  if to_regclass('public.deadlines_program_id_idx') is null then
    raise exception 'FAIL: deadlines_program_id_idx missing';
  end if;

  -- Each replaced function: SECURITY DEFINER, search_path = '', same language, volatility and arguments with defaults.
  -- (Return types can't have changed: create or replace refuses that.)
  for f in select * from (values
      ('public.upcoming_deadlines_for(uuid[],date,date)', 'sql', 's', 'p_students uuid[], p_from date, p_to date'),
      ('public.due_reminders(date)', 'sql', 's', 'today date DEFAULT CURRENT_DATE'),
      ('public.parent_view(text,date)', 'plpgsql', 'v', 'p_token text, p_today date DEFAULT NULL%')
    ) v(sig, lang, vol, args)
  loop
    select pr.prosecdef, pr.proconfig, l.lanname, pr.provolatile::text as vol, pg_get_function_arguments(pr.oid) as args
      into p
      from pg_proc pr join pg_language l on l.oid = pr.prolang
     where pr.oid = f.sig::regprocedure;
    if not p.prosecdef then raise exception 'FAIL: % is not SECURITY DEFINER', f.sig; end if;
    if not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c in ('search_path=""', 'search_path=')) then
      raise exception 'FAIL: % does not set search_path = '''' (proconfig %)', f.sig, p.proconfig;
    end if;
    if p.lanname <> f.lang or p.vol <> f.vol then
      raise exception 'FAIL: % language or volatility changed (%, %)', f.sig, p.lanname, p.vol;
    end if;
    if p.args not ilike f.args then raise exception 'FAIL: % arguments or defaults changed (%)', f.sig, p.args; end if;
  end loop;

  -- EXECUTE after apply: parent_view anon + authenticated; due_reminders service_role only; upcoming_deadlines_for no client.
  if not has_function_privilege('anon', 'public.parent_view(text,date)', 'execute')
     or not has_function_privilege('authenticated', 'public.parent_view(text,date)', 'execute') then
    raise exception 'FAIL: parent_view lost EXECUTE for anon or authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.due_reminders(date)', 'execute') then
    raise exception 'FAIL: due_reminders lost EXECUTE for service_role';
  end if;
  if has_function_privilege('anon', 'public.due_reminders(date)', 'execute')
     or has_function_privilege('authenticated', 'public.due_reminders(date)', 'execute') then
    raise exception 'FAIL: due_reminders is executable by anon or authenticated';
  end if;
  if has_function_privilege('anon', 'public.upcoming_deadlines_for(uuid[],date,date)', 'execute')
     or has_function_privilege('authenticated', 'public.upcoming_deadlines_for(uuid[],date,date)', 'execute') then
    raise exception 'FAIL: upcoming_deadlines_for is executable by anon or authenticated';
  end if;
  if exists (select 1 from pg_proc pr, aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) a
              where pr.oid in ('public.upcoming_deadlines_for(uuid[],date,date)'::regprocedure,
                               'public.due_reminders(date)'::regprocedure, 'public.parent_view(text,date)'::regprocedure)
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'FAIL: PUBLIC has EXECUTE on a replaced function';
  end if;

  -- college_summary: same columns in the same order, security_invoker kept, SELECT for anon and authenticated.
  if (select string_agg(attname::text, ',' order by attnum) from pg_attribute
       where attrelid = 'public.college_summary'::regclass and attnum > 0 and not attisdropped)
     is distinct from 'id,slug,name,short_name,country_code,state_region,city,latitude,longitude,setting,control,'
                   || 'undergrad_enrollment,pct_international_ug,general_tier,cds_year,applicants,admits,admit_rate,'
                   || 'ed_admit_rate,intl_admit_rate,gpa_avg,sat_p25,sat_p50,sat_p75,act_p25,act_p50,act_p75,test_policy,'
                   || 'english_policy,total_coa_usd,tuition_usd,tuition_out_of_state_usd,tuition_intl_usd,intl_aid_policy,'
                   || 'tiers,plans,next_deadline' then
    raise exception 'FAIL: college_summary columns changed';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.college_summary'::regclass
                  and 'security_invoker=true' = any (coalesce(reloptions, '{}'::text[]))) then
    raise exception 'FAIL: college_summary lost security_invoker';
  end if;
  if not has_table_privilege('anon', 'public.college_summary', 'select')
     or not has_table_privilege('authenticated', 'public.college_summary', 'select') then
    raise exception 'FAIL: college_summary lost SELECT for anon or authenticated';
  end if;
end $$;

-- ═════════════ part B: the constraints refuse a bad intake and a course of another college ═════════════
-- (Positive controls: A1 / K1 were stored with 's1', CX with smoke-gb's own course.)
do $$
begin
  begin
    insert into public.deadlines (institution_id, cycle, kind, label, due_date, intake)
    values ('00000000-0000-4000-8000-000000000a02', '2026-27', 'application', 'bad intake', '2027-01-01', 's3');
    raise exception 'FAIL: intake s3 was accepted';
  exception when check_violation then null;
  end;
  begin
    -- smoke-gb row pointing at smoke-au's course x
    insert into public.deadlines (institution_id, cycle, kind, label, due_date, program_id)
    values ('00000000-0000-4000-8000-000000000a01', '2026-27', 'application', 'cross college', '2027-01-01',
            '00000000-0000-4000-8000-000000000b03');
    raise exception 'FAIL: a deadline accepted a course of another college';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ═════════════ part C: upcoming_deadlines_for (feeds the teacher and parent views), checks (a)-(d) ═════════════
-- Explicit window 2026-09-01 .. 2027-12-31 (holds every fixture row). Each case first asserts that every expected row
-- is there (so it can't pass on an empty result), then that nothing else is, then that no row came twice.
do $$
declare
  c record;
  got text[];
begin
  for c in select * from (values
      ('(a) GB course x, plan RD',     '00000000-0000-4000-8000-0000000009e1'::uuid, 'smoke-gb', '2026-09-01'::date, array['CX', 'S']),
      ('(a) GB course y',              '00000000-0000-4000-8000-0000000009e4'::uuid, 'smoke-gb', '2026-09-01'::date, array['CY', 'S']),
      ('(b) GB no course',             '00000000-0000-4000-8000-0000000009e2'::uuid, 'smoke-gb', '2026-09-01'::date, array['U13', 'U15', 'S']),
      ('(b) GB unknown course',        '00000000-0000-4000-8000-0000000009e3'::uuid, 'smoke-gb', '2026-09-01'::date, array['U13', 'U15', 'S']),
      ('(c) AU course x, s2',          '00000000-0000-4000-8000-0000000009f1'::uuid, 'smoke-au', '2026-09-01'::date, array['A2']),
      ('(c) AU course x',              '00000000-0000-4000-8000-0000000009f2'::uuid, 'smoke-au', '2026-09-01'::date, array['K1', 'A2']),
      ('(c) AU no course',             '00000000-0000-4000-8000-0000000009f3'::uuid, 'smoke-au', '2026-09-01'::date, array['A1', 'A2']),
      ('(c) AU course x, intake s3',   '00000000-0000-4000-8000-0000000009f4'::uuid, 'smoke-au', '2026-09-01'::date, array['K1', 'A2']),
      -- K1 (2026-10-31) is outside this window but still replaces A1 (rule 2 counts course rows of any date) ...
      ('(c) AU course x, from 11-01',  '00000000-0000-4000-8000-0000000009f2'::uuid, 'smoke-au', '2026-11-01'::date, array['A2']),
      -- ... while the same window does hold A1 for a student without a course.
      ('(c) AU no course, from 11-01', '00000000-0000-4000-8000-0000000009f3'::uuid, 'smoke-au', '2026-11-01'::date, array['A1', 'A2']),
      ('(d) US plan ED',               '00000000-0000-4000-8000-0000000009d1'::uuid, 'smoke-us', '2026-09-01'::date, array['ED', 'S']),
      ('(d) US plan RD, odd checklist','00000000-0000-4000-8000-0000000009d2'::uuid, 'smoke-us', '2026-09-01'::date, array['RD', 'S'])
    ) t(name, sid, inst, from_date, want)
  loop
    select coalesce(array_agg(x.label), '{}') into got
      from public.upcoming_deadlines_for(array[c.sid], c.from_date, '2027-12-31') x
     where x.college_slug = c.inst;
    if not (got @> c.want) then
      raise exception 'FAIL: upcoming_deadlines_for % is missing a row: want %, got %', c.name, c.want, got;
    end if;
    if not (got <@ c.want) then
      raise exception 'FAIL: upcoming_deadlines_for % has an extra row: want %, got %', c.name, c.want, got;
    end if;
    if cardinality(got) <> cardinality(c.want) then
      raise exception 'FAIL: upcoming_deadlines_for % returned a row twice: %', c.name, got;
    end if;
  end loop;
end $$;

-- ═════════════ part D: due_reminders (its own copy of the filters), checks (a')-(d') and (e) ═════════════
-- For every case and EVERY row of that college: due_reminders(row's date - 14) sends it to the student exactly when the
-- row is in the expected set. Every expected row must be seen (counted), so an empty loop can't pass.
do $$
declare
  c record;
  r record;
  want boolean;
  got boolean;
  hits int;
begin
  for c in select * from (values
      ('(a'') GB course x, plan RD',   '00000000-0000-4000-8000-0000000009e1'::uuid, 'smoke-gb', array['CX', 'S']),
      ('(a'') GB course y',            '00000000-0000-4000-8000-0000000009e4'::uuid, 'smoke-gb', array['CY', 'S']),
      ('(b'') GB no course',           '00000000-0000-4000-8000-0000000009e2'::uuid, 'smoke-gb', array['U13', 'U15', 'S']),
      ('(b'') GB unknown course',      '00000000-0000-4000-8000-0000000009e3'::uuid, 'smoke-gb', array['U13', 'U15', 'S']),
      ('(c'') AU course x, s2',        '00000000-0000-4000-8000-0000000009f1'::uuid, 'smoke-au', array['A2']),
      ('(c'') AU course x',            '00000000-0000-4000-8000-0000000009f2'::uuid, 'smoke-au', array['K1', 'A2']),
      ('(c'') AU no course',           '00000000-0000-4000-8000-0000000009f3'::uuid, 'smoke-au', array['A1', 'A2']),
      ('(c'') AU course x, intake s3', '00000000-0000-4000-8000-0000000009f4'::uuid, 'smoke-au', array['K1', 'A2']),
      ('(d'') US plan ED',             '00000000-0000-4000-8000-0000000009d1'::uuid, 'smoke-us', array['ED', 'S']),
      ('(d'') US plan RD',             '00000000-0000-4000-8000-0000000009d2'::uuid, 'smoke-us', array['RD', 'S'])
    ) t(name, sid, inst, want)
  loop
    hits := 0;
    for r in select d.id, d.label, d.due_date from public.deadlines d
               join public.institutions i on i.id = d.institution_id where i.slug = c.inst
    loop
      want := r.label = any (c.want);
      got := exists (select 1 from public.due_reminders(r.due_date - 14) x
                      where x.user_id = c.sid and x.deadline_id = r.id and x.days_before = 14);
      if got <> want then
        raise exception 'FAIL: due_reminders(%) for %: % should be %', r.due_date - 14, c.name, r.label,
          case when want then 'sent' else 'not sent' end;
      end if;
      if got then hits := hits + 1; end if;
    end loop;
    if hits <> cardinality(c.want) then
      raise exception 'FAIL: due_reminders % sent % of the % expected rows', c.name, hits, cardinality(c.want);
    end if;
  end loop;

  -- (e) 2026-12-30 is 14 days before 2027-01-13: G1 gets CX and not U13; G2 (no course) gets U13 that same day.
  if not exists (select 1 from public.due_reminders('2026-12-30') x
                  where x.user_id = '00000000-0000-4000-8000-0000000009e1' and x.deadline_label = 'CX'
                    and x.college_slug = 'smoke-gb' and x.days_before = 14) then
    raise exception 'FAIL: (e) due_reminders(2026-12-30) has no CX for the course-x student';
  end if;
  if exists (select 1 from public.due_reminders('2026-12-30') x
              where x.user_id = '00000000-0000-4000-8000-0000000009e1' and x.deadline_label = 'U13') then
    raise exception 'FAIL: (e) due_reminders(2026-12-30) sends U13 to the course-x student';
  end if;
  if not exists (select 1 from public.due_reminders('2026-12-30') x
                  where x.user_id = '00000000-0000-4000-8000-0000000009e2' and x.deadline_label = 'U13') then
    raise exception 'FAIL: (e) due_reminders(2026-12-30) has no U13 for the student without a course';
  end if;
end $$;

-- ═════════════ part E: college_summary (h), read as anon ═════════════
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare
  r record;
begin
  select s.next_deadline, s.plans into r from public.college_summary s where s.slug = 'smoke-sum';
  if not found then raise exception 'FAIL: (h) anon cannot see smoke-sum in college_summary'; end if;
  if r.next_deadline is distinct from current_date + 60 then
    raise exception 'FAIL: (h) next_deadline should be the university round (%), got %', current_date + 60, r.next_deadline;
  end if;
  -- The course row's EA must not appear; the university row's RD must.
  if r.plans is distinct from array['RD'] then raise exception 'FAIL: (h) plans should be {RD}, got %', r.plans; end if;
  if array_position(r.plans, null) is not null then raise exception 'FAIL: (h) plans has a NULL element'; end if;
end $$;
reset role;

-- ═════════════ part F: parent_view (f), links minted by the students, opened as anon ═════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009e1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform set_config('smoke.parent_g1', public.create_share_link('parent', 'Smoke parent'), true); end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009f1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform set_config('smoke.parent_au1', public.create_share_link('parent', 'Smoke parent'), true); end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009f4","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform set_config('smoke.parent_au4', public.create_share_link('parent', 'Smoke parent'), true); end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009d2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform set_config('smoke.parent_u2', public.create_share_link('parent', 'Smoke parent'), true); end $$;
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare
  keys constant text[] := array['recommendations', 'transcript', 'test_scores', 'english_test', 'no_essays', 'test_plan',
    'english_plan', 'essay_list', 'ucas_ps', 'ucas_reference', 'admissions_test', 'extra_steps', 'course', 'intake'];
  v jsonb;
  c jsonb;
  k text[];
begin
  -- G1 (GB): slug, course, filtered extra_steps and step ticks, essay statuses only, the course's deadlines.
  v := public.parent_view(current_setting('smoke.parent_g1'), current_date);
  if v is null then raise exception 'FAIL: (f) parent_view returned null for an active link (as anon)'; end if;
  select x into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'smoke-gb';
  if c is null then raise exception 'FAIL: (f) no college with slug smoke-gb: %', v -> 'colleges'; end if;
  select coalesce(array_agg(x), '{}') into k from jsonb_object_keys(c -> 'checklist') x;
  if not (k @> keys and k <@ keys) then raise exception 'FAIL: (f) checklist keys should be exactly %, got %', keys, k; end if;
  if c #> '{checklist,course}' is distinct from '"x"'::jsonb then
    raise exception 'FAIL: (f) checklist.course should be "x", got %', c #> '{checklist,course}';
  end if;
  if c #> '{checklist,extra_steps}' is distinct from '{"ok": true}'::jsonb then
    raise exception 'FAIL: (f) extra_steps should be {"ok": true}, got %', c #> '{checklist,extra_steps}';
  end if;
  if c #> '{checklist,ucas_ps}' is distinct from 'true'::jsonb then raise exception 'FAIL: (f) ucas_ps true was dropped'; end if;
  if c #> '{checklist,ucas_reference}' is distinct from 'null'::jsonb then
    raise exception 'FAIL: (f) ucas_reference "yes" should come back null, got %', c #> '{checklist,ucas_reference}';
  end if;
  if c #> '{checklist,admissions_test}' is distinct from 'null'::jsonb then
    raise exception 'FAIL: (f) admissions_test false should come back null, got %', c #> '{checklist,admissions_test}';
  end if;
  if c #> '{checklist,intake}' is distinct from 'null'::jsonb then raise exception 'FAIL: (f) G1 has no intake'; end if;
  if c #> '{checklist,recommendations}' is distinct from 'true'::jsonb then raise exception 'FAIL: (f) recommendations lost'; end if;
  if c #> '{checklist,essay_list}' is distinct from '[{"status": "drafting"}]'::jsonb then
    raise exception 'FAIL: (f) essay_list should hold the status only, got %', c #> '{checklist,essay_list}';
  end if;
  select coalesce(array_agg(d ->> 'label'), '{}') into k from jsonb_array_elements(c -> 'deadlines') d;
  if not (k @> array['CX', 'S'] and k <@ array['CX', 'S'] and cardinality(k) = 2) then
    raise exception 'FAIL: (f) parent deadlines should be CX and S (run before 2027-01-13), got %', k;
  end if;

  -- AU1: intake s2 passes through.
  v := public.parent_view(current_setting('smoke.parent_au1'), current_date);
  select x into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'smoke-au';
  if c is null then raise exception 'FAIL: (f) no college with slug smoke-au for AU1'; end if;
  if c #> '{checklist,intake}' is distinct from '"s2"'::jsonb or c #> '{checklist,course}' is distinct from '"x"'::jsonb then
    raise exception 'FAIL: (f) AU1 should send intake "s2" and course "x", got %', c -> 'checklist';
  end if;

  -- AU4: intake s3 is dropped, the course stays.
  v := public.parent_view(current_setting('smoke.parent_au4'), current_date);
  select x into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'smoke-au';
  if c is null then raise exception 'FAIL: (f) no college with slug smoke-au for AU4'; end if;
  if c #> '{checklist,intake}' is distinct from 'null'::jsonb or c #> '{checklist,course}' is distinct from '"x"'::jsonb then
    raise exception 'FAIL: (f) AU4 should send no intake and course "x", got %', c -> 'checklist';
  end if;

  -- U2: a course that isn't a slug is dropped; s1 passes; extra_steps with nothing stored is null.
  v := public.parent_view(current_setting('smoke.parent_u2'), current_date);
  select x into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'smoke-us';
  if c is null then raise exception 'FAIL: (f) no college with slug smoke-us for U2'; end if;
  if c #> '{checklist,course}' is distinct from 'null'::jsonb or c #> '{checklist,intake}' is distinct from '"s1"'::jsonb
     or c #> '{checklist,extra_steps}' is distinct from 'null'::jsonb then
    raise exception 'FAIL: (f) U2 should send no course, intake "s1" and no extra_steps, got %', c -> 'checklist';
  end if;
end $$;
reset role;

-- ═════════════ part G: teacher views (g), as T1 ═════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009e0","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  g1 constant uuid := '00000000-0000-4000-8000-0000000009e1';
  g2 constant uuid := '00000000-0000-4000-8000-0000000009e2';
  k text[];
begin
  if not exists (select 1 from public.teacher_deadlines(365, current_date) x
                  where x.student_id = g1 and x.college_slug = 'smoke-gb' and x.label = 'CX') then
    raise exception 'FAIL: (g) teacher_deadlines has no CX for the course-x student (run before 2027-01-13)';
  end if;
  if exists (select 1 from public.teacher_deadlines(365, current_date) x
              where x.student_id = g1 and x.college_slug = 'smoke-gb' and x.label = 'U13') then
    raise exception 'FAIL: (g) teacher_deadlines lists U13 for the course-x student';
  end if;
  if not exists (select 1 from public.teacher_deadlines(365, current_date) x
                  where x.student_id = g2 and x.college_slug = 'smoke-gb' and x.label = 'U13') then
    raise exception 'FAIL: (g) teacher_deadlines has no U13 for the student without a course';
  end if;
  -- teacher_student: the same student's college deadlines are exactly CX and S.
  select coalesce(array_agg(d ->> 'label'), '{}') into k
    from jsonb_array_elements(public.teacher_student(g1, current_date) -> 'colleges') c
    cross join lateral jsonb_array_elements(c -> 'deadlines') d
   where c ->> 'slug' = 'smoke-gb';
  if not (k @> array['CX', 'S'] and k <@ array['CX', 'S'] and cardinality(k) = 2) then
    raise exception 'FAIL: (g) teacher_student deadlines should be CX and S, got %', k;
  end if;
end $$;
reset role;

-- ═════════════ part H: deleting a course deletes its rows (on delete cascade) ═════════════
select set_config('request.jwt.claims', '', true);
delete from public.programs where id = '00000000-0000-4000-8000-000000000b02';
do $$
begin
  if exists (select 1 from public.deadlines where id = '00000000-0000-4000-8000-000000000c05') then
    raise exception 'FAIL: CY outlived its course';
  end if;
  if not exists (select 1 from public.deadlines where id = '00000000-0000-4000-8000-000000000c04') then
    raise exception 'FAIL: deleting course y took CX with it';
  end if;
  raise notice 'uk_ca_au_steps smoke test: all checks passed, rolling back';
end $$;

rollback;

-- ═════════════ after the rollback: nothing was kept ═════════════
do $$
begin
  if exists (select 1 from auth.users where id::text like '00000000-0000-4000-8000-0000000009__')
     or exists (select 1 from auth.users where email like 'ukcaau-smoke-%@example.invalid')
     or exists (select 1 from public.institutions where slug in ('smoke-gb', 'smoke-au', 'smoke-us', 'smoke-sum'))
     or exists (select 1 from public.programs where id::text like '00000000-0000-4000-8000-000000000b0_')
     or exists (select 1 from public.deadlines where id::text like '00000000-0000-4000-8000-000000000c__')
     or exists (select 1 from public.share_links where student_id::text like '00000000-0000-4000-8000-0000000009__') then
    raise exception 'FAIL: smoke rows persisted after rollback';
  end if;
  raise notice 'uk_ca_au_steps smoke test passed';
end $$;
