-- Smoke test for migration 0052_classroom (classroom phase 1). Run in the dashboard SQL Editor AFTER applying 0052.
-- It creates throwaway users inside one transaction, acts as each of them through the real RPCs, and ROLLS BACK, so
-- nothing is kept. Success = the final notice "classroom smoke test passed". Any failed check raises an exception.
--
-- Cast (ids are 00000000-0000-4000-8000-0000000000xx):
--   T1 a1 teacher, classes A c1 and B c2        S1 b1 student, linked to T1 and T2, member of A and B
--   T2 a2 teacher, class C c3 (no members)      S2 b2 student, linked to T1, member of A; the link and the membership
--                                                  are dated one minute ahead, so nothing posted during the test
--                                                  counts for S2 (shown as read, left out of read counts)
--                                               S3 b3 student, linked to nobody
-- Parts: A announcements, read marks, leave and rename class, teacher profile, my_tasks; B conversations; C anchors on
-- notes and tasks; D the link ends (last, so no earlier part depends on a link that a later step removes).
-- An expected error is checked by its message. A call that should fail but doesn't raises 'FAIL: ...' inside the
-- block, which then fails the message check as well.

begin;

-- ── setup, as the SQL Editor's postgres role ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'classroom-smoke-t1@example.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'classroom-smoke-t2@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b1', 'classroom-smoke-s1@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 'classroom-smoke-s2@example.invalid'),
  ('00000000-0000-4000-8000-0000000000b3', 'classroom-smoke-s3@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'teacher'), ('00000000-0000-4000-8000-0000000000a2', 'teacher'),
  ('00000000-0000-4000-8000-0000000000b1', 'student'), ('00000000-0000-4000-8000-0000000000b2', 'student'),
  ('00000000-0000-4000-8000-0000000000b3', 'student');
insert into public.teacher_profiles (user_id, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'Smoke Teacher One'), ('00000000-0000-4000-8000-0000000000a2', 'Smoke Teacher Two');
insert into public.student_profiles (user_id, display_name, activities) values
  ('00000000-0000-4000-8000-0000000000b1', 'Smoke S1',
   '{"version":2,"commonApp":{"activities":[{"id":"smoke-act-1","type":"Debate"}],"honors":[]},"uc":[]}'),
  ('00000000-0000-4000-8000-0000000000b2', 'Smoke S2', '{}');
insert into public.classes (id, teacher_id, name) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'Smoke A'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 'Smoke B'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a2', 'Smoke C');
insert into public.teacher_links (teacher_id, student_id, via, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'class', now()),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b1', 'individual', now()),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'class', clock_timestamp() + interval '1 minute');
insert into public.class_members (class_id, student_id, joined_at) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', now()),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1', now()),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b2', clock_timestamp() + interval '1 minute');

-- Each "act as" step sets the JWT claims auth.uid() reads, then drops to the authenticated role. Steps "as postgres"
-- clear the claims first, so triggers that look at the JWT role (plan_limit, 0046) treat them as the SQL Editor.

-- ═════════════ part A: announcements, read marks, leave and rename class, teacher profile, my_tasks ═════════════

-- ── A1. T1 posts to class A and to all students; the tables are closed to clients ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_a uuid;
  v_all uuid;
  r record;
begin
  v_a := public.teacher_create_post('00000000-0000-4000-8000-0000000000c1', 'Smoke class post', 'Hello class A',
                                    'https://example.org/a', false);
  v_all := public.teacher_create_post(null, '  Smoke all post  ', 'Hello everyone', '  ', true);
  perform set_config('smoke.post_a', v_a::text, true);
  perform set_config('smoke.post_all', v_all::text, true);

  select * into r from public.teacher_posts() x where x.post_id = v_all;
  if not found or r.title is distinct from 'Smoke all post' or r.link_url is not null or not r.pinned
     or r.class_id is not null or r.archived then
    raise exception 'FAIL: all-students post stored wrongly (%)', r;
  end if;

  begin
    perform 1 from public.class_posts limit 1;
    raise exception 'FAIL: authenticated can select class_posts directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.post_reads limit 1;
    raise exception 'FAIL: authenticated can select post_reads directly';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── A2. S1 sees both posts unread; a student can't post ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.my_posts() x where x.post_id = current_setting('smoke.post_a')::uuid;
  if not found or r.is_read or r.teacher_id is distinct from '00000000-0000-4000-8000-0000000000a1'
     or r.class_name is distinct from 'Smoke A' or r.link_url is distinct from 'https://example.org/a' then
    raise exception 'FAIL: S1 should see the class-A post unread (%)', r;
  end if;
  select * into r from public.my_posts() x where x.post_id = current_setting('smoke.post_all')::uuid;
  if not found or r.is_read or r.class_id is not null then
    raise exception 'FAIL: S1 should see the all-students post unread (%)', r;
  end if;
  begin
    perform public.teacher_create_post(null, 'x', 'x', null, false);
    raise exception 'FAIL: a student created a post';
  exception when others then
    if sqlerrm not like 'classroom:%' then raise exception 'FAIL: student teacher_create_post: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── A3. S2 sees both, already read (posted before S2 joined) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.my_posts() x
       where x.post_id in (current_setting('smoke.post_a')::uuid, current_setting('smoke.post_all')::uuid) and x.is_read) <> 2 then
    raise exception 'FAIL: S2 should see both posts as read';
  end if;
