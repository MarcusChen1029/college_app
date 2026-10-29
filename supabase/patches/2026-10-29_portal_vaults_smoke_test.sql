-- Smoke test for migration 0045_portal_vaults. Run in the dashboard SQL Editor (or psql) AFTER applying 0045, or paste 0045
-- right after "begin;" to dry-run the migration and the test together.
-- It creates three throwaway users inside one transaction, calls the three functions as the table owner (the same code
-- path service_role uses), and ends with ROLLBACK, so nothing persists. A failed check raises
--   SMOKE FAIL [<check>]: expected <x>, got <y>
-- and stops the script. Success = no error: psql prints a PASS notice per check and a final "PASS" row; the SQL Editor
-- may show only "Success. No rows returned" for the closing rollback.
-- Not covered here (needs two sessions): the FOR SHARE vs reset ordering. Run two psql sessions by hand for that:
-- session 1 puts inside an open transaction, session 2's portal_vault_reset must wait until session 1 commits.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000004501', 'smoke-0045-a@example.invalid'),
  ('00000000-0000-4000-8000-000000004502', 'smoke-0045-b@example.invalid'),
  ('00000000-0000-4000-8000-000000004503', 'smoke-0045-c@example.invalid');

create function pg_temp.chk(p_name text, p_expect text, p_got text) returns void
language plpgsql as $fn$
begin
  if p_got is distinct from p_expect then
    raise exception 'SMOKE FAIL [%]: expected %, got %', p_name, coalesce(p_expect, '<null>'), coalesce(p_got, '<null>');
  end if;
  raise notice 'PASS [%]', p_name;
end $fn$;

do $do$
declare
  ua     uuid := '00000000-0000-4000-8000-000000004501';  -- main user: put, cap, reset, re-create
  ub     uuid := '00000000-0000-4000-8000-000000004502';  -- orphan e1 row, malformed records
  uc     uuid := '00000000-0000-4000-8000-000000004503';  -- old v1 row; must survive another user's reset
  nobody uuid := '00000000-0000-4000-8000-000000004599';  -- no vault, not in auth.users
  kid    text := repeat('K', 16);
  kid2   text := repeat('N', 16);
  rec    jsonb;
  rec2   jsonb;
  bads   jsonb[];
  i      integer;
  n      integer;
  s      text;
  t      timestamptz;
  caught boolean;
  priv   text;
  fn     text;
