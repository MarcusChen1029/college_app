-- Smoke test for migration 0051_ai_trial_and_weekly. Run in the dashboard SQL Editor AFTER applying 0051 (or paste 0051
-- right after "begin;" to dry-run the migration and the test together).
-- It creates throwaway users inside one transaction, acts as each of them (website session = JWT without client_id,
-- AI connector = the same JWT plus client_id, anon = no JWT, service role = the deadline-reminders Edge Function,
-- the owner = postgres without claims) and never commits: the LAST statement deliberately raises
-- "SMOKE RESULT: <n> failures" followed by one PASS/FAIL line per check, which aborts the transaction.
-- Success = "SMOKE RESULT: 0 failures". Real users' rows are only read (section I; it expects 0 only when run right after
-- applying 0051, before any student has spent a trial change or turned the weekly email on).
--
-- Cast: S1 student (AI trial, weekly email on, account deleted at the end), S2 student (a second trial user, digest off),
-- S3 teacher with the digest flag on (never due), S4 student with the flag on but no email address (never due), S5 profile
-- with the flag on but no role row (never due), S6 student with no profile (a trial user with no usage row).
-- Dates used for the digest week: Monday 2026-11-02, Wednesday 11-04, Sunday 11-08, the next Monday 11-09.

begin;

-- ── setup (postgres) ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000051a1', 'smoke-0051-s1@example.invalid'),
  ('00000000-0000-4000-8000-0000000051a2', 'smoke-0051-s2@example.invalid'),
  ('00000000-0000-4000-8000-0000000051a3', 'smoke-0051-t3@example.invalid'),
  ('00000000-0000-4000-8000-0000000051a4', null),
  ('00000000-0000-4000-8000-0000000051a5', 'smoke-0051-n5@example.invalid'),
  ('00000000-0000-4000-8000-0000000051a6', 'smoke-0051-s6@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000051a1', 'student'), ('00000000-0000-4000-8000-0000000051a2', 'student'),
  ('00000000-0000-4000-8000-0000000051a3', 'teacher'), ('00000000-0000-4000-8000-0000000051a4', 'student'),
  ('00000000-0000-4000-8000-0000000051a6', 'student');
insert into public.student_profiles (user_id, display_name, weekly_digest) values
  ('00000000-0000-4000-8000-0000000051a1', 'Smoke S1', false),
  ('00000000-0000-4000-8000-0000000051a2', 'Smoke S2', false),
  ('00000000-0000-4000-8000-0000000051a3', 'Smoke T3', true),
  ('00000000-0000-4000-8000-0000000051a4', 'Smoke S4', true),
  ('00000000-0000-4000-8000-0000000051a5', 'Smoke N5', true);

create temp table smoke (n serial primary key, name text, expect text, got text) on commit drop;
-- S1's profile row before any trial call (B12 proves the trial functions never touch it).
create temp table snap on commit drop as
  select md5(to_jsonb(sp)::text) as m from public.student_profiles sp where sp.user_id = '00000000-0000-4000-8000-0000000051a1';

-- Claims for a caller: the website session, or (p_ai) the AI connector's OAuth token for the same user.
create function pg_temp.c(p_uid text, p_ai boolean) returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_uid, 'role', 'authenticated')
         || case when p_ai then '{"client_id":"smoke-client"}'::jsonb else '{}'::jsonb end
