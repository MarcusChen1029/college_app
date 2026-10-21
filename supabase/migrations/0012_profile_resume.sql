-- Resume generator settings: contact header (name, email, phone, school, class year) and
-- display options, shaped as in web/lib/resume.ts. Covered by the per-user RLS on student_profiles.
alter table public.student_profiles
  add column if not exists resume jsonb not null default '{}'::jsonb;
