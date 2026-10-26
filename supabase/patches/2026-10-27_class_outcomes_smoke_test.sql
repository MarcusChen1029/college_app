-- Smoke test for migration 0033_class_outcomes. Run in the dashboard SQL Editor AFTER applying 0033.
-- It creates throwaway users inside one transaction, acts as each of them through the real RPC, and ROLLS BACK,
-- so nothing is kept. Success = the final notice "class outcomes smoke test: all checks passed".
-- Any failed check raises an exception (and the transaction is rolled back anyway).
--
-- Cast: teacher A (class A1 = S1, S2, S3; S4 and S5 one-on-one), teacher B (S6 only).
-- Colleges: X and Y are the first two institutions by slug (only their ids are used; nothing about them is changed).

begin;

-- ── setup, as the SQL Editor's postgres role ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'smoke-teacher-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000000b', 'smoke-teacher-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000001', 'smoke-s1@example.invalid'),
  ('00000000-0000-4000-8000-000000000002', 'smoke-s2@example.invalid'),
  ('00000000-0000-4000-8000-000000000003', 'smoke-s3@example.invalid'),
  ('00000000-0000-4000-8000-000000000004', 'smoke-s4@example.invalid'),
  ('00000000-0000-4000-8000-000000000005', 'smoke-s5@example.invalid'),
  ('00000000-0000-4000-8000-000000000006', 'smoke-s6@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-00000000000a', 'teacher'), ('00000000-0000-4000-8000-00000000000b', 'teacher'),
  ('00000000-0000-4000-8000-000000000001', 'student'), ('00000000-0000-4000-8000-000000000002', 'student'),
  ('00000000-0000-4000-8000-000000000003', 'student'), ('00000000-0000-4000-8000-000000000004', 'student'),
  ('00000000-0000-4000-8000-000000000005', 'student'), ('00000000-0000-4000-8000-000000000006', 'student');
insert into public.teacher_profiles (user_id, display_name) values
  ('00000000-0000-4000-8000-00000000000a', 'Smoke Teacher A'), ('00000000-0000-4000-8000-00000000000b', 'Smoke Teacher B');
insert into public.classes (id, teacher_id, name) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-00000000000a', 'Smoke A1'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-00000000000b', 'Smoke B1');
insert into public.teacher_links (teacher_id, student_id, via) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'class'),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000002', 'class'),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000003', 'class'),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000004', 'individual'),
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000005', 'individual'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000006', 'class');
insert into public.class_members (class_id, student_id) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000006');
insert into public.student_profiles (user_id, display_name, gpa_unweighted, sat_total, act_composite) values
  ('00000000-0000-4000-8000-000000000001', 'Smoke One', 3.87, 1450, null),
  ('00000000-0000-4000-8000-000000000002', 'Smoke Two', 3.60, 1380, null),
  ('00000000-0000-4000-8000-000000000003', 'Smoke Three', 3.95, null, 33),
  ('00000000-0000-4000-8000-000000000004', 'Smoke Four', 3.20, 1200, null),
  ('00000000-0000-4000-8000-000000000005', 'Smoke Five', 3.50, null, null),
  ('00000000-0000-4000-8000-000000000006', 'Smoke Six', 3.70, 1400, null);

select set_config('smoke.x', (select id::text from public.institutions order by slug limit 1), true);
select set_config('smoke.y', (select id::text from public.institutions order by slug offset 1 limit 1), true);

