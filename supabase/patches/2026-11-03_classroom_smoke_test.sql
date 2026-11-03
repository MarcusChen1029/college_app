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

-- ═════════════ part B: conversations about items, messages, unread counts ═════════════

-- ── B0. as postgres: a real college on S1's list, with one saved supplement essay ──
select set_config('request.jwt.claims', '', true);
do $$
declare
  v_inst uuid;
  v_slug text;
begin
  select i.id, i.slug into v_inst, v_slug from public.institutions i order by i.slug limit 1;
  if v_inst is null then raise exception 'FAIL: no institution to put on S1''s list'; end if;
  insert into public.student_colleges (user_id, institution_id, checklist)
  values ('00000000-0000-4000-8000-0000000000b1', v_inst,
          '{"essay_list":[{"id":"smoke-e1","title":"Why us","url":"","status":"drafting"}]}');
  perform set_config('smoke.slug', v_slug, true);
end $$;

-- ── B1. T1 starts a conversation about a college on S1's list; the tables are closed to clients ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_c1 uuid;
  r record;
begin
  v_c1 := public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'college', current_setting('smoke.slug'), 'MIT', 'hi');
  perform set_config('smoke.c1', v_c1::text, true);
  select * into r from public.my_conversations() x where x.conversation_id = v_c1;
  if not found or r.other_id is distinct from '00000000-0000-4000-8000-0000000000b1' or r.other_name is distinct from 'Smoke S1'
     or r.anchor_kind is distinct from 'college' or r.anchor_ref is distinct from current_setting('smoke.slug')
     or r.anchor_label is distinct from 'MIT' or not r.anchor_available or r.status is distinct from 'open'
     or r.started_by is distinct from 'teacher' or r.last_author is distinct from 'teacher' or r.last_body is distinct from 'hi'
     or r.unread <> 0 then
    raise exception 'FAIL: T1''s new conversation row (%)', r;
  end if;
  if (select x.conversations from public.classroom_unread() x) <> 0 then
    raise exception 'FAIL: T1''s own message counts as needing a reply';
  end if;
  begin
    perform 1 from public.conversations limit 1;
    raise exception 'FAIL: authenticated can select conversations directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.conversation_messages limit 1;
    raise exception 'FAIL: authenticated can select conversation_messages directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000b3', 'general', null, null, 'hello');
    raise exception 'FAIL: T1 started a conversation with unlinked S3';
  exception when others then
    if sqlerrm not like 'classroom: not linked%' then raise exception 'FAIL: conversation with S3: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── B2. S1 sees it unread with its label, replies ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_c1 uuid := current_setting('smoke.c1')::uuid;
  r record;
  u record;
begin
  select * into r from public.my_conversations() x where x.conversation_id = v_c1;
  if not found or r.unread <> 1 or r.anchor_label is distinct from 'MIT' or not r.anchor_available
     or r.other_id is distinct from '00000000-0000-4000-8000-0000000000a1' or r.other_name is distinct from 'Smoke Teacher Uno' then
    raise exception 'FAIL: S1''s view of the college conversation (%)', r;
  end if;
  select * into u from public.classroom_unread();
  if u.teachers <> 2 or u.posts <> 0 or u.conversations <> 1 then
    raise exception 'FAIL: S1 classroom_unread should be 2 teachers, 0 posts, 1 conversation (got %)', u;
  end if;
  perform set_config('smoke.m_reply', public.send_message(v_c1, 'reply from S1')::text, true);
  if (select x.unread from public.my_conversations() x where x.conversation_id = v_c1) <> 0 then
    raise exception 'FAIL: replying should leave nothing unread for S1';
  end if;
end $$;
reset role;

-- ── B3. T1: the reply needs a reply, mark read, the same college reuses the conversation, status ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_c1 uuid := current_setting('smoke.c1')::uuid;
  r record;
  v uuid;
