-- Smoke test for migration 0053_classroom_gc (Google Classroom style: class themes, task topics, done notes and links).
-- Run in the dashboard SQL Editor AFTER applying 0053. For the dry run, paste 0053 and then this file inside one
-- begin ... rollback (this file's own begin then only warns that a transaction is already open, and its rollback also
-- undoes 0053). It creates throwaway users inside one transaction, acts as each of them through the real RPCs, and
-- ROLLS BACK, so nothing is kept. Success = the notice "classroom gc smoke test passed" and, after the rollback, one row
-- CLASSROOM_GC_SMOKE_OK. Any failed check raises an exception, which stops the script before that row.
--
-- Cast (ids are 00000000-0000-4000-8000-0000000053xx):
--   T1 a1 teacher, classes A c1 "GC Zeta (A)" and B c2 "GC Alpha (B)" (school year 2026-27). The names sort the other
--      way from the ids, so an array in my_teachers() that is not ordered like class_ids shows up.
--   T2 a2 teacher, class C c3
--   S1 b1 student, linked to T1, member of A and B
--   S2 b2 student, linked to T1, member of A
-- Parts: P catalog and table checks; G themes and topics; D done notes and links; A archive; O AI-connector refusals.
-- An expected error is checked by its exact message. A call that should fail but doesn't raises 'FAIL: ...' inside the
-- block, which then fails the message check as well.

begin;

-- ── setup, as the SQL Editor's postgres role ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000053a1', 'classroom-gc-smoke-t1@example.invalid'),
  ('00000000-0000-4000-8000-0000000053a2', 'classroom-gc-smoke-t2@example.invalid'),
  ('00000000-0000-4000-8000-0000000053b1', 'classroom-gc-smoke-s1@example.invalid'),
  ('00000000-0000-4000-8000-0000000053b2', 'classroom-gc-smoke-s2@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000053a1', 'teacher'), ('00000000-0000-4000-8000-0000000053a2', 'teacher'),
  ('00000000-0000-4000-8000-0000000053b1', 'student'), ('00000000-0000-4000-8000-0000000053b2', 'student');
insert into public.teacher_profiles (user_id, display_name) values
  ('00000000-0000-4000-8000-0000000053a1', 'GC Smoke Teacher One'),
  ('00000000-0000-4000-8000-0000000053a2', 'GC Smoke Teacher Two');
insert into public.student_profiles (user_id, display_name) values
  ('00000000-0000-4000-8000-0000000053b1', 'GC Smoke S1'), ('00000000-0000-4000-8000-0000000053b2', 'GC Smoke S2');
insert into public.classes (id, teacher_id, name, school_year) values
  ('00000000-0000-4000-8000-0000000053c1', '00000000-0000-4000-8000-0000000053a1', 'GC Zeta (A)', null),
  ('00000000-0000-4000-8000-0000000053c2', '00000000-0000-4000-8000-0000000053a1', 'GC Alpha (B)', '2026-27'),
  ('00000000-0000-4000-8000-0000000053c3', '00000000-0000-4000-8000-0000000053a2', 'GC C', null);
insert into public.teacher_links (teacher_id, student_id, via) values
  ('00000000-0000-4000-8000-0000000053a1', '00000000-0000-4000-8000-0000000053b1', 'class'),
  ('00000000-0000-4000-8000-0000000053a1', '00000000-0000-4000-8000-0000000053b2', 'class');
insert into public.class_members (class_id, student_id) values
  ('00000000-0000-4000-8000-0000000053c1', '00000000-0000-4000-8000-0000000053b1'),
  ('00000000-0000-4000-8000-0000000053c2', '00000000-0000-4000-8000-0000000053b1'),
  ('00000000-0000-4000-8000-0000000053c1', '00000000-0000-4000-8000-0000000053b2');

-- Each "act as" step sets the JWT claims auth.uid() reads, then drops to the authenticated role. Steps "as postgres"
-- clear the claims first.

