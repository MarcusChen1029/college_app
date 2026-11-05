-- Smoke test for migration 0056_prelaunch_hardening. Run in the dashboard SQL Editor AFTER applying 0056 (or paste 0056
-- right after "begin;" to dry-run the migration and the test together). It creates throwaway users inside one transaction,
-- acts as each of them (website session = JWT without client_id, AI connector = the same JWT plus client_id, anon = no JWT,
-- service role = the SQL Editor's postgres here), and never commits: the LAST statement deliberately raises
-- "SMOKE RESULT: <n> failures" followed by one PASS/FAIL line per check, which aborts the transaction.
-- Success = "SMOKE RESULT: 0 failures". Real users' rows are never touched.
--
-- Cast (ids 00000000-0000-4000-8000-0000000056xx): T u1 teacher with class c1; S1 u2 student linked to T (member of c1);
-- S2 u3 student who joins T during the test; u4 stage-paid order, u5 production-paid, u6 both, u7 refunded production.
-- Parts: A the 11 RPCs refuse an AI token (42501); B the same RPCs still work for the teacher's website session, join codes
-- expire after a year by default, a joined link starts with essays off; C catalog (sources and grants); D table privileges;
-- E share_essays default; F recompute_plan counts production orders only.

begin;

create temp table smoke (n serial primary key, name text, expect text, got text) on commit drop;

create function pg_temp.u(k int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000056' || lpad(k::text, 2, '0'))::uuid $$;
create function pg_temp.today() returns date language sql stable as $$ select (now() at time zone 'Asia/Taipei')::date $$;
-- Claims for a caller: the website session, or (p_ai) the AI connector's OAuth token for the same user.
create function pg_temp.c(k int, p_ai boolean) returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', pg_temp.u(k), 'role', 'authenticated')
         || case when p_ai then '{"client_id":"smoke-client"}'::jsonb else '{}'::jsonb end
$$;
-- Runs p_sql as that caller (anon when p_claims is null); returns 'ok:<first column>' or 'refused <sqlstate>: <message>'.
-- Back to postgres afterwards.
create function pg_temp.run(p_claims jsonb, p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  perform set_config('role', case when p_claims is null then 'anon' else 'authenticated' end, true);
  begin
    execute p_sql into res;
    res := 'ok:' || coalesce(res, '');
  exception when others then
    res := 'refused ' || sqlstate || ': ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;
create function pg_temp.chk(p_name text, p_expect text, p_got text) returns void language sql as $$
  insert into smoke (name, expect, got) values (p_name, p_expect, p_got)
$$;

-- ── setup, as postgres ──
insert into auth.users (id, email) select pg_temp.u(k), 'smoke-0056-u' || k || '@example.invalid' from generate_series(1, 7) k;
insert into public.user_roles (user_id, role) select pg_temp.u(k), case when k = 1 then 'teacher' else 'student' end from generate_series(1, 7) k;
insert into public.teacher_profiles (user_id, display_name, school) values (pg_temp.u(1), 'Smoke Teacher', 'Smoke High');
insert into public.student_profiles (user_id, display_name) select pg_temp.u(k), 'Smoke S' || k from generate_series(2, 7) k;
insert into public.classes (id, teacher_id, name) values ('00000000-0000-4000-8000-0000000056c1', pg_temp.u(1), 'Smoke 0056 A');
insert into public.teacher_links (teacher_id, student_id, via) values (pg_temp.u(1), pg_temp.u(2), 'class');
insert into public.class_members (class_id, student_id) values ('00000000-0000-4000-8000-0000000056c1', pg_temp.u(2));
insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_from, pass_until, payer, status, payment_type, paid_at) values
  (pg_temp.u(4), 'SMOKE0056A', 'stage',      2027, 990, pg_temp.today(), date '2027-07-31', 'student', 'paid',     'Credit_CreditCard', now()),
  (pg_temp.u(5), 'SMOKE0056B', 'production', 2027, 990, pg_temp.today(), date '2027-07-31', 'student', 'paid',     'Credit_CreditCard', now()),
  (pg_temp.u(6), 'SMOKE0056C', 'stage',      2027, 990, pg_temp.today(), date '2027-07-31', 'student', 'paid',     'Credit_CreditCard', now()),
  (pg_temp.u(6), 'SMOKE0056D', 'production', 2028, 990, pg_temp.today(), date '2028-07-31', 'student', 'paid',     'ATM_LAND',          now()),
  (pg_temp.u(7), 'SMOKE0056E', 'production', 2027, 990, pg_temp.today(), date '2027-07-31', 'student', 'refunded', 'Credit_CreditCard', now());

-- ── A. an AI connector token (client_id) is refused by every one of the 11 RPCs with 42501, before anything else ──
-- (0021-0029 answered 'teachers only' through is_role; 0056 answers refuse_oauth_client's own error, like every other client RPC)
select pg_temp.chk('A1 AI: teacher_students', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), 'select student_id::text from public.teacher_students() limit 1'));
select pg_temp.chk('A2 AI: teacher_roster', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), 'select student_id::text from public.teacher_roster(null) limit 1'));
select pg_temp.chk('A3 AI: teacher_deadlines', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), 'select count(*)::text from public.teacher_deadlines(60, null)'));
select pg_temp.chk('A4 AI: teacher_outcomes', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), 'select public.teacher_outcomes(null)::text'));
select pg_temp.chk('A5 AI: teacher_student', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), format('select public.teacher_student(%L, null)::text', pg_temp.u(2))));
select pg_temp.chk('A6 AI: teacher_create_class', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), $q$select public.teacher_create_class('Smoke AI', null)::text$q$));
select pg_temp.chk('A7 AI: teacher_archive_class', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), $q$select public.teacher_archive_class('00000000-0000-4000-8000-0000000056c1', true)::text$q$));
select pg_temp.chk('A8 AI: teacher_remove_from_class', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), format($q$select public.teacher_remove_from_class('00000000-0000-4000-8000-0000000056c1', %L)::text$q$, pg_temp.u(2))));
select pg_temp.chk('A9 AI: teacher_remove_student', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), format('select public.teacher_remove_student(%L)::text', pg_temp.u(2))));
select pg_temp.chk('A10 AI: teacher_revoke_code', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), $q$select public.teacher_revoke_code('individual', null)::text$q$));
select pg_temp.chk('A11 AI: set_my_digest', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), 'select public.set_my_digest(true)::text'));
select pg_temp.chk('A12 AI: teacher_new_code (had the refusal already)', 'refused 42501: Not available to connected AI apps', pg_temp.run(pg_temp.c(1, true), $q$select public.teacher_new_code('individual', null, null)::text$q$));
select pg_temp.chk('A13 nothing changed under the AI token: S1 still linked, c1 not archived, no new class', 'true',
  ((select count(*) = 1 from public.teacher_links where teacher_id = pg_temp.u(1))
   and not (select archived from public.classes where id = '00000000-0000-4000-8000-0000000056c1')
   and (select count(*) = 1 from public.classes where teacher_id = pg_temp.u(1)))::text);

