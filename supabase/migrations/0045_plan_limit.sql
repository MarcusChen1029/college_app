-- Paid plans with ECPay, step 2 of 2 (spec docs/superpowers/specs/2026-10-29-payments-design.md, "Migration 0045").
-- Makes the Free plan's 5-college limit hold on the server, not only in the web app: a BEFORE INSERT trigger on
-- student_colleges refuses the 6th row of a student who has no active pass, for website sessions and AI connector
-- tokens alike (the ai_student_colleges view inserts into the same table, so add_college is limited too).
--
-- APPLY THIS ONLY AFTER THE NEW WEB CLIENT IS LIVE (0044 first, then the deploy, then 0045). The old client's first
-- sign-in merge inserts the whole local list in one upsert and aborts the entire merge on any insert error, so one
-- refused row would lose all of it. The new client works out how many colleges fit before it inserts.
--
-- Rule:
--   * Only anon / authenticated requests are limited. The service role, cron and the SQL Editor pass. The JWT's role
--     claim decides (PostgREST sets request.jwt.claims for every Data API request); the role setting is checked as
--     well, so a session that switched to a client role without claims is held to the same rule. (The function is
--     SECURITY DEFINER, so current_user would be its owner here; the role setting is the caller's.)
--   * A pass is active when some element of the owner's plan_windows has from <= today <= until, today being the
--     Asia/Taipei date (the same rule as activeWindow in web/lib/plans.ts). A malformed element counts as no window.
--     The plan flag column is not consulted: the windows are the source of truth.
--   * Otherwise the owner's rows in student_colleges are counted, custom colleges included (the web app compares the
--     same total), and the insert is refused when there are already 5. The count is serialised per owner with an
--     advisory lock (the enforce_row_cap pattern, 0041), and rows inserted earlier by the same statement are counted
--     too, so one statement of 6 rows fails as a whole.
--   * The trigger fires for every proposed row, also one that ON CONFLICT would turn into a no-op or an update, as
--     row_cap (0041) does. The web client only inserts colleges the account does not have yet.
-- Trigger order is alphabetical: oauth_guard (0041), plan_limit, row_cap (0041), so a malformed AI insert is refused
-- by the OAuth guard first. Nothing already over the limit is touched: updates and deletes are not limited, and a
-- student whose pass ended keeps their list (they can only add after deleting down).
-- Smoke test: supabase/patches/2026-10-29_plan_limit_smoke_test.sql.

create function public.enforce_plan_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  db_role text := coalesce(current_setting('role', true), '');
  today date := (now() at time zone 'Asia/Taipei')::date;
  windows jsonb;
  w jsonb;
  n bigint;
begin
  if not (jwt_role in ('anon', 'authenticated') or db_role in ('anon', 'authenticated')) then
    return new;
  end if;
  if new.user_id is null then return new; end if;

  select plan_windows into windows from public.student_profiles where user_id = new.user_id;
  for w in select value from jsonb_array_elements(coalesce(windows, '[]'::jsonb)) loop
    begin
      if (w ->> 'from')::date <= today and today <= (w ->> 'until')::date then
        return new; -- an active pass: no limit
      end if;
    exception when others then
      null; -- a malformed element (not an object, a missing or unreadable date) is no window
    end;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('plan_limit:' || new.user_id::text, 0));
  select count(*) into n from public.student_colleges where user_id = new.user_id;
  if n >= 5 then
    raise exception 'Plan limit reached: the Free plan holds 5 colleges.' using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $$;
revoke all on function public.enforce_plan_limit() from public, anon, authenticated;

create trigger plan_limit before insert on public.student_colleges
  for each row execute function public.enforce_plan_limit();
