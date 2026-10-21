-- Activities and honors for the Common App (10 + 5) and UC application (20), shaped as
-- ActivityData in web/lib/activities.ts. Covered by the existing per-user RLS on student_profiles.
alter table public.student_profiles
  add column if not exists activities jsonb not null default '{}'::jsonb;
