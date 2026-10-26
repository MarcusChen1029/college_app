-- Smoke test for migration 0028_teacher_tasks. Run in the dashboard SQL Editor AFTER applying 0028.
-- It creates throwaway users inside one transaction, acts as each of them through the real RPCs, and ROLLS BACK,
-- so nothing is kept. Success = the final notice "teacher tasks smoke test: all checks passed".
-- Any failed check raises an exception (and the transaction is rolled back anyway).
--
-- Cast: teacher A (class A1; students S1 in A1, S2 one-on-one), teacher B (class B1, student S3),
--       student U (linked to nobody).

begin;

-- ── setup, as the SQL Editor's postgres role ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'smoke-teacher-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000000b', 'smoke-teacher-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000001', 'smoke-s1@example.invalid'),
  ('00000000-0000-4000-8000-000000000002', 'smoke-s2@example.invalid'),
  ('00000000-0000-4000-8000-000000000003', 'smoke-s3@example.invalid'),
  ('00000000-0000-4000-8000-0000000000ff', 'smoke-unlinked@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-00000000000a', 'teacher'), ('00000000-0000-4000-8000-00000000000b', 'teacher'),
  ('00000000-0000-4000-8000-000000000001', 'student'), ('00000000-0000-4000-8000-000000000002', 'student'),
  ('00000000-0000-4000-8000-000000000003', 'student'), ('00000000-0000-4000-8000-0000000000ff', 'student');
insert into public.teacher_profiles (user_id, display_name) values
  ('00000000-0000-4000-8000-00000000000a', 'Smoke Teacher A'), ('00000000-0000-4000-8000-00000000000b', 'Smoke Teacher B');
insert into public.classes (id, teacher_id, name) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'Smoke A1'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000b', 'Smoke B1');
insert into public.teacher_links (teacher_id, student_id, via) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'class'),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000002', 'individual'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000003', 'class');
insert into public.class_members (class_id, student_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000003');

-- Each "act as" step sets the JWT claims auth.uid() reads, then drops to the authenticated role.

-- ── teacher A creates tasks ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
declare t_class uuid; t_one uuid; ok boolean;
begin
  t_class := public.create_task('Smoke: finish Common App profile', 'Section 1-3', current_date + 3,
                                p_class => '00000000-0000-4000-8000-0000000000c1');
  t_one := public.create_task('Smoke: send transcript request', null, null, p_student => '00000000-0000-4000-8000-000000000002');
  perform set_config('smoke.t_class', t_class::text, true);
  perform set_config('smoke.t_one', t_one::text, true);

  -- Both targets / neither target are refused.
  begin
    perform public.create_task('x', null, null, '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000002');
    raise exception 'FAIL: task with two targets was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- A cannot target B's class or B's student.
  begin
    perform public.create_task('x', p_class => '00000000-0000-4000-8000-0000000000c2');
    raise exception 'FAIL: teacher A created a task for teacher B''s class';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.create_task('x', p_student => '00000000-0000-4000-8000-000000000003');
    raise exception 'FAIL: teacher A created a task for a student linked only to B';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Over-long title refused.
  begin
    perform public.create_task(repeat('x', 121), p_student => '00000000-0000-4000-8000-000000000002');
    raise exception 'FAIL: 121-char title accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- Direct table access is closed.
  begin
    perform 1 from public.teacher_tasks limit 1;
    raise exception 'FAIL: authenticated can select teacher_tasks directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.task_completions limit 1;
    raise exception 'FAIL: authenticated can select task_completions directly';
  exception when insufficient_privilege then null;
  end;

  select count(*) = 2 into ok from public.list_my_tasks();
  if not ok then raise exception 'FAIL: teacher A should list 2 tasks'; end if;
end $$;
reset role;

-- ── teacher B sees none of A's tasks and cannot touch them ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$
declare t uuid := current_setting('smoke.t_class')::uuid;
begin
  if exists (select 1 from public.list_my_tasks()) then raise exception 'FAIL: teacher B lists teacher A''s tasks'; end if;
  begin
    perform * from public.task_progress(t);
    raise exception 'FAIL: teacher B read progress of A''s task';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.update_task(t, 'hijacked');
    raise exception 'FAIL: teacher B updated A''s task';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.archive_task(t, true);
    raise exception 'FAIL: teacher B archived A''s task';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- ── student S1 (class member) sees the class task only, completes it ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.my_tasks();
  if n <> 1 then raise exception 'FAIL: S1 should see 1 task, saw %', n; end if;
  perform public.set_task_done(current_setting('smoke.t_class')::uuid, true);
  if not (select done from public.my_tasks() where task_id = current_setting('smoke.t_class')::uuid) then
    raise exception 'FAIL: S1 completion not recorded';
  end if;
  -- S1 cannot complete S2's one-on-one task.
  begin
    perform public.set_task_done(current_setting('smoke.t_one')::uuid, true);
    raise exception 'FAIL: S1 completed a task that is not theirs';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Students can't call teacher RPCs.
  begin
    perform * from public.task_progress(current_setting('smoke.t_class')::uuid);
    raise exception 'FAIL: student read task_progress';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- ── student S2 sees only their one-on-one task and not S1's completion ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.my_tasks();
  if n <> 1 then raise exception 'FAIL: S2 should see 1 task, saw %', n; end if;
  if (select done from public.my_tasks()) then raise exception 'FAIL: S2 sees a done flag they did not set'; end if;
end $$;
reset role;

-- ── unlinked student U and B's student S3 see nothing and can't complete anything ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ff","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.my_tasks()) then raise exception 'FAIL: unlinked student sees tasks'; end if;
  begin
    perform public.set_task_done(current_setting('smoke.t_class')::uuid, true);
    raise exception 'FAIL: unlinked student completed a task';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.my_tasks()) then raise exception 'FAIL: teacher B''s student sees teacher A''s tasks'; end if;
