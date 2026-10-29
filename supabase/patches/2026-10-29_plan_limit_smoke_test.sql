-- Smoke test for migration 0045_plan_limit. Run in the dashboard SQL Editor AFTER applying 0045
-- (or paste 0044 and 0045 right after "begin;" to dry-run both migrations and the test together).
-- It creates throwaway users inside one transaction, acts as each of them (website session = JWT without client_id,
-- AI connector = the same JWT plus client_id through the ai_student_colleges view, service role = the payments Edge
-- Function, no JWT = the owner in the SQL Editor), and never commits: the LAST statement deliberately raises
-- "SMOKE RESULT: <n> failures" followed by one PASS/FAIL line per check, which aborts the transaction.
-- Success = "SMOKE RESULT: 0 failures". Real users' rows are never touched.
--
-- Cast: S1 Free student at the limit, S2 pass holder, S3 Free student for batch inserts, S4 window edge cases,
-- S5 custom colleges, S6 no profile row, S7 Free student with an empty list, S8 batch on top of existing rows,
-- S9 service role / owner / role detection, S10 Free student already over the limit (a pass that ended).
-- Each student gets rows in 10 real institutions (the first ten by id).

begin;

create temp table smoke (n serial primary key, name text, expect text, got text) on commit drop;
create temp table smoke_inst on commit drop as
  select (row_number() over (order by id))::int as n, id from (select id from public.institutions order by id limit 10) i;

-- ── helpers (the same style as the 0044 smoke test) ──
-- Throwaway user k (1..10).
create function pg_temp.u(k int) returns text language sql immutable as $$ select '00000000-0000-4000-8000-0000000045' || lpad(k::text, 2, '0') $$;
-- Institution k (1..10).
create function pg_temp.iid(k int) returns text language sql stable as $$ select id::text from smoke_inst where n = k $$;
-- Today in Taipei, and a pass window from today+f to today+t (inclusive).
create function pg_temp.w(f int, t int) returns jsonb language sql stable as $$
  select jsonb_build_object('entry_year', 2027, 'from', (now() at time zone 'Asia/Taipei')::date + f, 'until', (now() at time zone 'Asia/Taipei')::date + t)
$$;
-- Claims for a caller: the website session, or (p_ai) the AI connector's OAuth token for the same user.
create function pg_temp.c(p_uid text, p_ai boolean) returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_uid, 'role', 'authenticated')
         || case when p_ai then '{"client_id":"smoke-client"}'::jsonb else '{}'::jsonb end
$$;
-- Runs p_sql with those JWT claims, that database role and request path (the pre-request hook first when p_hook, as
-- PostgREST does for every Data API request). Returns 'ok:<first column>' or 'refused <sqlstate>: <message> [hint=<hint>]'.
-- Back to postgres with no claims afterwards.
create function pg_temp.go(p_claims text, p_role text, p_path text, p_hook boolean, p_sql text) returns text language plpgsql as $$
declare res text; h text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims, ''), true);
  perform set_config('request.path', coalesce(p_path, ''), true);
  perform set_config('role', p_role, true);
  begin
    if p_hook then perform public.api_request_guard(); end if;
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
  exception when others then
    get stacked diagnostics h = pg_exception_hint;
    res := 'refused ' || sqlstate || ': ' || sqlerrm || coalesce(' [hint=' || nullif(h, '') || ']', '');
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;
create function pg_temp.web(p_uid text, p_sql text) returns text language sql as $$
  select pg_temp.go(pg_temp.c(p_uid, false)::text, 'authenticated', '/student_colleges', false, p_sql)
$$;
create function pg_temp.svc(p_sql text) returns text language sql as $$
  select pg_temp.go('{"role":"service_role"}', 'service_role', '/student_colleges', false, p_sql)
$$;
-- A website session adds institution k to its own list (one row), or institutions f..t in ONE statement.
create function pg_temp.ins_one(p_uid text, k int) returns text language sql as $$
  select pg_temp.web(p_uid, format('with x as (insert into public.student_colleges (user_id, institution_id) values (%L, %L) returning 1) select count(*)::text from x', p_uid, pg_temp.iid(k)))
$$;
create function pg_temp.ins_n(p_uid text, f int, t int) returns text language sql as $$
  select pg_temp.web(p_uid, format('with x as (insert into public.student_colleges (user_id, institution_id) select %L::uuid, i from unnest(%L::uuid[]) i returning 1) select count(*)::text from x',
                                   p_uid, '{' || (select string_agg(id::text, ',') from smoke_inst where n between f and t) || '}'))
