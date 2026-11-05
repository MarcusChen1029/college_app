-- Smoke test for migration 0055_uk_ca_au_after_offer. Run AFTER applying it (or after it in one begin ... rollback for
-- the dry run), owner present. One transaction that ROLLS BACK; the last block proves nothing was kept, reading only
-- tables older than the migration. Success = the last statement returns 'uk_ca_au_after_offer smoke test passed'; a
-- failed check raises 'FAIL: ...'. Run it in the SQL Editor or via execute_sql (both stop at the first error); with
-- psql use -v ON_ERROR_STOP=1, or psql goes on after a FAIL, rolls back and still prints 'passed'.
--
-- Reply-by rule (web/lib/uk-offers.ts replyByDeadline, plan Task 6): GB non-custom college, admitted, uk_reply_by a real
-- YYYY-MM-DD date in the window, uk_reply not firm/insurance/decline, no GB non-custom college of the student Firm.
-- Dates: upcoming_deadlines_for / due_reply_reminders take explicit dates (any run day). teacher_deadlines,
-- teacher_student and parent_view use today = least(greatest(p_today, d - 2), d + 2), d = the server's current_date
-- (0023:17/:55/:109, 0054:160), windows from today. For p_today '2027-04-01' that is d + 2 until 2027-03-29, then
-- 2027-04-01, and d - 2 from 2027-04-04; so parts C and D see the 2027-05-05 row for runs on or before 2027-05-07.
--
-- Fixture (ids 00000000-0000-4000-8000-00000000xxxx): T 10e0 teacher linked to S; S 10e1 student (reminder_days {14},
-- an email, a parent link made in part B). S's colleges: GB1-GB4 1c01-1c04 (GB, aoffer-gb1..4), US 1c05, custom 1c06.
-- Base state: all six admitted with {"uk_reply_by": "2027-05-05"}, no reply: GB1-GB4 have a reply-by row and US / custom,
-- with the same keys, have none, so every "no row" check runs next to rows that show, in the same call.

begin;

-- == setup, as postgres with no JWT claims (the plan-limit trigger then lets inserts pass) ==
select set_config('request.jwt.claims', '', true);

insert into public.countries (code, name) values ('GB', 'United Kingdom'), ('US', 'United States') on conflict (code) do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000010e0', 'afteroffer-smoke-t@example.invalid'),
  ('00000000-0000-4000-8000-0000000010e1', 'afteroffer-smoke-s@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000010e0', 'teacher'), ('00000000-0000-4000-8000-0000000010e1', 'student');
insert into public.student_profiles (user_id, display_name, reminder_emails, reminder_days)
  values ('00000000-0000-4000-8000-0000000010e1', 'Smoke S', true, '{14}'::smallint[]);
insert into public.institutions (id, slug, name, country_code) values
  ('00000000-0000-4000-8000-000000001a01', 'aoffer-gb1', 'After offer Smoke GB1', 'GB'),
  ('00000000-0000-4000-8000-000000001a02', 'aoffer-gb2', 'After offer Smoke GB2', 'GB'),
  ('00000000-0000-4000-8000-000000001a03', 'aoffer-gb3', 'After offer Smoke GB3', 'GB'),
  ('00000000-0000-4000-8000-000000001a04', 'aoffer-gb4', 'After offer Smoke GB4', 'GB'),
  ('00000000-0000-4000-8000-000000001a05', 'aoffer-us', 'After offer Smoke US', 'US');
insert into public.student_colleges (id, user_id, institution_id, custom, status, checklist)
select v.id::uuid, '00000000-0000-4000-8000-0000000010e1'::uuid, v.inst::uuid, v.custom::jsonb, 'admitted'::text,
       '{"uk_reply_by": "2027-05-05"}'::jsonb
from (values
  ('00000000-0000-4000-8000-000000001c01', '00000000-0000-4000-8000-000000001a01', null),
  ('00000000-0000-4000-8000-000000001c02', '00000000-0000-4000-8000-000000001a02', null),
  ('00000000-0000-4000-8000-000000001c03', '00000000-0000-4000-8000-000000001a03', null),
  ('00000000-0000-4000-8000-000000001c04', '00000000-0000-4000-8000-000000001a04', null),
  ('00000000-0000-4000-8000-000000001c05', '00000000-0000-4000-8000-000000001a05', null),
  ('00000000-0000-4000-8000-000000001c06', null, '{"name": "After offer Smoke custom"}')
) v(id, inst, custom);
insert into public.teacher_links (teacher_id, student_id, via, share_essays) values
  ('00000000-0000-4000-8000-0000000010e0', '00000000-0000-4000-8000-0000000010e1', 'individual', true);

