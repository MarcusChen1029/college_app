-- Countries the student is applying to, as ISO-style codes matching public.countries.code
-- (US, GB, ...). The first entry is the default region on the colleges page. Empty = not chosen yet.
alter table public.student_profiles
  add column if not exists target_regions jsonb not null default '[]'::jsonb check (jsonb_typeof(target_regions) = 'array');