begin
  select * into r from public.my_conversations() x where x.conversation_id = v_c1;
  if r.unread <> 1 or r.last_author <> 'student' or r.last_body is distinct from 'reply from S1' then
    raise exception 'FAIL: T1 should see 1 unread reply (%)', r;
  end if;
  if (select x.conversations from public.classroom_unread() x) <> 1 then raise exception 'FAIL: T1 should have 1 conversation needing a reply'; end if;
  perform public.mark_conversation_read(v_c1);
  if (select x.unread from public.my_conversations() x where x.conversation_id = v_c1) <> 0 then
    raise exception 'FAIL: unread after mark_conversation_read';
  end if;
  if (select x.conversations from public.classroom_unread() x) <> 0 then raise exception 'FAIL: still needs a reply after reading'; end if;

  v := public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'college', current_setting('smoke.slug'), 'MIT', 'again');
  if v is distinct from v_c1 then raise exception 'FAIL: the same college should reuse the conversation'; end if;

  perform public.set_conversation_status(v_c1, 'resolved');
  if (select x.status from public.my_conversations() x where x.conversation_id = v_c1) <> 'resolved' then
    raise exception 'FAIL: conversation not resolved';
  end if;
  begin
    perform public.set_conversation_status(v_c1, 'closed');
    raise exception 'FAIL: unknown status accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: unknown status: %', sqlerrm; end if;
  end;
  perform public.send_message(v_c1, 'reopening');
  if (select x.status from public.my_conversations() x where x.conversation_id = v_c1) <> 'open' then
    raise exception 'FAIL: a new message should reopen the conversation';
  end if;
end $$;
reset role;

-- ── B4. T2 starts a general conversation with S1; T1's stay out of T2's reach ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_c1 uuid := current_setting('smoke.c1')::uuid;
begin
  perform set_config('smoke.c2', public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'general', null, null,
                                                            'hello from T2')::text, true);
  if exists (select 1 from public.my_conversations() x where x.conversation_id = v_c1) then
    raise exception 'FAIL: T2 lists T1''s conversation';
  end if;
  begin
    perform * from public.conversation_messages_for(v_c1);
    raise exception 'FAIL: T2 read T1''s messages';
  exception when others then
    if sqlerrm not like 'classroom: not found%' then raise exception 'FAIL: T2 reading T1''s messages: %', sqlerrm; end if;
  end;
  begin
    perform public.send_message(v_c1, 'butting in');
    raise exception 'FAIL: T2 wrote into T1''s conversation';
  exception when others then
    if sqlerrm not like 'classroom: not found%' then raise exception 'FAIL: T2 send to T1''s conversation: %', sqlerrm; end if;
  end;
  begin
    perform public.mark_conversation_read(v_c1);
    raise exception 'FAIL: T2 marked T1''s conversation read';
  exception when others then
    if sqlerrm not like 'classroom: not found%' then raise exception 'FAIL: T2 mark T1''s conversation: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── B5. S1 sees both teachers' conversations, both unread ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(distinct x.other_id) from public.my_conversations() x) <> 2 then
    raise exception 'FAIL: S1 should see conversations with two teachers';
  end if;
  if (select x.conversations from public.classroom_unread() x) <> 2 then
    raise exception 'FAIL: S1 should have 2 conversations with unread messages';
  end if;
end $$;
reset role;

-- ── B6. S3 (unlinked) sees nothing and can't start anything ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;
do $$
declare u record;
begin
  if exists (select 1 from public.my_conversations()) then raise exception 'FAIL: unlinked S3 sees conversations'; end if;
  select * into u from public.classroom_unread();
  if u.teachers <> 0 or u.posts <> 0 or u.conversations <> 0 then raise exception 'FAIL: S3 classroom_unread (%)', u; end if;
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000a1', 'general', null, null, 'hi');
    raise exception 'FAIL: unlinked S3 started a conversation';
  exception when others then
    if sqlerrm not like 'classroom: not linked%' then raise exception 'FAIL: S3 start: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── B7. as postgres: T2 and S1 already have 100 conversations ──
select set_config('request.jwt.claims', '', true);
insert into public.conversations (teacher_id, student_id, anchor_kind, started_by)
select '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b1', 'general', 'teacher'
  from generate_series(1, 100 - (select count(*)::int from public.conversations c
                                  where c.teacher_id = '00000000-0000-4000-8000-0000000000a2'
                                    and c.student_id = '00000000-0000-4000-8000-0000000000b1'));

