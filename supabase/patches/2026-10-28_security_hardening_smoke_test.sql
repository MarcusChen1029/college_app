-- Smoke test for migration 0039_security_hardening. Run in the dashboard SQL Editor AFTER applying 0039
-- (or paste 0039 right after "begin;" to dry-run the migration and the test together).
-- It creates throwaway users inside one transaction, acts as each of them (website session = JWT without client_id,
-- AI connector = the same JWT plus client_id), and never commits: the LAST statement deliberately raises
-- "SMOKE RESULT: <n> failures" followed by one PASS/FAIL line per check, which aborts the transaction.
-- Success = "SMOKE RESULT: 0 failures".
--
-- Cast: S student (profile, list, transcript, links), S2 student who switches to teacher, S3 student for share-link
-- expiry and limits, T teacher. RPCs are called directly, so section C proves the function-level guard (layer c)
-- works even without the pre-request hook; section A calls the hook function itself.

begin;

-- ── setup (postgres) ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000039a1', 'smoke-0039-s@example.invalid'),
  ('00000000-0000-4000-8000-0000000039a2', 'smoke-0039-s2@example.invalid'),
  ('00000000-0000-4000-8000-0000000039a3', 'smoke-0039-s3@example.invalid'),
  ('00000000-0000-4000-8000-0000000039b1', 'smoke-0039-t@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000039a1', 'student'), ('00000000-0000-4000-8000-0000000039a2', 'student'),
  ('00000000-0000-4000-8000-0000000039a3', 'student'), ('00000000-0000-4000-8000-0000000039b1', 'teacher');
insert into public.teacher_profiles (user_id, display_name, school) values ('00000000-0000-4000-8000-0000000039b1', 'Smoke Teacher', 'Smoke High');
insert into public.student_profiles (user_id, display_name, sat_total, portals) values
  ('00000000-0000-4000-8000-0000000039a1', 'Smoke S', 1300, '{"x":{"password":"SMOKESECRET"}}'),
  ('00000000-0000-4000-8000-0000000039a2', 'Smoke S2', null, '{}'),
  ('00000000-0000-4000-8000-0000000039a3', 'Smoke S3', null, '{}');
insert into public.student_colleges (user_id, institution_id, status, checklist)
  select '00000000-0000-4000-8000-0000000039a1', id, 'researching', '{}' from public.institutions order by slug limit 1;
insert into public.transcript_schools (id, user_id, name) values ('00000000-0000-4000-8000-0000000039c1', '00000000-0000-4000-8000-0000000039a1', 'Smoke HS');
insert into public.transcript_courses (user_id, school_id, academic_year, grade_level, name)
  values ('00000000-0000-4000-8000-0000000039a1', '00000000-0000-4000-8000-0000000039c1', 2025, 11, 'Smoke Algebra');
insert into public.recommenders (user_id, name) values ('00000000-0000-4000-8000-0000000039a1', 'Smoke Rec');

create temp table smoke (n serial primary key, name text, expect text, got text) on commit drop;

-- Claims for a caller: the website session, or (p_ai) the AI connector's OAuth token for the same user.
create function pg_temp.c(p_uid text, p_ai boolean) returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_uid, 'role', 'authenticated')
         || case when p_ai then '{"client_id":"smoke-client"}'::jsonb else '{}'::jsonb end
