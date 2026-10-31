-- Smoke test for migration 0049_password_storage. Run in the dashboard SQL Editor AFTER applying 0049 (or paste 0049 right
-- after "begin;" to dry-run the migration and the test together).
-- It creates throwaway users inside one transaction, acts as each of them (website session = JWT without client_id,
-- AI connector = the same JWT plus client_id, anon = no JWT, the owner = postgres without claims) and never commits: the
-- LAST statement deliberately raises "SMOKE RESULT: <n> failures" followed by one PASS/FAIL line per check, which aborts
-- the transaction. Success = "SMOKE RESULT: 0 failures". Real users' rows are only read (section E; E1 expects 0 only
-- when run right after applying 0049, before any student has switched to device mode).
--
-- Cast: S1 a student with a profile row, S2 a student with no profile yet, S3 another student (must stay untouched).

begin;

-- ── setup (postgres) ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000049a1', 'smoke-0049-s1@example.invalid'),
  ('00000000-0000-4000-8000-0000000049a2', 'smoke-0049-s2@example.invalid'),
  ('00000000-0000-4000-8000-0000000049a3', 'smoke-0049-s3@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000049a1', 'student'), ('00000000-0000-4000-8000-0000000049a2', 'student'),
  ('00000000-0000-4000-8000-0000000049a3', 'student');
-- Inserted the way rows existed before 0049: no password_storage given.
insert into public.student_profiles (user_id, display_name, sat_total) values
  ('00000000-0000-4000-8000-0000000049a1', 'Smoke S1', 1300),
  ('00000000-0000-4000-8000-0000000049a3', 'Smoke S3', 1200);

create temp table smoke (n serial primary key, name text, expect text, got text) on commit drop;

-- Claims for a caller: the website session, or (p_ai) the AI connector's OAuth token for the same user.
create function pg_temp.c(p_uid text, p_ai boolean) returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_uid, 'role', 'authenticated')
         || case when p_ai then '{"client_id":"smoke-client"}'::jsonb else '{}'::jsonb end