-- ===== part A: schema, function headers, grants; redact_checklist on every kind of input =====
do $$
declare
  f record;
  p record;
begin
  if (select format_type(atttypid, atttypmod) || ':' || attnotnull::text || ':' || atthasdef::text from pg_attribute
       where attrelid = 'public.student_profiles'::regclass and attname = 'citizenship' and not attisdropped)
     is distinct from 'text:false:false' then
    raise exception 'FAIL: student_profiles.citizenship missing, or not a nullable text column without a default';
  end if;
  if (select format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || pg_get_expr(d.adbin, d.adrelid)
        from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
       where a.attrelid = 'public.scholarships'::regclass and a.attname = 'currency' and not a.attisdropped)
     is distinct from 'text:true:''USD''::text' then
    raise exception 'FAIL: scholarships.currency missing, or not text not null default ''USD''';
  end if;
  -- the student reaches both columns (table-level grants; parts B and H also write them as the student)
  if not (has_column_privilege('authenticated', 'public.student_profiles', 'citizenship', 'select')
          and has_column_privilege('authenticated', 'public.student_profiles', 'citizenship', 'update')
          and has_column_privilege('authenticated', 'public.scholarships', 'currency', 'select')
          and has_column_privilege('authenticated', 'public.scholarships', 'currency', 'insert')
          and has_column_privilege('authenticated', 'public.scholarships', 'currency', 'update')) then
    raise exception 'FAIL: authenticated lacks a privilege on citizenship or currency';
  end if;

  -- reply_reminder_log: key, cascades, RLS on with no policy, service role only
  if (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.reply_reminder_log'::regclass and contype = 'p')
     is distinct from 'PRIMARY KEY (student_college_id, due_date, days_before)' then
    raise exception 'FAIL: reply_reminder_log primary key should be (student_college_id, due_date, days_before)';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.reply_reminder_log'::regclass and contype = 'f'
        and confdeltype = 'c' and confrelid in ('auth.users'::regclass, 'public.student_colleges'::regclass)) <> 2 then
    raise exception 'FAIL: reply_reminder_log needs ON DELETE CASCADE keys to auth.users and student_colleges';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.reply_reminder_log'::regclass)
     or exists (select 1 from pg_policy where polrelid = 'public.reply_reminder_log'::regclass) then
    raise exception 'FAIL: reply_reminder_log should have RLS on and no policy';
  end if;
  if has_table_privilege('anon', 'public.reply_reminder_log', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.reply_reminder_log', 'select,insert,update,delete') then
    raise exception 'FAIL: a client role has a privilege on reply_reminder_log';
  end if;
  if not (has_table_privilege('service_role', 'public.reply_reminder_log', 'select')
          and has_table_privilege('service_role', 'public.reply_reminder_log', 'insert')) then
    raise exception 'FAIL: service_role cannot select and insert reply_reminder_log';
  end if;

  -- headers: language, volatility, SECURITY DEFINER or not, search_path = '', arguments, result
  for f in select * from (values
      ('public.upcoming_deadlines_for(uuid[],date,date)', 'sql', 's', true, 'p_students uuid[], p_from date, p_to date',
       'TABLE(student_id uuid, college_id uuid, college_name text, college_slug text, due_date date, kind text, label text, plan_key text, status text)'),
      ('public.due_reply_reminders(date)', 'sql', 's', true, 'today date DEFAULT CURRENT_DATE',
       'TABLE(user_id uuid, email text, student_college_id uuid, days_before smallint, due_date date, college_name text, college_slug text, label text)'),
      ('public.redact_checklist(jsonb,boolean)', 'sql', 'i', false, 'p jsonb, p_share boolean', 'jsonb')
    ) v(sig, lang, vol, secdef, args, res)
  loop
    select pr.prosecdef, pr.proconfig, l.lanname, pr.provolatile::text as vol,
           pg_get_function_arguments(pr.oid) as args, pg_get_function_result(pr.oid) as res
      into p from pg_proc pr join pg_language l on l.oid = pr.prolang where pr.oid = f.sig::regprocedure;
    if p.prosecdef <> f.secdef then raise exception 'FAIL: % SECURITY DEFINER should be %', f.sig, f.secdef; end if;
    if not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c in ('search_path=""', 'search_path=')) then
      raise exception 'FAIL: % does not set search_path = '''' (proconfig %)', f.sig, p.proconfig;
    end if;
    if p.lanname <> f.lang or p.vol <> f.vol then
      raise exception 'FAIL: % language or volatility changed (%, %)', f.sig, p.lanname, p.vol;
    end if;
    if p.args is distinct from f.args then raise exception 'FAIL: % arguments changed (%)', f.sig, p.args; end if;
    if p.res is distinct from f.res then raise exception 'FAIL: % result changed (%)', f.sig, p.res; end if;
  end loop;

  -- EXECUTE: due_reply_reminders service_role only; upcoming_deadlines_for and redact_checklist no client; no PUBLIC
  if not has_function_privilege('service_role', 'public.due_reply_reminders(date)', 'execute') then
    raise exception 'FAIL: service_role cannot execute due_reply_reminders';
  end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) r,
                           unnest(array['public.due_reply_reminders(date)', 'public.upcoming_deadlines_for(uuid[],date,date)',
                                        'public.redact_checklist(jsonb,boolean)']) fn
              where has_function_privilege(r::name, fn, 'execute')) then
    raise exception 'FAIL: anon or authenticated can execute due_reply_reminders, upcoming_deadlines_for or redact_checklist';
  end if;
  if exists (select 1 from pg_proc pr, aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) a
              where pr.oid in ('public.due_reply_reminders(date)'::regprocedure, 'public.redact_checklist(jsonb,boolean)'::regprocedure,
                               'public.upcoming_deadlines_for(uuid[],date,date)'::regprocedure)
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'FAIL: PUBLIC has EXECUTE on a new or replaced function';
  end if;
  if not has_function_privilege('anon', 'public.parent_view(text,date)', 'execute') then
    raise exception 'FAIL: parent_view lost EXECUTE for anon';
  end if;

  -- redact_checklist = 0022's result minus uk_conditions; a non-object comes back as it is (no error)
  for f in select * from (values
      ('"junk"', 'false', '"junk"'),
      ('[1, "uk_conditions"]', 'false', '[1, "uk_conditions"]'),
      ('null', 'true', 'null'),
      ('{"a": 1, "uk_conditions": "x"}', 'true', '{"a": 1}'),
      ('{"a": 1, "uk_conditions": "x"}', 'false', '{"a": 1}'),
      ('{"essay_list": "x", "uk_conditions": "y"}', 'false', '{"essay_list": "x"}'),
      ('{"essay_list": [{"title": "t", "url": "u", "status": "done"}], "uk_conditions": "x"}', 'false', '{"essay_list": [{"status": "done"}]}'),
      ('{"essay_list": [{"title": "t", "status": "done"}], "uk_conditions": "x"}', 'true', '{"essay_list": [{"title": "t", "status": "done"}]}'),
      ('{"essay_list": [{"title": "t", "status": "s"}]}', null, '{"essay_list": [{"status": "s"}]}'),
      ('{"a": 1}', null, '{"a": 1}')
    ) v(input, share, want)
  loop
    if public.redact_checklist(f.input::jsonb, f.share::boolean) is distinct from f.want::jsonb then
      raise exception 'FAIL: redact_checklist(%, %) = %, want %', f.input, f.share,
        public.redact_checklist(f.input::jsonb, f.share::boolean), f.want;
    end if;
  end loop;
  if public.redact_checklist(null, false) is not null then raise exception 'FAIL: redact_checklist(null) is not null'; end if;
end $$;

-- ===== part B: (a) citizenship is the student's own field; an AI token can't write it =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
begin
  if current_user <> 'authenticated' then raise exception 'FAIL: (a) running as %, not authenticated', current_user; end if;
  update public.student_profiles set citizenship = 'TW' where user_id = '00000000-0000-4000-8000-0000000010e1';
  get diagnostics n = row_count;
  if n <> 1 or (select citizenship from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000010e1')
               is distinct from 'TW' then
    raise exception 'FAIL: (a) the student could not set citizenship TW (% rows)', n;
  end if;
  begin
    update public.student_profiles set citizenship = 'tw' where user_id = '00000000-0000-4000-8000-0000000010e1';
    raise exception 'FAIL: (a) citizenship ''tw'' was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.student_profiles set citizenship = 'TWN' where user_id = '00000000-0000-4000-8000-0000000010e1';
    raise exception 'FAIL: (a) citizenship ''TWN'' was accepted';
  exception when check_violation then null;
  end;
  -- the parent link for parts C and G (create_share_link is the student's own RPC)
  perform set_config('smoke.ao_parent', public.create_share_link('parent', 'Smoke parent'), true);
end $$;
reset role;

-- The same student as an AI connection (same JWT plus client_id, 0041:43-46): the restrictive no_oauth_clients policy
-- (0043:183) closes the base table, so the UPDATE matches 0 rows rather than raising, and ai_student_profiles has no
-- citizenship column. Control: the view's sat_total update hits 1 row (right sub; the 0 is the policy).
select set_config('request.jwt.claims',
                  '{"sub":"00000000-0000-4000-8000-0000000010e1","role":"authenticated","client_id":"smoke-client"}', true);
set local role authenticated;
do $$
declare
  n int;
begin
  if current_user <> 'authenticated' then raise exception 'FAIL: (a) running as %, not authenticated', current_user; end if;
  update public.student_profiles set citizenship = 'GB' where user_id = '00000000-0000-4000-8000-0000000010e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: (a) an OAuth token updated % base profile rows, want 0', n; end if;
  begin
    update public.ai_student_profiles set citizenship = 'GB' where user_id = '00000000-0000-4000-8000-0000000010e1';
    raise exception 'FAIL: (a) ai_student_profiles accepted a citizenship update';
  exception when undefined_column then null;
  end;
  update public.ai_student_profiles set sat_total = 1400 where user_id = '00000000-0000-4000-8000-0000000010e1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: (a) positive control: the OAuth view update of sat_total hit % rows, want 1', n; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '', true);
do $$
begin
  if (select citizenship || ':' || sat_total from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000010e1')
     is distinct from 'TW:1400' then
    raise exception 'FAIL: (a) after the OAuth calls the profile should hold TW and 1400';
  end if;
  -- (b) the AI view has no citizenship, while the same lookup sees sat_total there and citizenship on the table
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'ai_student_profiles' and column_name = 'citizenship')
     or (select count(*) from information_schema.columns where table_schema = 'public'
          and (table_name, column_name) in (('ai_student_profiles', 'sat_total'), ('student_profiles', 'citizenship'))) <> 2 then
    raise exception 'FAIL: (b) ai_student_profiles has citizenship, or the positive lookups found nothing';
  end if;
end $$;

-- ===== part C: (b) + (c) the parent link, opened as anon =====
set local role anon;
do $$
declare
  v jsonb := public.parent_view(current_setting('smoke.ao_parent'), '2027-04-01');
  c jsonb;
begin
  if current_user <> 'anon' then raise exception 'FAIL: (b) running as %, not anon', current_user; end if;
  if v is null or strpos(v::text, '"aoffer-gb1"') = 0 then raise exception 'FAIL: (b) parent_view null or without aoffer-gb1'; end if;
  if strpos(v::text, 'citizenship') > 0 or strpos(v::text, '"TW"') > 0 then
    raise exception 'FAIL: (b) parent_view shows the citizenship';
  end if;
  select x into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'aoffer-gb1';
  if (select count(*) from jsonb_array_elements(c -> 'deadlines') d
       where d = '{"due_date": "2027-05-05", "kind": "other", "label": "UCAS reply-by date", "plan": null}') <> 1 then
    raise exception 'FAIL: (c) parent deadlines of GB1 should hold the reply-by row once (run on or before 2027-05-07): %', c -> 'deadlines';
  end if;
end $$;
reset role;

-- ===== part D: (b) + (c) the teacher's views, as T =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e0","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  s constant uuid := '00000000-0000-4000-8000-0000000010e1';
  v jsonb := public.teacher_student('00000000-0000-4000-8000-0000000010e1', '2027-04-01');
  t text;
begin
  if current_user <> 'authenticated' then raise exception 'FAIL: (b) running as %, not authenticated', current_user; end if;
  if strpos(v::text, '"aoffer-gb1"') = 0 then raise exception 'FAIL: (b) teacher_student has no aoffer-gb1'; end if;
  if strpos(v::text, 'citizenship') > 0 or strpos(v::text, '"TW"') > 0 then
    raise exception 'FAIL: (b) teacher_student shows the citizenship';
  end if;
  -- the whole roster row as text (a jsonb field's quotes come out doubled there, so search without them)
  select string_agg(r::text, ' ') into t from public.teacher_roster('2027-04-01') r where r.student_id = s;
  if strpos(coalesce(t, ''), 'aoffer-gb1') = 0 or strpos(t, 'citizenship') > 0 or strpos(t, 'TW') > 0 then
    raise exception 'FAIL: (b) teacher_roster has no aoffer-gb1 or shows the citizenship';
  end if;
  if (select count(*) from jsonb_array_elements(v -> 'colleges') c, jsonb_array_elements(c -> 'deadlines') d
       where c ->> 'slug' = 'aoffer-gb1'
         and d = '{"due_date": "2027-05-05", "kind": "other", "label": "UCAS reply-by date", "plan": null}') <> 1 then
    raise exception 'FAIL: (c) teacher_student deadlines of GB1 should hold the reply-by row once (run on or before 2027-05-07)';
  end if;
  if (select count(*) from public.teacher_deadlines(365, '2027-04-01') x
       where x.student_id = s and x.college_slug = 'aoffer-gb1' and x.due_date = '2027-05-05' and x.kind = 'other'
         and x.label = 'UCAS reply-by date' and x.status = 'admitted') <> 1 then
    raise exception 'FAIL: (c) teacher_deadlines should hold GB1''s reply-by row once (run on or before 2027-05-07)';
  end if;
  -- the US and custom colleges have the same keys and no row
  if exists (select 1 from public.teacher_deadlines(365, '2027-04-01') x
              where x.student_id = s and x.college_slug in ('aoffer-us', 'custom-00000000-0000-4000-8000-000000001c06')) then
    raise exception 'FAIL: (d) teacher_deadlines lists a reply-by date for the US or the custom college';
  end if;
end $$;
reset role;

-- ===== part E: (c)-(e) upcoming_deadlines_for and due_reply_reminders, case by case =====
select set_config('request.jwt.claims', '', true);
do $$
declare
  s constant uuid := '00000000-0000-4000-8000-0000000010e1';
  ids constant uuid[] := array['00000000-0000-4000-8000-000000001c01', '00000000-0000-4000-8000-000000001c02',
    '00000000-0000-4000-8000-000000001c03', '00000000-0000-4000-8000-000000001c04', '00000000-0000-4000-8000-000000001c05',
    '00000000-0000-4000-8000-000000001c06']::uuid[];
  names constant text[] := array['GB1', 'GB2', 'GB3', 'GB4', 'US', 'custom'];
  r record;
  c record;
  k int;
  w int;
  n int;
  n_any int;
  n_ok int;
  d_any int;
  d_ok int;
  cases int := 0;
begin
  -- (c) the exact row; both ends of the window are inclusive
  select * into r from public.upcoming_deadlines_for(array[s], '2027-04-01', '2027-06-01') x where x.college_id = ids[1];
  if not found or r.student_id <> s or r.college_name <> 'After offer Smoke GB1' or r.college_slug <> 'aoffer-gb1'
     or r.due_date <> '2027-05-05' or r.kind <> 'other' or r.label <> 'UCAS reply-by date' or r.plan_key is not null
     or r.status <> 'admitted' then
    raise exception 'FAIL: (c) upcoming_deadlines_for row of GB1 is wrong or missing: %', r;
  end if;
  if not exists (select 1 from public.upcoming_deadlines_for(array[s], '2027-05-05', '2027-05-05') x where x.college_id = ids[1])
     or exists (select 1 from public.upcoming_deadlines_for(array[s], '2027-05-06', '2027-06-01') x where x.college_id = ids[1])
     or exists (select 1 from public.upcoming_deadlines_for(array[s], '2027-04-01', '2027-05-04') x where x.college_id = ids[1]) then
    raise exception 'FAIL: (c) the reply-by row ignores the window';
  end if;
  -- (e) the exact reminder row; 13 days before is not in reminder_days {14}
  select * into r from public.due_reply_reminders('2027-04-21') x where x.student_college_id = ids[1];
  if not found or r.user_id <> s or r.email <> 'afteroffer-smoke-s@example.invalid' or r.days_before <> 14
     or r.due_date <> '2027-05-05' or r.college_name <> 'After offer Smoke GB1' or r.college_slug <> 'aoffer-gb1'
     or r.label <> 'UCAS reply-by date' then
    raise exception 'FAIL: (e) due_reply_reminders row of GB1 is wrong or missing: %', r;
  end if;
  if exists (select 1 from public.due_reply_reminders('2027-04-22') x where x.user_id = s) then
    raise exception 'FAIL: (e) due_reply_reminders sends 13 days before, which is not in reminder_days';
  end if;

  -- (d)/(e) per case: reset (6 rows) and GB1's row is back; apply chk {"<college #>": patch merged in} and st
  -- {"<college #>": status}, which must land (one row per college named, each holding its patch and status, so a
  -- no-change case can't pass on a missed update); then BOTH functions give one right row per college in want, none else.
  for c in select * from (values
      ('base: GB1-GB4 rows; US and custom, same keys, none', '{}', '{}', array['GB1', 'GB2', 'GB3', 'GB4']),
      ('GB1 Firm declines every other UK offer', '{"1": {"uk_reply": "firm"}}', '{}', '{}'),
      ('GB1 Insurance', '{"1": {"uk_reply": "insurance"}}', '{}', array['GB2', 'GB3', 'GB4']),
      ('GB1 Decline', '{"1": {"uk_reply": "decline"}}', '{}', array['GB2', 'GB3', 'GB4']),
      ('GB1 "FIRM" is no valid reply (reads as unset)', '{"1": {"uk_reply": "FIRM"}}', '{}', array['GB1', 'GB2', 'GB3', 'GB4']),
      ('GB1 submitted', '{}', '{"1": "submitted"}', array['GB2', 'GB3', 'GB4']),
      ('GB1 enrolled', '{}', '{"1": "enrolled"}', array['GB2', 'GB3', 'GB4']),
      ('GB1 uk_reply_by not-a-date', '{"1": {"uk_reply_by": "not-a-date"}}', '{}', array['GB2', 'GB3', 'GB4']),
      ('GB1 uk_reply_by 2027-5-5', '{"1": {"uk_reply_by": "2027-5-5"}}', '{}', array['GB2', 'GB3', 'GB4']),
      ('GB1 uk_reply_by 2027-02-30', '{"1": {"uk_reply_by": "2027-02-30"}}', '{}', array['GB2', 'GB3', 'GB4']),
      ('GB1 uk_reply_by null', '{"1": {"uk_reply_by": null}}', '{}', array['GB2', 'GB3', 'GB4']),
      ('GB2 Firm + GB3 Insurance: GB1 and GB4 (Not yet, same date) get none',
       '{"2": {"uk_reply": "firm"}, "3": {"uk_reply": "insurance"}}', '{}', '{}'),
      ('GB3 Insurance alone declines nothing', '{"3": {"uk_reply": "insurance"}}', '{}', array['GB1', 'GB2', 'GB4']),
      ('GB2 "FIRM" declines nothing', '{"2": {"uk_reply": "FIRM"}}', '{}', array['GB1', 'GB2', 'GB3', 'GB4']),
      ('GB2 Firm while submitted still declines the rest', '{"2": {"uk_reply": "firm"}}', '{"2": "submitted"}', '{}'),
      ('US Firm declines no UK offer', '{"5": {"uk_reply": "firm"}}', '{}', array['GB1', 'GB2', 'GB3', 'GB4']),
      ('custom Firm declines no UK offer', '{"6": {"uk_reply": "firm"}}', '{}', array['GB1', 'GB2', 'GB3', 'GB4'])
    ) t(name, chk, st, want)
  loop
    cases := cases + 1;
    update public.student_colleges set status = 'admitted', checklist = '{"uk_reply_by": "2027-05-05"}' where user_id = s;
    get diagnostics n = row_count;
    if n <> 6
       or not exists (select 1 from public.upcoming_deadlines_for(array[s], '2027-04-01', '2027-06-01') x where x.college_id = ids[1])
       or not exists (select 1 from public.due_reply_reminders('2027-04-21') x where x.student_college_id = ids[1]) then
      raise exception 'FAIL: (d) the reset before "%" hit % rows, or GB1''s reply-by row is not back', c.name, n;
    end if;
    update public.student_colleges sc
       set checklist = sc.checklist || coalesce(c.chk::jsonb -> g.i::text, '{}'),
           status = coalesce(c.st::jsonb ->> g.i::text, sc.status)
      from generate_subscripts(ids, 1) g(i)
     where sc.id = ids[g.i] and (c.chk::jsonb ? g.i::text or c.st::jsonb ? g.i::text);
    get diagnostics n = row_count;
    if n <> (select count(*) from (select jsonb_object_keys(c.chk::jsonb) union select jsonb_object_keys(c.st::jsonb)) x)
       or exists (select 1 from jsonb_each(c.chk::jsonb) e join public.student_colleges sc on sc.id = ids[e.key::int]
                   where not sc.checklist @> e.value)
       or exists (select 1 from jsonb_each_text(c.st::jsonb) e join public.student_colleges sc on sc.id = ids[e.key::int]
                   where sc.status <> e.value) then
      raise exception 'FAIL: (d) the change of "%" did not land (% rows)', c.name, n;
    end if;
    for k in 1 .. 6 loop
      w := case when names[k] = any (c.want) then 1 else 0 end;
      select count(*), count(*) filter (where x.student_id = s and x.due_date = '2027-05-05' and x.kind = 'other'
                                          and x.label = 'UCAS reply-by date' and x.plan_key is null)
        into n_any, n_ok
        from public.upcoming_deadlines_for(array[s], '2027-04-01', '2027-06-01') x where x.college_id = ids[k];
      select count(*), count(*) filter (where x.user_id = s and x.days_before = 14 and x.due_date = '2027-05-05'
                                          and x.label = 'UCAS reply-by date')
        into d_any, d_ok
        from public.due_reply_reminders('2027-04-21') x where x.student_college_id = ids[k];
      if n_any <> w or n_ok <> w or d_any <> w or d_ok <> w then
        raise exception 'FAIL: (d)/(e) "%": % should have % reply-by row; upcoming_deadlines_for % (% right), due_reply_reminders % (% right)',
          c.name, names[k], w, n_any, n_ok, d_any, d_ok;
      end if;
    end loop;
  end loop;
  if cases <> 17 then raise exception 'FAIL: (d) ran % cases, want 17', cases; end if;

  -- (e) the log: a sent reminder isn't sent again; a log row for another date or day count doesn't block one
  update public.student_colleges set status = 'admitted', checklist = '{"uk_reply_by": "2027-05-05"}' where user_id = s;
  insert into public.reply_reminder_log (user_id, student_college_id, due_date, days_before) values
    (s, ids[1], '2027-05-05', 14), (s, ids[4], '2027-06-02', 14), (s, ids[4], '2027-05-05', 3);
  if exists (select 1 from public.due_reply_reminders('2027-04-21') x where x.student_college_id = ids[1]) then
    raise exception 'FAIL: (e) a logged reply-by reminder is due again';
  end if;
  if not exists (select 1 from public.due_reply_reminders('2027-04-21') x where x.student_college_id = ids[4]) then
    raise exception 'FAIL: (e) a log row for another date or another day count blocked GB4''s reminder';
  end if;
  if not exists (select 1 from public.upcoming_deadlines_for(array[s], '2027-04-01', '2027-06-01') x where x.college_id = ids[1]) then
    raise exception 'FAIL: (e) the log hid GB1''s row from the deadline views';
  end if;
  -- a moved reply-by date is reminded again (due_date is in the key)
  update public.student_colleges set checklist = '{"uk_reply_by": "2027-05-12"}' where id = ids[1];
  if not exists (select 1 from public.due_reply_reminders('2027-04-28') x where x.student_college_id = ids[1] and x.due_date = '2027-05-12') then
    raise exception 'FAIL: (e) a moved reply-by date is not reminded again';
  end if;
  -- reminders off: nothing for that student (due_reminders' profile join)
  update public.student_profiles set reminder_emails = false where user_id = s;
  if exists (select 1 from public.due_reply_reminders('2027-04-21') x where x.user_id = s) then
    raise exception 'FAIL: (e) due_reply_reminders ignores reminder_emails = false';
  end if;
  update public.student_profiles set reminder_emails = true where user_id = s;
end $$;

-- ===== part F: (e) a signed-in client can't call the reminder function =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if current_user <> 'authenticated' then raise exception 'FAIL: (e) running as %, not authenticated', current_user; end if;
  perform public.due_reply_reminders('2027-04-21');
  raise exception 'FAIL: (e) authenticated could call due_reply_reminders';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ===== part G: (f) teachers never see the offer conditions, essays shared or not =====
-- GB1 has an essay (share false: redact's jsonb_set branch), GB2 none (plain branch); the essay title, shown only when
-- shared, proves the flag changed. Per pass: share_essays set as postgres, then T via set_config('role')
-- (2026-11-02_ai_trial_weekly_smoke_test.sql:55-66), then back.
select set_config('request.jwt.claims', '', true);
update public.student_colleges set checklist =
  '{"uk_offer": "conditional", "uk_conditions": "A*AA in Maths", "uk_reply": "firm", "uk_reply_by": "2027-05-05",
    "essay_list": [{"title": "Smoke secret essay", "url": "https://docs.google.com/document/d/aosmoke", "status": "drafting"}]}'
  where id = '00000000-0000-4000-8000-000000001c01';
update public.student_colleges set checklist = '{"uk_offer": "unconditional", "uk_conditions": "A*AA in Maths", "uk_reply": "insurance"}'
  where id = '00000000-0000-4000-8000-000000001c02';
do $$
declare
  s constant uuid := '00000000-0000-4000-8000-0000000010e1';
  p_share boolean;
  v jsonb;
  c jsonb;
  passes int := 0;
begin
  foreach p_share in array array[true, false] loop
    update public.teacher_links set share_essays = p_share
     where teacher_id = '00000000-0000-4000-8000-0000000010e0' and student_id = s;
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e0","role":"authenticated"}', true);
    perform set_config('role', 'authenticated', true);
    if current_user <> 'authenticated' then raise exception 'FAIL: (f) running as %, not authenticated', current_user; end if;

    v := public.teacher_student(s, current_date);
    if (v ->> 'share_essays')::boolean is distinct from p_share or strpos(v::text, 'A*AA') > 0 then
      raise exception 'FAIL: (f) teacher_student shows the conditions, or share_essays isn''t % ', p_share;
    end if;
    select x -> 'checklist' into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'aoffer-gb1';
    if c ->> 'uk_reply' is distinct from 'firm' or c ->> 'uk_offer' is distinct from 'conditional' or c ? 'uk_conditions' then
      raise exception 'FAIL: (f) GB1 checklist should keep uk_reply / uk_offer and lose uk_conditions (share %): %', p_share, c;
    end if;
    if (c #>> '{essay_list,0,title}' is not distinct from 'Smoke secret essay') <> p_share then
      raise exception 'FAIL: (f) the essay title should show only when shared (share %): %', p_share, c -> 'essay_list';
    end if;
    select x -> 'checklist' into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'aoffer-gb2';
    if c ->> 'uk_reply' is distinct from 'insurance' or c ? 'uk_conditions' then
      raise exception 'FAIL: (f) GB2 checklist should keep uk_reply and lose uk_conditions (share %): %', p_share, c;
    end if;
    select r.colleges into v from public.teacher_roster(current_date) r where r.student_id = s;
    select x -> 'checklist' into c from jsonb_array_elements(v) x where x ->> 'slug' = 'aoffer-gb1';
    if c ->> 'uk_reply' is distinct from 'firm' or c ? 'uk_conditions' or strpos(v::text, 'A*AA') > 0 then
      raise exception 'FAIL: (f) teacher_roster should keep GB1''s uk_reply and hide the conditions (share %): %', p_share, c;
    end if;

    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    passes := passes + 1;
  end loop;
  if passes <> 2 then raise exception 'FAIL: (f) ran % passes, want 2', passes; end if;
end $$;

-- the parent never sees them either (parent_view lists its checklist keys)
set local role anon;
do $$
declare
  v jsonb := public.parent_view(current_setting('smoke.ao_parent'), current_date);
begin
  if current_user <> 'anon' then raise exception 'FAIL: (f) running as %, not anon', current_user; end if;
  if v is null or strpos(v::text, '"aoffer-gb1"') = 0 then raise exception 'FAIL: (f) parent_view lost GB1'; end if;
  if strpos(v::text, 'A*AA') > 0 then raise exception 'FAIL: (f) parent_view shows the conditions'; end if;
end $$;
reset role;

-- ===== part H: (g) scholarship currency, as the student =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000010e1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v text;
  sid uuid;
  n int;
begin
  if current_user <> 'authenticated' then raise exception 'FAIL: (g) running as %, not authenticated', current_user; end if;
  insert into public.scholarships (name, amount_usd) values ('AO smoke default', 1000) returning currency, id into v, sid;
  if v is distinct from 'USD' then raise exception 'FAIL: (g) a scholarship without currency reads back %, want USD', v; end if;
  insert into public.scholarships (name, amount_usd, currency) values ('AO smoke GBP', 500, 'GBP') returning currency into v;
  if v is distinct from 'GBP' then raise exception 'FAIL: (g) GBP reads back %', v; end if;
  begin
    insert into public.scholarships (name, currency) values ('AO smoke EUR', 'EUR');
    raise exception 'FAIL: (g) currency EUR was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.scholarships (name, currency) values ('AO smoke gbp', 'gbp');
    raise exception 'FAIL: (g) currency gbp was accepted';
  exception when check_violation then null;
  end;
  update public.scholarships set currency = 'CAD' where id = sid;
  get diagnostics n = row_count;
  if n <> 1 or (select currency from public.scholarships where id = sid) is distinct from 'CAD' then
    raise exception 'FAIL: (g) the student could not change the currency to CAD';
  end if;
  begin
    update public.scholarships set currency = 'EUR' where id = sid;
    raise exception 'FAIL: (g) an update to EUR was accepted';
  exception when check_violation then null;
  end;
  raise notice 'uk_ca_au_after_offer smoke test: all checks passed, rolling back';
end $$;
reset role;

rollback;

-- ===== after the rollback: nothing was kept (reads only tables older than the migration) =====
do $$
begin
  if exists (select 1 from auth.users where id in ('00000000-0000-4000-8000-0000000010e0', '00000000-0000-4000-8000-0000000010e1')
                                         or email like 'afteroffer-smoke-%@example.invalid')
     or exists (select 1 from public.institutions where slug like 'aoffer-%')
     or exists (select 1 from public.student_colleges where id::text like '00000000-0000-4000-8000-000000001c0_')
     or exists (select 1 from public.scholarships where name like 'AO smoke %')
     or exists (select 1 from public.share_links where student_id = '00000000-0000-4000-8000-0000000010e1') then
    raise exception 'FAIL: smoke rows persisted after rollback';
  end if;
  raise notice 'uk_ca_au_after_offer smoke test passed';
end $$;

-- The pass signal as a result row (execute_sql may not show notices). Reached only if every statement above succeeded.
select 'uk_ca_au_after_offer smoke test passed' as result;