-- ── B. the teacher's website session uses them as before; join codes; a joined link starts with essays off ──
select pg_temp.chk('B1 session: teacher_students lists S1', 'ok:' || pg_temp.u(2), pg_temp.run(pg_temp.c(1, false), 'select student_id::text from public.teacher_students() limit 1'));
select pg_temp.chk('B2 session: teacher_roster lists S1', 'ok:' || pg_temp.u(2), pg_temp.run(pg_temp.c(1, false), 'select student_id::text from public.teacher_roster(null) limit 1'));
select pg_temp.chk('B3 session: teacher_deadlines answers', 'ok:', pg_temp.run(pg_temp.c(1, false), 'select count(*)::text from public.teacher_deadlines(60, null)'));
select pg_temp.chk('B4 session: teacher_outcomes answers', 'ok:{', pg_temp.run(pg_temp.c(1, false), 'select public.teacher_outcomes(null)::text'));
select pg_temp.chk('B5 session: teacher_student(S1) shows essays off and no essays', 'ok:false|null', pg_temp.run(pg_temp.c(1, false),
  format($q$select (public.teacher_student(%L, null) ->> 'share_essays') || '|' || coalesce(public.teacher_student(%L, null) ->> 'essays', 'null')$q$, pg_temp.u(2), pg_temp.u(2))));