-- ── B8. T2's 101st conversation with S1 is refused ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'general', null, null, 'one more');
    raise exception 'FAIL: 101st conversation for a pair accepted';
  exception when others then
    if sqlerrm not like 'classroom: limit%' then raise exception 'FAIL: 101st conversation: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── B9. S1 shares essays with T1 ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select public.set_share_essays('00000000-0000-4000-8000-0000000000a1', true);
reset role;

-- ── B10. T1 comments on the personal statement and on a saved supplement essay ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_slug text := current_setting('smoke.slug');
begin
  perform set_config('smoke.c_essay', public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'essay', 'ps',
                                                                'Personal statement', 'about your PS')::text, true);
  perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'essay', 'supp:' || v_slug || ':smoke-e1',
                                    'Why us', 'about your why-us essay');
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'essay', 'supp:' || v_slug || ':smoke-nope',
                                      'Nope', 'x');
    raise exception 'FAIL: supplement essay id that isn''t saved accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: unsaved supplement essay: %', sqlerrm; end if;
  end;
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'essay', 'supp:not-on-the-list:smoke-e1',
                                      'Nope', 'x');
    raise exception 'FAIL: supplement essay of a college not on the list accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: supplement of another college: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── B11. S1 stops sharing essays with T1 ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select public.set_share_essays('00000000-0000-4000-8000-0000000000a1', false);
reset role;

-- ── B12. T1: the essay conversation stays, without its label; essay, activity and other anchors are checked ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.my_conversations() x where x.conversation_id = current_setting('smoke.c_essay')::uuid;
  if not found or r.anchor_available or r.anchor_label is not null or r.anchor_kind is distinct from 'essay'
     or r.anchor_ref is distinct from 'ps' then
    raise exception 'FAIL: unshared essay conversation should stay listed without label (%)', r;
  end if;
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'essay', 'uc:2', 'UC question 2', 'x');
    raise exception 'FAIL: essay anchor accepted while essays are not shared';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: unshared essay anchor: %', sqlerrm; end if;
  end;
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'section', 'essays', 'Essays', 'x');
    raise exception 'FAIL: essays section accepted while essays are not shared';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: unshared essays section: %', sqlerrm; end if;
  end;
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'activity', 'legacy-ca-0', 'Old entry', 'x');
    raise exception 'FAIL: made-up legacy activity id accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: legacy activity id: %', sqlerrm; end if;
  end;
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'activity', 'smoke-act-404', 'Gone', 'x');
    raise exception 'FAIL: activity id not in S1''s activities accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: missing activity id: %', sqlerrm; end if;
  end;
  perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'activity', 'smoke-act-1', 'Debate', 'about debate');
  perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'profile', 'gpa', 'GPA', 'about your GPA');
  begin
    perform public.start_conversation('00000000-0000-4000-8000-0000000000b1', 'task', gen_random_uuid()::text, 'Task', 'x');
    raise exception 'FAIL: unknown task anchor accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: unknown task anchor: %', sqlerrm; end if;
  end;
  begin
    perform public.delete_message(current_setting('smoke.m_reply')::uuid);
    raise exception 'FAIL: T1 deleted S1''s message';
  exception when others then
    if sqlerrm not like 'classroom: not found%' then raise exception 'FAIL: non-author delete: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── B13. S1 keeps the essay label; deletes their own messages ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_c1 uuid := current_setting('smoke.c1')::uuid;
  v_reply uuid := current_setting('smoke.m_reply')::uuid;
  v_oops uuid;
  r record;
begin
  select * into r from public.my_conversations() x where x.conversation_id = current_setting('smoke.c_essay')::uuid;
  if not found or r.anchor_label is distinct from 'Personal statement' or r.anchor_available then
    raise exception 'FAIL: S1 should keep the essay label, marked not shared (%)', r;
  end if;
  perform public.delete_message(v_reply);
  select * into r from public.conversation_messages_for(v_c1) x where x.message_id = v_reply;
  if not found or not r.deleted or r.body is not null or r.author is distinct from 'student' then
    raise exception 'FAIL: deleted message as S1 sees it (%)', r;
  end if;
  v_oops := public.send_message(v_c1, 'oops');
  perform public.delete_message(v_oops);
  select * into r from public.my_conversations() x where x.conversation_id = v_c1;
  if r.last_author is distinct from 'student' or r.last_body is not null then
    raise exception 'FAIL: a deleted last message should show no body (%)', r;
  end if;
  -- hi (T1), reply (S1), again (T1), reopening (T1), oops (S1), in the order the function returns them.
  if (select string_agg(x.author, ',' order by x.n)
        from public.conversation_messages_for(v_c1) with ordinality as x(message_id, author, body, deleted, created_at, n))
     is distinct from 'teacher,student,teacher,teacher,student' then
    raise exception 'FAIL: messages should be oldest first';
  end if;
