-- Dry run for migration 0043_forbid_new_plaintext (and 0040's key table, section D). Run in the dashboard SQL Editor AFTER applying 0043, or paste
-- 0043 at the marked line below to dry-run the migration and the checks together. It creates throwaway rows inside
-- one transaction, acts as the website (authenticated), anon and the service role, and never commits: the LAST
-- statement deliberately raises "DRY RUN RESULT: <n> failures" followed by one PASS/FAIL line per check.
-- Success = "DRY RUN RESULT: 0 failures". The plaintext values below are markers, not real passwords.

begin;

-- ── setup (postgres): one student with a not-yet-migrated college password and profile password ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000041a1', 'dry-0043-s@example.invalid'),
  ('00000000-0000-4000-8000-0000000041a2', 'dry-0043-new@example.invalid');
-- (If 0043 is already applied, its triggers would refuse this setup: switch them off for these two inserts.)
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'forbid_plaintext_password' and tgrelid = 'public.student_colleges'::regclass) then
    alter table public.student_colleges disable trigger forbid_plaintext_password;
    alter table public.student_profiles disable trigger forbid_plaintext_password;
  end if;
end $$;
insert into public.student_profiles (user_id, display_name, sat_total, portals) values
  ('00000000-0000-4000-8000-0000000041a1', 'Dry S', 1300,
   '{"systems":{"commonapp":{"url":"","username":"ca","password":"OLD-PROFILE-MARKER"}},"progress":{"commonapp":{"done":true}}}');
insert into public.student_colleges (id, user_id, institution_id, status, checklist, portal_username, portal_password)
  select '00000000-0000-4000-8000-0000000041c1', '00000000-0000-4000-8000-0000000041a1', id, 'in_progress', '{}', 'kid', 'OLD-COLLEGE-MARKER'
  from public.institutions order by slug limit 1;
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'forbid_plaintext_password' and tgrelid = 'public.student_colleges'::regclass) then
    alter table public.student_colleges enable trigger forbid_plaintext_password;
    alter table public.student_profiles enable trigger forbid_plaintext_password;
  end if;
end $$;

-- ── paste 0043 here to dry-run the migration itself ──

create temp table dry (n serial primary key, name text, expect text, got text) on commit drop;

