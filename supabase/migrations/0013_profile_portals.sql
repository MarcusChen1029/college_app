-- Logins for shared application systems (Common App, UC, ApplyTexas…), testing/aid sites,
-- campus portals and custom entries, shaped as PortalData in web/lib/portals.ts.
-- Plain text like student_colleges.portal_password (0007), protected by the per-user RLS on student_profiles.
alter table public.student_profiles
  add column if not exists portals jsonb not null default '{}'::jsonb;
