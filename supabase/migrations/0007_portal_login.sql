-- Application portal login per listed college (portal_url already exists from 0001).
-- Plain text, protected only by the per-user RLS on student_colleges; the UI tells students
-- not to reuse an important password here.
alter table public.student_colleges
  add column if not exists portal_username text,
  add column if not exists portal_password text;
