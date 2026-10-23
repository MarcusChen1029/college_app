-- Essays shared by many colleges: the Common App personal statement and the UC personal insight
-- questions (chosen prompt, status, Google Doc link), shaped as in web/lib/personal-essays.ts.
-- Covered by the per-user RLS on student_profiles.
alter table public.student_profiles
  add column if not exists essays jsonb not null default '{}'::jsonb;