$$;
-- The Edge Function's service-role key (no user).
create function pg_temp.svc() returns jsonb language sql immutable as $$ select '{"role":"service_role"}'::jsonb $$;
-- Runs p_sql as that caller (anon when p_claims is null; the claims' role otherwise) with request.path set, after the
-- pre-request hook (as PostgREST does for every Data API request); returns 'ok:<first column>' or
-- 'refused <sqlstate>: <message>'. Back to postgres after.
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
  perform set_config('request.path', '', true);
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
-- Who the digest function returns for p_today, among the throwaway users only: 'a1|2026-11-02' or 'none'.
create function pg_temp.due(p date) returns text language sql as $$
  select pg_temp.req(pg_temp.svc(), '/rpc/due_student_digests',
    format($f$select coalesce(string_agg(right(user_id::text, 2) || '|' || week_start, ',' order by user_id), 'none')
              from public.due_student_digests(%L) where user_id::text like '00000000-0000-4000-8000-0000000051a%%'$f$, p))
$$;

-- ── A. objects and grants ──
select pg_temp.chk('A1 ai_trial_usage.writes_used is smallint, not null, default 0', 'smallint/NO/0',
  (select data_type || '/' || is_nullable || '/' || column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_trial_usage' and column_name = 'writes_used'));
select pg_temp.chk('A2 one row per account (primary key user_id), removed with the account (cascade)', 'PRIMARY KEY (user_id)/c',
  (select (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.ai_trial_usage'::regclass and contype = 'p')
          || '/' || (select confdeltype::text from pg_constraint where conrelid = 'public.ai_trial_usage'::regclass and contype = 'f')));
select pg_temp.chk('A3 writes_used above 100 refused (owner)', 'refused 23514',
  pg_temp.own($q$insert into public.ai_trial_usage (user_id, writes_used) values ('00000000-0000-4000-8000-0000000051a6', 101) returning 1$q$));
select pg_temp.chk('A4 writes_used below 0 refused (owner)', 'refused 23514',
  pg_temp.own($q$insert into public.ai_trial_usage (user_id, writes_used) values ('00000000-0000-4000-8000-0000000051a6', -1) returning 1$q$));
select pg_temp.chk('A5 both new tables have RLS on and no policy', 'true/0/true/0',
  (select (select relrowsecurity::text from pg_class where oid = 'public.ai_trial_usage'::regclass) || '/'
       || (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'ai_trial_usage') || '/'
       || (select relrowsecurity::text from pg_class where oid = 'public.student_digest_log'::regclass) || '/'
       || (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'student_digest_log')));
select pg_temp.chk('A6 anon and authenticated hold no privilege (table or column) on either table', '0',
  (select count(*)::text from unnest(array['anon', 'authenticated']) r, unnest(array['public.ai_trial_usage', 'public.student_digest_log']) t
    where has_table_privilege(r::name, t, 'select,insert,update,delete,truncate,references,trigger')
       or has_any_column_privilege(r::name, t, 'select,insert,update,references')));
select pg_temp.chk('A7 service_role can select / insert / update / delete student_digest_log', 'select=true,insert=true,update=true,delete=true',
  (select string_agg(p || '=' || has_table_privilege('service_role', 'public.student_digest_log', p)::text, ',' order by array_position(array['select', 'insert', 'update', 'delete'], p))
     from unnest(array['select', 'insert', 'update', 'delete']) p));
select pg_temp.chk('A8 ai_trial_writes_left: authenticated yes / anon no / PUBLIC no', 'true/false/0',
  (select has_function_privilege('authenticated', 'public.ai_trial_writes_left()', 'execute')::text || '/'
       || has_function_privilege('anon', 'public.ai_trial_writes_left()', 'execute')::text || '/'
       || (select count(*)::text from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.ai_trial_writes_left()'::regprocedure and a.grantee = 0)));
select pg_temp.chk('A9 consume_ai_trial_write: authenticated yes / anon no / PUBLIC no', 'true/false/0',
  (select has_function_privilege('authenticated', 'public.consume_ai_trial_write()', 'execute')::text || '/'
       || has_function_privilege('anon', 'public.consume_ai_trial_write()', 'execute')::text || '/'
       || (select count(*)::text from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.consume_ai_trial_write()'::regprocedure and a.grantee = 0)));
select pg_temp.chk('A10 due_student_digests: authenticated no / anon no / service_role yes / PUBLIC no', 'false/false/true/0',
  (select has_function_privilege('authenticated', 'public.due_student_digests(date)', 'execute')::text || '/'
       || has_function_privilege('anon', 'public.due_student_digests(date)', 'execute')::text || '/'
       || has_function_privilege('service_role', 'public.due_student_digests(date)', 'execute')::text || '/'
       || (select count(*)::text from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.due_student_digests(date)'::regprocedure and a.grantee = 0)));
select pg_temp.chk('A11 api_request_guard keeps its grants (anon, authenticated, service_role yes / PUBLIC no)', 'true/true/true/0',
  (select has_function_privilege('anon', 'public.api_request_guard()', 'execute')::text || '/'
       || has_function_privilege('authenticated', 'public.api_request_guard()', 'execute')::text || '/'
       || has_function_privilege('service_role', 'public.api_request_guard()', 'execute')::text || '/'
       || (select count(*)::text from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.api_request_guard()'::regprocedure and a.grantee = 0)));
select pg_temp.chk('A12 the three new functions are SECURITY DEFINER with an empty search_path', '3',
  (select count(*)::text from pg_proc where oid in ('public.ai_trial_writes_left()'::regprocedure, 'public.consume_ai_trial_write()'::regprocedure,
     'public.due_student_digests(date)'::regprocedure) and prosecdef and 'search_path=""' = any (proconfig)));
select pg_temp.chk('A13 the trial functions take no argument and have no overload (the limit can''t be passed in)', '2/2',
  (select (count(*) filter (where pronargs = 0))::text || '/' || count(*)::text
     from pg_proc where pronamespace = 'public'::regnamespace and proname in ('ai_trial_writes_left', 'consume_ai_trial_write')));
select pg_temp.chk('A14 pre-request hook still registered', 'true',
  (select (setconfig::text like '%pgrst.db_pre_request=public.api_request_guard%')::text from pg_db_role_setting where setrole = 'authenticator'::regrole and setdatabase = 0));
select pg_temp.chk('A15 due_student_digests returns exactly user_id, email, week_start', '{user_id,email,week_start}',
  (select array_agg(n order by i)::text from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as x(n, m, i)
    where p.oid = 'public.due_student_digests(date)'::regprocedure and x.m = 't'));
select pg_temp.chk('A16 student_profiles.weekly_digest is boolean, not null, default false', 'boolean/NO/false',
  (select data_type || '/' || is_nullable || '/' || column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'student_profiles' and column_name = 'weekly_digest'));
select pg_temp.chk('A17 student_digest_log: one row per student per week, removed with the account', 'PRIMARY KEY (user_id, week_start)/c',
  (select (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.student_digest_log'::regclass and contype = 'p')
          || '/' || (select confdeltype::text from pg_constraint where conrelid = 'public.student_digest_log'::regclass and contype = 'f')));
select pg_temp.chk('A18 the AI view exposes neither new column', '0',
  (select count(*)::text from information_schema.columns where table_schema = 'public' and table_name = 'ai_student_profiles'
      and column_name in ('weekly_digest', 'ai_trial_writes_used', 'writes_used')));

-- ── B. the trial counter, as the AI connector's token (S1) and the website (S2) ──
select pg_temp.chk('B1 the hook lets an AI token reach rpc/consume_ai_trial_write', 'ok:passed',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/consume_ai_trial_write', $q$select 'passed'$q$));
select pg_temp.chk('B2 ...and rpc/ai_trial_writes_left, with the /rest/v1 prefix too', 'ok:passed',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rest/v1/rpc/ai_trial_writes_left', $q$select 'passed'$q$));
select pg_temp.chk('B3 three changes left before any is spent', 'ok:3',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/ai_trial_writes_left', $q$select public.ai_trial_writes_left()::text$q$));
select pg_temp.chk('B4 ...and asking creates no usage row', '0',
  (select count(*)::text from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a1'));
select pg_temp.chk('B5 first change spent: 2 left', 'ok:2',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/consume_ai_trial_write', $q$select public.consume_ai_trial_write()::text$q$));
select pg_temp.chk('B6 second: 1 left', 'ok:1',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/consume_ai_trial_write', $q$select public.consume_ai_trial_write()::text$q$));
select pg_temp.chk('B7 third: 0 left', 'ok:0',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/consume_ai_trial_write', $q$select public.consume_ai_trial_write()::text$q$));
select pg_temp.chk('B8 fourth: -1 (none left)', 'ok:-1',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/consume_ai_trial_write', $q$select public.consume_ai_trial_write()::text$q$));
select pg_temp.chk('B9 fifth: still -1', 'ok:-1',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/consume_ai_trial_write', $q$select public.consume_ai_trial_write()::text$q$));
select pg_temp.chk('B10 none left when asked', 'ok:0',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/ai_trial_writes_left', $q$select public.ai_trial_writes_left()::text$q$));
select pg_temp.chk('B11 stored count stops at 3 (not 4 or 5)', '3',
  (select writes_used::text from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a1'));
select pg_temp.chk('B12 the AI token''s trial calls left S1''s profile row exactly as it was', (select m from snap),
  (select md5(to_jsonb(sp)::text) from public.student_profiles sp where sp.user_id = '00000000-0000-4000-8000-0000000051a1'));
select pg_temp.chk('B13 a website session spends its own trial: S2 has 2 left after one change', 'ok:2',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a2', false), '/rpc/consume_ai_trial_write', $q$select public.consume_ai_trial_write()::text$q$));
select pg_temp.chk('B14 ...and nobody else''s: S1 stays at 3, S2 is at 1', '3/1',
  (select (select writes_used::text from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a1') || '/'
       || (select writes_used::text from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a2')));
select pg_temp.chk('B15 a student with no profile and no usage row has 3 left', 'ok:3',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a6', false), '/rpc/ai_trial_writes_left', $q$select public.ai_trial_writes_left()::text$q$));
select pg_temp.chk('B16 ...and that call created no row', '0',
  (select count(*)::text from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a6'));
select pg_temp.chk('B17 a caller can''t pass a limit (no such function)', 'refused 42883',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a2', false), '/rpc/consume_ai_trial_write', $q$select public.consume_ai_trial_write(100::smallint)::text$q$));
select pg_temp.chk('B18 anon can''t call consume', 'refused 42501',
  pg_temp.req(null, '/rpc/consume_ai_trial_write', $q$select public.consume_ai_trial_write()::text$q$));
select pg_temp.chk('B19 anon can''t call left', 'refused 42501',
  pg_temp.req(null, '/rpc/ai_trial_writes_left', $q$select public.ai_trial_writes_left()::text$q$));
select pg_temp.chk('B20 no signed-in user (the owner): consume refused', 'refused 42501: not signed in',
  pg_temp.own($q$select public.consume_ai_trial_write()::text$q$));
select pg_temp.chk('B21 no signed-in user (the owner): left refused', 'refused 42501: not signed in',
  pg_temp.own($q$select public.ai_trial_writes_left()::text$q$));
select pg_temp.chk('B22 the service role has no user either: consume refused', 'refused 42501',
  pg_temp.req(pg_temp.svc(), '/rpc/consume_ai_trial_write', $q$select public.consume_ai_trial_write()::text$q$));
select pg_temp.chk('B23 ...and none of those calls changed a count (S2 still 1)', '1',
  (select writes_used::text from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a2'));

-- ── C. the two new tables are closed to every client ──
select pg_temp.chk('C1 a website session can''t read ai_trial_usage', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/ai_trial_usage', $q$select count(*)::text from public.ai_trial_usage$q$));
select pg_temp.chk('C2 ...can''t reset its own count', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/ai_trial_usage', $q$update public.ai_trial_usage set writes_used = 0 where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1$q$));
select pg_temp.chk('C3 ...can''t create a row', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a6', false), '/ai_trial_usage', $q$insert into public.ai_trial_usage (user_id, writes_used) values ('00000000-0000-4000-8000-0000000051a6', 0) returning 1$q$));
select pg_temp.chk('C4 ...can''t delete its row', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/ai_trial_usage', $q$delete from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1$q$));
select pg_temp.chk('C5 anon can''t read it', 'refused 42501',
  pg_temp.req(null, '/ai_trial_usage', $q$select count(*)::text from public.ai_trial_usage$q$));
select pg_temp.chk('C6 an AI token is refused by the hook on /ai_trial_usage', 'refused 42501: Connected AI apps can only use the student tables.',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/ai_trial_usage', $q$update public.ai_trial_usage set writes_used = 0 where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1$q$));
select pg_temp.chk('C7 ...even when its path claims an allowed view, the grants refuse the table', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/ai_student_profiles', $q$update public.ai_trial_usage set writes_used = 0 where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1$q$));
select pg_temp.chk('C8 S1''s count is still 3 after all of that', '3',
  (select writes_used::text from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a1'));
select pg_temp.chk('C9 a website session can''t read student_digest_log', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/student_digest_log', $q$select count(*)::text from public.student_digest_log$q$));
select pg_temp.chk('C10 ...can''t write it', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/student_digest_log', $q$insert into public.student_digest_log (user_id, week_start) values ('00000000-0000-4000-8000-0000000051a1', date '2026-11-02') returning 1$q$));
select pg_temp.chk('C11 anon can''t read it', 'refused 42501',
  pg_temp.req(null, '/student_digest_log', $q$select count(*)::text from public.student_digest_log$q$));
select pg_temp.chk('C12 an AI token is refused by the hook on /student_digest_log', 'refused 42501: Connected AI apps can only use the student tables.',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/student_digest_log', $q$select count(*)::text from public.student_digest_log$q$));

-- ── D. the pre-request hook: an AI token reaches the old paths and exactly the two new ones ──
select pg_temp.chk('D1 an AI token on another function is still refused', 'refused 42501: Connected AI apps can only use the student tables.',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/some_other_function', $q$select 'passed'$q$));
select pg_temp.chk('D2 ...a function whose name only starts like the allowed one', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/consume_ai_trial_write_extra', $q$select 'passed'$q$));
select pg_temp.chk('D3 ...the allowed name with a trailing slash', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/consume_ai_trial_write/', $q$select 'passed'$q$));
select pg_temp.chk('D4 ...rpc/due_student_digests', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/due_student_digests', $q$select 'passed'$q$));
select pg_temp.chk('D5 ...rpc/create_share_link', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/create_share_link', $q$select 'passed'$q$));
select pg_temp.chk('D6 ...the base table student_profiles (closed since 0043)', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/student_profiles', $q$select 'passed'$q$));
select pg_temp.chk('D7 ...student_colleges', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/student_colleges', $q$select 'passed'$q$));
select pg_temp.chk('D8 the two views and the two transcript tables still pass (also with /rest/v1)', 'ok:passed,ok:passed,ok:passed,ok:passed,ok:passed',
  (select string_agg(pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), p, $q$select 'passed'$q$), ',' order by o)
     from unnest(array['/ai_student_profiles', '/ai_student_colleges', '/transcript_schools', '/transcript_courses', '/rest/v1/ai_student_profiles']) with ordinality as x(p, o)));
select pg_temp.chk('D9 a website session (no client_id) passes any path', 'ok:passed',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/rpc/some_other_function', $q$select 'passed'$q$));

-- ── E. weekly_digest: the student's choice, out of an AI token's reach ──
select pg_temp.chk('E1 a website student turns the weekly email on (S1)', 'ok:true',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/student_profiles',
    $q$update public.student_profiles set weekly_digest = true where user_id = '00000000-0000-4000-8000-0000000051a1' returning weekly_digest::text$q$));
select pg_temp.chk('E2 ...and off again with an upsert of user_id + weekly_digest (as the Settings toggle sends it)', 'ok:false',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/student_profiles',
    $q$insert into public.student_profiles (user_id, weekly_digest) values ('00000000-0000-4000-8000-0000000051a1', false)
       on conflict (user_id) do update set weekly_digest = excluded.weekly_digest returning weekly_digest::text$q$));
select pg_temp.chk('E3 ...and on again', 'ok:true',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/student_profiles',
    $q$update public.student_profiles set weekly_digest = true where user_id = '00000000-0000-4000-8000-0000000051a1' returning weekly_digest::text$q$));
select pg_temp.chk('E4 a student can''t change another student''s choice (0 rows)', 'ok:0',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/student_profiles',
    $q$with x as (update public.student_profiles set weekly_digest = true where user_id = '00000000-0000-4000-8000-0000000051a2' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E5 an AI token is refused by the hook on the base table', 'refused 42501: Connected AI apps can only use the student tables.',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/student_profiles',
    $q$update public.student_profiles set weekly_digest = false where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1$q$));
select pg_temp.chk('E6 ...and has no such column in its view (write)', 'refused 42703',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/ai_student_profiles',
    $q$update public.ai_student_profiles set weekly_digest = false where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1$q$));
select pg_temp.chk('E7 ...nor in its view (read)', 'refused 42703',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/ai_student_profiles', $q$select weekly_digest from public.ai_student_profiles$q$));
select pg_temp.chk('E8 second layer: with the hook out of the way, the base table still changes no row for an AI token (0 rows)', 'ok:0',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/ai_student_profiles',
    $q$with x as (update public.student_profiles set weekly_digest = false where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E9 S1 is still opted in after all of that', 'true',
  (select weekly_digest::text from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000051a1'));
select pg_temp.chk('E10 an AI update of an allowed field through its view still works and leaves the choice alone', 'ok:1/true',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/ai_student_profiles',
    $q$with x as (update public.ai_student_profiles set sat_total = 1400 where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1) select count(*)::text from x$q$)
  || '/' || (select weekly_digest::text from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000051a1'));

-- ── F. due_student_digests, as the Edge Function (service role). Only S1 is opted in, is a student, has an email. ──
select pg_temp.chk('F0 2026-11-02 is a Monday', '1', (select extract(isodow from date '2026-11-02')::text));
select pg_temp.chk('F1 Monday 11-02: S1 only (S2 off, S3 teacher, S4 no email, S5 no role row), week_start 11-02', 'ok:a1|2026-11-02',
  pg_temp.due(date '2026-11-02'));
select pg_temp.chk('F2 Wednesday 11-04: the same week', 'ok:a1|2026-11-02', pg_temp.due(date '2026-11-04'));
select pg_temp.chk('F3 Sunday 11-08: still the week of Monday 11-02', 'ok:a1|2026-11-02', pg_temp.due(date '2026-11-08'));
select pg_temp.chk('F4 Monday 11-09: the next week', 'ok:a1|2026-11-09', pg_temp.due(date '2026-11-09'));
select pg_temp.chk('F5 no date given: today in Taipei, never a null week_start', 'ok:a1|true',
  pg_temp.req(pg_temp.svc(), '/rpc/due_student_digests',
    $q$select coalesce(string_agg(right(user_id::text, 2) || '|' || (week_start = date_trunc('week', (now() at time zone 'Asia/Taipei')::date::timestamp)::date)::text, ',' order by user_id), 'none')
         from public.due_student_digests(null) where user_id::text like '00000000-0000-4000-8000-0000000051a%'$q$));
select pg_temp.chk('F6 the Edge Function logs the send (insert ... on conflict do nothing)', 'ok:2026-11-02',
  pg_temp.req(pg_temp.svc(), '/rpc/due_student_digests',
    $q$insert into public.student_digest_log (user_id, week_start) values ('00000000-0000-4000-8000-0000000051a1', date '2026-11-02') on conflict do nothing returning week_start::text$q$));
select pg_temp.chk('F7 logging the same week again is ignored', 'ok:null',
  pg_temp.req(pg_temp.svc(), '/rpc/due_student_digests',
    $q$insert into public.student_digest_log (user_id, week_start) values ('00000000-0000-4000-8000-0000000051a1', date '2026-11-02') on conflict do nothing returning week_start::text$q$));
select pg_temp.chk('F8 after the send, Monday 11-02: nobody is due', 'ok:none', pg_temp.due(date '2026-11-02'));
select pg_temp.chk('F9 ...Wednesday 11-04: nobody', 'ok:none', pg_temp.due(date '2026-11-04'));
select pg_temp.chk('F10 ...Sunday 11-08: nobody', 'ok:none', pg_temp.due(date '2026-11-08'));
select pg_temp.chk('F11 ...Monday 11-09: S1 is due again for the new week', 'ok:a1|2026-11-09', pg_temp.due(date '2026-11-09'));
select pg_temp.chk('F12 a plain upsert (merge duplicates) also works for the service role', 'ok:2026-11-02',
  pg_temp.req(pg_temp.svc(), '/rpc/due_student_digests',
    $q$insert into public.student_digest_log (user_id, week_start) values ('00000000-0000-4000-8000-0000000051a1', date '2026-11-02')
       on conflict (user_id, week_start) do update set sent_at = excluded.sent_at returning week_start::text$q$));
select pg_temp.chk('F13 the owner switches S1''s choice off', 'ok:1',
  pg_temp.own($q$update public.student_profiles set weekly_digest = false where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1$q$));
select pg_temp.chk('F14 ...so S1 is not due next Monday although nothing is logged for that week', 'ok:none', pg_temp.due(date '2026-11-09'));
select pg_temp.chk('F15 the owner switches it on again', 'ok:1',
  pg_temp.own($q$update public.student_profiles set weekly_digest = true where user_id = '00000000-0000-4000-8000-0000000051a1' returning 1$q$));
select pg_temp.chk('F16 ...and S1 is due next Monday again', 'ok:a1|2026-11-09', pg_temp.due(date '2026-11-09'));
select pg_temp.chk('F17 the service role can delete a log row', 'ok:2026-11-02',
  pg_temp.req(pg_temp.svc(), '/rpc/due_student_digests',
    $q$delete from public.student_digest_log where user_id = '00000000-0000-4000-8000-0000000051a1' and week_start = date '2026-11-02' returning week_start::text$q$));
select pg_temp.chk('F18 ...and then the log is the only thing that kept S1 off the Monday 11-02 list', 'ok:a1|2026-11-02', pg_temp.due(date '2026-11-02'));

-- ── G. nobody but the service role runs the digest function ──
select pg_temp.chk('G1 a website session can''t call due_student_digests', 'refused 42501',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', false), '/rpc/due_student_digests',
    $q$select count(*)::text from public.due_student_digests(date '2026-11-02')$q$));
select pg_temp.chk('G2 anon can''t', 'refused 42501',
  pg_temp.req(null, '/rpc/due_student_digests', $q$select count(*)::text from public.due_student_digests(date '2026-11-02')$q$));
select pg_temp.chk('G3 an AI token is refused by the hook before it gets that far', 'refused 42501: Connected AI apps can only use the student tables.',
  pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000051a1', true), '/rpc/due_student_digests',
    $q$select count(*)::text from public.due_student_digests(date '2026-11-02')$q$));

-- ── H. deleting the account takes the trial row and the log rows with it ──
select pg_temp.chk('H1 the owner logs a send for S1 again', 'ok:1',
  pg_temp.own($q$insert into public.student_digest_log (user_id, week_start) values ('00000000-0000-4000-8000-0000000051a1', date '2026-11-02') returning 1$q$));
select pg_temp.chk('H2 S1 has a trial row and a log row', '1/1',
  (select (select count(*)::text from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a1') || '/'
       || (select count(*)::text from public.student_digest_log where user_id = '00000000-0000-4000-8000-0000000051a1')));
select pg_temp.chk('H3 S1''s account is deleted (as Settings > Delete account does through auth)', 'ok:1',
  pg_temp.own($q$with x as (delete from auth.users where id = '00000000-0000-4000-8000-0000000051a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H4 ...and both rows are gone', '0/0',
  (select (select count(*)::text from public.ai_trial_usage where user_id = '00000000-0000-4000-8000-0000000051a1') || '/'
       || (select count(*)::text from public.student_digest_log where user_id = '00000000-0000-4000-8000-0000000051a1')));

-- ── I. real rows (read only; 0 only when run right after applying 0051) ──
select pg_temp.chk('I1 no real account has a trial row yet', '0',
  (select count(*)::text from public.ai_trial_usage where user_id::text not like '00000000-0000-4000-8000-0000000051a%'));
select pg_temp.chk('I2 no real student has the weekly email on yet', '0',
  (select count(*)::text from public.student_profiles where weekly_digest and user_id::text not like '00000000-0000-4000-8000-0000000051a%'));
select pg_temp.chk('I3 no real log rows yet', '0',
  (select count(*)::text from public.student_digest_log where user_id::text not like '00000000-0000-4000-8000-0000000051a%'));

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