end $$;
reset role;

-- ── B14. T1 sees the deletions; a deleted message is never unread ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_c1 uuid := current_setting('smoke.c1')::uuid;
  r record;
begin
  select * into r from public.conversation_messages_for(v_c1) x where x.message_id = current_setting('smoke.m_reply')::uuid;
  if not found or not r.deleted or r.body is not null then raise exception 'FAIL: deleted message as T1 sees it (%)', r; end if;
  select * into r from public.my_conversations() x where x.conversation_id = v_c1;
  if r.unread <> 0 or r.last_body is not null then raise exception 'FAIL: T1''s row after deletions (%)', r; end if;
  if (select x.conversations from public.classroom_unread() x) <> 0 then
    raise exception 'FAIL: a deleted message should not need a reply';
  end if;
end $$;
reset role;

-- ── B15. S1: two general questions are two conversations; S1 can also start about an item ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  q1 uuid;
  q2 uuid;
  r record;
begin
  q1 := public.start_conversation('00000000-0000-4000-8000-0000000000a1', 'general', null, null, 'question 1');
  q2 := public.start_conversation('00000000-0000-4000-8000-0000000000a1', 'general', null, null, 'question 2');
  if q1 = q2 then raise exception 'FAIL: two general questions share one conversation'; end if;
  select * into r from public.my_conversations() x where x.conversation_id = q1;
  if r.started_by is distinct from 'student' or r.anchor_kind is distinct from 'general' or r.anchor_ref is not null then
    raise exception 'FAIL: student-started general conversation (%)', r;
  end if;
  if public.start_conversation('00000000-0000-4000-8000-0000000000a1', 'college', current_setting('smoke.slug'), 'MIT', 'from me')
     is distinct from current_setting('smoke.c1')::uuid then
    raise exception 'FAIL: S1 asking about the same college should reuse the conversation';
  end if;
end $$;
reset role;

-- ── B16. T1 and S2 have a general conversation; S2 leaves class A; it stays, and so does the link ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select set_config('smoke.c_s2', public.start_conversation('00000000-0000-4000-8000-0000000000b2', 'general', null, null,
                                                          'hello S2')::text, true);
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public.leave_class('00000000-0000-4000-8000-0000000000c1');
  if not exists (select 1 from public.my_conversations() x where x.conversation_id = current_setting('smoke.c_s2')::uuid) then
    raise exception 'FAIL: S2 lost the conversation after leaving a class';
  end if;
  if not exists (select 1 from public.my_teachers() x where x.teacher_id = '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL: leaving a class ended S2''s link';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.my_conversations() x where x.conversation_id = current_setting('smoke.c_s2')::uuid) then
    raise exception 'FAIL: T1 lost the S2 conversation after S2 left a class';
  end if;
end $$;
reset role;

-- ── B17. S1: message length, then the daily limit (S1 has sent 5 messages; 50 more are added as postgres) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.send_message(current_setting('smoke.c1')::uuid, repeat('x', 2001));
    raise exception 'FAIL: 2001-char message accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: 2001-char message: %', sqlerrm; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.conversation_messages (conversation_id, author, body)
select current_setting('smoke.c2')::uuid, 'student', 'smoke rate ' || g from generate_series(1, 50) g;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.send_message(current_setting('smoke.c2')::uuid, 'one too many');
    raise exception 'FAIL: 51st student message of the day accepted';
  exception when others then
    if sqlerrm not like 'classroom: rate%' then raise exception 'FAIL: 51st student message: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ═════════════ part C: anchors on private notes and private tasks ═════════════