$$;
-- Runs p_sql as that caller (anon when p_claims is null) with request.path set, after the pre-request hook (as PostgREST
-- does for every Data API request); returns 'ok:<first column>' or 'refused <sqlstate>: <message>'. Back to postgres after.
create function pg_temp.req(p_claims jsonb, p_path text, p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  perform set_config('request.path', coalesce(p_path, ''), true);
  perform set_config('role', case when p_claims is null then 'anon' else coalesce(p_claims ->> 'role', 'authenticated') end, true);
  begin
    perform public.api_request_guard();
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
  exception when others then
    res := 'refused ' || sqlstate || ': ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;
-- The owner in the SQL Editor: postgres, no JWT.
create function pg_temp.own(p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', '', true);
  begin
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
  exception when others then
    res := 'refused ' || sqlstate || ': ' || sqlerrm;
  end;
  return res;
end $$;
create function pg_temp.chk(p_name text, p_expect text, p_got text) returns void language sql as $$
  insert into smoke (name, expect, got) values (p_name, p_expect, p_got)
$$;
-- A profile's password_storage ('none' when there is no row).
create function pg_temp.ps(p_uid uuid) returns text language sql as $$
  select coalesce((select password_storage from public.student_profiles where user_id = p_uid), 'none')
$$;

-- ── A. the column ──
select pg_temp.chk('A1 column is text, not null, default ''vault''', 'text/NO/''vault''::text',
  (select data_type || '/' || is_nullable || '/' || column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'student_profiles' and column_name = 'password_storage'));
select pg_temp.chk('A2 a row inserted without it gets vault', 'vault', pg_temp.ps('00000000-0000-4000-8000-0000000049a1'));
select pg_temp.chk('A3 every existing row is vault or device (nothing else, no null)', '0',
  (select count(*)::text from public.student_profiles where password_storage is null or password_storage not in ('vault', 'device')));
select pg_temp.chk('A4 the check refuses another value (owner)', 'refused 23514',
  pg_temp.own($q$update public.student_profiles set password_storage = 'cloud' where user_id = '00000000-0000-4000-8000-0000000049a1' returning 1$q$));
select pg_temp.chk('A5 not null refuses null (owner)', 'refused 23502',
  pg_temp.own($q$update public.student_profiles set password_storage = null where user_id = '00000000-0000-4000-8000-0000000049a1' returning 1$q$));
select pg_temp.chk('A6 the check is case-sensitive (''Device'' refused)', 'refused 23514',
  pg_temp.own($q$update public.student_profiles set password_storage = 'Device' where user_id = '00000000-0000-4000-8000-0000000049a1' returning 1$q$));
select pg_temp.chk('A7 ...and S1 is still vault after the refused writes', 'vault', pg_temp.ps('00000000-0000-4000-8000-0000000049a1'));

-- ── B. the student, through the website (the paths web/lib/portal-vault-client.ts uses) ──
select pg_temp.chk('B1 student reads own password_storage', 'ok:vault', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', false), '/student_profiles',
  $q$select password_storage from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000049a1'$q$));
select pg_temp.chk('B2 student switches own row to device (upsert of user_id + password_storage, as writeMode sends it)', 'ok:device', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', false), '/student_profiles',
  $q$insert into public.student_profiles (user_id, password_storage) values ('00000000-0000-4000-8000-0000000049a1', 'device')
     on conflict (user_id) do update set password_storage = excluded.password_storage returning password_storage$q$));
select pg_temp.chk('B3 ...stored, and the other fields untouched', 'device/1300/Smoke S1',
  (select password_storage || '/' || sat_total || '/' || display_name from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000049a1'));
select pg_temp.chk('B4 the whole-profile save (fromProfile, no password_storage) leaves it alone', 'ok:1', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', false), '/student_profiles',
  $q$with x as (insert into public.student_profiles (user_id, sat_total, reminder_emails) values ('00000000-0000-4000-8000-0000000049a1', 1350, true)
     on conflict (user_id) do update set sat_total = excluded.sat_total, reminder_emails = excluded.reminder_emails returning 1) select count(*)::text from x$q$));
select pg_temp.chk('B5 ...still device, sat saved', 'device/1350', (select password_storage || '/' || sat_total from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000049a1'));
select pg_temp.chk('B6 student refused another value', 'refused 23514', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', false), '/student_profiles',
  $q$update public.student_profiles set password_storage = 'cloud' where user_id = '00000000-0000-4000-8000-0000000049a1' returning 1$q$));
select pg_temp.chk('B7 student switches back to vault with a plain update', 'ok:vault', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', false), '/student_profiles',
  $q$update public.student_profiles set password_storage = 'vault' where user_id = '00000000-0000-4000-8000-0000000049a1' returning password_storage$q$));
select pg_temp.chk('B8 a student with no profile yet: the mode upsert creates the row (plan free)', 'ok:device', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a2', false), '/student_profiles',
  $q$insert into public.student_profiles (user_id, password_storage) values ('00000000-0000-4000-8000-0000000049a2', 'device')
     on conflict (user_id) do update set password_storage = excluded.password_storage returning password_storage$q$));
select pg_temp.chk('B9 ...the new row', 'device/free', (select password_storage || '/' || plan from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000049a2'));

-- ── C. nobody else ──
select pg_temp.chk('C1 a student can''t change another student''s mode (0 rows)', 'ok:0', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', false), '/student_profiles',
  $q$with x as (update public.student_profiles set password_storage = 'device' where user_id = '00000000-0000-4000-8000-0000000049a3' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('C2 a student can''t read another student''s mode (no row)', 'ok:null', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', false), '/student_profiles',
  $q$select password_storage from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000049a3'$q$));
select pg_temp.chk('C3 a student can''t create another student''s row with a mode (RLS)', 'refused 42501', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', false), '/student_profiles',
  $q$insert into public.student_profiles (user_id, password_storage) values ('00000000-0000-4000-8000-0000000049a3', 'device')
     on conflict (user_id) do update set password_storage = excluded.password_storage returning password_storage$q$));
select pg_temp.chk('C4 anon reads no mode', 'ok:0', pg_temp.req(null, '/student_profiles',
  $q$select count(*)::text from public.student_profiles where password_storage is not null$q$));
select pg_temp.chk('C5 anon changes no mode (0 rows)', 'ok:0', pg_temp.req(null, '/student_profiles',
  $q$with x as (update public.student_profiles set password_storage = 'device' where user_id = '00000000-0000-4000-8000-0000000049a3' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('C6 an AI connection can''t read it through its view (no such column)', 'refused 42703', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', true), '/ai_student_profiles',
  $q$select password_storage from public.ai_student_profiles$q$));
select pg_temp.chk('C7 an AI connection can''t reach the base table at all', 'refused 42501', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', true), '/student_profiles',
  $q$update public.student_profiles set password_storage = 'device' where user_id = '00000000-0000-4000-8000-0000000049a1' returning 1$q$));
select pg_temp.chk('C8 an AI update through its view still works and leaves the mode alone', 'ok:1', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000049a1', true), '/ai_student_profiles',
  $q$with x as (update public.ai_student_profiles set sat_total = 1400 where user_id = '00000000-0000-4000-8000-0000000049a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('C9 ...S1 vault, sat 1400; S3 untouched (vault)', 'vault/1400/vault',
  (select password_storage || '/' || sat_total || '/' || pg_temp.ps('00000000-0000-4000-8000-0000000049a3') from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000049a1'));

-- ── D. not exposed anywhere else ──
select pg_temp.chk('D1 ai_student_profiles has no password_storage column', '0',
  (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'ai_student_profiles' and column_name = 'password_storage'));
select pg_temp.chk('D2 no function mentions password_storage (teacher, share-link, extension RPCs included)', '0',
  (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%password_storage%'));
select pg_temp.chk('D3 no view selects it', '0',
  (select count(*)::text from information_schema.view_column_usage where table_schema = 'public' and table_name = 'student_profiles' and column_name = 'password_storage'));

-- ── E. real rows (read only) ──
select pg_temp.chk('E1 real rows are all vault right after 0049 (nobody switched yet)', '0',
  (select count(*)::text from public.student_profiles where password_storage <> 'vault' and user_id not in
     ('00000000-0000-4000-8000-0000000049a1', '00000000-0000-4000-8000-0000000049a2', '00000000-0000-4000-8000-0000000049a3')));

-- ── result: raises on purpose, so the transaction can never commit ──
do $$
declare f int; s text;
begin
  select count(*) filter (where not coalesce(got like expect || '%', false)),
         string_agg(format('%s %s | %s | %s', case when coalesce(got like expect || '%', false) then 'PASS' else 'FAIL' end, n, name, left(got, 160)), E'\n' order by n)
    into f, s from smoke;
  raise exception E'SMOKE RESULT: % failures\n%', f, s;
end $$;

rollback;