-- ═════════════ part P: catalog and table checks ═════════════

-- ── P1. as postgres: each new or changed function has exactly one signature (PostgREST can't choose between two
-- overloads), is SECURITY DEFINER with an empty search_path, and is callable by authenticated but not by anon/public ──
select set_config('request.jwt.claims', '', true);
do $$
declare
  sig   text;
  v_oid oid;
  r     record;
begin
  foreach sig in array array[
    'teacher_set_class_theme(uuid, text)',
    'create_task(text, text, date, uuid, uuid, text, text, text, text)',
    'update_task(uuid, text, text, date, text)', 'archive_task(uuid, boolean)',
    'set_task_done(uuid, boolean, text, text)', 'task_progress(uuid)', 'my_tasks()', 'list_my_tasks()',
    'teacher_student_tasks(uuid)', 'my_teachers()'
  ] loop
    v_oid := to_regprocedure('public.' || sig);
    if v_oid is null then raise exception 'FAIL: public.% is missing', sig; end if;
    if (select count(*) from pg_catalog.pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.proname = split_part(sig, '(', 1)) <> 1 then
      raise exception 'FAIL: public.% has an old overload left over', split_part(sig, '(', 1);
    end if;
    select p.prosecdef, p.proconfig into r from pg_catalog.pg_proc p where p.oid = v_oid;
    if not found or not r.prosecdef or not ('search_path=""' = any (coalesce(r.proconfig, '{}'::text[]))) then
      raise exception 'FAIL: public.% should be SECURITY DEFINER with search_path '''' (proconfig %)', sig, r.proconfig;
    end if;
    if not has_function_privilege('authenticated', v_oid, 'execute')
       or has_function_privilege('anon', v_oid, 'execute') then
      raise exception 'FAIL: public.% should be executable by authenticated only', sig;
    end if;
  end loop;
end $$;

-- ── P2. as postgres: the new columns' checks hold for direct writes too; the limits themselves pass ──
do $$
declare
  t1     constant uuid := '00000000-0000-4000-8000-0000000053a1';
  s2     constant uuid := '00000000-0000-4000-8000-0000000053b2';
  v_a    constant uuid := '00000000-0000-4000-8000-0000000053c1';
  v_task uuid;
begin
  -- An archived task, so no student ever sees it or its completion.
  insert into public.teacher_tasks (teacher_id, class_id, title, archived, topic)
  values (t1, v_a, 'GC direct task', true, repeat('t', 60))
  returning id into v_task;
  insert into public.task_completions (task_id, student_id, teacher_id, note, link)
  values (v_task, s2, t1, repeat('n', 500), 'https://' || repeat('a', 492));

  begin
    update public.classes set theme = 'pink' where id = '00000000-0000-4000-8000-0000000053c3';
    raise exception 'FAIL: classes.theme took pink';
  exception when check_violation then null;
  end;
  begin
    insert into public.teacher_tasks (teacher_id, class_id, title, archived, topic) values (t1, v_a, 'x', true, '   ');
    raise exception 'FAIL: teacher_tasks.topic took a blank topic';
  exception when check_violation then null;
  end;
  begin
    insert into public.teacher_tasks (teacher_id, class_id, title, archived, topic) values (t1, v_a, 'x', true, repeat('t', 61));
    raise exception 'FAIL: teacher_tasks.topic took 61 characters';
  exception when check_violation then null;
  end;
  begin
    update public.task_completions set note = repeat('n', 501) where task_id = v_task and student_id = s2;
    raise exception 'FAIL: task_completions.note took 501 characters';
  exception when check_violation then null;
  end;
  begin
    update public.task_completions set note = '   ' where task_id = v_task and student_id = s2;
    raise exception 'FAIL: task_completions.note took a blank note';
  exception when check_violation then null;
  end;
  begin
    update public.task_completions set link = 'javascript:x' where task_id = v_task and student_id = s2;
    raise exception 'FAIL: task_completions.link took javascript:';
  exception when check_violation then null;
  end;
  begin
    update public.task_completions set link = 'https://' || repeat('a', 493) where task_id = v_task and student_id = s2;
    raise exception 'FAIL: task_completions.link took 501 characters';
  exception when check_violation then null;
  end;
end $$;

-- ═════════════ part G: class themes and task topics ═════════════

-- ── G1. T1: themes (set, clear with null, refused), a class-A task with a topic, the topic limits ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_a     constant uuid := '00000000-0000-4000-8000-0000000053c1';
  v_b     constant uuid := '00000000-0000-4000-8000-0000000053c2';
  v_task  uuid;
  v       uuid;
  v_theme text;
  r       record;
begin
  perform public.teacher_set_class_theme(v_a, 'coral');
  perform public.teacher_set_class_theme(v_b, 'mint');
  -- T1 reads their own classes directly ("own classes read", 0021).
  select c.theme into v_theme from public.classes c where c.id = v_b;
  if not found or v_theme is distinct from 'mint' then raise exception 'FAIL: class B theme not set (%)', v_theme; end if;
  perform public.teacher_set_class_theme(v_b, null);
  select c.theme into v_theme from public.classes c where c.id = v_b;
  if not found or v_theme is not null then raise exception 'FAIL: a null theme should clear class B''s (%)', v_theme; end if;

  begin
    perform public.teacher_set_class_theme(v_a, 'pink');
    raise exception 'FAIL: theme pink accepted';
  exception when others then
    if sqlerrm is distinct from 'classroom: invalid' then raise exception 'FAIL: theme pink: %', sqlerrm; end if;
  end;
  begin
    perform public.teacher_set_class_theme('00000000-0000-4000-8000-0000000053c3', 'sky');
    raise exception 'FAIL: T1 set the theme of T2''s class';
  exception when others then
    if sqlerrm is distinct from 'classroom: not found' then raise exception 'FAIL: theme on T2''s class: %', sqlerrm; end if;
  end;
  select c.theme into v_theme from public.classes c where c.id = v_a;
  if not found or v_theme is distinct from 'coral' then raise exception 'FAIL: class A should be coral (%)', v_theme; end if;

  v_task := public.create_task('GC class task', p_class => v_a, p_topic => '  College list  ');
  perform set_config('smoke.task', v_task::text, true);
  select * into r from public.list_my_tasks() x where x.task_id = v_task;
  if not found or r.topic is distinct from 'College list' then
    raise exception 'FAIL: the topic should be stored trimmed (%)', r;
  end if;
  perform set_config('smoke.task_created', r.created_at::text, true);

  v := public.create_task('GC 60-character topic', p_class => v_a, p_topic => repeat('t', 60));
  select * into r from public.list_my_tasks() x where x.task_id = v;
  if not found or r.topic is distinct from repeat('t', 60) then raise exception 'FAIL: a 60-character topic should be kept'; end if;
  perform public.archive_task(v, true);
  v := public.create_task('GC blank topic', p_class => v_a, p_topic => '   ');
  select * into r from public.list_my_tasks() x where x.task_id = v;
  if not found or r.topic is not null then raise exception 'FAIL: a blank topic should be stored as none (%)', r.topic; end if;
  perform public.archive_task(v, true);
  select * into r from public.list_my_tasks() x where x.task_id = v;
  if not found or not r.archived then raise exception 'FAIL: archive_task did not archive (%)', r; end if;

  begin
    perform public.create_task('GC 61', p_class => v_a, p_topic => repeat('t', 61));
    raise exception 'FAIL: a 61-character topic accepted';
  exception when others then
    if sqlerrm is distinct from 'classroom: invalid' then raise exception 'FAIL: 61-character topic: %', sqlerrm; end if;
  end;
  begin
    perform public.create_task('   ', p_class => v_a, p_topic => 'College list');
    raise exception 'FAIL: an empty title accepted';
  exception when others then
    if sqlerrm is distinct from 'task title required' then raise exception 'FAIL: empty title: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── G2. T2 can't touch T1's class or task ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053a2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_task constant uuid := current_setting('smoke.task')::uuid;
begin
  begin
    perform public.teacher_set_class_theme('00000000-0000-4000-8000-0000000053c1', 'sky');
    raise exception 'FAIL: T2 set the theme of T1''s class';
  exception when others then
    if sqlerrm is distinct from 'classroom: not found' then raise exception 'FAIL: T2 theme on class A: %', sqlerrm; end if;
  end;
  begin
    perform public.update_task(v_task, 'hijacked', null, null, 'hijacked');
    raise exception 'FAIL: T2 updated T1''s task';
  exception when others then
    if sqlerrm is distinct from 'task not found' then raise exception 'FAIL: T2 update_task: %', sqlerrm; end if;
  end;
  begin
    perform public.archive_task(v_task, true);
    raise exception 'FAIL: T2 archived T1''s task';
  exception when others then
    if sqlerrm is distinct from 'task not found' then raise exception 'FAIL: T2 archive_task: %', sqlerrm; end if;
  end;
  begin
    perform * from public.task_progress(v_task);
    raise exception 'FAIL: T2 read the progress of T1''s task';
  exception when others then
    if sqlerrm is distinct from 'task not found' then raise exception 'FAIL: T2 task_progress: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── G3. S1: can't set a theme; my_teachers() carries themes, school years and archived flags aligned with class_ids;
-- my_tasks() carries created_at and the topic ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  r      record;
begin
  begin
    perform public.teacher_set_class_theme('00000000-0000-4000-8000-0000000053c1', 'sky');
    raise exception 'FAIL: a student set a class theme';
  exception when others then
    if sqlerrm is distinct from 'classroom: not found (teachers only)' then raise exception 'FAIL: student theme: %', sqlerrm; end if;
  end;
  -- Ordered by name, then id: B "GC Alpha (B)" first. A is still coral after T2's and S1's refused calls.
  select * into r from public.my_teachers() x where x.teacher_id = '00000000-0000-4000-8000-0000000053a1';
  if not found
     or r.class_ids is distinct from array['00000000-0000-4000-8000-0000000053c2', '00000000-0000-4000-8000-0000000053c1']::uuid[]
     or r.class_names is distinct from array['GC Alpha (B)', 'GC Zeta (A)']::text[]
     or r.class_themes is distinct from array[null, 'coral']::text[]
     or r.class_years is distinct from array['2026-27', null]::text[]
     or r.class_archived is distinct from array[false, false]::boolean[] then
    raise exception 'FAIL: S1''s my_teachers() row for T1 (%)', r;
  end if;
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not found or r.topic is distinct from 'College list'
     or r.created_at is distinct from current_setting('smoke.task_created')::timestamptz
     or r.class_id is distinct from '00000000-0000-4000-8000-0000000053c1'
     or r.done or r.done_at is not null or r.note is not null or r.link is not null then
    raise exception 'FAIL: S1''s my_tasks() row (%)', r;
  end if;
end $$;
reset role;

-- ── G4. T1: update_task changes the topic (and still the title, details and due date); p_topic null clears it ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  r      record;
begin
  perform public.update_task(v_task, '  GC class task v2  ', '  Bring the list  ', '2026-12-01', '  Essays  ');
  select * into r from public.list_my_tasks() x where x.task_id = v_task;
  if not found or r.title is distinct from 'GC class task v2' or r.details is distinct from 'Bring the list'
     or r.due_on is distinct from '2026-12-01'::date or r.topic is distinct from 'Essays' then
    raise exception 'FAIL: update_task should change title, details, due date and topic (%)', r;
  end if;
  select * into r from public.teacher_student_tasks('00000000-0000-4000-8000-0000000053b1') x where x.task_id = v_task;
  if not found or r.topic is distinct from 'Essays' or r.done or r.note is not null or r.link is not null then
    raise exception 'FAIL: T1''s teacher_student_tasks() row for S1 (%)', r;
  end if;
  begin
    perform public.update_task(v_task, 'GC class task v2', null, null, repeat('t', 61));
    raise exception 'FAIL: update_task took a 61-character topic';
  exception when others then
    if sqlerrm is distinct from 'classroom: invalid' then raise exception 'FAIL: update_task 61-character topic: %', sqlerrm; end if;
  end;
  begin
    perform public.update_task(v_task, '   ', null, null, 'Essays');
    raise exception 'FAIL: update_task took an empty title';
  exception when others then
    if sqlerrm is distinct from 'task title required' then raise exception 'FAIL: update_task empty title: %', sqlerrm; end if;
  end;
  perform public.update_task(v_task, 'GC class task v2', 'Bring the list', '2026-12-01', null);
  select * into r from public.list_my_tasks() x where x.task_id = v_task;
  if not found or r.topic is not null or r.title is distinct from 'GC class task v2' then
    raise exception 'FAIL: p_topic null should clear the topic (%)', r;
  end if;
end $$;
reset role;

-- ═════════════ part D: done notes and links ═════════════

-- ── D1. S1 marks the task done with a note and a link (stored trimmed); bad notes and links are refused ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  r      record;
begin
  perform public.set_task_done(v_task, true, '  draft  ', '  https://a.org/d  ');
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not found or not r.done or r.done_at is null
     or r.note is distinct from 'draft' or r.link is distinct from 'https://a.org/d' then
    raise exception 'FAIL: done with a note and a link (%)', r;
  end if;
  perform set_config('smoke.done_at', r.done_at::text, true);

  begin
    perform public.set_task_done(v_task, true, repeat('n', 501), null);
    raise exception 'FAIL: a 501-character note accepted';
  exception when others then
    if sqlerrm is distinct from 'classroom: invalid' then raise exception 'FAIL: 501-character note: %', sqlerrm; end if;
  end;
  begin
    perform public.set_task_done(v_task, true, 'draft', 'javascript:x');
    raise exception 'FAIL: a javascript: link accepted';
  exception when others then
    if sqlerrm is distinct from 'classroom: invalid' then raise exception 'FAIL: javascript: link: %', sqlerrm; end if;
  end;
  begin
    perform public.set_task_done(v_task, true, 'draft', 'https://' || repeat('a', 493));
    raise exception 'FAIL: a 501-character link accepted';
  exception when others then
    if sqlerrm is distinct from 'classroom: invalid' then raise exception 'FAIL: 501-character link: %', sqlerrm; end if;
  end;
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not found or not r.done or r.note is distinct from 'draft' or r.link is distinct from 'https://a.org/d' then
    raise exception 'FAIL: a refused call changed the completion (%)', r;
  end if;
end $$;
reset role;

-- ── D2. T1 sees S1's note and link (task_progress, teacher_student_tasks); S2 has none ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  r      record;
begin
  select * into r from public.task_progress(v_task) x where x.student_id = '00000000-0000-4000-8000-0000000053b1';
  if not found or not r.done or r.display_name is distinct from 'GC Smoke S1'
     or r.done_at is distinct from current_setting('smoke.done_at')::timestamptz
     or r.note is distinct from 'draft' or r.link is distinct from 'https://a.org/d' then
    raise exception 'FAIL: T1''s task_progress() row for S1 (%)', r;
  end if;
  select * into r from public.task_progress(v_task) x where x.student_id = '00000000-0000-4000-8000-0000000053b2';
  if not found or r.done or r.done_at is not null or r.note is not null or r.link is not null then
    raise exception 'FAIL: T1''s task_progress() row for S2 (%)', r;
  end if;
  select * into r from public.teacher_student_tasks('00000000-0000-4000-8000-0000000053b1') x where x.task_id = v_task;
  if not found or not r.done or r.note is distinct from 'draft' or r.link is distinct from 'https://a.org/d' then
    raise exception 'FAIL: T1''s teacher_student_tasks() row for S1 (%)', r;
  end if;
  select * into r from public.list_my_tasks() x where x.task_id = v_task;
  if not found or r.done_count is distinct from 1 or r.total_count is distinct from 2 then
    raise exception 'FAIL: list_my_tasks() should count 1 of 2 done (%)', r;
  end if;
end $$;
reset role;

-- ── D3. S1 marks done again with a new note and no link: note and link are replaced, done_at stays ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  r      record;
begin
  perform pg_catalog.pg_sleep(0.01); -- so a done_at written again would differ
  perform public.set_task_done(v_task, true, 'final draft', null);
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not found or not r.done or r.note is distinct from 'final draft' or r.link is not null
     or r.done_at is distinct from current_setting('smoke.done_at')::timestamptz then
    raise exception 'FAIL: done again should replace note and link and keep done_at (%)', r;
  end if;
end $$;
reset role;

-- ── D4. S2 (same class task) sees nothing of S1's, writes and undoes their own completion ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053b2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  r      record;
begin
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not found or r.done or r.done_at is not null or r.note is not null or r.link is not null then
    raise exception 'FAIL: S2 should see the task without S1''s completion (%)', r;
  end if;
  perform public.set_task_done(v_task, true, 'S2 note', 'https://b.org/x');
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not found or not r.done or r.note is distinct from 'S2 note' or r.link is distinct from 'https://b.org/x' then
    raise exception 'FAIL: S2''s own completion (%)', r;
  end if;
  perform public.set_task_done(v_task, false);
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not found or r.done or r.note is not null or r.link is not null then raise exception 'FAIL: S2''s undo (%)', r; end if;
end $$;
reset role;

-- ── D5. T1: S2's calls left S1's completion alone ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  r      record;
begin
  select * into r from public.task_progress(v_task) x where x.student_id = '00000000-0000-4000-8000-0000000053b1';
  if not found or not r.done or r.note is distinct from 'final draft' or r.link is not null
     or r.done_at is distinct from current_setting('smoke.done_at')::timestamptz then
    raise exception 'FAIL: S2 changed S1''s completion (%)', r;
  end if;
  select * into r from public.task_progress(v_task) x where x.student_id = '00000000-0000-4000-8000-0000000053b2';
  if not found or r.done or r.note is not null or r.link is not null then
    raise exception 'FAIL: S2''s row after their undo (%)', r;
  end if;
end $$;
reset role;

-- ── D6. S1 undoes: not done, and the note and link are gone ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  r      record;
begin
  perform public.set_task_done(v_task, false);
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not found or r.done or r.done_at is not null or r.note is not null or r.link is not null then
    raise exception 'FAIL: S1''s undo (%)', r;
  end if;
end $$;
reset role;

-- ── D7. as postgres: undo deleted the completion rows themselves ──
select set_config('request.jwt.claims', '', true);
do $$
declare v_task constant uuid := current_setting('smoke.task')::uuid;
begin
  if not exists (select 1 from public.teacher_tasks t where t.id = v_task) then
    raise exception 'FAIL: setup: the smoke task is missing';
  end if;
  if exists (select 1 from public.task_completions tc where tc.task_id = v_task) then
    raise exception 'FAIL: undo should delete the completion row, and the note and link with it';
  end if;
end $$;

-- ═════════════ part A: archive ═════════════

-- ── A1. T1 archives class B; archive_task still archives and un-archives ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  r      record;
begin
  perform public.teacher_archive_class('00000000-0000-4000-8000-0000000053c2', true);
  perform public.archive_task(v_task, true);
  select * into r from public.list_my_tasks() x where x.task_id = v_task;
  if not found or not r.archived then raise exception 'FAIL: archive_task (%)', r; end if;
  perform public.archive_task(v_task, false);
  select * into r from public.list_my_tasks() x where x.task_id = v_task;
  if not found or r.archived then raise exception 'FAIL: un-archive_task (%)', r; end if;
end $$;
reset role;

-- ── A2. S1: my_teachers() marks class B archived (the other arrays unchanged); the un-archived task is back ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000053b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.my_teachers() x where x.teacher_id = '00000000-0000-4000-8000-0000000053a1';
  if not found
     or r.class_ids is distinct from array['00000000-0000-4000-8000-0000000053c2', '00000000-0000-4000-8000-0000000053c1']::uuid[]
     or r.class_archived is distinct from array[true, false]::boolean[]
     or r.class_themes is distinct from array[null, 'coral']::text[]
     or r.class_years is distinct from array['2026-27', null]::text[] then
    raise exception 'FAIL: S1''s my_teachers() row after B was archived (%)', r;
  end if;
  if not exists (select 1 from public.my_tasks() x where x.task_id = current_setting('smoke.task')::uuid) then
    raise exception 'FAIL: S1 should see the un-archived task';
  end if;
end $$;
reset role;

-- ═════════════ part O: AI-connector tokens are refused ═════════════
-- The claims carry client_id, the claim refuse_oauth_client() checks (is_oauth_client, 0041). The calls are ones T1 / S1
-- may make on the website, so only the refusal can stop them; the refusal's own message and code are required (before
-- 0053, is_role() already failed for update_task / archive_task / task_progress, but with 'teachers only').

-- ── O1. T1 through an AI connector ──
select set_config('request.jwt.claims',
                  '{"sub":"00000000-0000-4000-8000-0000000053a1","role":"authenticated","client_id":"smoke-client"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  q      text;
begin
  foreach q in array array[
    format('select public.update_task(%L, %L, null, null, %L)', v_task, 'GC AI title', 'Essays'),
    format('select public.archive_task(%L, true)', v_task),
    format('select * from public.task_progress(%L)', v_task),
    format('select public.teacher_set_class_theme(%L, %L)', '00000000-0000-4000-8000-0000000053c1', 'sky'),
    format('select public.create_task(%L, p_class => %L, p_topic => %L)', 'GC AI task', '00000000-0000-4000-8000-0000000053c1', 'x'),
    'select * from public.list_my_tasks()',
    format('select * from public.teacher_student_tasks(%L)', '00000000-0000-4000-8000-0000000053b1')
  ] loop
    begin
      execute q;
      raise exception 'FAIL: an AI-connector token ran: %', q;
    exception when others then
      if sqlstate is distinct from '42501' or sqlerrm not like 'Not available to connected AI apps%' then
        raise exception 'FAIL: AI connector, % -> % (%)', q, sqlerrm, sqlstate;
      end if;
    end;
  end loop;
end $$;
reset role;

-- ── O2. S1 through an AI connector ──
select set_config('request.jwt.claims',
                  '{"sub":"00000000-0000-4000-8000-0000000053b1","role":"authenticated","client_id":"smoke-client"}', true);
set local role authenticated;
do $$
declare
  v_task constant uuid := current_setting('smoke.task')::uuid;
  q      text;
begin
  foreach q in array array[
    format('select public.set_task_done(%L, true, %L, null)', v_task, 'AI note'),
    'select * from public.my_tasks()',
    'select * from public.my_teachers()'
  ] loop
    begin
      execute q;
      raise exception 'FAIL: an AI-connector token ran: %', q;
    exception when others then
      if sqlstate is distinct from '42501' or sqlerrm not like 'Not available to connected AI apps%' then
        raise exception 'FAIL: AI connector, % -> % (%)', q, sqlerrm, sqlstate;
      end if;
    end;
  end loop;
end $$;
reset role;

-- ═════════════ done ═════════════
select set_config('request.jwt.claims', '', true);
do $$
begin
  raise notice 'classroom gc smoke test passed';
end $$;

rollback;

select 'CLASSROOM_GC_SMOKE_OK' as result;
