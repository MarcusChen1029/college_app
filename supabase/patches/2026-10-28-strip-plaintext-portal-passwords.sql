-- Removes plaintext portal passwords that are already in the encrypted store (portal_passwords, migration 0038):
-- student_colleges.portal_password is set to null, and the "password" key is removed from student_profiles.portals
-- (systems.*, campuses.*, custom[]), ONLY where the matching slot exists in portal_passwords. A password that was not
-- copied is never touched. Runbook step 5 (docs/superpowers/plans/2026-10-28-portal-password-encryption.md): run it
-- only after migration 0038, scripts/backfill-portal-passwords.mjs and the deploy, and after checking the site.
-- These are UPDATEs: run the file in the dashboard SQL Editor (the Supabase MCP waits for approval on UPDATE).
--
-- Slots, as web/lib/portal-slots.ts builds them:
--   student_colleges row  -> 'college:' || (id for a custom college, else institution_id)
--   portals.systems.<k>   -> 'system:' || k        portals.campuses.<k> -> 'campus:' || k
--   portals.custom[i]     -> 'custom:' || (custom[i]->>'id')
--
-- BEFORE and AFTER: run these two counts. Before the updates, "with_vault_copy" is what will be stripped and
-- "without_vault_copy" is what stays; it should be 0 after a backfill. If it isn't, run the backfill again; what is
-- still left is a password the site can't place (an id or key outside the slot format, or over 512 characters):
-- decide about those before the later drop patch, which removes them. After the updates, "with_vault_copy" is 0.
--
-- select count(*) filter (where v.slot is not null) as with_vault_copy,
--        count(*) filter (where v.slot is null)     as without_vault_copy
-- from public.student_colleges sc
-- left join public.portal_passwords v
--   on v.user_id = sc.user_id
--  and v.slot = 'college:' || (case when sc.custom is not null and sc.custom <> 'null'::jsonb then sc.id else sc.institution_id end)::text
-- where coalesce(sc.portal_password, '') <> '';
--
-- with logins as (
--   select sp.user_id, 'system:' || e.key as slot
--   from public.student_profiles sp,
--        jsonb_each(case when jsonb_typeof(sp.portals -> 'systems') = 'object' then sp.portals -> 'systems' else '{}'::jsonb end) e
--   where coalesce(e.value ->> 'password', '') <> ''
--   union all
--   select sp.user_id, 'campus:' || e.key
--   from public.student_profiles sp,
--        jsonb_each(case when jsonb_typeof(sp.portals -> 'campuses') = 'object' then sp.portals -> 'campuses' else '{}'::jsonb end) e
--   where coalesce(e.value ->> 'password', '') <> ''
--   union all
--   select sp.user_id, 'custom:' || (c ->> 'id')
--   from public.student_profiles sp,
--        jsonb_array_elements(case when jsonb_typeof(sp.portals -> 'custom') = 'array' then sp.portals -> 'custom' else '[]'::jsonb end) c
--   where coalesce(c ->> 'password', '') <> ''
-- )
-- select count(*) filter (where v.slot is not null) as with_vault_copy,
--        count(*) filter (where v.slot is null)     as without_vault_copy
-- from logins l
-- left join public.portal_passwords v on v.user_id = l.user_id and v.slot = l.slot;

begin;

update public.student_colleges sc
set portal_password = null
where sc.portal_password is not null
  and exists (
    select 1
    from public.portal_passwords v
    where v.user_id = sc.user_id
      and v.slot = 'college:' || (case when sc.custom is not null and sc.custom <> 'null'::jsonb then sc.id else sc.institution_id end)::text
  );

-- Rebuilds systems / campuses / custom with "password" removed from the logins whose slot is in the store; every
-- other key and value (links, usernames, progress, logins without a stored copy) stays as it was.
update public.student_profiles sp
set portals = sp.portals
  || case when jsonb_typeof(sp.portals -> 'systems') = 'object' then jsonb_build_object('systems', (
       select coalesce(jsonb_object_agg(e.key,
                case when jsonb_typeof(e.value) = 'object'
                      and exists (select 1 from public.portal_passwords v where v.user_id = sp.user_id and v.slot = 'system:' || e.key)
                     then e.value - 'password' else e.value end), '{}'::jsonb)
       from jsonb_each(sp.portals -> 'systems') e)) else '{}'::jsonb end
  || case when jsonb_typeof(sp.portals -> 'campuses') = 'object' then jsonb_build_object('campuses', (
       select coalesce(jsonb_object_agg(e.key,
                case when jsonb_typeof(e.value) = 'object'
                      and exists (select 1 from public.portal_passwords v where v.user_id = sp.user_id and v.slot = 'campus:' || e.key)
                     then e.value - 'password' else e.value end), '{}'::jsonb)
       from jsonb_each(sp.portals -> 'campuses') e)) else '{}'::jsonb end
  || case when jsonb_typeof(sp.portals -> 'custom') = 'array' then jsonb_build_object('custom', (
       select coalesce(jsonb_agg(
                case when jsonb_typeof(c.value) = 'object'
                      and exists (select 1 from public.portal_passwords v where v.user_id = sp.user_id and v.slot = 'custom:' || (c.value ->> 'id'))
                     then c.value - 'password' else c.value end order by c.ord), '[]'::jsonb)
       from jsonb_array_elements(sp.portals -> 'custom') with ordinality as c(value, ord))) else '{}'::jsonb end
where jsonb_typeof(sp.portals) = 'object'
  and (jsonb_path_exists(sp.portals, '$.systems.*.password')
    or jsonb_path_exists(sp.portals, '$.campuses.*.password')
    or jsonb_path_exists(sp.portals, '$.custom[*].password'));

commit;