-- X: four final outcomes (S1-S4); S5 has only submitted. Y: three admits. S6 (teacher B's) admitted at X.
insert into public.student_colleges (user_id, institution_id, plan_key, status) values
  ('00000000-0000-4000-8000-000000000001', current_setting('smoke.x')::uuid, null, 'admitted'),
  ('00000000-0000-4000-8000-000000000002', current_setting('smoke.x')::uuid, null, 'waitlisted'),
  ('00000000-0000-4000-8000-000000000003', current_setting('smoke.x')::uuid, null, 'rejected'),
  ('00000000-0000-4000-8000-000000000004', current_setting('smoke.x')::uuid, null, 'admitted'),
  ('00000000-0000-4000-8000-000000000005', current_setting('smoke.x')::uuid, null, 'submitted'),
  ('00000000-0000-4000-8000-000000000001', current_setting('smoke.y')::uuid, null, 'admitted'),
  ('00000000-0000-4000-8000-000000000002', current_setting('smoke.y')::uuid, null, 'admitted'),
  ('00000000-0000-4000-8000-000000000003', current_setting('smoke.y')::uuid, null, 'admitted'),
  ('00000000-0000-4000-8000-000000000006', current_setting('smoke.x')::uuid, null, 'admitted');

-- ── teacher A with only 4 students holding a final outcome: nothing comes back ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r jsonb := public.teacher_outcomes();
begin
  if (r ->> 'enough')::boolean then raise exception 'FAIL: 4 students passed the 5-student floor'; end if;
  if jsonb_array_length(r -> 'colleges') <> 0 then raise exception 'FAIL: colleges returned below the floor: %', r; end if;
  if (r ->> 'students_with_outcomes')::int <> 4 then raise exception 'FAIL: expected 4 students with outcomes, got %', r ->> 'students_with_outcomes'; end if;
end $$;
reset role;

-- ── S5 enrolls at X: 5 students now, X passes the floor (5 there), Y does not (3 there) ──
update public.student_colleges set status = 'enrolled'
  where user_id = '00000000-0000-4000-8000-000000000005' and institution_id = current_setting('smoke.x')::uuid;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  r jsonb := public.teacher_outcomes();
  c jsonb;
  bad text;
  t text;
begin
  if not (r ->> 'enough')::boolean then raise exception 'FAIL: 5 students did not pass the floor: %', r; end if;
  if jsonb_array_length(r -> 'colleges') <> 1 then raise exception 'FAIL: expected exactly college X, got %', r -> 'colleges'; end if;
  if (r ->> 'hidden_colleges')::int <> 1 then raise exception 'FAIL: expected Y to be counted as hidden, got %', r ->> 'hidden_colleges'; end if;
  c := r -> 'colleges' -> 0;
  if c ->> 'college_id' <> current_setting('smoke.x') then raise exception 'FAIL: the returned college is not X'; end if;
  if jsonb_array_length(c -> 'points') <> 5 then raise exception 'FAIL: expected 5 points at X, got %', jsonb_array_length(c -> 'points'); end if;

  -- Only the allowed keys, on the college and on every point.
  select string_agg(k, ',') into bad from jsonb_object_keys(c) k where k not in ('college_id', 'slug', 'name', 'points');
  if bad is not null then raise exception 'FAIL: unexpected college keys: %', bad; end if;
  select string_agg(distinct k, ',') into bad
    from jsonb_array_elements(c -> 'points') pt, jsonb_object_keys(pt) k
    where k not in ('gpa', 'sat', 'act', 'outcome', 'plan');
  if bad is not null then raise exception 'FAIL: unexpected point keys: %', bad; end if;

  -- No student id, email or display name anywhere in the payload.
  t := r::text;
  if t like '%00000000-0000-4000-8000-00000000000%' then raise exception 'FAIL: a student id leaked'; end if;
  if t like '%example.invalid%' or t like '%Smoke %' then raise exception 'FAIL: an email or name leaked'; end if;

  -- GPA rounded to 0.05 (S1 3.87 -> 3.85); outcomes mapped (enrolled -> admitted, rejected -> denied).
  if not exists (select 1 from jsonb_array_elements(c -> 'points') pt where (pt ->> 'gpa')::numeric = 3.85) then
    raise exception 'FAIL: GPA 3.87 was not rounded to 3.85';
  end if;
  if exists (select 1 from jsonb_array_elements(c -> 'points') pt where (pt ->> 'gpa')::numeric = 3.87) then
    raise exception 'FAIL: unrounded GPA returned';
  end if;
  if (select count(*) from jsonb_array_elements(c -> 'points') pt where pt ->> 'outcome' = 'admitted') <> 3
     or (select count(*) from jsonb_array_elements(c -> 'points') pt where pt ->> 'outcome' = 'waitlisted') <> 1
     or (select count(*) from jsonb_array_elements(c -> 'points') pt where pt ->> 'outcome' = 'denied') <> 1 then
    raise exception 'FAIL: outcome counts wrong: %', c -> 'points';
  end if;

  -- Class A1 has only 3 students: below the floor again.
  r := public.teacher_outcomes('00000000-0000-4000-8000-0000000000c1');
  if (r ->> 'enough')::boolean or jsonb_array_length(r -> 'colleges') <> 0 then
    raise exception 'FAIL: class A1 (3 students) passed the floor: %', r;
  end if;

  -- Teacher B's class id is refused.
  begin
    perform public.teacher_outcomes('00000000-0000-4000-8000-0000000000c2');
    raise exception 'FAIL: teacher A read teacher B''s class';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- ── teacher B (one student) gets nothing, and none of A's students ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r jsonb := public.teacher_outcomes();
begin
  if (r ->> 'enough')::boolean or jsonb_array_length(r -> 'colleges') <> 0 then raise exception 'FAIL: teacher B got data: %', r; end if;
  if (r ->> 'students_with_outcomes')::int <> 1 then raise exception 'FAIL: teacher B counts A''s students: %', r; end if;
end $$;
reset role;

-- ── a student calling it is refused ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.teacher_outcomes();
    raise exception 'FAIL: a student called teacher_outcomes';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- And still has no direct read of other students' rows.
  if exists (select 1 from public.student_colleges where user_id <> '00000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: student reads other students'' colleges';
  end if;
end $$;
reset role;

do $$ begin raise notice 'class outcomes smoke test: all checks passed'; end $$;

rollback;
