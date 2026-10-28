-- LAST step of the portal password move (runbook step 5, docs/superpowers/plans/2026-10-28-portal-password-encryption.md):
-- drops student_colleges.portal_password, and removes the empty "password" keys still left in student_profiles.portals.
-- Run it only when 2026-10-28-portal-plaintext-counts.sql shows 0 everywhere, and no old build of the site is still
-- in use. It REFUSES to run (raises, changes nothing) while any non-empty plaintext password is left in either place,
-- so it can't delete one that was never copied. Supabase backups keep old values until they age out.
-- DDL + UPDATE: run it in the dashboard SQL Editor.

begin;

do $$
declare
  c bigint;
  p bigint;
begin
  select count(*) into c from public.student_colleges where coalesce(portal_password, '') <> '';
  select count(*) into p from public.student_profiles sp cross join lateral public.portal_password_values(sp.portals);
  if c + p > 0 then
    raise exception 'Not dropping: % college and % profile plaintext passwords are still waiting to be moved.', c, p;
  end if;
end $$;

-- 0043's trigger and compare-and-set function depend on the column.
drop trigger forbid_plaintext_password on public.student_colleges;
drop function public.forbid_plaintext_college_password();
drop function public.strip_college_portal_password(uuid, uuid, text);

alter table public.student_colleges drop column portal_password;

-- Only empty values are left (the check above); take the keys out too.
update public.student_profiles
set portals = public.portals_without_passwords(portals)
where jsonb_path_exists(portals, '$.systems.*.password')
   or jsonb_path_exists(portals, '$.campuses.*.password')
   or jsonb_path_exists(portals, '$.custom[*].password');

commit;

-- After: both must return 0.
-- select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'student_colleges' and column_name = 'portal_password';
-- select count(*) from public.student_profiles where jsonb_path_exists(portals, '$.systems.*.password') or jsonb_path_exists(portals, '$.campuses.*.password') or jsonb_path_exists(portals, '$.custom[*].password');
