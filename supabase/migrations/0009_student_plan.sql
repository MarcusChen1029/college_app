-- Subscription plan per student (no payment yet; students pick a plan themselves).
-- free = up to 3 colleges, junior = 10, senior = unlimited. Limits are enforced in the web app.
alter table public.student_profiles
  add column if not exists plan text not null default 'free' check (plan in ('free', 'junior', 'senior'));