-- Runs p_sql as p_role ('authenticated' = the student's website session, 'anon', 'service_role', or 'postgres');
-- returns 'ok:<first column>' or 'refused <sqlstate>: <message>'. Back to postgres afterwards.
create function pg_temp.run(p_role text, p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', case when p_role = 'authenticated'
    then '{"sub":"00000000-0000-4000-8000-0000000041a1","role":"authenticated"}' else '' end, true);
  perform set_config('role', p_role, true);
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
  insert into dry (name, expect, got) values (p_name, p_expect, p_got)
$$;

-- ── A. student_colleges: no new plaintext ──
select pg_temp.chk('A1 service role: insert with a password refused', 'refused 42501', pg_temp.run('service_role',
  $q$insert into public.student_colleges (user_id, institution_id, status, portal_password)
     select '00000000-0000-4000-8000-0000000041a2', id, 'in_progress', 'NEW-MARKER' from public.institutions order by slug limit 1 returning 'x'$q$));
select pg_temp.chk('A2 website: update status of a row that still holds old plaintext', 'ok:submitted', pg_temp.run('authenticated',
  $q$update public.student_colleges set status = 'submitted' where id = '00000000-0000-4000-8000-0000000041c1' returning status$q$));
select pg_temp.chk('A3 old build (service role path): same old password re-sent with a status change', 'ok:in_progress', pg_temp.run('service_role',
  $q$update public.student_colleges set status = 'in_progress', portal_password = 'OLD-COLLEGE-MARKER' where id = '00000000-0000-4000-8000-0000000041c1' returning status$q$));
select pg_temp.chk('A4 service role: changing the password refused', 'refused 42501', pg_temp.run('service_role',
  $q$update public.student_colleges set portal_password = 'CHANGED-MARKER' where id = '00000000-0000-4000-8000-0000000041c1' returning 'x'$q$));
select pg_temp.chk('A5 website: writing portal_password refused (no column privilege)', 'refused 42501', pg_temp.run('authenticated',
  $q$update public.student_colleges set portal_password = 'OLD-COLLEGE-MARKER' where id = '00000000-0000-4000-8000-0000000041c1' returning 'x'$q$));
select pg_temp.chk('A6 migrate: compare-and-set with a stale value does nothing', 'ok:false', pg_temp.run('service_role',
  $q$select public.strip_college_portal_password('00000000-0000-4000-8000-0000000041a1', '00000000-0000-4000-8000-0000000041c1', 'STALE-MARKER')::text$q$));
select pg_temp.chk('A7 migrate: compare-and-set with the copied value nulls it', 'ok:true', pg_temp.run('service_role',
  $q$select public.strip_college_portal_password('00000000-0000-4000-8000-0000000041a1', '00000000-0000-4000-8000-0000000041c1', 'OLD-COLLEGE-MARKER')::text$q$));
select pg_temp.chk('A8 the row now has no plaintext', 'ok:true', pg_temp.run('postgres',
  $q$select (portal_password is null)::text from public.student_colleges where id = '00000000-0000-4000-8000-0000000041c1'$q$));
select pg_temp.chk('A9 old build writing the cleared password back refused', 'refused 42501', pg_temp.run('service_role',
  $q$update public.student_colleges set portal_password = 'OLD-COLLEGE-MARKER' where id = '00000000-0000-4000-8000-0000000041c1' returning 'x'$q$));
select pg_temp.chk('A10 website cannot call the compare-and-set', 'refused 42501', pg_temp.run('authenticated',
  $q$select public.strip_college_portal_password('00000000-0000-4000-8000-0000000041a1', '00000000-0000-4000-8000-0000000041c1', 'x')::text$q$));

-- ── B. student_profiles.portals: no new plaintext ──
select pg_temp.chk('B1 website: unrelated column update on a row with old plaintext', 'ok:1400', pg_temp.run('authenticated',
  $q$update public.student_profiles set sat_total = 1400 where user_id = auth.uid() returning sat_total::text$q$));
select pg_temp.chk('B2 website: portals saved with the old password passed through unchanged', 'ok:x', pg_temp.run('authenticated',
  $q$update public.student_profiles set portals = jsonb_set(portals, '{systems,commonapp,username}', '"ca2"') where user_id = auth.uid() returning 'x'$q$));
-- The website saves profiles with an upsert (INSERT ... ON CONFLICT DO UPDATE, as supabase-js .upsert() sends it);
-- BEFORE INSERT triggers fire for it too, so these prove the INSERT branch compares with the stored row.
select pg_temp.chk('B2a website upsert: old password passed through unchanged', 'ok:1450', pg_temp.run('authenticated',
  $q$insert into public.student_profiles (user_id, sat_total, portals)
     select auth.uid(), 1450, portals from public.student_profiles where user_id = auth.uid()
     on conflict (user_id) do update set sat_total = excluded.sat_total, portals = excluded.portals
     returning sat_total::text$q$));
select pg_temp.chk('B2b website upsert: changing the password refused', 'refused 42501', pg_temp.run('authenticated',
  $q$insert into public.student_profiles (user_id, sat_total, portals)
     select auth.uid(), 1460, jsonb_set(portals, '{systems,commonapp,password}', '"CHANGED-MARKER"') from public.student_profiles where user_id = auth.uid()
     on conflict (user_id) do update set sat_total = excluded.sat_total, portals = excluded.portals
     returning sat_total::text$q$));
select pg_temp.chk('B2c website upsert: adding a password refused', 'refused 42501', pg_temp.run('authenticated',
  $q$insert into public.student_profiles (user_id, sat_total, portals)
     select auth.uid(), 1470, jsonb_set(portals, '{systems,ucas}', '{"url":"","username":"u","password":"NEW-MARKER"}') from public.student_profiles where user_id = auth.uid()
     on conflict (user_id) do update set sat_total = excluded.sat_total, portals = excluded.portals
     returning sat_total::text$q$));
select pg_temp.chk('B3 website: adding a new password refused', 'refused 42501', pg_temp.run('authenticated',
  $q$update public.student_profiles set portals = jsonb_set(portals, '{systems,ucas}', '{"url":"","username":"u","password":"NEW-MARKER"}') where user_id = auth.uid() returning 'x'$q$));
select pg_temp.chk('B4 website: changing the old password refused', 'refused 42501', pg_temp.run('authenticated',
  $q$update public.student_profiles set portals = jsonb_set(portals, '{systems,commonapp,password}', '"CHANGED-MARKER"') where user_id = auth.uid() returning 'x'$q$));
select pg_temp.chk('B5 any role (service role shown): a new profile with a password refused', 'refused 42501', pg_temp.run('service_role',
  $q$insert into public.student_profiles (user_id, portals) values ('00000000-0000-4000-8000-0000000041a2', '{"custom":[{"id":"c1","password":"NEW-MARKER"}]}') returning 'x'$q$));
select pg_temp.chk('B6 migrate: replace that also changes a username refused (returns false)', 'ok:false', pg_temp.run('service_role',
  $q$select public.replace_profile_portals('00000000-0000-4000-8000-0000000041a1',
       (select portals from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000041a1'),
       jsonb_set(public.portals_without_passwords((select portals from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000041a1')), '{systems,commonapp,username}', '"hijack"'))::text$q$));
select pg_temp.chk('B7 migrate: replace from a stale read does nothing', 'ok:false', pg_temp.run('service_role',
  $q$select public.replace_profile_portals('00000000-0000-4000-8000-0000000041a1', '{"systems":{}}'::jsonb, '{"systems":{}}'::jsonb)::text$q$));
select pg_temp.chk('B8 migrate: replace with the password removed', 'ok:true', pg_temp.run('service_role',
  $q$select public.replace_profile_portals('00000000-0000-4000-8000-0000000041a1',
       (select portals from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000041a1'),
       public.portals_without_passwords((select portals from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000041a1')))::text$q$));
select pg_temp.chk('B9 profile now has no password, username and progress kept', 'ok:ca2|true|false', pg_temp.run('postgres',
  $q$select (portals #>> '{systems,commonapp,username}') || '|' || (portals #>> '{progress,commonapp,done}') || '|' || (portals #> '{systems,commonapp}' ? 'password')::text
     from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000041a1'$q$));

-- ── C. column grants: the website and the AI tools still work; portal_password is out of reach ──
select pg_temp.chk('C1 website: select portal_password refused', 'refused 42501', pg_temp.run('authenticated',
  $q$select portal_password from public.student_colleges limit 1$q$));
select pg_temp.chk('C2 website: select * refused (portal_password is in it)', 'refused 42501', pg_temp.run('authenticated',
  $q$select count(*)::text from (select * from public.student_colleges) s$q$));
select pg_temp.chk('C3 website: COLLEGE_COLUMNS read with institutions(slug)', 'ok:1', pg_temp.run('authenticated',
  $q$select count(*)::text from (select sc.id, sc.custom, sc.institution_id, sc.plan_key, sc.status, sc.notes, sc.checklist, sc.portal_url,
       sc.portal_username, sc.aid_offer_usd, sc.created_at, i.slug from public.student_colleges sc left join public.institutions i on i.id = sc.institution_id) s$q$));
select pg_temp.chk('C4 website: insert as fromEntry (custom college with id)', 'ok:x', pg_temp.run('authenticated',
  $q$insert into public.student_colleges (user_id, id, custom, institution_id, plan_key, status, notes, checklist, portal_url, portal_username, aid_offer_usd)
     values (auth.uid(), '00000000-0000-4000-8000-0000000041c2', '{"name":"Dry College"}', null, null, 'in_progress', null, '{}', null, 'me', null) returning 'x'$q$));
select pg_temp.chk('C5 website: merge upsert (on conflict do nothing)', 'ok:null', pg_temp.run('authenticated',
  $q$insert into public.student_colleges (user_id, institution_id, plan_key, status, notes, checklist, portal_url, portal_username, aid_offer_usd)
     select auth.uid(), id, null, 'in_progress', null, '{}', null, null, null from public.institutions order by slug limit 1
     on conflict (user_id, institution_id) do nothing returning 'x'$q$));
select pg_temp.chk('C6 website: list update (store.update columns)', 'ok:EA', pg_temp.run('authenticated',
  $q$update public.student_colleges set plan_key = 'EA', status = 'submitted', notes = 'n', checklist = '{"stars":true}', portal_url = 'https://x.example',
       portal_username = 'kid2', aid_offer_usd = 1000 where id = '00000000-0000-4000-8000-0000000041c1' returning plan_key$q$));
select pg_temp.chk('C7 AI tools: read COLLEGE_COLUMNS_NO_LOGINS + updated_at', 'ok:2', pg_temp.run('authenticated',
  $q$select count(*)::text from (select id, custom, institution_id, plan_key, status, notes, checklist, created_at, updated_at
       from public.student_colleges where user_id = auth.uid()) s$q$));
select pg_temp.chk('C8 AI tools: update plan/status/notes/checklist returning updated_at', 'ok:true', pg_temp.run('authenticated',
  $q$update public.student_colleges set plan_key = 'RD', status = 'in_progress', notes = null, checklist = '{}'
     where id = '00000000-0000-4000-8000-0000000041c1' returning (updated_at is not null)::text$q$));
select pg_temp.chk('C9 AI tools: add_college insert', 'ok:x', pg_temp.run('authenticated',
  $q$insert into public.student_colleges (user_id, institution_id, plan_key, status, notes, checklist)
     select auth.uid(), id, null, 'in_progress', null, '{}' from public.institutions where id not in
       (select institution_id from public.student_colleges where user_id = auth.uid() and institution_id is not null) order by slug limit 1 returning 'x'$q$));
select pg_temp.chk('C10 website: delete still allowed', 'ok:x', pg_temp.run('authenticated',
  $q$delete from public.student_colleges where id = '00000000-0000-4000-8000-0000000041c2' returning 'x'$q$));
select pg_temp.chk('C11 anon: no select', 'refused 42501', pg_temp.run('anon',
  $q$select id::text from public.student_colleges limit 1$q$));
select pg_temp.chk('C12 service role: still reads portal_password', 'ok:null', pg_temp.run('service_role',
  $q$select portal_password from public.student_colleges where id = '00000000-0000-4000-8000-0000000041c1'$q$));

-- ── D. 0040's key table: one row, service role only, never overwritten through the API ──
select pg_temp.chk('D1 website: cannot read portal_vault_meta', 'refused 42501', pg_temp.run('authenticated',
  $q$select key_id from public.portal_vault_meta limit 1$q$));
select pg_temp.chk('D2 service role: claim (or already claimed: nothing changes)', 'ok:', pg_temp.run('service_role',
  $q$insert into public.portal_vault_meta (id, key_id) values (true, 'DRYRUN0041keyid0') on conflict (id) do nothing returning 'x'$q$));
select pg_temp.chk('D3 service role: a second row refused', 'refused 23514', pg_temp.run('service_role',
  $q$insert into public.portal_vault_meta (id, key_id) values (false, 'DRYRUN0041keyid1') returning 'x'$q$));
select pg_temp.chk('D4 service role: cannot change the stored key id', 'refused 42501', pg_temp.run('service_role',
  $q$update public.portal_vault_meta set key_id = 'DRYRUN0041keyid2' returning 'x'$q$));
select pg_temp.chk('D5 exactly one row', 'ok:1', pg_temp.run('postgres',
  $q$select count(*)::text from public.portal_vault_meta$q$));

-- ── result: raises on purpose, so the transaction can never commit ──
do $$
declare f int; s text;
begin
  select count(*) filter (where not starts_with(got, expect)),
         string_agg(case when starts_with(got, expect) then 'PASS ' else 'FAIL ' end || name || ' | expect ' || expect || ' | got ' || got, E'\n' order by n)
  into f, s from dry;
  raise exception E'DRY RUN RESULT: % failures\n%', f, s;
end $$;

rollback;