select pg_temp.chk('B6 session: set_my_digest(true)', 'ok:', pg_temp.run(pg_temp.c(1, false), 'select public.set_my_digest(true)::text'));
select pg_temp.chk('B7 digest is on', 'true', (select digest_enabled::text from public.teacher_profiles where user_id = pg_temp.u(1)));
select pg_temp.chk('B8 session: teacher_create_class makes class B with a code', 'ok:{', pg_temp.run(pg_temp.c(1, false), $q$select public.teacher_create_class('Smoke 0056 B', null)::text$q$));
select pg_temp.chk('B9 class B''s code expires 365 days from now (teacher_create_class passed no expiry)', 'true',
  (select (jc.expires_at = now() + interval '365 days')::text from public.join_codes jc join public.classes c on c.id = jc.class_id
    where c.teacher_id = pg_temp.u(1) and c.name = 'Smoke 0056 B' and not jc.revoked));
select pg_temp.chk('B10 session: teacher_new_code(class c1, no expiry) answers a code', 'ok:', pg_temp.run(pg_temp.c(1, false), $q$select public.teacher_new_code('class', '00000000-0000-4000-8000-0000000056c1', null)$q$));
select pg_temp.chk('B11 c1''s code expires 365 days from now', 'true',
  (select (expires_at = now() + interval '365 days')::text from public.join_codes where class_id = '00000000-0000-4000-8000-0000000056c1' and not revoked));
-- A code made before 0056 (expires_at null) is still a code without an expiry. Inserted as postgres the way 0021-0055
-- stored them; it is T's one live individual code until B13 replaces it (join_codes_one_active_individual).
do $$ begin perform set_config('smoke.oldcode', public.make_code(), true); end $$;
insert into public.join_codes (code, teacher_id, kind, class_id, expires_at) values (current_setting('smoke.oldcode'), pg_temp.u(1), 'individual', null, null);
select pg_temp.chk('B12 S2 previews a pre-0056 code with no expiry: still valid', 'ok:true', pg_temp.run(pg_temp.c(3, false), format($q$select (public.preview_code(%L) ->> 'ok')$q$, current_setting('smoke.oldcode'))));
select pg_temp.chk('B13 session: teacher_new_code(individual, 7 days) keeps the given expiry (and retires the old code)', 'ok:', pg_temp.run(pg_temp.c(1, false), $q$select public.teacher_new_code('individual', null, now() + interval '7 days')$q$));
select pg_temp.chk('B14 the one live individual code expires in 7 days, not 365; the old one is revoked', 'true true',
  (select (expires_at = now() + interval '7 days')::text from public.join_codes where teacher_id = pg_temp.u(1) and kind = 'individual' and not revoked)
  || ' ' || (select revoked::text from public.join_codes where code = current_setting('smoke.oldcode')));
do $$ begin perform set_config('smoke.c1code', (select code from public.join_codes where class_id = '00000000-0000-4000-8000-0000000056c1' and not revoked), true); end $$;
select pg_temp.chk('B15 S2 previews c1''s new code: the teacher and school it shows', 'ok:true Smoke Teacher Smoke High Smoke 0056 A', pg_temp.run(pg_temp.c(3, false),
  format($q$select (r ->> 'ok') || ' ' || (r ->> 'teacher_name') || ' ' || (r ->> 'school') || ' ' || (r ->> 'class_name') from public.preview_code(%L) r$q$, current_setting('smoke.c1code'))));
select pg_temp.chk('B16 S2 joins with it', 'ok:true', pg_temp.run(pg_temp.c(3, false), format($q$select (public.redeem_code(%L) ->> 'ok')$q$, current_setting('smoke.c1code'))));
select pg_temp.chk('B17 the new link starts with essays off (redeem_code names no share_essays; default false)', 'false class',
  (select share_essays::text || ' ' || via from public.teacher_links where teacher_id = pg_temp.u(1) and student_id = pg_temp.u(3)));
