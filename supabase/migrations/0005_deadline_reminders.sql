-- Deadline reminder emails.
-- A daily pg_cron job calls the `deadline-reminders` Edge Function, which asks
-- public.due_reminders() what is due, emails one digest per student and records
-- each reminder in reminder_log so nothing is sent twice.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.student_profiles
  add column reminder_emails boolean not null default true,
  add column reminder_days smallint[] not null default '{14,3,1}'
    check (array_length(reminder_days, 1) between 1 and 5 and 0 < all (reminder_days) and 60 >= all (reminder_days));

create table public.reminder_log (
  user_id     uuid not null references auth.users(id) on delete cascade,
  deadline_id uuid not null references public.deadlines(id) on delete cascade,
  days_before smallint not null,
  sent_at     timestamptz not null default now(),
  primary key (user_id, deadline_id, days_before)
);
create index on public.reminder_log (deadline_id);
alter table public.reminder_log enable row level security;
create policy "own reminders" on public.reminder_log for select to authenticated
  using ((select auth.uid()) = user_id);

-- Shared secret between the cron job and the Edge Function. Not exposed through the API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.app_config (key text primary key, value text not null);
insert into private.app_config (key, value)
  values ('reminders_cron_secret', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;

create function public.check_cron_secret(secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.app_config where key = 'reminders_cron_secret' and value = secret)
$$;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.check_cron_secret(text) to service_role;

-- Reminders due on `today`: a deadline for a college on the student's list that is exactly
-- N days away, where N is one of the student's reminder_days. Application deadlines are
-- limited to the student's chosen plan (if any) and skipped once they've applied.
create function public.due_reminders(today date default current_date)
returns table (
  user_id uuid, email text, deadline_id uuid, days_before smallint, due_date date,
  college_name text, college_slug text, deadline_label text, kind text, plan_key text
)
language sql stable security definer set search_path = '' as $$
  select sc.user_id, u.email, d.id, (d.due_date - today)::smallint, d.due_date,
         i.name, i.slug,
         coalesce(d.label, ap.label, initcap(replace(d.kind, '_', ' '))), d.kind, d.plan_key
  from public.student_colleges sc
  join public.student_profiles sp on sp.user_id = sc.user_id and sp.reminder_emails
  join auth.users u on u.id = sc.user_id and u.email is not null
  join public.institutions i on i.id = sc.institution_id
  join public.deadlines d on d.institution_id = sc.institution_id and d.due_date is not null
  left join public.application_plans ap on ap.key = d.plan_key
  where (d.due_date - today) = any (sp.reminder_days)
    and sc.status not in ('withdrawn', 'rejected', 'enrolled')
    and (d.kind <> 'application' or (
          sc.status in ('researching', 'planning', 'in_progress')
          and (sc.plan_key is null or d.plan_key = sc.plan_key)))
    and (d.kind <> 'deposit' or sc.status = 'admitted')
    and not exists (select 1 from public.reminder_log rl
                    where rl.user_id = sc.user_id and rl.deadline_id = d.id and rl.days_before = (d.due_date - today))
  order by sc.user_id, d.due_date
$$;
revoke execute on function public.due_reminders(date) from public, anon, authenticated;
grant execute on function public.due_reminders(date) to service_role;

-- Daily at 14:07 UTC (morning in the Americas, evening in Asia).
select cron.schedule(
  'deadline-reminders',
  '7 14 * * *',
  $$
  select net.http_post(
    url := 'https://eyvmtaggayqizllaseiu.supabase.co/functions/v1/deadline-reminders',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select value from private.app_config where key = 'reminders_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000)
  $$
);