-- ── C1. T1 writes notes directly (the "own notes" policy applies); the anchor format is checked ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_slug text := current_setting('smoke.slug');
begin
  insert into public.teacher_notes (student_id, body, anchor_kind, anchor_ref)
  values ('00000000-0000-4000-8000-0000000000b1', 'Smoke note about a college', 'college', v_slug);
  insert into public.teacher_notes (student_id, body) values ('00000000-0000-4000-8000-0000000000b1', 'Smoke general note');
  if (select count(*) from public.teacher_notes n
       where n.student_id = '00000000-0000-4000-8000-0000000000b1' and n.anchor_kind = 'college' and n.anchor_ref = v_slug) <> 1 then
    raise exception 'FAIL: T1 should read back the anchored note';
  end if;
  begin
    insert into public.teacher_notes (student_id, body, anchor_kind, anchor_ref)
    values ('00000000-0000-4000-8000-0000000000b1', 'x', 'college', null);
    raise exception 'FAIL: note with a kind and no ref accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.teacher_notes (student_id, body, anchor_kind, anchor_ref)
    values ('00000000-0000-4000-8000-0000000000b1', 'x', null, 'stray-ref');
    raise exception 'FAIL: note with a ref and no kind accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.teacher_notes (student_id, body, anchor_kind, anchor_ref)
    values ('00000000-0000-4000-8000-0000000000b1', 'x', 'essay', 'uc:9');
    raise exception 'FAIL: note about essay uc:9 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.teacher_notes (student_id, body, anchor_kind, anchor_ref)
    values ('00000000-0000-4000-8000-0000000000b1', 'x', 'activity', 'legacy-ca-0');
    raise exception 'FAIL: note about a made-up legacy activity id accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- ── C2. S1 can't read notes; S1 shares essays with T1 again ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.teacher_notes) then raise exception 'FAIL: a student can read teacher notes'; end if;
  perform public.set_share_essays('00000000-0000-4000-8000-0000000000a1', true);
end $$;
reset role;

-- ── C3. T1: a private task about S1's personal statement; anchors on class tasks are refused; old calls still work ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_priv uuid;
  v_cls uuid;
  r record;
begin
  v_priv := public.create_task('Smoke private task', p_student => '00000000-0000-4000-8000-0000000000b1',
                               p_anchor_kind => 'essay', p_anchor_ref => 'ps', p_anchor_label => 'Personal statement');
  perform set_config('smoke.task_priv', v_priv::text, true);
  begin
    perform public.create_task('x', p_class => '00000000-0000-4000-8000-0000000000c2', p_anchor_kind => 'college',
                               p_anchor_ref => current_setting('smoke.slug'), p_anchor_label => 'MIT');
    raise exception 'FAIL: anchor on a class task accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: anchored class task: %', sqlerrm; end if;
  end;
  begin
    perform public.create_task('x', p_student => '00000000-0000-4000-8000-0000000000b1', p_anchor_kind => 'college',
                               p_anchor_ref => current_setting('smoke.slug'));
    raise exception 'FAIL: anchored task without a label accepted';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: anchored task without label: %', sqlerrm; end if;
  end;
  v_cls := public.create_task(p_title => 'Smoke class-B task 2', p_class => '00000000-0000-4000-8000-0000000000c2');
  perform set_config('smoke.task_cls', v_cls::text, true);

  select * into r from public.list_my_tasks() x where x.task_id = v_priv;
  if not found or r.student_id is distinct from '00000000-0000-4000-8000-0000000000b1' or r.anchor_kind is distinct from 'essay'
     or r.anchor_ref is distinct from 'ps' or r.anchor_label is distinct from 'Personal statement' or not r.anchor_available then
    raise exception 'FAIL: T1''s private task row (%)', r;
  end if;
  select * into r from public.list_my_tasks() x where x.task_id = v_cls;
  if not found or r.anchor_kind is not null or r.anchor_label is not null or r.anchor_available is not null then
    raise exception 'FAIL: T1''s class task should carry no anchor (%)', r;
  end if;
end $$;
reset role;

-- ── C4. S1 sees the private task (no class, with its anchor) and the new class-B task ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.my_tasks() x where x.task_id = current_setting('smoke.task_priv')::uuid;
  if not found or r.class_id is not null or r.class_name is not null or r.anchor_kind is distinct from 'essay'
     or r.anchor_ref is distinct from 'ps' or r.anchor_label is distinct from 'Personal statement' or not r.anchor_available then
    raise exception 'FAIL: S1''s private task row (%)', r;
  end if;
  if not exists (select 1 from public.my_tasks() x where x.task_id = current_setting('smoke.task_cls')::uuid
                    and x.class_id = '00000000-0000-4000-8000-0000000000c2' and x.anchor_kind is null) then
    raise exception 'FAIL: S1 should see the class-B task';
  end if;