end $$;
reset role;

-- ── A4. S3 (unlinked) sees nothing ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.my_posts()) then raise exception 'FAIL: unlinked S3 sees posts'; end if;
end $$;
reset role;

-- ── A5. T2 sees none of T1's posts and can't touch them ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_a uuid := current_setting('smoke.post_a')::uuid;
begin
  if exists (select 1 from public.teacher_posts() x
              where x.post_id in (v_a, current_setting('smoke.post_all')::uuid)) then
    raise exception 'FAIL: T2 lists T1''s posts';
  end if;
  begin
    perform public.teacher_update_post(v_a, 'hijacked', 'x', null, false);
    raise exception 'FAIL: T2 updated T1''s post';
  exception when others then
    if sqlerrm not like 'classroom: not found%' then raise exception 'FAIL: T2 update: %', sqlerrm; end if;
  end;
  begin
    perform public.teacher_archive_post(v_a, true);
    raise exception 'FAIL: T2 archived T1''s post';
  exception when others then
    if sqlerrm not like 'classroom: not found%' then raise exception 'FAIL: T2 archive: %', sqlerrm; end if;
  end;
  begin
    perform * from public.teacher_post_unread(v_a);
    raise exception 'FAIL: T2 read who has not read T1''s post';
  exception when others then
    if sqlerrm not like 'classroom: not found%' then raise exception 'FAIL: T2 unread list: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── A6. T1's counts: only S1 counts (S2 joined after the posts) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_a uuid := current_setting('smoke.post_a')::uuid;
  r record;
begin
  select * into r from public.teacher_posts() x where x.post_id = current_setting('smoke.post_all')::uuid;
  if r.audience is distinct from 1 or r.read_count is distinct from 0 then
    raise exception 'FAIL: all-students post should count 1 student, 0 read (got %/%)', r.read_count, r.audience;
  end if;
  select * into r from public.teacher_posts() x where x.post_id = v_a;
  if r.audience is distinct from 1 or r.read_count is distinct from 0 then
    raise exception 'FAIL: class post should count 1 student, 0 read (got %/%)', r.read_count, r.audience;
  end if;
  if (select count(*) from public.teacher_post_unread(v_a)) <> 1
     or not exists (select 1 from public.teacher_post_unread(v_a) x
                     where x.student_id = '00000000-0000-4000-8000-0000000000b1' and x.display_name = 'Smoke S1') then
    raise exception 'FAIL: who has not read the class post should be exactly S1';
  end if;
end $$;
reset role;

-- ── A7. S1 marks both read (an id S1 can't see is ignored) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.mark_posts_read(array[current_setting('smoke.post_a')::uuid, current_setting('smoke.post_all')::uuid,
                                       gen_random_uuid()]);
  if exists (select 1 from public.my_posts() x where not x.is_read) then
    raise exception 'FAIL: S1 still has unread posts after mark_posts_read';
  end if;
end $$;
reset role;

-- ── A8. T1 sees the read marks, then archives the all-students post ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_a uuid := current_setting('smoke.post_a')::uuid;
  v_all uuid := current_setting('smoke.post_all')::uuid;
  r record;
begin
  select * into r from public.teacher_posts() x where x.post_id = v_a;
  if r.read_count is distinct from 1 or r.audience is distinct from 1 then
    raise exception 'FAIL: class post should be read by 1 of 1 (got %/%)', r.read_count, r.audience;
  end if;
  if exists (select 1 from public.teacher_post_unread(v_a)) then raise exception 'FAIL: unread list should be empty'; end if;
  perform public.teacher_archive_post(v_all, true);
  select * into r from public.teacher_posts() x where x.post_id = v_all;
  if not r.archived or r.audience <> 0 then raise exception 'FAIL: archived post (%)', r; end if;
end $$;
reset role;

-- ── A9. S1 no longer sees the archived post; leaves class A: its post goes, the link stays ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.my_posts() x where x.post_id = current_setting('smoke.post_all')::uuid) then
    raise exception 'FAIL: S1 sees an archived post';
  end if;
  perform public.leave_class('00000000-0000-4000-8000-0000000000c1');
  if exists (select 1 from public.my_posts() x where x.post_id = current_setting('smoke.post_a')::uuid) then
    raise exception 'FAIL: S1 still sees the class-A post after leaving A';
  end if;
  if not exists (select 1 from public.my_teachers() x
                  where x.teacher_id = '00000000-0000-4000-8000-0000000000a1' and x.class_names = array['Smoke B']) then
    raise exception 'FAIL: leaving class A should keep the T1 link and class B';
  end if;
end $$;
reset role;

-- ── A10. T1: un-archive, refused posts, rename class, edit profile, the 21st post of the day, a class-B task ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_class_a constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_task uuid;
  i int;