select pg_temp.chk('B18 S2 is in class c1', '1', (select count(*)::text from public.class_members where class_id = '00000000-0000-4000-8000-0000000056c1' and student_id = pg_temp.u(3)));
select pg_temp.chk('B19 session: teacher_revoke_code(class c1)', 'ok:', pg_temp.run(pg_temp.c(1, false), $q$select public.teacher_revoke_code('class', '00000000-0000-4000-8000-0000000056c1')::text$q$));
select pg_temp.chk('B20 c1 has no live code', '0', (select count(*)::text from public.join_codes where class_id = '00000000-0000-4000-8000-0000000056c1' and not revoked));
select pg_temp.chk('B21 session: teacher_archive_class(c1, true)', 'ok:', pg_temp.run(pg_temp.c(1, false), $q$select public.teacher_archive_class('00000000-0000-4000-8000-0000000056c1', true)::text$q$));
select pg_temp.chk('B22 c1 is archived', 'true', (select archived::text from public.classes where id = '00000000-0000-4000-8000-0000000056c1'));
select pg_temp.chk('B23 session: teacher_archive_class(c1, false)', 'ok:', pg_temp.run(pg_temp.c(1, false), $q$select public.teacher_archive_class('00000000-0000-4000-8000-0000000056c1', false)::text$q$));
select pg_temp.chk('B24 session: teacher_remove_from_class(c1, S2)', 'ok:', pg_temp.run(pg_temp.c(1, false), format($q$select public.teacher_remove_from_class('00000000-0000-4000-8000-0000000056c1', %L)::text$q$, pg_temp.u(3))));
select pg_temp.chk('B25 S2 left the class, link kept', '0 1',
  (select (select count(*) from public.class_members where student_id = pg_temp.u(3))::text || ' ' || (select count(*) from public.teacher_links where student_id = pg_temp.u(3))::text));
select pg_temp.chk('B26 session: teacher_remove_student(S2)', 'ok:', pg_temp.run(pg_temp.c(1, false), format('select public.teacher_remove_student(%L)::text', pg_temp.u(3))));
select pg_temp.chk('B27 the link to S2 is gone, S1 stays', '1 ' || pg_temp.u(2),
  (select count(*)::text || ' ' || string_agg(student_id::text, ',') from public.teacher_links where teacher_id = pg_temp.u(1)));
select pg_temp.chk('B28 a student session cannot use a teacher RPC (unchanged)', 'refused P0001: teachers only', pg_temp.run(pg_temp.c(2, false), 'select student_id::text from public.teacher_students() limit 1'));

-- ── C. catalog: every one of the 12 re-created RPCs starts with the refusal and keeps its grants ──
with f as (
  select p.oid, p.proname, p.prosrc, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('teacher_archive_class', 'teacher_create_class', 'teacher_deadlines', 'teacher_outcomes',
    'teacher_remove_from_class', 'teacher_remove_student', 'teacher_revoke_code', 'teacher_roster', 'teacher_student', 'teacher_students',
    'set_my_digest', 'teacher_new_code'))