$$;
-- Runs p_sql as that caller (anon when p_claims is null) with request.path set; returns 'ok:<first column>' or
-- 'refused <sqlstate>: <message>'. Back to postgres afterwards.
create function pg_temp.run(p_claims jsonb, p_path text, p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  perform set_config('request.path', coalesce(p_path, ''), true);
  perform set_config('role', case when p_claims is null then 'anon' else 'authenticated' end, true);
  begin
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
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

-- ── A. pre-request hook: an AI token reaches only the four MCP tables ──
select pg_temp.chk('A1 hook: AI /student_profiles passes', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A2 hook: AI /student_colleges passes', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_colleges', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A3 hook: AI /transcript_schools passes', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/transcript_schools', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A4 hook: AI /transcript_courses passes', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/transcript_courses', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A5 hook: AI /rest/v1/student_profiles passes', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rest/v1/student_profiles', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A6 hook: AI /rpc/create_share_link refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/create_share_link', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A7 hook: AI /share_links refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/share_links', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A8 hook: AI / (OpenAPI root) refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A9 hook: AI /student_profiles_x refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles_x', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A10 hook: website /rpc/create_share_link passes', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/rpc/create_share_link', $q$select public.api_request_guard()::text$q$));
select pg_temp.chk('A11 hook: anon /rpc/parent_view passes', 'ok:', pg_temp.run(null, '/rpc/parent_view', $q$select public.api_request_guard()::text$q$));

-- ── B. website sessions behave as before ──
select pg_temp.chk('B1 web create_share_link parent', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/rpc/create_share_link', $q$select set_config('smoke.ptok', public.create_share_link('parent', null), true)$q$));
select pg_temp.chk('B2 web create_share_link portfolio', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/rpc/create_share_link', $q$select set_config('smoke.ftok', public.create_share_link('portfolio', null), true)$q$));
select pg_temp.chk('B3 web create_extension_token', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/rpc/create_extension_token', $q$select set_config('smoke.etok', public.create_extension_token('Smoke'), true)$q$));
select pg_temp.chk('B4 web teacher_create_class', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', false), '/rpc/teacher_create_class', $q$select set_config('smoke.code', public.teacher_create_class('Smoke class', null)->>'code', true)$q$));
select pg_temp.chk('B5 web preview_code', 'ok:{"ok": true', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/rpc/preview_code', $q$select public.preview_code(current_setting('smoke.code'))::text$q$));
select pg_temp.chk('B6 web redeem_code', 'ok:{"ok": true', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/rpc/redeem_code', $q$select public.redeem_code(current_setting('smoke.code'))::text$q$));
select pg_temp.chk('B7 new link share_essays defaults to false', 'false', (select share_essays::text from public.teacher_links where teacher_id = '00000000-0000-4000-8000-0000000039b1' and student_id = '00000000-0000-4000-8000-0000000039a1'));
select pg_temp.chk('B8 web my_teachers', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/rpc/my_teachers', $q$select count(*)::text from public.my_teachers()$q$));
select pg_temp.chk('B9 web teacher_roster', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', false), '/rpc/teacher_roster', $q$select count(*)::text from public.teacher_roster(null)$q$));
select pg_temp.chk('B10 web teacher_student', 'ok:{', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', false), '/rpc/teacher_student', $q$select public.teacher_student('00000000-0000-4000-8000-0000000039a1', null)::text$q$));
select pg_temp.chk('B11 web change_my_role student->teacher', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a2', false), '/rpc/change_my_role', $q$select public.change_my_role('teacher', 'Smoke Two', null)::text$q$));
select pg_temp.chk('B12 anon parent_view with a live link', 'ok:{', pg_temp.run(null, '/rpc/parent_view', $q$select public.parent_view(current_setting('smoke.ptok'), null)::text$q$));
select pg_temp.chk('B13 anon portfolio_view with a live link', 'ok:{', pg_temp.run(null, '/rpc/portfolio_view', $q$select public.portfolio_view(current_setting('smoke.ftok'))::text$q$));
select pg_temp.chk('B14 anon extension_transcript with a live token', 'ok:{"ok": true', pg_temp.run(null, '/rpc/extension_transcript', $q$select public.extension_transcript(current_setting('smoke.etok'))::text$q$));

-- ── C. every client RPC refuses the AI token at the function level (42501 = explicit guard; P0001 'students/teachers only' = is_role) ──
select pg_temp.chk('C01 AI archive_task', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/archive_task', $q$select public.archive_task(gen_random_uuid(), true)::text$q$));
select pg_temp.chk('C02 AI change_my_role', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/change_my_role', $q$select public.change_my_role('teacher', 'Evil', null)::text$q$));
select pg_temp.chk('C03 AI create_extension_token', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/create_extension_token', $q$select public.create_extension_token('Evil')$q$));
select pg_temp.chk('C04 AI create_share_link', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/create_share_link', $q$select public.create_share_link('parent', null)$q$));
select pg_temp.chk('C05 AI create_task', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/create_task', $q$select public.create_task('t', null, null, null, '00000000-0000-4000-8000-0000000039a1')::text$q$));
select pg_temp.chk('C06 AI extension_transcript (valid token) gets nothing', 'ok:{"ok": false, "error": "students_only"}', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/extension_transcript', $q$select public.extension_transcript(current_setting('smoke.etok'))::text$q$));
select pg_temp.chk('C07 AI leave_teacher', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/leave_teacher', $q$select public.leave_teacher('00000000-0000-4000-8000-0000000039b1')::text$q$));
select pg_temp.chk('C08 AI list_my_tasks', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/list_my_tasks', $q$select count(*)::text from public.list_my_tasks()$q$));
select pg_temp.chk('C09 AI my_tasks', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/my_tasks', $q$select count(*)::text from public.my_tasks()$q$));
select pg_temp.chk('C10 AI my_teachers', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/my_teachers', $q$select count(*)::text from public.my_teachers()$q$));
select pg_temp.chk('C11 AI parent_view (valid token) gets null', 'ok:null', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/parent_view', $q$select public.parent_view(current_setting('smoke.ptok'), null)::text$q$));
select pg_temp.chk('C12 AI portfolio_view (valid token) gets null', 'ok:null', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/portfolio_view', $q$select public.portfolio_view(current_setting('smoke.ftok'))::text$q$));
select pg_temp.chk('C13 AI preview_code', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/preview_code', $q$select public.preview_code(current_setting('smoke.code'))::text$q$));
select pg_temp.chk('C14 AI redeem_code', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/redeem_code', $q$select public.redeem_code(current_setting('smoke.code'))::text$q$));
select pg_temp.chk('C15 AI revoke_extension_token', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/revoke_extension_token', $q$select public.revoke_extension_token(gen_random_uuid())::text$q$));
select pg_temp.chk('C16 AI revoke_share_link', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/revoke_share_link', $q$select public.revoke_share_link(gen_random_uuid())::text$q$));
select pg_temp.chk('C17 AI set_my_digest', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/set_my_digest', $q$select public.set_my_digest(true)::text$q$));
select pg_temp.chk('C18 AI set_my_role', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/set_my_role', $q$select public.set_my_role('teacher', 'Evil', null)::text$q$));
select pg_temp.chk('C19 AI set_share_essays', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/set_share_essays', $q$select public.set_share_essays('00000000-0000-4000-8000-0000000039b1', true)::text$q$));
select pg_temp.chk('C20 AI set_task_done', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/rpc/set_task_done', $q$select public.set_task_done(gen_random_uuid(), true)::text$q$));
select pg_temp.chk('C21 AI task_progress', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/task_progress', $q$select count(*)::text from public.task_progress(gen_random_uuid())$q$));
select pg_temp.chk('C22 AI teacher_archive_class', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_archive_class', $q$select public.teacher_archive_class(gen_random_uuid(), true)::text$q$));
select pg_temp.chk('C23 AI teacher_create_class', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_create_class', $q$select public.teacher_create_class('Evil', null)::text$q$));
select pg_temp.chk('C24 AI teacher_deadlines', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_deadlines', $q$select count(*)::text from public.teacher_deadlines(30, null)$q$));
select pg_temp.chk('C25 AI teacher_new_code', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_new_code', $q$select public.teacher_new_code('individual', null, null)$q$));
select pg_temp.chk('C26 AI teacher_outcomes', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_outcomes', $q$select public.teacher_outcomes(null)::text$q$));
select pg_temp.chk('C27 AI teacher_remove_from_class', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_remove_from_class', $q$select public.teacher_remove_from_class(gen_random_uuid(), gen_random_uuid())::text$q$));
select pg_temp.chk('C28 AI teacher_remove_student', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_remove_student', $q$select public.teacher_remove_student('00000000-0000-4000-8000-0000000039a1')::text$q$));
select pg_temp.chk('C29 AI teacher_revoke_code', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_revoke_code', $q$select public.teacher_revoke_code('individual', null)::text$q$));
select pg_temp.chk('C30 AI teacher_roster', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_roster', $q$select count(*)::text from public.teacher_roster(null)$q$));
select pg_temp.chk('C31 AI teacher_student', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_student', $q$select public.teacher_student('00000000-0000-4000-8000-0000000039a1', null)::text$q$));
select pg_temp.chk('C32 AI teacher_students', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/teacher_students', $q$select count(*)::text from public.teacher_students()$q$));
select pg_temp.chk('C33 AI update_task', 'refused', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', true), '/rpc/update_task', $q$select public.update_task(gen_random_uuid(), 't', null, null)::text$q$));
select pg_temp.chk('C34 the AI calls above changed nothing: S still student, 1 teacher link, 2 share links, 1 token', '1/1/2/1',
  (select (select count(*) from public.user_roles where user_id = '00000000-0000-4000-8000-0000000039a1' and role = 'student') || '/' ||
          (select count(*) from public.teacher_links where student_id = '00000000-0000-4000-8000-0000000039a1') || '/' ||
          (select count(*) from public.share_links where student_id = '00000000-0000-4000-8000-0000000039a1') || '/' ||
          (select count(*) from public.extension_tokens where user_id = '00000000-0000-4000-8000-0000000039a1')));

-- ── D. table reads: the AI token sees nothing outside the MCP tables (no_oauth_clients); the website sees its rows ──
select pg_temp.chk('D1 AI share_links', 'ok:0', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/share_links', $q$select count(*)::text from public.share_links$q$));
select pg_temp.chk('D2 web share_links', 'ok:2', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/share_links', $q$select count(*)::text from public.share_links$q$));
select pg_temp.chk('D3 AI extension_tokens', 'ok:0', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/extension_tokens', $q$select count(*)::text from public.extension_tokens$q$));
select pg_temp.chk('D4 web extension_tokens', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/extension_tokens', $q$select count(*)::text from public.extension_tokens$q$));
select pg_temp.chk('D5 AI teacher_links', 'ok:0', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/teacher_links', $q$select count(*)::text from public.teacher_links$q$));
select pg_temp.chk('D6 web teacher_links', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/teacher_links', $q$select count(*)::text from public.teacher_links$q$));
select pg_temp.chk('D7 AI user_roles', 'ok:0', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/user_roles', $q$select count(*)::text from public.user_roles$q$));
select pg_temp.chk('D8 web user_roles', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/user_roles', $q$select count(*)::text from public.user_roles$q$));
select pg_temp.chk('D9 AI recommenders', 'ok:0', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/recommenders', $q$select count(*)::text from public.recommenders$q$));
select pg_temp.chk('D10 web recommenders', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/recommenders', $q$select count(*)::text from public.recommenders$q$));
select pg_temp.chk('D11 AI class_members', 'ok:0', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/class_members', $q$select count(*)::text from public.class_members$q$));
select pg_temp.chk('D12 AI insert recommender refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/recommenders', $q$with x as (insert into public.recommenders (user_id, name) values ('00000000-0000-4000-8000-0000000039a1', 'Evil') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('D13 AI reads student_profiles', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$select count(*)::text from public.student_profiles$q$));
select pg_temp.chk('D14 AI reads student_colleges', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_colleges', $q$select count(*)::text from public.student_colleges$q$));
select pg_temp.chk('D15 AI reads transcript_courses', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/transcript_courses', $q$select count(*)::text from public.transcript_courses$q$));

-- ── E. AI writes: only the columns and operations tools.ts uses ──
select pg_temp.chk('E1 AI update reminder_emails refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$with x as (update public.student_profiles set reminder_emails = false where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E2 AI update plan refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$with x as (update public.student_profiles set plan = 'senior' where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E3 AI update portals refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$with x as (update public.student_profiles set portals = '{}' where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E4 AI update reminder_days refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$with x as (update public.student_profiles set reminder_days = '{1}' where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E5 AI update sat_total allowed', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$with x as (update public.student_profiles set sat_total = 1450 where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E6 AI update every MCP profile column allowed', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$with x as (update public.student_profiles set act_composite = 30, gpa_unweighted = 3.8, gpa_weighted = 4.2, is_international = true, target_regions = '["US"]', test_details = '{"sat":{}}', interested = '["mit"]', activities = '{"commonApp":{}}', resume = '{"options":{}}' where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E7 web update reminder_emails + plan allowed', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/student_profiles', $q$with x as (update public.student_profiles set reminder_emails = false, plan = 'junior' where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E8 AI insert profile refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$with x as (insert into public.student_profiles (user_id) values ('00000000-0000-4000-8000-0000000039a1') on conflict do nothing returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E9 AI add_college insert allowed', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_colleges', $q$with i as (select id from public.institutions order by slug offset 1 limit 1), x as (insert into public.student_colleges (user_id, institution_id, plan_key, status, notes, checklist) select '00000000-0000-4000-8000-0000000039a1', id, null, 'in_progress', null, '{}' from i returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E10 AI insert with portal_password refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_colleges', $q$with x as (insert into public.student_colleges (user_id, custom, portal_password) values ('00000000-0000-4000-8000-0000000039a1', '{"name":"Evil"}', 'pw') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E11 AI update checklist/status/notes allowed', 'ok:2', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_colleges', $q$with x as (update public.student_colleges set checklist = '{"transcript":true}', status = 'planning', notes = 'n', plan_key = null where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E12 AI update portal_password refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_colleges', $q$with x as (update public.student_colleges set portal_password = 'x' where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E13 AI update aid_offer_usd refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_colleges', $q$with x as (update public.student_colleges set aid_offer_usd = 1 where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E14 AI delete student_colleges refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_colleges', $q$with x as (delete from public.student_colleges where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E15 AI delete student_profiles refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/student_profiles', $q$with x as (delete from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E16 AI delete transcript_schools refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/transcript_schools', $q$with x as (delete from public.transcript_schools where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E17 AI insert transcript_schools allowed', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/transcript_schools', $q$with x as (insert into public.transcript_schools (user_id, name) values ('00000000-0000-4000-8000-0000000039a1', 'AI School') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E18 AI update transcript_courses allowed', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/transcript_courses', $q$with x as (update public.transcript_courses set name = 'Smoke Algebra II' where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E19 AI delete transcript_courses allowed', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', true), '/transcript_courses', $q$with x as (delete from public.transcript_courses where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E20 web delete student_colleges allowed', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/student_colleges', $q$with x as (delete from public.student_colleges where user_id = '00000000-0000-4000-8000-0000000039a1' and notes = 'n' and status = 'planning' and institution_id = (select id from public.institutions order by slug offset 1 limit 1) returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E21 portals untouched after AI attempts', 'SMOKESECRET', (select portals #>> '{x,password}' from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000039a1'));

-- ── F. share links expire; old rows are cleaned up; recent rows are capped ──
select pg_temp.chk('F1 every share link (incl. pre-existing) expires in 180 days', 'true', (select (count(*) filter (where expires_at = now() + interval '180 days') = count(*))::text from public.share_links));
insert into public.share_links (student_id, kind, token_hash, label, expires_at) values
  ('00000000-0000-4000-8000-0000000039a3', 'parent', extensions.digest(repeat('Z', 43), 'sha256'), 'expired', now() - interval '1 day'),
  ('00000000-0000-4000-8000-0000000039a3', 'portfolio', extensions.digest(repeat('Y', 43), 'sha256'), 'live', now() + interval '1 day');
select pg_temp.chk('F2 anon parent_view on an expired link', 'ok:null', pg_temp.run(null, '/rpc/parent_view', $q$select public.parent_view(repeat('Z', 43), null)::text$q$));
select pg_temp.chk('F3 anon portfolio_view on a live link', 'ok:{', pg_temp.run(null, '/rpc/portfolio_view', $q$select public.portfolio_view(repeat('Y', 43))::text$q$));
insert into public.share_links (student_id, kind, token_hash, label, revoked_at)
  select '00000000-0000-4000-8000-0000000039a3', 'parent', extensions.digest('old' || g, 'sha256'), 'old', now() - interval '40 days' from generate_series(1, 60) g;
select pg_temp.chk('F4 create_share_link after 60 old revoked rows', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a3', false), '/rpc/create_share_link', $q$select public.create_share_link('parent', null)$q$));
select pg_temp.chk('F5 old revoked rows deleted (3 left: expired, live, new)', '3', (select count(*)::text from public.share_links where student_id = '00000000-0000-4000-8000-0000000039a3'));
insert into public.share_links (student_id, kind, token_hash, label, revoked_at)
  select '00000000-0000-4000-8000-0000000039a3', 'parent', extensions.digest('recent' || g, 'sha256'), 'recent', now() - interval '1 day' from generate_series(1, 50) g;
select pg_temp.chk('F6 create_share_link with 50+ recent rows refused', 'refused P0001: Too many', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a3', false), '/rpc/create_share_link', $q$select public.create_share_link('parent', null)$q$));
insert into public.extension_tokens (user_id, token_hash, revoked_at)
  select '00000000-0000-4000-8000-0000000039a1', extensions.digest('oldtok' || g, 'sha256'), now() - interval '40 days' from generate_series(1, 10) g;
select pg_temp.chk('F7 create_extension_token after 10 old revoked tokens', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/rpc/create_extension_token', $q$select public.create_extension_token('Smoke 2')$q$));
select pg_temp.chk('F8 old tokens deleted (2 left)', '2', (select count(*)::text from public.extension_tokens where user_id = '00000000-0000-4000-8000-0000000039a1'));
insert into public.extension_tokens (user_id, token_hash, revoked_at)
  select '00000000-0000-4000-8000-0000000039a3', extensions.digest('recenttok' || g, 'sha256'), now() - interval '1 day' from generate_series(1, 50) g;
select pg_temp.chk('F9 create_extension_token with 50 recent rows refused', 'refused P0001: Too many', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a3', false), '/rpc/create_extension_token', $q$select public.create_extension_token('x')$q$));

-- ── G. make_code: 8 symbols from its 31-symbol alphabet ──
select pg_temp.chk('G1 make_code x1000: well-formed/distinct/symbols used', '1000/1000/31',
  (with s as (select public.make_code() c from generate_series(1, 1000))
   select (select count(*) from s where c ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$') || '/' || (select count(distinct c) from s) || '/' ||
          (select count(distinct ch) from s, regexp_split_to_table(c, '') ch)));

-- ── H. row caps (the N+1th insert fails) and size caps ──
select pg_temp.chk('H1 transcript_schools up to 20', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/transcript_schools', $q$with x as (insert into public.transcript_schools (user_id, name) select '00000000-0000-4000-8000-0000000039a1', 'Cap ' || g from generate_series(1, 20 - (select count(*) from public.transcript_schools where user_id = '00000000-0000-4000-8000-0000000039a1')) g returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H2 21st transcript school refused', 'refused P0001: Limit reached: at most 20 transcript schools', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/transcript_schools', $q$with x as (insert into public.transcript_schools (user_id, name) values ('00000000-0000-4000-8000-0000000039a1', 'Cap 21') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H3 50 recommenders in one statement on top of 1 refused', 'refused P0001: Limit reached: at most 50 recommenders', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/recommenders', $q$with x as (insert into public.recommenders (user_id, name) select '00000000-0000-4000-8000-0000000039a1', 'Rec ' || g from generate_series(1, 50) g returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H4 49 more recommenders (50 total)', 'ok:49', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/recommenders', $q$with x as (insert into public.recommenders (user_id, name) select '00000000-0000-4000-8000-0000000039a1', 'Rec ' || g from generate_series(1, 49) g returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H5 51st recommender refused', 'refused P0001: Limit reached', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/recommenders', $q$with x as (insert into public.recommenders (user_id, name) values ('00000000-0000-4000-8000-0000000039a1', 'Rec 51') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H6 student_colleges up to 500', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/student_colleges', $q$with x as (insert into public.student_colleges (user_id, custom) select '00000000-0000-4000-8000-0000000039a1', jsonb_build_object('name', 'Cap ' || g) from generate_series(1, 500 - (select count(*) from public.student_colleges where user_id = '00000000-0000-4000-8000-0000000039a1')) g returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H7 501st college refused', 'refused P0001: Limit reached: at most 500 student colleges', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/student_colleges', $q$with x as (insert into public.student_colleges (user_id, custom) values ('00000000-0000-4000-8000-0000000039a1', '{"name":"Cap 501"}') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H8 classes up to 100', 'ok:', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', false), '/rpc/teacher_create_class', $q$select count(public.teacher_create_class('Cap ' || g, null))::text from generate_series(1, 100 - (select count(*) from public.classes where teacher_id = '00000000-0000-4000-8000-0000000039b1')) g$q$));
select pg_temp.chk('H9 101st class refused', 'refused P0001: Limit reached: at most 100 classes', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039b1', false), '/rpc/teacher_create_class', $q$select public.teacher_create_class('Cap 101', null)::text$q$));
select pg_temp.chk('H10 profile jsonb over 256 KB refused', 'refused 23514', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/student_profiles', $q$with x as (update public.student_profiles set activities = jsonb_build_object('x', repeat('a', 300000)) where user_id = '00000000-0000-4000-8000-0000000039a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H11 college notes of 10 001 chars refused', 'refused 23514', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/student_colleges', $q$with x as (update public.student_colleges set notes = repeat('a', 10001) where user_id = '00000000-0000-4000-8000-0000000039a1' and institution_id is not null returning 1) select count(*)::text from x$q$));
select pg_temp.chk('H12 college notes of 10 000 chars allowed', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000039a1', false), '/student_colleges', $q$with x as (update public.student_colleges set notes = repeat('a', 10000) where user_id = '00000000-0000-4000-8000-0000000039a1' and institution_id is not null returning 1) select count(*)::text from x$q$));

-- ── I. catalog ──
create function public.smoke_probe_0039() returns int language sql as 'select 1';
select pg_temp.chk('I1 a new function gets no PUBLIC/anon/authenticated EXECUTE', 'true', (select (proacl::text !~ '(^|[{,])=X|anon=|authenticated=')::text from pg_proc where proname = 'smoke_probe_0039'));
select pg_temp.chk('I2 SECURITY DEFINER functions executable by authenticated / by anon (was 33/3)', '33/3',
  (select count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute')) || '/' || count(*) filter (where has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef));
select pg_temp.chk('I3 pre-request hook registered', 'true', (select (setconfig::text like '%pgrst.db_pre_request=public.api_request_guard%')::text from pg_db_role_setting where setrole = 'authenticator'::regrole and setdatabase = 0));
select pg_temp.chk('I4 no_oauth_clients on all 18 user-data tables (none on the 4 MCP tables)', '18/0',
  (select count(*) filter (where tablename in ('class_members', 'classes', 'code_attempts', 'extension_tokens', 'google_tokens', 'join_codes',
            'recommenders', 'reminder_log', 'scholarship_reminder_log', 'scholarships', 'share_links', 'task_completions',
            'teacher_digest_log', 'teacher_links', 'teacher_notes', 'teacher_profiles', 'teacher_tasks', 'user_roles'))
          || '/' || count(*) filter (where tablename in ('student_profiles', 'student_colleges', 'transcript_schools', 'transcript_courses'))
     from pg_policies where schemaname = 'public' and policyname = 'no_oauth_clients' and permissive = 'RESTRICTIVE'));
select pg_temp.chk('I5 teacher_links.share_essays default', 'false', (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'teacher_links' and column_name = 'share_essays'));

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
