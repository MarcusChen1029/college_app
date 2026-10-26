-- Student-side scholarship tracker: scholarships a student found and typed in themselves (we ship no scholarship data).
-- Private to the student. RLS lets only the owner touch their rows, and no teacher RPC reads this table.
-- Limits and enums are mirrored in web/lib/scholarships.ts (validateScholarship); keep the two in step.

create table public.scholarships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (btrim(name) <> '' and char_length(name) <= 200),
  provider    text check (char_length(provider) <= 200),
  amount_usd  integer check (amount_usd between 0 and 10000000),
  deadline    date,
  url         text check (char_length(url) <= 2000 and url ~* '^https?://\S+$'),
  status      text not null default 'considering' check (status in ('considering','applying','submitted','awarded','declined')),
  notes       text check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.scholarships (user_id);

alter table public.scholarships enable row level security;
create policy "own scholarships select" on public.scholarships for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own scholarships insert" on public.scholarships for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own scholarships update" on public.scholarships for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own scholarships delete" on public.scholarships for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger touch before update on public.scholarships
  for each row execute function public.touch_updated_at();

-- Reminder emails (deadline-reminders Edge Function). reminder_log.deadline_id points at public.deadlines, so
-- scholarship reminders get their own log. due_date is part of the key so moving a deadline re-arms its reminders.
create table public.scholarship_reminder_log (
  user_id        uuid not null references auth.users(id) on delete cascade,
  scholarship_id uuid not null references public.scholarships(id) on delete cascade,
  due_date       date not null,
  days_before    smallint not null,
  sent_at        timestamptz not null default now(),
  primary key (user_id, scholarship_id, due_date, days_before)
);
create index on public.scholarship_reminder_log (scholarship_id);
alter table public.scholarship_reminder_log enable row level security;
create policy "own scholarship reminders" on public.scholarship_reminder_log for select to authenticated
  using ((select auth.uid()) = user_id);

-- Scholarship deadlines due on `today`: same rule as due_reminders() for colleges (exactly N days away, N one of
-- the student's reminder_days, reminders on), for scholarships the student is still considering or applying to.
create function public.due_scholarship_reminders(today date default current_date)
returns table (user_id uuid, email text, scholarship_id uuid, days_before smallint, due_date date, name text, provider text)
language sql stable security definer set search_path = '' as $$
  select s.user_id, u.email, s.id, (s.deadline - today)::smallint, s.deadline, s.name, s.provider
  from public.scholarships s
  join public.student_profiles sp on sp.user_id = s.user_id and sp.reminder_emails
  join auth.users u on u.id = s.user_id and u.email is not null
  where s.deadline is not null
    and s.status in ('considering', 'applying')
    and (s.deadline - today) = any (sp.reminder_days)
    and not exists (select 1 from public.scholarship_reminder_log rl
                    where rl.user_id = s.user_id and rl.scholarship_id = s.id
                      and rl.due_date = s.deadline and rl.days_before = (s.deadline - today))
  order by s.user_id, s.deadline
$$;
revoke execute on function public.due_scholarship_reminders(date) from public, anon, authenticated;
grant execute on function public.due_scholarship_reminders(date) to service_role;