end $$;
reset role;

-- ── C5. T1's per-student task list for S1: private and class tasks, with done flags ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.teacher_student_tasks('00000000-0000-4000-8000-0000000000b1') x
   where x.task_id = current_setting('smoke.task_priv')::uuid;
  if not found or r.done or r.done_at is not null or r.class_id is not null or r.anchor_label is distinct from 'Personal statement'
     or not r.anchor_available then
    raise exception 'FAIL: private task in teacher_student_tasks (%)', r;
  end if;
  select * into r from public.teacher_student_tasks('00000000-0000-4000-8000-0000000000b1') x
   where x.task_id = current_setting('smoke.task_cls')::uuid;
  if not found or r.done or r.class_id is distinct from '00000000-0000-4000-8000-0000000000c2' or r.class_name is distinct from 'Smoke B' then
    raise exception 'FAIL: class task in teacher_student_tasks (%)', r;
  end if;
  select * into r from public.teacher_student_tasks('00000000-0000-4000-8000-0000000000b1') x
   where x.task_id = current_setting('smoke.task_b')::uuid;
  if not found or not r.done or r.done_at is null then
    raise exception 'FAIL: the class-B task S1 ticked in part A should show done (%)', r;
  end if;
end $$;
reset role;

-- ── C6. S2 sees none of S1's private tasks ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.my_tasks() x where x.task_id = current_setting('smoke.task_priv')::uuid) then
    raise exception 'FAIL: S2 sees S1''s private task';
  end if;
end $$;
reset role;

-- ── C7. T2 isn't linked to S2 ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform * from public.teacher_student_tasks('00000000-0000-4000-8000-0000000000b2');
    raise exception 'FAIL: T2 listed tasks of a student they are not linked to';
  exception when others then
    if sqlerrm not like 'classroom: not linked%' then raise exception 'FAIL: T2 teacher_student_tasks(S2): %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── C8. S1 stops sharing essays with T1 ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select public.set_share_essays('00000000-0000-4000-8000-0000000000a1', false);
reset role;

-- ── C9. T1: the essay task stays, without its label; a new essay-anchored task is refused ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.list_my_tasks() x where x.task_id = current_setting('smoke.task_priv')::uuid;
  if not found or r.anchor_available or r.anchor_label is not null or r.anchor_kind is distinct from 'essay' then
    raise exception 'FAIL: list_my_tasks after sharing off (%)', r;
  end if;
  select * into r from public.teacher_student_tasks('00000000-0000-4000-8000-0000000000b1') x
   where x.task_id = current_setting('smoke.task_priv')::uuid;
  if not found or r.anchor_available or r.anchor_label is not null or r.anchor_kind is distinct from 'essay' then
    raise exception 'FAIL: teacher_student_tasks after sharing off (%)', r;
  end if;
  begin
    perform public.create_task('x', p_student => '00000000-0000-4000-8000-0000000000b1', p_anchor_kind => 'essay',
                               p_anchor_ref => 'ps', p_anchor_label => 'Personal statement');
    raise exception 'FAIL: essay-anchored task accepted while essays are not shared';
  exception when others then
    if sqlerrm not like 'classroom: invalid%' then raise exception 'FAIL: unshared essay task: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ── C10. S1 keeps the label; leaving class B takes its tasks away, the private task stays ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.my_tasks() x where x.task_id = current_setting('smoke.task_priv')::uuid;
  if not found or r.anchor_label is distinct from 'Personal statement' or r.anchor_available then
    raise exception 'FAIL: S1 should keep the task label, marked not shared (%)', r;
  end if;
  perform public.leave_class('00000000-0000-4000-8000-0000000000c2');
  if exists (select 1 from public.my_tasks() x
              where x.task_id in (current_setting('smoke.task_cls')::uuid, current_setting('smoke.task_b')::uuid)) then
    raise exception 'FAIL: class-B tasks still shown after leaving class B';
  end if;
  if not exists (select 1 from public.my_tasks() x where x.task_id = current_setting('smoke.task_priv')::uuid) then
    raise exception 'FAIL: the private task went away with the class';
  end if;
