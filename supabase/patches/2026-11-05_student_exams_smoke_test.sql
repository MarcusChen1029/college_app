-- Smoke test for migration 0057_student_exams (Materials > Exams). Run in the dashboard SQL Editor (or one execute_sql)
-- AFTER applying 0057. It creates two throwaway users inside one transaction, acts as each of them, and ROLLS BACK, so
-- nothing is kept. Success = the final notice "student_exams smoke test passed". Any failed check raises an exception.
--
-- Cast (ids are 00000000-0000-4000-8000-0000000000xx):  U1 e1 student with a row   U2 e2 student with a row
-- Parts: E1 own row insert / select / update / upsert (as the web client writes it); E2 the other user's row is invisible
-- and can't be changed; E3 anon is refused; E4 an AI-connector token (client_id claim) sees nothing and can't write;
-- E5 the shape check refuses non-object data, missing or non-array entries and more than 80 entries.
-- An expected refusal is caught by its SQLSTATE class. A statement that should fail but doesn't raises 'FAIL: ...'.

begin;

-- ── setup, as the SQL Editor's postgres role ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'exams-smoke-u1@example.invalid'),
  ('00000000-0000-4000-8000-0000000000e2', 'exams-smoke-u2@example.invalid');

-- Each "act as" step sets the JWT claims auth.uid() reads, then drops to that role. Steps "as postgres" clear the claims first.

-- ── E1. U1 inserts, reads, updates and upserts its own row ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  u1 constant uuid := '00000000-0000-4000-8000-0000000000e1';
  u2 constant uuid := '00000000-0000-4000-8000-0000000000e2';
  v jsonb;
  n int;
begin
  -- user_id defaults to auth.uid()
  insert into public.student_exams (data)
    values ('{"version":1,"entries":[{"id":"a1","system":"ap","subject":"AP Biology","session":"2026-05","result":"5"}]}');
  select data into v from public.student_exams where user_id = u1;
  if v is null or v -> 'entries' -> 0 ->> 'subject' is distinct from 'AP Biology' then
    raise exception 'FAIL: U1 can''t read back its own row (%)', v;
  end if;

  update public.student_exams set data = jsonb_set(data, '{ibTotals}', '{"predicted":38,"result":null}') where user_id = u1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: U1''s update changed % rows', n; end if;
  select data into v from public.student_exams where user_id = u1;
  if v -> 'ibTotals' ->> 'predicted' is distinct from '38' then raise exception 'FAIL: U1''s update not stored (%)', v; end if;

  -- The web client's write: upsert of the whole document on user_id.
  insert into public.student_exams (user_id, data)
    values (u1, '{"version":1,"entries":[{"id":"a1","system":"ap","subject":"AP Biology","result":"5"},{"id":"a2","system":"ib","subject":"Physics","level":"HL","predicted":"6"}]}')
    on conflict (user_id) do update set data = excluded.data;
  select data into v from public.student_exams where user_id = u1;
  if jsonb_array_length(v -> 'entries') <> 2 or v ? 'ibTotals' then raise exception 'FAIL: U1''s upsert not stored (%)', v; end if;

  -- U1 can't create a row for U2 (RLS with check, SQLSTATE 42501).
  begin
    insert into public.student_exams (user_id, data) values (u2, '{"version":1,"entries":[]}');
    raise exception 'FAIL: U1 inserted a row for U2';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── E2. U2 has its own row, and can't see or change U1's ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  u1 constant uuid := '00000000-0000-4000-8000-0000000000e1';
  u2 constant uuid := '00000000-0000-4000-8000-0000000000e2';
  n int;
begin
  insert into public.student_exams default values; -- user_id = auth.uid(), data = the empty document
  select count(*) into n from public.student_exams;
  if n <> 1 then raise exception 'FAIL: U2 sees % rows (only its own expected)', n; end if;
  if exists (select 1 from public.student_exams where user_id = u1) then raise exception 'FAIL: U2 can read U1''s row'; end if;
  if not exists (select 1 from public.student_exams where user_id = u2 and data = '{"version":1,"entries":[]}'::jsonb) then
    raise exception 'FAIL: U2''s default row is missing or not the empty document';
  end if;

  update public.student_exams set data = '{"version":1,"entries":[]}' where user_id = u1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: U2 updated U1''s row'; end if;
  delete from public.student_exams where user_id = u1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: U2 deleted U1''s row'; end if;

  -- An upsert on U1's key is refused, not turned into an update of U1's row.
  begin
    insert into public.student_exams (user_id, data) values (u1, '{"version":1,"entries":[]}')
      on conflict (user_id) do update set data = excluded.data;
    raise exception 'FAIL: U2''s upsert on U1''s key went through';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- As postgres: U1's row is exactly what U1 last wrote.
select set_config('request.jwt.claims', '', true);
do $$
begin
  if (select jsonb_array_length(data -> 'entries') from public.student_exams where user_id = '00000000-0000-4000-8000-0000000000e1') is distinct from 2 then
    raise exception 'FAIL: U1''s row changed after U2''s attempts';
  end if;
end $$;

-- ── E3. anon is refused (no grant, 0044) ──
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  begin
    perform 1 from public.student_exams limit 1;
    raise exception 'FAIL: anon can select student_exams';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.student_exams (user_id, data) values ('00000000-0000-4000-8000-0000000000e1', '{"version":1,"entries":[]}');
    raise exception 'FAIL: anon can insert into student_exams';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── E4. an AI-connector token for U1 (client_id claim) sees nothing and can't write (restrictive no_oauth_clients) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","client_id":"smoke-client"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.student_exams;
  if n <> 0 then raise exception 'FAIL: an OAuth token sees % student_exams rows', n; end if;
  update public.student_exams set data = '{"version":1,"entries":[]}' where user_id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: an OAuth token updated U1''s exams'; end if;
end $$;
reset role;

-- ── E5. the shape check (student_exams_data_shape) refuses bad documents ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  u1 constant uuid := '00000000-0000-4000-8000-0000000000e1';
  bad jsonb;
begin
  foreach bad in array array[
    '[]'::jsonb,                                  -- not an object
    '{"version":1}'::jsonb,                       -- no entries
    '{"version":1,"entries":{}}'::jsonb,          -- entries not an array
    '{"version":1,"entries":"x"}'::jsonb,
    jsonb_build_object('version', 1, 'entries',
      (select jsonb_agg(jsonb_build_object('id', 'x' || g, 'system', 'ap', 'subject', 'AP Biology')) from generate_series(1, 81) g))
  ] loop
    begin
      update public.student_exams set data = bad where user_id = u1;
      raise exception 'FAIL: the shape check accepted %', left(bad::text, 80);
    exception when check_violation then null;
    end;
  end loop;

  -- 80 entries is the limit, not past it.
  update public.student_exams
     set data = jsonb_build_object('version', 1, 'entries',
       (select jsonb_agg(jsonb_build_object('id', 'x' || g, 'system', 'ap', 'subject', 'AP Biology')) from generate_series(1, 80) g))
   where user_id = u1;
end $$;
reset role;

-- ═════════════ done ═════════════
do $$
begin
  raise notice 'student_exams smoke test passed';
end $$;

rollback;
