-- LATER, final step of the portal password move (runbook step 6, docs/superpowers/plans/2026-10-28-portal-password-encryption.md):
-- drops student_colleges.portal_password and removes every "password" key still left in student_profiles.portals.
-- Run it only weeks after 2026-10-28-strip-plaintext-portal-passwords.sql, once the encrypted store has been live and
-- checked and no old build of the site is still in use (an old build selects the column and would fail to load lists).
-- This DELETES data: whatever is still here was not copied into portal_passwords (empty values, or passwords the site
-- can't place). Run the two count queries at the top of the strip patch first and accept what they show.
-- Supabase backups keep old values until they age out. DDL + UPDATE: run it in the dashboard SQL Editor.
--
-- Nothing else may still read the column (expect 0 rows):
-- select 'view' as kind, viewname as name from pg_views where schemaname = 'public' and definition ilike '%portal_password%'
-- union all
-- select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prosrc ilike '%portal_password%';

begin;

update public.student_profiles sp
set portals = sp.portals
  || case when jsonb_typeof(sp.portals -> 'systems') = 'object' then jsonb_build_object('systems', (
       select coalesce(jsonb_object_agg(e.key, case when jsonb_typeof(e.value) = 'object' then e.value - 'password' else e.value end), '{}'::jsonb)
       from jsonb_each(sp.portals -> 'systems') e)) else '{}'::jsonb end
  || case when jsonb_typeof(sp.portals -> 'campuses') = 'object' then jsonb_build_object('campuses', (
       select coalesce(jsonb_object_agg(e.key, case when jsonb_typeof(e.value) = 'object' then e.value - 'password' else e.value end), '{}'::jsonb)
       from jsonb_each(sp.portals -> 'campuses') e)) else '{}'::jsonb end
  || case when jsonb_typeof(sp.portals -> 'custom') = 'array' then jsonb_build_object('custom', (
       select coalesce(jsonb_agg(case when jsonb_typeof(c.value) = 'object' then c.value - 'password' else c.value end order by c.ord), '[]'::jsonb)
       from jsonb_array_elements(sp.portals -> 'custom') with ordinality as c(value, ord))) else '{}'::jsonb end
where jsonb_typeof(sp.portals) = 'object'
  and (jsonb_path_exists(sp.portals, '$.systems.*.password')
    or jsonb_path_exists(sp.portals, '$.campuses.*.password')
    or jsonb_path_exists(sp.portals, '$.custom[*].password'));

alter table public.student_colleges drop column portal_password;

commit;

-- After: both must return 0.
-- select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'student_colleges' and column_name = 'portal_password';
-- select count(*) from public.student_profiles where jsonb_path_exists(portals, '$.systems.*.password') or jsonb_path_exists(portals, '$.campuses.*.password') or jsonb_path_exists(portals, '$.custom[*].password');
