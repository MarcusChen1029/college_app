-- Student-side recommender tracker: who a student asked for a letter, when, and whether it arrived.
-- Private to the student. RLS lets only the owner touch their rows, and no teacher RPC reads this table.
-- Limits and enums are mirrored in web/lib/recommenders.ts (validateRecommender); keep the two in step.

create table public.recommenders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null check (btrim(name) <> '' and char_length(name) <= 120),
  role            text not null default 'teacher' check (role in ('teacher','counselor','other')),
  subject_or_note text check (char_length(subject_or_note) <= 500),
  requested_on    date,
  due_on          date,
  status          text not null default 'to_ask' check (status in ('to_ask','asked','in_progress','submitted','thanked')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (requested_on is null or due_on is null or due_on >= requested_on)
);
create index on public.recommenders (user_id);

alter table public.recommenders enable row level security;
create policy "own recommenders select" on public.recommenders for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own recommenders insert" on public.recommenders for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own recommenders update" on public.recommenders for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own recommenders delete" on public.recommenders for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger touch before update on public.recommenders
  for each row execute function public.touch_updated_at();