begin
  rec := jsonb_build_object('version', 'e1', 'key_id', kid,
           'pass_salt', repeat('s', 22), 'pass_iterations', 600000, 'pass_check', repeat('c', 43), 'pass_wrapped', repeat('w', 80),
           'rec_salt', repeat('t', 22), 'rec_check', repeat('d', 43), 'rec_wrapped', repeat('x', 80));

  -- ── create ──
  perform pg_temp.chk('create: first call', 'ok', public.portal_vault_create(ua, rec));
  perform pg_temp.chk('create: second call', 'exists', public.portal_vault_create(ua, rec));
  select count(*) into n from public.portal_vaults where user_id = ua;
  perform pg_temp.chk('create: exactly one row', '1', n::text);
  select key_id into s from public.portal_vaults where user_id = ua;
  perform pg_temp.chk('create: key id stored', kid, s);
  select pass_iterations::text into s from public.portal_vaults where user_id = ua;
  perform pg_temp.chk('create: iterations stored', '600000', s);

  -- ── put: refusals ──
  perform pg_temp.chk('put: no vault', 'no_vault', public.portal_vault_put(nobody, 'a', 'e1.' || kid || '.AAAA', null, false));
  perform pg_temp.chk('put: other key id', 'wrong_vault', public.portal_vault_put(ua, 'a', 'e1.' || repeat('Z', 16) || '.AAAA', null, false));
  perform pg_temp.chk('put: old v1 value', 'wrong_vault', public.portal_vault_put(ua, 'a', 'v1.' || kid || '.AAAA', null, false));
  perform pg_temp.chk('put: not an e1 value', 'wrong_vault', public.portal_vault_put(ua, 'a', 'x', null, false));
  perform pg_temp.chk('put: null value', 'wrong_vault', public.portal_vault_put(ua, 'a', null, null, false));
  perform pg_temp.chk('put: wrong key id with expected', 'wrong_vault', public.portal_vault_put(ua, 'a', 'e1.' || repeat('Z', 16) || '.AAAA', now(), false));
  select count(*) into n from public.portal_passwords where user_id = ua;
  perform pg_temp.chk('put: refused values stored nothing', '0', n::text);

  -- ── put: insert-only ──
  perform pg_temp.chk('put insert-only: first', 'ok', public.portal_vault_put(ua, 'a', 'e1.' || kid || '.AAAA', null, true));
  perform pg_temp.chk('put insert-only: occupied', 'occupied', public.portal_vault_put(ua, 'a', 'e1.' || kid || '.BBBB', null, true));
  select sealed into s from public.portal_passwords where user_id = ua and slot = 'a';
  perform pg_temp.chk('put insert-only: occupied slot unchanged', 'e1.' || kid || '.AAAA', s);

  -- ── put: upsert ──
  perform pg_temp.chk('put upsert: overwrite', 'ok', public.portal_vault_put(ua, 'a', 'e1.' || kid || '.CCCC', null, false));
  select sealed into s from public.portal_passwords where user_id = ua and slot = 'a';
  perform pg_temp.chk('put upsert: value replaced', 'e1.' || kid || '.CCCC', s);
  perform pg_temp.chk('put upsert: new slot', 'ok', public.portal_vault_put(ua, 'b', 'e1.' || kid || '.EEEE', null, false));

  -- ── put: compare-and-set on updated_at ──
  select updated_at into t from public.portal_passwords where user_id = ua and slot = 'a';
  perform pg_temp.chk('put expected: stale timestamp', 'changed', public.portal_vault_put(ua, 'a', 'e1.' || kid || '.DDDD', t - interval '1 second', false));
  select sealed into s from public.portal_passwords where user_id = ua and slot = 'a';
  perform pg_temp.chk('put expected: stale write changed nothing', 'e1.' || kid || '.CCCC', s);
  perform pg_temp.chk('put expected: matching timestamp', 'ok', public.portal_vault_put(ua, 'a', 'e1.' || kid || '.DDDD', t, false));
  select sealed into s from public.portal_passwords where user_id = ua and slot = 'a';
  perform pg_temp.chk('put expected: matching write applied', 'e1.' || kid || '.DDDD', s);
  perform pg_temp.chk('put expected: missing slot', 'changed', public.portal_vault_put(ua, 'nope', 'e1.' || kid || '.DDDD', t, false));
  select count(*) into n from public.portal_passwords where user_id = ua and slot = 'nope';
  perform pg_temp.chk('put expected: missing slot not created', '0', n::text);

  -- ── put: 500-row cap (counts every row, v1 included) ──
  insert into public.portal_passwords (user_id, slot, sealed)
    select ua, 'bulk:' || k::text, 'e1.' || kid || '.AAAA'
    from generate_series(1, 500 - (select count(*) from public.portal_passwords where user_id = ua)) as g(k);
  select count(*) into n from public.portal_passwords where user_id = ua;
  perform pg_temp.chk('cap: user is at 500 rows', '500', n::text);
  perform pg_temp.chk('cap: new slot by upsert', 'too_many', public.portal_vault_put(ua, 'new1', 'e1.' || kid || '.AAAA', null, false));
  perform pg_temp.chk('cap: new slot by insert-only', 'too_many', public.portal_vault_put(ua, 'new2', 'e1.' || kid || '.AAAA', null, true));
  perform pg_temp.chk('cap: existing slot still upserts', 'ok', public.portal_vault_put(ua, 'a', 'e1.' || kid || '.FFFF', null, false));
  perform pg_temp.chk('cap: occupied slot still reports occupied', 'occupied', public.portal_vault_put(ua, 'a', 'e1.' || kid || '.GGGG', null, true));
  delete from public.portal_passwords where user_id = ua and slot = 'bulk:1';
  perform pg_temp.chk('cap: room again after a delete', 'ok', public.portal_vault_put(ua, 'new1', 'e1.' || kid || '.AAAA', null, false));
  select count(*) into n from public.portal_passwords where user_id = ua;
  perform pg_temp.chk('cap: back at exactly 500 rows', '500', n::text);

  -- ── create: orphans, v1 rows, malformed records ──
  insert into public.portal_passwords (user_id, slot, sealed) values (ub, 'x', 'e1.' || repeat('Q', 16) || '.AAAA');
  perform pg_temp.chk('create: orphan e1 row blocks', 'orphans', public.portal_vault_create(ub, rec));
  select count(*) into n from public.portal_vaults where user_id = ub;
  perform pg_temp.chk('create: orphans inserted no vault', '0', n::text);
  perform public.portal_vault_reset(ub);
  select count(*) into n from public.portal_passwords where user_id = ub;
  perform pg_temp.chk('reset: orphan e1 row cleared', '0', n::text);

  bads := array[
    rec || jsonb_build_object('pass_iterations', 599999),
    rec || jsonb_build_object('pass_iterations', 10000001),
    rec || jsonb_build_object('key_id', 'short'),
    rec || jsonb_build_object('version', 'e2'),
    rec || jsonb_build_object('pass_salt', repeat('s', 21)),
    rec || jsonb_build_object('pass_check', repeat('c', 44)),
    rec || jsonb_build_object('pass_wrapped', repeat('w', 79)),
    rec || jsonb_build_object('rec_salt', repeat('t', 21) || '+'),
    rec || jsonb_build_object('rec_check', repeat('d', 43) || '='),
    rec || jsonb_build_object('rec_wrapped', repeat('x', 81)),
    rec - 'rec_check'
  ];
  for i in 1 .. array_length(bads, 1) loop
    caught := false;
    begin
      perform public.portal_vault_create(ub, bads[i]);
    exception when check_violation or not_null_violation then
      caught := true;
    end;
    perform pg_temp.chk('create: malformed record #' || i::text || ' rejected', 'true', caught::text);
  end loop;
  select count(*) into n from public.portal_vaults where user_id = ub;
  perform pg_temp.chk('create: malformed records inserted no vault', '0', n::text);
  perform pg_temp.chk('create: after reset', 'ok', public.portal_vault_create(ub, rec));

  insert into public.portal_passwords (user_id, slot, sealed) values (uc, 'x', 'v1.' || repeat('Q', 16) || '.AAAA');
  perform pg_temp.chk('create: old v1 row does not block', 'ok', public.portal_vault_create(uc, rec));
  select count(*) into n from public.portal_passwords where user_id = uc;
  perform pg_temp.chk('create: v1 row kept', '1', n::text);

  -- ── reset ──
  perform public.portal_vault_reset(ua);
  select count(*) into n from public.portal_vaults where user_id = ua;
  perform pg_temp.chk('reset: vault row gone', '0', n::text);
  select count(*) into n from public.portal_passwords where user_id = ua;
  perform pg_temp.chk('reset: password rows gone', '0', n::text);
  select count(*) into n from public.portal_vaults where user_id in (ub, uc);
  perform pg_temp.chk('reset: other users vaults kept', '2', n::text);
  select count(*) into n from public.portal_passwords where user_id = uc;
  perform pg_temp.chk('reset: other users rows kept', '1', n::text);
  perform public.portal_vault_reset(nobody);  -- nothing to delete: no error
  perform pg_temp.chk('put: after reset there is no vault', 'no_vault', public.portal_vault_put(ua, 'a', 'e1.' || kid || '.AAAA', null, false));

  -- a save made under the deleted vault can't land in its replacement
  rec2 := rec || jsonb_build_object('key_id', kid2);
  perform pg_temp.chk('create: new vault after reset', 'ok', public.portal_vault_create(ua, rec2));
  perform pg_temp.chk('put: value sealed under the deleted vault', 'wrong_vault', public.portal_vault_put(ua, 'a', 'e1.' || kid || '.AAAA', null, false));
  perform pg_temp.chk('put: value sealed under the new vault', 'ok', public.portal_vault_put(ua, 'a', 'e1.' || kid2 || '.AAAA', null, false));

  -- ── lockdown ──
  select c.relrowsecurity::text into s from pg_class c where c.oid = 'public.portal_vaults'::regclass;
  perform pg_temp.chk('table: row level security on', 'true', s);
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'portal_vaults';
  perform pg_temp.chk('table: no policies', '0', n::text);
  foreach priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
    perform pg_temp.chk('table: anon has no ' || priv, 'false', has_table_privilege('anon', 'public.portal_vaults', priv)::text);
    perform pg_temp.chk('table: authenticated has no ' || priv, 'false', has_table_privilege('authenticated', 'public.portal_vaults', priv)::text);
  end loop;
  foreach priv in array array['select', 'insert', 'update', 'delete'] loop
    perform pg_temp.chk('table: service_role has ' || priv, 'true', has_table_privilege('service_role', 'public.portal_vaults', priv)::text);
  end loop;
  foreach fn in array array[
    'public.portal_vault_create(uuid, jsonb)',
    'public.portal_vault_put(uuid, text, text, timestamptz, boolean)',
    'public.portal_vault_reset(uuid)'
  ] loop
    -- anon and authenticated inherit PUBLIC, so this also proves PUBLIC lost EXECUTE
    perform pg_temp.chk(fn || ': anon cannot execute', 'false', has_function_privilege('anon', fn, 'execute')::text);
    perform pg_temp.chk(fn || ': authenticated cannot execute', 'false', has_function_privilege('authenticated', fn, 'execute')::text);
    perform pg_temp.chk(fn || ': service_role can execute', 'true', has_function_privilege('service_role', fn, 'execute')::text);
    select (p.prosecdef::text || '/' || exists (select 1 from unnest(p.proconfig) c where c in ('search_path=""', 'search_path='))::text)
      into s from pg_proc p where p.oid = fn::regprocedure;
    perform pg_temp.chk(fn || ': security invoker, empty search_path', 'false/true', s);
  end loop;

  raise notice 'portal_vaults smoke test: all checks passed';
end $do$;

select 'PASS: portal_vaults smoke test (rolled back below)' as result;

rollback;
