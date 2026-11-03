-- Connect AI free trial and the opt-in weekly email for students (PR 2 of the AI-subscribers work; spec
-- docs/superpowers/specs/2026-11-02-ai-subscribers-design.md sections 4 and 7, plan docs/superpowers/plans/2026-11-02-ai-subscribers.md
-- Tasks 8-10).
--
-- 1. Free trial of Connect AI. A Free account may connect an AI app and make 3 successful changes (writes and deletes)
--    before the pass message. The count is server-owned: one row per account in public.ai_trial_usage, created when the
--    first change is spent, and reachable only through two SECURITY DEFINER functions that the website session AND the
--    AI connector's OAuth token may call (the MCP server calls them with the student's own token, web/lib/mcp/tools.ts):
--      ai_trial_writes_left()    3 minus the changes used (3 when the account has no row yet); changes nothing.
--      consume_ai_trial_write()  spends one change in a single atomic statement; returns what is left (2, 1, 0) or -1 when
--                                none was left (the limit is reached; the count never goes past 3).
--    The limit 3 is a literal inside both functions (no parameter), so no caller can raise it; the web code's constant
--    must match it. Both raise 42501 when no user is signed in (service role, the SQL Editor).
--    Student accounts only. The trial belongs to students: both functions look the caller up in public.user_roles and
--    answer as if there were no counter unless the row says 'student' (ai_trial_writes_left() returns NULL,
--    consume_ai_trial_write() returns -1 and spends nothing; the MCP server reads a NULL as "no counter" and blocks the
--    account as before the trial). Why this matters: change_my_role (0025, 0041) keeps the other side's data, so a teacher who
--    used to be a student still has a student_profiles row, the MCP server only refuses a missing profile row, and an
--    AI token can't read user_roles; without this check a student who approved Connect AI and then switched to teacher
--    would keep a working AI connection on the teacher account. user_roles is queried directly, not through is_role(),
--    because is_role() returns false for an OAuth client by design (0041) and the AI token is the caller that must pass.
--    Why a table of its own and not a student_profiles column (the first draft): that design collides with three guards.
--    guard_plan_columns (0045) resets plan columns by the JWT role, and the claims stay "authenticated" inside a
--    SECURITY DEFINER function, so the function's own increment would be reset; guard_oauth_student_writes (0041) raises
--    when an OAuth request changes a column outside its allow-list (the claims keep client_id inside the function); and
--    the touch trigger would bump the profile's updated_at on every trial write. A separate table has none of those
--    triggers and needs no change to ai_student_profiles or to the guards.
--    The table has RLS on, no policy and no client grant: a client (website, AI token or anon) can neither read nor write
--    it directly, only through the two functions, and each function only ever touches the caller's own row.
-- 2. api_request_guard() (0043 version) gains exactly two allowed paths for an OAuth-client token:
--    rpc/ai_trial_writes_left and rpc/consume_ai_trial_write. Everything else is refused as before: the two views, the
--    two transcript tables and these two RPCs are all an AI token can reach. pgrst.db_pre_request is already set (0041).
-- 3. Weekly student email (opt-in). student_profiles.weekly_digest (default false) is the student's choice, made in
--    Settings. student_profiles keeps its 0001 table-level grants and "own profile" policy (see 0049), so the student
--    reads and writes the column through the same path as every other profile field; an AI token can't change it
--    (0041's write allow-list refuses any column it doesn't list, and the base table is closed to OAuth since 0043).
--    student_digest_log has one row per student per week that an email went out (service role only), and
--    due_student_digests(p_today) tells the deadline-reminders Edge Function who is due: weekly_digest on, a student role,
--    an email address, and no log row for the week p_today falls in. The week starts on Monday; the caller passes the
--    Taipei date and logs exactly the week_start it was given back (one row per student per week_start). The function
--    does not look at the weekday: the caller decides on which days it sends. It mirrors due_teacher_digests (0029).
--
-- ORDER: apply this BEFORE deploying PR 2's web code. That code's copy and trial UI (home, pricing, Connect AI, the consent
-- page) assume the trial exists. Without this migration the site still loads (the profile select falls back when
-- weekly_digest is missing) and, until the two functions exist, the MCP server keeps Free accounts fully blocked, as today,
-- but the pages would promise a trial that isn't there. The code that is live now is unaffected by this migration: the column
-- has a default, the new tables are unused by it, and the guard only gains two allowed paths.
-- Smoke test: supabase/patches/2026-11-02_ai_trial_weekly_smoke_test.sql (paste this file right after its "begin;" to
-- dry-run both; it ends in a deliberate error, so nothing persists).
-- Undo, if ever needed (nothing else depends on these objects): drop function public.due_student_digests(date);
-- drop table public.student_digest_log; alter table public.student_profiles drop column weekly_digest; drop function
-- public.consume_ai_trial_write(); drop function public.ai_trial_writes_left(); drop table public.ai_trial_usage; then
-- re-create public.api_request_guard() from 0043.

-- ───────────── 1. Connect AI trial counter ─────────────