begin
  perform public.teacher_archive_post(current_setting('smoke.post_all')::uuid, false);

  begin
    perform public.teacher_create_post(null, repeat('x', 121), 'body', null, false);
    raise exception 'FAIL: 121-char title accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: 121-char title: %', sqlerrm; end if;
  end;
  begin
    perform public.teacher_create_post(null, 'title', 'body', 'javascript:x', false);
    raise exception 'FAIL: javascript: link accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: javascript: link: %', sqlerrm; end if;
  end;
  begin
    perform public.teacher_create_post(null, 'title', '   ', null, false);
    raise exception 'FAIL: empty body accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: empty body: %', sqlerrm; end if;
  end;
  begin
    perform public.teacher_create_post('00000000-0000-4000-8000-0000000000c3', 'title', 'body', null, false);
    raise exception 'FAIL: T1 posted to T2''s class';
  exception when others then
    if sqlerrm not like 'classroom: not found%' then raise exception 'FAIL: post to T2''s class: %', sqlerrm; end if;
  end;

  perform public.teacher_rename_class(v_class_a, '  Smoke A renamed  ');
  if (select c.name from public.classes c where c.id = v_class_a) is distinct from 'Smoke A renamed' then
    raise exception 'FAIL: class not renamed';
  end if;
  begin
    perform public.teacher_rename_class(v_class_a, '   ');
    raise exception 'FAIL: empty class name accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: empty class name: %', sqlerrm; end if;
  end;
  begin
    perform public.teacher_rename_class('00000000-0000-4000-8000-0000000000c3', 'mine now');
    raise exception 'FAIL: T1 renamed T2''s class';
  exception when others then
    if sqlerrm not like 'classroom: not found%' then raise exception 'FAIL: rename T2''s class: %', sqlerrm; end if;
  end;

  perform public.update_my_teacher_profile('  Smoke Teacher Uno  ', '  Smoke High  ');
  if not exists (select 1 from public.teacher_profiles tp where tp.user_id = '00000000-0000-4000-8000-0000000000a1'
                    and tp.display_name = 'Smoke Teacher Uno' and tp.school = 'Smoke High') then
    raise exception 'FAIL: teacher profile not updated';
  end if;
  begin
    perform public.update_my_teacher_profile('   ', null);
    raise exception 'FAIL: empty teacher name accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: empty teacher name: %', sqlerrm; end if;
  end;

  if exists (select 1 from public.my_posts()) then raise exception 'FAIL: a teacher gets rows from my_posts'; end if;

  -- 2 posts so far today; 18 more (to class A, which S1 has left) reach 20; the 21st is refused.
  for i in 1..18 loop
    perform public.teacher_create_post(v_class_a, 'Smoke filler ' || i, 'x', null, false);
  end loop;
  begin
    perform public.teacher_create_post(null, 'one too many', 'x', null, false);
    raise exception 'FAIL: 21st post of the day accepted';
  exception when others then
    if sqlerrm not like 'classroom: rate%' then raise exception 'FAIL: 21st post: %', sqlerrm; end if;
  end;

  v_task := public.create_task('Smoke class-B task', p_class => '00000000-0000-4000-8000-0000000000c2');
  perform set_config('smoke.task_b', v_task::text, true);
end $$;
reset role;

-- ── A11. S1: the un-archived post is back and still read; my_tasks carries teacher_id, class and done_at ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_task uuid := current_setting('smoke.task_b')::uuid;
  r record;
begin
  if not exists (select 1 from public.my_posts() x where x.post_id = current_setting('smoke.post_all')::uuid and x.is_read) then
    raise exception 'FAIL: un-archived post should be back, still read';
  end if;
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not found or r.teacher_id is distinct from '00000000-0000-4000-8000-0000000000a1'
     or r.teacher_name is distinct from 'Smoke Teacher Uno' or r.class_id is distinct from '00000000-0000-4000-8000-0000000000c2'
     or r.class_name is distinct from 'Smoke B' or r.done or r.done_at is not null then
    raise exception 'FAIL: my_tasks row before done (%)', r;
  end if;
  perform public.set_task_done(v_task, true);
  select * into r from public.my_tasks() x where x.task_id = v_task;
  if not r.done or r.done_at is null then raise exception 'FAIL: my_tasks done_at after set_task_done (%)', r; end if;
end $$;
reset role;

-- ── A12. as postgres: T2 already holds 200 active posts, made two days ago (so the daily rate doesn't apply) ──
select set_config('request.jwt.claims', '', true);
insert into public.class_posts (teacher_id, class_id, title, body, created_at, updated_at)
select '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c3', 'Smoke old ' || g, 'x',
       clock_timestamp() - interval '2 days', clock_timestamp() - interval '2 days'
  from generate_series(1, 200) g;

-- ── A13. T2's next post hits the active-post limit ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.teacher_create_post(null, 'post 201', 'x', null, false);
    raise exception 'FAIL: 201st active post accepted';
  exception when others then
    if sqlerrm not like 'classroom: limit%' then raise exception 'FAIL: 201st active post: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ═════════════ done ═════════════
do $$
begin
  raise notice 'classroom smoke test passed';
end $$;

rollback;
