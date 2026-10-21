-- Section scores (SAT/ACT breakdown, English tests with sub-scores) and the "interested"
-- shortlist (college slugs considered but not on the list). Shapes are defined in web/lib/scores.ts
-- and web/lib/fit.ts; covered by the existing per-user RLS on student_profiles.
alter table public.student_profiles
  add column if not exists test_details jsonb not null default '{}'::jsonb,
  add column if not exists interested jsonb not null default '[]'::jsonb check (jsonb_typeof(interested) = 'array');