create table public.ai_trial_usage (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  writes_used smallint not null default 0 check (writes_used between 0 and 100),
  updated_at  timestamptz not null default now()
);

-- No client grant and no policy (0044: a new table gets no default grants for anon/authenticated; revoked again here to
-- be explicit). The service role keeps full access for support, like the 0045 / 0050 tables.
revoke all on public.ai_trial_usage from public, anon, authenticated;
alter table public.ai_trial_usage enable row level security;
grant all on public.ai_trial_usage to service_role;

comment on table public.ai_trial_usage is
  'Connect AI free-trial changes spent per account (0051). Written only by public.consume_ai_trial_write; no client access.';

create function public.ai_trial_writes_left() returns smallint
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  -- Student accounts only (see the header): NULL = this account has no trial counter.
  if not exists (select 1 from public.user_roles r where r.user_id = uid and r.role = 'student') then return null; end if;
  return coalesce((select greatest(3 - u.writes_used, 0) from public.ai_trial_usage u where u.user_id = uid), 3)::smallint;
end $$;

-- One statement does the insert-or-increment, so two changes made at the same moment cannot both spend the last one:
-- the second waits on the row, then sees writes_used = 3 and gets no row back.
create function public.consume_ai_trial_write() returns smallint
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  remaining smallint;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  -- Student accounts only (see the header): any other account gets -1 and nothing is spent or created.
  if not exists (select 1 from public.user_roles r where r.user_id = uid and r.role = 'student') then return -1; end if;
  insert into public.ai_trial_usage as t (user_id, writes_used) values (uid, 1)
  on conflict (user_id) do update set writes_used = t.writes_used + 1, updated_at = now()
  where t.writes_used < 3
  returning (3 - t.writes_used)::smallint into remaining;
  return coalesce(remaining, -1)::smallint;
end $$;

revoke all on function public.ai_trial_writes_left(), public.consume_ai_trial_write() from public, anon, authenticated;
grant execute on function public.ai_trial_writes_left(), public.consume_ai_trial_write() to authenticated;

comment on function public.ai_trial_writes_left() is
  'Free changes left in the Connect AI trial for the caller: 3 minus the changes spent, NULL when the caller is not a student account (0051). Callable by website sessions and AI-connector tokens.';
comment on function public.consume_ai_trial_write() is
  'Spends one Connect AI trial change for a student account; returns the changes left, or -1 when none were left or the caller is not a student (0051). The limit 3 is fixed here.';

-- ───────────── 2. the pre-request hook lets an AI token call exactly those two functions ─────────────

-- Same as 0043 section 4, plus the two rpc/ paths (request.path is '/rpc/<function>' for a function call).
create or replace function public.api_request_guard() returns void
language plpgsql stable set search_path = '' as $$
declare
  p text;
begin
  if not public.is_oauth_client() then return; end if;
  p := regexp_replace(coalesce(current_setting('request.path', true), ''), '^(/rest/v1)?/+', '');
  if p in ('ai_student_profiles', 'ai_student_colleges', 'transcript_schools', 'transcript_courses',
           'rpc/ai_trial_writes_left', 'rpc/consume_ai_trial_write') then return; end if;
  raise exception 'Connected AI apps can only use the student tables.' using errcode = '42501';
end $$;

-- ───────────── 3. weekly student email ─────────────

alter table public.student_profiles add column weekly_digest boolean not null default false;
comment on column public.student_profiles.weekly_digest is
  'The student opted in to the weekly email (Settings > reminders). Sent by the deadline-reminders Edge Function. 0051.';

-- One row per weekly email sent. Used only by the Edge Function (service_role); RLS on, no policies, no client grants.
-- week_start is the Monday of the week (the value due_student_digests returned); update is granted so a plain upsert works
-- as well as insert ... on conflict do nothing.
create table public.student_digest_log (
  user_id    uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, week_start)
);
revoke all on public.student_digest_log from public, anon, authenticated;
alter table public.student_digest_log enable row level security;
grant select, insert, update, delete on public.student_digest_log to service_role;

comment on table public.student_digest_log is
  'One row per student per week (Monday date) that the weekly email went out (0051). Service role only.';

-- Students due the weekly email for the week p_today (a Taipei date) falls in. A null p_today means today in Taipei.
create function public.due_student_digests(p_today date)
returns table (user_id uuid, email text, week_start date)
language sql stable security definer set search_path = '' as $$
  with w as (
    select date_trunc('week', coalesce(p_today, (now() at time zone 'Asia/Taipei')::date)::timestamp)::date as week_start
  )
  select sp.user_id, u.email::text, w.week_start
    from public.student_profiles sp
    join auth.users u on u.id = sp.user_id and coalesce(btrim(u.email), '') <> ''
    cross join w
   where sp.weekly_digest
     and exists (select 1 from public.user_roles r where r.user_id = sp.user_id and r.role = 'student')
     and not exists (select 1 from public.student_digest_log g where g.user_id = sp.user_id and g.week_start = w.week_start)
   order by sp.user_id
$$;

revoke all on function public.due_student_digests(date) from public, anon, authenticated;
grant execute on function public.due_student_digests(date) to service_role;
