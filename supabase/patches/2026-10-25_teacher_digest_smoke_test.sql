-- Smoke test for migration 0029_teacher_digest. Run in the dashboard SQL Editor AFTER applying 0028 and 0029.
-- It creates throwaway users inside one transaction, calls the real functions as each role, and ROLLS BACK,
-- so nothing is kept. Success = the final notice "teacher digest smoke test: all checks passed".
-- Any failed check raises an exception (and the transaction is rolled back anyway).
--
-- Cast: teacher A (digest on; student S1), teacher B (digest on; student S3), teacher C (digest OFF; also linked
--       to S1), student U (linked to nobody, but has a task-free custom college due soon).
-- Every private field (notes, portal login, aid offer, scholarship) holds the marker SMOKE_SECRET, which must never
-- appear in any digest row.

begin;

-- ── setup, as the SQL Editor's postgres role ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'smoke-teacher-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000000b', 'smoke-teacher-b@example.invalid'),
  ('00000000-0000-4000-8000-00000000000c', 'smoke-teacher-c@example.invalid'),
  ('00000000-0000-4000-8000-000000000001', 'smoke-s1@example.invalid'),
  ('00000000-0000-4000-8000-000000000003', 'smoke-s3@example.invalid'),
  ('00000000-0000-4000-8000-0000000000ff', 'smoke-unlinked@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-00000000000a', 'teacher'), ('00000000-0000-4000-8000-00000000000b', 'teacher'),
  ('00000000-0000-4000-8000-00000000000c', 'teacher'),
  ('00000000-0000-4000-8000-000000000001', 'student'), ('00000000-0000-4000-8000-000000000003', 'student'),
  ('00000000-0000-4000-8000-0000000000ff', 'student');
insert into public.teacher_profiles (user_id, display_name, digest_enabled) values
  ('00000000-0000-4000-8000-00000000000a', 'Smoke Teacher A', true),
  ('00000000-0000-4000-8000-00000000000b', 'Smoke Teacher B', true),
  ('00000000-0000-4000-8000-00000000000c', 'Smoke Teacher C', false);
insert into public.teacher_links (teacher_id, student_id, via) values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'individual'),
  ('00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000001', 'individual'),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000003', 'individual');

-- Custom colleges (no reference data needed): one still in progress and due in 3 days (listed), one already
-- submitted and due in 3 days (not listed), one in progress but due in 20 days (not listed). Private fields set.
insert into public.student_colleges (user_id, institution_id, custom, status, notes, portal_username, portal_password, aid_offer_usd) values
  ('00000000-0000-4000-8000-000000000001', null, jsonb_build_object('name', 'Smoke College Open', 'deadline', (current_date + 3)::text),
   'in_progress', 'SMOKE_SECRET', 'SMOKE_SECRET', 'SMOKE_SECRET', 12345),
  ('00000000-0000-4000-8000-000000000001', null, jsonb_build_object('name', 'Smoke College Submitted', 'deadline', (current_date + 3)::text),
   'submitted', 'SMOKE_SECRET', null, null, null),
  ('00000000-0000-4000-8000-000000000001', null, jsonb_build_object('name', 'Smoke College Later', 'deadline', (current_date + 20)::text),
   'in_progress', null, null, null, null),
  ('00000000-0000-4000-8000-000000000003', null, jsonb_build_object('name', 'Smoke College B', 'deadline', (current_date + 1)::text),
   'planning', 'SMOKE_SECRET', null, null, null),
  ('00000000-0000-4000-8000-0000000000ff', null, jsonb_build_object('name', 'Smoke College Unlinked', 'deadline', (current_date + 2)::text),
   'in_progress', null, null, null, null);
insert into public.scholarships (user_id, name, provider, deadline) values
  ('00000000-0000-4000-8000-000000000001', 'SMOKE_SECRET', 'SMOKE_SECRET', current_date + 2);

-- Tasks, inserted directly (the RPCs are tested by the 0028 smoke test).
insert into public.teacher_tasks (id, teacher_id, student_id, title, due_on, archived) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'Smoke: due soon', current_date + 2, false),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'Smoke: overdue', current_date - 4, false),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'Smoke: overdue but done', current_date - 1, false),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'Smoke: far away', current_date + 30, false),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'Smoke: archived', current_date + 1, true),
  ('00000000-0000-4000-8000-0000000000d6', '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001', 'Smoke: no due date', null, false),
  ('00000000-0000-4000-8000-0000000000d7', '00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000001', 'Smoke: teacher C task', current_date + 1, false),
  ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000003', 'Smoke: teacher B task', current_date + 1, false);
insert into public.task_completions (task_id, student_id, teacher_id) values
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a');

-- ── the Edge Function's role: service_role ──
set local role service_role;
do $$
declare
  a constant uuid := '00000000-0000-4000-8000-00000000000a';
  b constant uuid := '00000000-0000-4000-8000-00000000000b';
  c constant uuid := '00000000-0000-4000-8000-00000000000c';
  got text[];
  cols text[];