$$;
create function pg_temp.ins_custom(p_uid text) returns text language sql as $$
  select pg_temp.web(p_uid, format($q$with x as (insert into public.student_colleges (user_id, custom) values (%L, '{"name":"Smoke Custom College"}') returning 1) select count(*)::text from x$q$, p_uid))
$$;
-- The AI connector adds institution k through the ai_student_colleges view (user_id defaults to the token's user).
create function pg_temp.ins_ai(p_uid text, k int) returns text language sql as $$
  select pg_temp.go(pg_temp.c(p_uid, true)::text, 'authenticated', '/ai_student_colleges', true,
                    format('with x as (insert into public.ai_student_colleges (institution_id) values (%L) returning 1) select count(*)::text from x', pg_temp.iid(k)))
$$;
-- The owner in the SQL Editor: postgres, no JWT.
create function pg_temp.own(p_sql text) returns text language plpgsql as $$
declare res text; h text;
begin
  perform set_config('request.jwt.claims', '', true);
  begin
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
  exception when others then
    get stacked diagnostics h = pg_exception_hint;
    res := 'refused ' || sqlstate || ': ' || sqlerrm || coalesce(' [hint=' || nullif(h, '') || ']', '');
  end;
  return res;
end $$;
-- Sets a student's windows and plan flag (owner), tries the 6th college through the website, removes it again.
create function pg_temp.tryw(p_uid text, p_windows jsonb, p_plan text) returns text language plpgsql as $$
declare r text;
begin
  update public.student_profiles set plan = p_plan, plan_windows = p_windows where user_id = p_uid::uuid;
  r := pg_temp.ins_one(p_uid, 6);
  delete from public.student_colleges where user_id = p_uid::uuid and institution_id = pg_temp.iid(6)::uuid;
  return r;
end $$;
create function pg_temp.cnt(p_uid text) returns text language sql as $$ select count(*)::text from public.student_colleges where user_id = p_uid::uuid $$;
create function pg_temp.chk(p_name text, p_expect text, p_got text) returns void language sql as $$
  insert into smoke (name, expect, got) values (p_name, p_expect, p_got)
$$;
-- What a refused sixth college looks like.
create function pg_temp.lim() returns text language sql immutable as $$ select 'refused P0001: Plan limit reached: the Free plan holds 5 colleges. [hint=plan_limit]' $$;

-- ── setup (postgres) ──
insert into auth.users (id, email) select pg_temp.u(k)::uuid, 'smoke-0045-s' || k || '@example.invalid' from generate_series(1, 10) k;
insert into public.user_roles (user_id, role) select pg_temp.u(k)::uuid, 'student' from generate_series(1, 10) k;
-- S6 has no profile row at all. S2 holds a pass (from 30 days ago to 30 days ahead); everyone else is Free.
insert into public.student_profiles (user_id, display_name) select pg_temp.u(k)::uuid, 'Smoke S' || k from generate_series(1, 10) k where k <> 6;
update public.student_profiles set plan = 'senior', plan_windows = jsonb_build_array(pg_temp.w(-30, 30)) where user_id = pg_temp.u(2)::uuid;
-- Lists built earlier (owner inserts are not limited): S2, S4, S6, S9 five colleges, S5 four, S8 three, S10 seven.
insert into public.student_colleges (user_id, institution_id) select pg_temp.u(k)::uuid, id from smoke_inst, unnest(array[2, 4, 6, 9]) k where n <= 5;
insert into public.student_colleges (user_id, institution_id) select pg_temp.u(5)::uuid, id from smoke_inst where n <= 4;
insert into public.student_colleges (user_id, institution_id) select pg_temp.u(8)::uuid, id from smoke_inst where n <= 3;
insert into public.student_colleges (user_id, institution_id) select pg_temp.u(10)::uuid, id from smoke_inst where n <= 7;

select pg_temp.chk('S0 ten institutions to test with; setup lists 5/5/5/5/4/3/7 rows', '10/5/5/5/5/4/3/7',
  (select (select count(*) from smoke_inst) || '/' || pg_temp.cnt(pg_temp.u(2)) || '/' || pg_temp.cnt(pg_temp.u(4)) || '/' || pg_temp.cnt(pg_temp.u(6)) || '/' || pg_temp.cnt(pg_temp.u(9))
          || '/' || pg_temp.cnt(pg_temp.u(5)) || '/' || pg_temp.cnt(pg_temp.u(8)) || '/' || pg_temp.cnt(pg_temp.u(10))));

-- ── A. a Free student: five colleges fit, the sixth is refused with hint plan_limit ──
select pg_temp.chk('A1 Free student adds college 1 (website)', 'ok:1', pg_temp.ins_one(pg_temp.u(1), 1));
select pg_temp.chk('A2 ...college 2', 'ok:1', pg_temp.ins_one(pg_temp.u(1), 2));
select pg_temp.chk('A3 ...college 3', 'ok:1', pg_temp.ins_one(pg_temp.u(1), 3));
select pg_temp.chk('A4 ...college 4', 'ok:1', pg_temp.ins_one(pg_temp.u(1), 4));
select pg_temp.chk('A5 ...college 5', 'ok:1', pg_temp.ins_one(pg_temp.u(1), 5));
select pg_temp.chk('A6 ...the sixth is refused: P0001, message, hint plan_limit', pg_temp.lim(), pg_temp.ins_one(pg_temp.u(1), 6));
select pg_temp.chk('A7 the AI connector (client_id, ai_student_colleges view) is limited too', pg_temp.lim(), pg_temp.ins_ai(pg_temp.u(1), 6));
select pg_temp.chk('A8 ...the list still has 5 colleges', '5', pg_temp.cnt(pg_temp.u(1)));
select pg_temp.chk('A9 another Free student with an empty list is not held back by it (website)', 'ok:1', pg_temp.ins_one(pg_temp.u(7), 1));
select pg_temp.chk('A10 ...nor through the AI view', 'ok:1', pg_temp.ins_ai(pg_temp.u(7), 2));
select pg_temp.chk('A11 one statement of 6 rows for an empty list: refused as a whole', pg_temp.lim(), pg_temp.ins_n(pg_temp.u(3), 1, 6));
select pg_temp.chk('A12 ...nothing was inserted', '0', pg_temp.cnt(pg_temp.u(3)));
select pg_temp.chk('A13 one statement of 5 rows: all inserted', 'ok:5', pg_temp.ins_n(pg_temp.u(3), 1, 5));
select pg_temp.chk('A14 ...and one more row is refused', pg_temp.lim(), pg_temp.ins_n(pg_temp.u(3), 6, 6));
select pg_temp.chk('A15 ...and the list still has 5', '5', pg_temp.cnt(pg_temp.u(3)));
select pg_temp.chk('A16 a list of 3 + one statement of 3 more: refused as a whole', pg_temp.lim(), pg_temp.ins_n(pg_temp.u(8), 4, 6));
select pg_temp.chk('A17 ...the list is still 3', '3', pg_temp.cnt(pg_temp.u(8)));
select pg_temp.chk('A18 ...a statement of 2 more fits (3 + 2 = 5)', 'ok:2', pg_temp.ins_n(pg_temp.u(8), 4, 5));
select pg_temp.chk('A19 ...the list is 5', '5', pg_temp.cnt(pg_temp.u(8)));

-- ── B. a student with an active pass: no limit ──
select pg_temp.chk('B1 pass holder with 5 colleges adds a 6th (website)', 'ok:1', pg_temp.ins_one(pg_temp.u(2), 6));
select pg_temp.chk('B2 ...a 7th', 'ok:1', pg_temp.ins_one(pg_temp.u(2), 7));
select pg_temp.chk('B3 ...an 8th through the AI view', 'ok:1', pg_temp.ins_ai(pg_temp.u(2), 8));
select pg_temp.chk('B4 ...8 colleges', '8', pg_temp.cnt(pg_temp.u(2)));

-- ── C. which windows count (S4 has 5 colleges; each try adds a 6th through the website and removes it) ──
select pg_temp.chk('C1 no windows: refused', pg_temp.lim(), pg_temp.tryw(pg_temp.u(4), '[]', 'free'));
select pg_temp.chk('C2 a pass that ended yesterday: refused', pg_temp.lim(), pg_temp.tryw(pg_temp.u(4), jsonb_build_array(pg_temp.w(-60, -1)), 'free'));
select pg_temp.chk('C3 a pass that starts tomorrow (a pre-order): refused', pg_temp.lim(), pg_temp.tryw(pg_temp.u(4), jsonb_build_array(pg_temp.w(1, 100)), 'free'));
select pg_temp.chk('C4 a pass whose last day is today: allowed (until is inclusive)', 'ok:1', pg_temp.tryw(pg_temp.u(4), jsonb_build_array(pg_temp.w(-60, 0)), 'free'));
select pg_temp.chk('C5 a pass whose first day is today: allowed (from is inclusive)', 'ok:1', pg_temp.tryw(pg_temp.u(4), jsonb_build_array(pg_temp.w(0, 100)), 'free'));
select pg_temp.chk('C6 from after until: refused', pg_temp.lim(), pg_temp.tryw(pg_temp.u(4), jsonb_build_array(pg_temp.w(5, -5)), 'free'));
select pg_temp.chk('C7 only malformed elements (bad dates, scalars, null, [], missing or null keys): refused', pg_temp.lim(),
  pg_temp.tryw(pg_temp.u(4), '[{"from":"abc","until":"2099-01-01"},{"from":"2026-13-45","until":"2099-01-01"},5,"x",null,[],{"entry_year":2027},{"from":"2000-01-01"},{"until":"2099-12-31"},{"from":null,"until":null}]', 'free'));
select pg_temp.chk('C8 malformed elements before an active window: allowed (the bad ones count as no window)', 'ok:1',
  pg_temp.tryw(pg_temp.u(4), '[{"from":"abc","until":"abc"},5,null]'::jsonb || jsonb_build_array(pg_temp.w(-1, 1)), 'free'));
select pg_temp.chk('C9 an ended pass then an active one: allowed', 'ok:1', pg_temp.tryw(pg_temp.u(4), jsonb_build_array(pg_temp.w(-400, -300), pg_temp.w(-1, 1)), 'free'));
select pg_temp.chk('C10 an active pass then an ended one: allowed', 'ok:1', pg_temp.tryw(pg_temp.u(4), jsonb_build_array(pg_temp.w(-1, 1), pg_temp.w(-400, -300)), 'free'));
select pg_temp.chk('C11 the plan flag alone does not lift the limit (senior, no windows)', pg_temp.lim(), pg_temp.tryw(pg_temp.u(4), '[]', 'senior'));
select pg_temp.chk('C12 the windows decide, not the flag (free, active window)', 'ok:1', pg_temp.tryw(pg_temp.u(4), jsonb_build_array(pg_temp.w(-1, 1)), 'free'));
select pg_temp.chk('C13 a student with no profile row is Free', pg_temp.lim(), pg_temp.ins_one(pg_temp.u(6), 6));

-- ── D. who is limited: website and AI sessions only ──
select pg_temp.chk('D1 service role adds a 6th college for a Free student', 'ok:1',
  pg_temp.svc(format('with x as (insert into public.student_colleges (user_id, institution_id) values (%L, %L) returning 1) select count(*)::text from x', pg_temp.u(9), pg_temp.iid(6))));
select pg_temp.chk('D2 the owner (SQL Editor, no JWT) adds a 7th', 'ok:1',
  pg_temp.own(format('with x as (insert into public.student_colleges (user_id, institution_id) values (%L, %L) returning 1) select count(*)::text from x', pg_temp.u(9), pg_temp.iid(7))));
select pg_temp.chk('D3 a statement run as postgres that carries a website JWT (e.g. inside a definer function) is limited', pg_temp.lim(),
  pg_temp.go(pg_temp.c(pg_temp.u(1), false)::text, 'postgres', '', false,
             format('with x as (insert into public.student_colleges (user_id, institution_id) values (%L, %L) returning 1) select count(*)::text from x', pg_temp.u(1), pg_temp.iid(6))));
select pg_temp.chk('D4 a session switched to role authenticated without claims is limited (the role setting, not current_user)', pg_temp.lim(),
  pg_temp.go('', 'authenticated', '', false,
             format('with x as (insert into public.student_colleges (user_id, institution_id) values (%L, %L) returning 1) select count(*)::text from x', pg_temp.u(1), pg_temp.iid(6))));
select pg_temp.chk('D5 ...and the Free student still has 5 colleges', '5', pg_temp.cnt(pg_temp.u(1)));

-- ── E. custom colleges count; editing and deleting are never limited ──
select pg_temp.chk('E1 four colleges + a custom college = 5 (website)', 'ok:1', pg_temp.ins_custom(pg_temp.u(5)));
select pg_temp.chk('E2 ...a catalog college is refused', pg_temp.lim(), pg_temp.ins_one(pg_temp.u(5), 5));
select pg_temp.chk('E3 ...so is another custom college', pg_temp.lim(), pg_temp.ins_custom(pg_temp.u(5)));
select pg_temp.chk('E4 ...deleting the custom college', 'ok:1',
  pg_temp.web(pg_temp.u(5), format('with x as (delete from public.student_colleges where user_id = %L and custom is not null returning 1) select count(*)::text from x', pg_temp.u(5))));
select pg_temp.chk('E5 ...makes room for a catalog college', 'ok:1', pg_temp.ins_one(pg_temp.u(5), 5));
select pg_temp.chk('E6 a Free student already over the limit (7 colleges) can still edit them', 'ok:7',
  pg_temp.web(pg_temp.u(10), format('with x as (update public.student_colleges set notes = ''still editable'' where user_id = %L returning 1) select count(*)::text from x', pg_temp.u(10))));
select pg_temp.chk('E7 ...delete one (6 left)', 'ok:1',
  pg_temp.web(pg_temp.u(10), format('with x as (delete from public.student_colleges where user_id = %L and institution_id = %L returning 1) select count(*)::text from x', pg_temp.u(10), pg_temp.iid(1))));
select pg_temp.chk('E8 ...but not add one back', pg_temp.lim(), pg_temp.ins_one(pg_temp.u(10), 1));
select pg_temp.chk('E9 ...delete two more (4 left)', 'ok:2',
  pg_temp.web(pg_temp.u(10), format('with x as (delete from public.student_colleges where user_id = %L and institution_id in (%L, %L) returning 1) select count(*)::text from x', pg_temp.u(10), pg_temp.iid(2), pg_temp.iid(3))));
select pg_temp.chk('E10 ...now one fits again (5)', 'ok:1', pg_temp.ins_one(pg_temp.u(10), 1));
select pg_temp.chk('E11 ...and the next is refused', pg_temp.lim(), pg_temp.ins_one(pg_temp.u(10), 2));

-- ── F. the advisory lock ──
select pg_temp.chk('F1 a Free insert took this owner''s advisory lock plan_limit:<uid>', 'true',
  (select (exists (select 1 from pg_locks l where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1
                      and l.classid::text::bigint = ((k >> 32) & 4294967295) and l.objid::text::bigint = (k & 4294967295)))::text
     from (select hashtextextended('plan_limit:' || pg_temp.u(1), 0) k) s));
select pg_temp.chk('F2 the pass holder took none (the trigger returned before locking)', 'false',
  (select (exists (select 1 from pg_locks l where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1
                      and l.classid::text::bigint = ((k >> 32) & 4294967295) and l.objid::text::bigint = (k & 4294967295)))::text
     from (select hashtextextended('plan_limit:' || pg_temp.u(2), 0) k) s));

-- ── G. catalog ──
select pg_temp.chk('G1 trigger plan_limit: BEFORE INSERT FOR EACH ROW on student_colleges, enabled, runs enforce_plan_limit', '1',
  (select count(*)::text from pg_trigger where tgrelid = 'public.student_colleges'::regclass and tgname = 'plan_limit' and tgtype = 7 and tgenabled = 'O'
      and tgfoid = 'public.enforce_plan_limit()'::regprocedure and not tgisinternal));
select pg_temp.chk('G2 plan_limit fires after oauth_guard and before row_cap (trigger names fire alphabetically)', 'true',
  (with t as (select string_agg(tgname, ',' order by tgname) s from pg_trigger where tgrelid = 'public.student_colleges'::regclass and not tgisinternal and tgtype & 4 = 4)
   select (position('oauth_guard' in s) > 0 and position('oauth_guard' in s) < position('plan_limit' in s) and position('plan_limit' in s) < position('row_cap' in s))::text || ' ' || s from t));
select pg_temp.chk('G3 enforce_plan_limit is security definer with a pinned search_path', 'true/true',
  (select prosecdef::text || '/' || (exists (select 1 from unnest(proconfig) c where c like 'search_path=%'))::text from pg_proc where oid = 'public.enforce_plan_limit()'::regprocedure));
select pg_temp.chk('G4 nobody (authenticated, anon, PUBLIC) may execute enforce_plan_limit', 'false/false/false',
  (select has_function_privilege('authenticated', p.oid, 'execute')::text || '/' || has_function_privilege('anon', p.oid, 'execute')::text || '/' || coalesce(p.proacl::text ~ '(^|[{,])=X', true)::text
     from pg_proc p where p.oid = 'public.enforce_plan_limit()'::regprocedure));

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