end $$;
reset role;

-- ── teacher A sees progress: class task 1/1 done, one-on-one 0/1 ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select done_count, total_count into r from public.list_my_tasks() where task_id = current_setting('smoke.t_class')::uuid;
  if r.done_count <> 1 or r.total_count <> 1 then raise exception 'FAIL: class task counts %/%', r.done_count, r.total_count; end if;
  select done_count, total_count into r from public.list_my_tasks() where task_id = current_setting('smoke.t_one')::uuid;
  if r.done_count <> 0 or r.total_count <> 1 then raise exception 'FAIL: one-on-one task counts %/%', r.done_count, r.total_count; end if;
  if (select count(*) from public.task_progress(current_setting('smoke.t_class')::uuid)) <> 1 then
    raise exception 'FAIL: class task progress should list exactly S1';
  end if;
end $$;
reset role;

-- ── the link ends: S1 leaves A, S2 is removed by A ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.leave_teacher('00000000-0000-4000-8000-00000000000a');
do $$
begin
  if exists (select 1 from public.my_tasks()) then raise exception 'FAIL: S1 still sees tasks after leaving'; end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select public.teacher_remove_student('00000000-0000-4000-8000-000000000002');
do $$
declare r record;
begin
  select done_count, total_count into r from public.list_my_tasks() where task_id = current_setting('smoke.t_class')::uuid;
  if r.done_count <> 0 or r.total_count <> 0 then raise exception 'FAIL: departed student still counted (%/%)', r.done_count, r.total_count; end if;
  if exists (select 1 from public.list_my_tasks() where task_id = current_setting('smoke.t_one')::uuid) then
    raise exception 'FAIL: one-on-one task survived the link ending';
  end if;
end $$;
reset role;

-- Completions went with the link (checked as postgres, since the table is closed to clients).
do $$
begin
  if exists (select 1 from public.task_completions where student_id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: S1 completion kept after the link ended';
  end if;
  raise notice 'teacher tasks smoke test: all checks passed';
end $$;

rollback;