begin
  -- The returned columns are exactly these (each is already exposed by teacher_roster / teacher_deadlines / list_my_tasks).
  select array_agg(n order by i) into cols
    from pg_proc p, unnest(p.proargnames, p.proargmodes) with ordinality as x(n, m, i)
   where p.oid = 'public.teacher_digest_data(uuid, date)'::regprocedure and x.m = 't';
  if cols is distinct from array['student_id', 'student_name', 'item', 'title', 'label', 'due_on'] then
    raise exception 'FAIL: teacher_digest_data columns are %', cols;
  end if;

  -- Teacher A: S1's open tasks (due soon + overdue) and the one open college due within 7 days. Nothing else.
  select array_agg(item || ':' || title order by item, title) into got from public.teacher_digest_data(a, current_date);
  if got is distinct from array['deadline:Smoke College Open', 'task:Smoke: due soon', 'task:Smoke: overdue'] then
    raise exception 'FAIL: teacher A digest rows are %', got;
  end if;
  if exists (select 1 from public.teacher_digest_data(a, current_date) where student_id <> '00000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: teacher A digest includes a student who is not linked to A';
  end if;

  -- Teacher B gets only S3 (never A's students, never teacher C's task).
  select array_agg(item || ':' || title order by item, title) into got from public.teacher_digest_data(b, current_date);
  if got is distinct from array['deadline:Smoke College B', 'task:Smoke: teacher B task'] then
    raise exception 'FAIL: teacher B digest rows are %', got;
  end if;

  -- Teacher C has the digest off: no data at all, and not due.
  if exists (select 1 from public.teacher_digest_data(c, current_date)) then raise exception 'FAIL: teacher C (digest off) got data'; end if;
  if exists (select 1 from public.due_teacher_digests(current_date) where teacher_id = c) then raise exception 'FAIL: teacher C (digest off) is due'; end if;

  -- The unlinked student never appears; a student id passed as a teacher gets nothing.
  if exists (select 1 from public.teacher_digest_data(a, current_date) x where x.title = 'Smoke College Unlinked')
     or exists (select 1 from public.teacher_digest_data(b, current_date) x where x.title = 'Smoke College Unlinked') then
    raise exception 'FAIL: unlinked student included';
  end if;
  if exists (select 1 from public.teacher_digest_data('00000000-0000-4000-8000-000000000001', current_date)) then
    raise exception 'FAIL: a student id got digest data';
  end if;

  -- No private value anywhere in any row.
  if exists (select 1 from public.teacher_digest_data(a, current_date) r where row_to_json(r)::text like '%SMOKE_SECRET%')
     or exists (select 1 from public.teacher_digest_data(b, current_date) r where row_to_json(r)::text like '%SMOKE_SECRET%')
     or exists (select 1 from public.due_teacher_digests(current_date) r where row_to_json(r)::text like '%SMOKE_SECRET%') then
    raise exception 'FAIL: a private value leaked into the digest';
  end if;

  -- A and B are due; after a send logged 3 days ago A is not; after one 7 days ago A is due again.
  if (select count(*) from public.due_teacher_digests(current_date) where teacher_id in (a, b)) <> 2 then
    raise exception 'FAIL: teachers A and B should both be due';
  end if;
  insert into public.teacher_digest_log (teacher_id, sent_on) values (a, current_date - 3);
  if exists (select 1 from public.due_teacher_digests(current_date) where teacher_id = a) then raise exception 'FAIL: A due again 3 days after a digest'; end if;
  delete from public.teacher_digest_log where teacher_id = a;
  insert into public.teacher_digest_log (teacher_id, sent_on) values (a, current_date - 7);
  if not exists (select 1 from public.due_teacher_digests(current_date) where teacher_id = a) then raise exception 'FAIL: A not due 7 days after a digest'; end if;
end $$;
reset role;

-- ── clients can't reach the data functions or the log ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform * from public.teacher_digest_data('00000000-0000-4000-8000-00000000000a', current_date);
    raise exception 'FAIL: authenticated can call teacher_digest_data';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.due_teacher_digests(current_date);
    raise exception 'FAIL: authenticated can call due_teacher_digests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.teacher_digest_log limit 1;
    raise exception 'FAIL: authenticated can select teacher_digest_log';
  exception when insufficient_privilege then null;
  end;

  -- Teacher A turns the digest off through the RPC.
  perform public.set_my_digest(false);
  if (select digest_enabled from public.teacher_profiles where user_id = '00000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL: set_my_digest(false) did not turn it off';
  end if;
end $$;
reset role;

-- ── a student can't call set_my_digest ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.set_my_digest(true);
    raise exception 'FAIL: a student called set_my_digest';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- ── with A's digest off, A gets no data and is not due ──
set local role service_role;
do $$
begin
  if exists (select 1 from public.teacher_digest_data('00000000-0000-4000-8000-00000000000a', current_date)) then
    raise exception 'FAIL: teacher A still gets data after turning the digest off';
  end if;
  if exists (select 1 from public.due_teacher_digests(current_date) where teacher_id = '00000000-0000-4000-8000-00000000000a') then
    raise exception 'FAIL: teacher A still due after turning the digest off';
  end if;
  raise notice 'teacher digest smoke test: all checks passed';
end $$;
reset role;

rollback;