end $$;
reset role;

-- ═════════════ part D: the link ends (last) ═════════════

-- ── D1. S1 ticks the private task ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select public.set_task_done(current_setting('smoke.task_priv')::uuid, true);
reset role;

-- ── D2. as postgres: the pair T1-S1 has rows in every per-pair table ──
select set_config('request.jwt.claims', '', true);
do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  s1 constant uuid := '00000000-0000-4000-8000-0000000000b1';
begin
  perform set_config('smoke.conv_t1s1',
                     (select string_agg(c.id::text, ',') from public.conversations c where c.teacher_id = t1 and c.student_id = s1), true);
  if not exists (select 1 from public.conversations c where c.teacher_id = t1 and c.student_id = s1) then
    raise exception 'FAIL: setup: no T1-S1 conversations';
  end if;
  if not exists (select 1 from public.conversation_messages m join public.conversations c on c.id = m.conversation_id
                  where c.teacher_id = t1 and c.student_id = s1) then
    raise exception 'FAIL: setup: no T1-S1 messages';
  end if;
  if not exists (select 1 from public.post_reads r where r.teacher_id = t1 and r.student_id = s1) then
    raise exception 'FAIL: setup: no T1-S1 read marks';
  end if;
  if not exists (select 1 from public.teacher_notes n where n.teacher_id = t1 and n.student_id = s1) then
    raise exception 'FAIL: setup: no T1 notes about S1';
  end if;
  if not exists (select 1 from public.teacher_tasks t where t.teacher_id = t1 and t.student_id = s1) then
    raise exception 'FAIL: setup: no T1 private task for S1';
  end if;
  if not exists (select 1 from public.task_completions tc
                  where tc.task_id = current_setting('smoke.task_priv')::uuid and tc.teacher_id = t1 and tc.student_id = s1) then
    raise exception 'FAIL: setup: S1''s completion of the private task is missing';
  end if;
end $$;

-- ── D3. S1 leaves T1 ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;
select public.leave_teacher('00000000-0000-4000-8000-0000000000a1');
reset role;

-- ── D4. as postgres: everything of that pair is gone for both sides; S1's conversations with T2 stay ──
select set_config('request.jwt.claims', '', true);
do $$
declare
  t1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  t2 constant uuid := '00000000-0000-4000-8000-0000000000a2';
  s1 constant uuid := '00000000-0000-4000-8000-0000000000b1';
begin
  if exists (select 1 from public.conversations c where c.teacher_id = t1 and c.student_id = s1) then
    raise exception 'FAIL: T1-S1 conversations kept after the link ended';
  end if;
  if exists (select 1 from public.conversation_messages m
              where m.conversation_id = any (string_to_array(current_setting('smoke.conv_t1s1'), ',')::uuid[])) then
    raise exception 'FAIL: T1-S1 messages kept after the link ended';
  end if;
  if exists (select 1 from public.post_reads r where r.teacher_id = t1 and r.student_id = s1) then
    raise exception 'FAIL: T1-S1 read marks kept after the link ended';
  end if;
  if exists (select 1 from public.teacher_notes n where n.teacher_id = t1 and n.student_id = s1) then
    raise exception 'FAIL: T1''s notes about S1 kept after the link ended';
  end if;
  if exists (select 1 from public.teacher_tasks t where t.teacher_id = t1 and t.student_id = s1) then
    raise exception 'FAIL: T1''s private task for S1 kept after the link ended';
  end if;
  if exists (select 1 from public.task_completions tc where tc.teacher_id = t1 and tc.student_id = s1) then
    raise exception 'FAIL: S1''s completions of T1''s tasks kept after the link ended';
  end if;
  if not exists (select 1 from public.conversations c
                  where c.teacher_id = t2 and c.student_id = s1 and c.id = current_setting('smoke.c2')::uuid) then
    raise exception 'FAIL: S1''s conversation with T2 went away too';
  end if;
end $$;

-- ═════════════ done ═════════════
do $$
begin
  raise notice 'classroom smoke test passed';
end $$;

rollback;