select pg_temp.chk('C1 12 functions found / with refuse_oauth_client() / authenticated / service_role / anon / PUBLIC', '12/12/12/12/0/0',
  count(*) || '/' || count(*) filter (where position('perform public.refuse_oauth_client();' in prosrc) > 0)
   || '/' || count(*) filter (where has_function_privilege('authenticated', oid, 'execute'))
   || '/' || count(*) filter (where has_function_privilege('service_role', oid, 'execute'))
   || '/' || count(*) filter (where has_function_privilege('anon', oid, 'execute'))
   -- a null ACL means the default (PUBLIC may execute); otherwise look for the PUBLIC (grantee 0) entry
   || '/' || count(*) filter (where proacl is null or exists (select 1 from aclexplode(proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')))
from f;
select pg_temp.chk('C2 the refusal is the first statement after begin in all 12', '12',
  (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('teacher_archive_class', 'teacher_create_class', 'teacher_deadlines', 'teacher_outcomes',
      'teacher_remove_from_class', 'teacher_remove_student', 'teacher_revoke_code', 'teacher_roster', 'teacher_student', 'teacher_students',
      'set_my_digest', 'teacher_new_code')
      and p.prosrc ~ E'\\mbegin\\s+perform public\\.refuse_oauth_client\\(\\);'));

-- ── D. table privileges ──
select pg_temp.chk('D1 anon has no INSERT/UPDATE/DELETE (table or column level) on the four student tables', '0',
  (select count(*)::text from unnest(array['student_profiles', 'student_colleges', 'teacher_links', 'user_roles']) t
    where has_table_privilege('anon', format('public.%I', t), 'INSERT') or has_table_privilege('anon', format('public.%I', t), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', t), 'DELETE')
       or has_any_column_privilege('anon', format('public.%I', t), 'INSERT') or has_any_column_privilege('anon', format('public.%I', t), 'UPDATE')));
select pg_temp.chk('D2 authenticated still writes them (table level, or columns on student_colleges)', 'true',
  (has_table_privilege('authenticated', 'public.student_profiles', 'INSERT') and has_table_privilege('authenticated', 'public.student_profiles', 'UPDATE')
   and has_table_privilege('authenticated', 'public.student_profiles', 'DELETE')
   and has_table_privilege('authenticated', 'public.teacher_links', 'UPDATE') and has_table_privilege('authenticated', 'public.user_roles', 'INSERT')
   and has_any_column_privilege('authenticated', 'public.student_colleges', 'INSERT') and has_any_column_privilege('authenticated', 'public.student_colleges', 'UPDATE')
   and has_table_privilege('authenticated', 'public.student_colleges', 'DELETE'))::text);
select pg_temp.chk('D3 no TRUNCATE / TRIGGER / REFERENCES left for anon or authenticated in public (table grants / column grants)', '0 / 0',
  (select count(*)::text from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES'))
  || ' / ' ||
  (select count(*)::text from information_schema.column_privileges
    where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'REFERENCES'));
select pg_temp.chk('D4 anon still reads the reference tables', 'true',
  (has_table_privilege('anon', 'public.institutions', 'SELECT') and has_table_privilege('anon', 'public.deadlines', 'SELECT')
   and has_table_privilege('anon', 'public.college_summary', 'SELECT'))::text);
-- "returning 1" on purpose: a column in RETURNING needs SELECT, which anon lacks on student_colleges since 0043, and the
-- refusal must come from the write grant that 0056 removes, not from a missing read grant.
select pg_temp.chk('D5 anon: insert into student_profiles is a privilege error, not an RLS one', 'refused 42501: permission denied for table student_profiles',
  pg_temp.run(null, format('with w as (insert into public.student_profiles (user_id) values (%L) returning 1) select count(*)::text from w', pg_temp.u(2))));
select pg_temp.chk('D6 anon: update teacher_links is a privilege error', 'refused 42501: permission denied for table teacher_links',
  pg_temp.run(null, 'with w as (update public.teacher_links set share_essays = true returning 1) select count(*)::text from w'));
select pg_temp.chk('D7 anon: insert into user_roles is a privilege error', 'refused 42501: permission denied for table user_roles',
  pg_temp.run(null, format($q$with w as (insert into public.user_roles (user_id, role) values (%L, 'teacher') returning 1) select count(*)::text from w$q$, pg_temp.u(3))));
select pg_temp.chk('D8 anon: delete from student_colleges is a privilege error', 'refused 42501: permission denied for table student_colleges',
  pg_temp.run(null, 'with w as (delete from public.student_colleges returning 1) select count(*)::text from w'));
select pg_temp.chk('D9 anon still counts institutions', 'ok:', pg_temp.run(null, 'select count(*)::text from public.institutions'));
select pg_temp.chk('D10 S1 session: updates own profile as before', 'ok:Smoke S2 renamed',
  pg_temp.run(pg_temp.c(2, false), format($q$update public.student_profiles set display_name = 'Smoke S2 renamed' where user_id = %L returning display_name$q$, pg_temp.u(2))));
select pg_temp.chk('D11 S1 session: adds a college to their own list as before', 'ok:researching',
  pg_temp.run(pg_temp.c(2, false), format($q$insert into public.student_colleges (user_id, institution_id, status) select %L, id, 'researching' from public.institutions order by slug limit 1 returning status$q$, pg_temp.u(2))));
select pg_temp.chk('D11b S1 session: and removes it again', 'ok:1',
  pg_temp.run(pg_temp.c(2, false), format($q$with d as (delete from public.student_colleges where user_id = %L returning id) select count(*)::text from d$q$, pg_temp.u(2))));
select pg_temp.chk('D12 S1 session: cannot turn essays on for a link that is not theirs (RLS, unchanged)', 'ok:0',
  pg_temp.run(pg_temp.c(3, false), format($q$with u as (update public.teacher_links set share_essays = true where student_id = %L returning 1) select count(*)::text from u$q$, pg_temp.u(2))));

-- ── E. share_essays default ──
select pg_temp.chk('E1 column default is false', 'false',
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'teacher_links' and column_name = 'share_essays'));
insert into public.teacher_links (teacher_id, student_id, via) values (pg_temp.u(1), pg_temp.u(4), 'individual');
select pg_temp.chk('E2 a link inserted without the column starts off', 'false', (select share_essays::text from public.teacher_links where teacher_id = pg_temp.u(1) and student_id = pg_temp.u(4)));
select pg_temp.chk('E3 S1 still turns essays on for their own link (set_share_essays, unchanged)', 'ok:',
  pg_temp.run(pg_temp.c(2, false), format('select public.set_share_essays(%L, true)::text', pg_temp.u(1))));
select pg_temp.chk('E4 and it is on for that link only', 'true false',
  (select (select share_essays from public.teacher_links where teacher_id = pg_temp.u(1) and student_id = pg_temp.u(2))::text || ' '
       || (select share_essays from public.teacher_links where teacher_id = pg_temp.u(1) and student_id = pg_temp.u(4))::text));

-- ── F. recompute_plan: production orders only ──
select public.recompute_plan(pg_temp.u(k)) from generate_series(4, 7) k;
select pg_temp.chk('F1 a stage-paid order alone leaves the student Free with no window', 'free []',
  (select plan || ' ' || plan_windows::text from public.student_profiles where user_id = pg_temp.u(4)));
select pg_temp.chk('F2 a production-paid order is a pass', 'senior 1 2027 2027-07-31',
  (select plan || ' ' || jsonb_array_length(plan_windows) || ' ' || (plan_windows -> 0 ->> 'entry_year') || ' ' || (plan_windows -> 0 ->> 'until') from public.student_profiles where user_id = pg_temp.u(5)));
select pg_temp.chk('F3 stage 2027 + production 2028: only the production window', 'senior 1 2028',
  (select plan || ' ' || jsonb_array_length(plan_windows) || ' ' || (plan_windows -> 0 ->> 'entry_year') from public.student_profiles where user_id = pg_temp.u(6)));
select pg_temp.chk('F4 a refunded production order is no pass (unchanged)', 'free []',
  (select plan || ' ' || plan_windows::text from public.student_profiles where user_id = pg_temp.u(7)));
select pg_temp.chk('F5 the function filters on mode', 'true',
  (select (prosrc like '%o.status = ''paid'' and o.mode = ''production''%')::text from pg_proc where proname = 'recompute_plan' and pronamespace = 'public'::regnamespace));
select pg_temp.chk('F6 a website session cannot call recompute_plan (service role only, unchanged)', 'refused 42501: permission denied for function recompute_plan',
  pg_temp.run(pg_temp.c(5, false), format('select public.recompute_plan(%L)::text', pg_temp.u(5))));
select pg_temp.chk('F7 the student reads their own plan as before', 'ok:senior', pg_temp.run(pg_temp.c(5, false), 'select plan from public.student_profiles'));

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
