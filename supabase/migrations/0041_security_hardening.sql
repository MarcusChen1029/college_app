-- Security hardening from the 2026-10-28 audit (SRV-1, DB-2, DB-3, DB-5, DB-7, DB-8, DB-10, DB-14).
--
-- 1. AI connector containment (SRV-1). The MCP server (web/lib/mcp/tools.ts) calls the Data API with the student's
--    OAuth access token: an ordinary Supabase JWT (role "authenticated") that also carries a client_id claim. Website
--    sessions never carry client_id. Without this migration that token could do everything the student can: mint
--    extension tokens and share links, redeem join codes, switch roles, change reminder settings. Five layers now keep
--    it to what tools.ts actually does (student_profiles, student_colleges, transcript_schools, transcript_courses):
--    a. api_request_guard() runs before every Data API request (PostgREST db-pre-request) and refuses an OAuth-client
--       token on any path except those four tables and the two views of (e). This is the central gate.
--    b. A RESTRICTIVE policy "no_oauth_clients" on every other user-data table.
--    c. is_role() is false for an OAuth client, so every role-gated RPC refuses it; every other authenticated RPC calls
--       refuse_oauth_client() first. All 33 client RPCs refuse an OAuth client even without (a).
--    d. guard_oauth_student_writes() limits an OAuth client to the columns and operations tools.ts uses
--       (no portal logins, plan, reminders, essays; no deletes except transcript courses).
--    e. Views ai_student_profiles / ai_student_colleges hold only the columns tools.ts reads or writes (no portals,
--       portal_url, portal_username, portal_password, reminder settings, essays, aid offer). The deployed tools use
--       them; 0043 (applied after that deploy) then refuses the two base tables to OAuth clients, so saved-login
--       usernames and links are out of an AI token's reach. Until 0043, (a) allows both, for the MCP code still live.
--    A new MCP tool that needs another table, RPC or column must widen (a), (d) and (e) in a new migration.
-- 2. Write limits (DB-2): size CHECKs (NOT VALID: existing rows are not re-checked, but every new or changed row is),
--    per-account row caps, and housekeeping of old revoked/expired share links, extension tokens and join codes.
-- 3. Join codes: per-user lock around the rate limit (DB-3), unbiased CSPRNG codes (DB-10), role-row locks (DB-14).
-- 4. New teacher links do not share essays until the student turns it on (DB-5).
-- 5. Share links expire after 180 days (DB-8).
-- 6. New functions in public are no longer executable by PUBLIC/anon/authenticated by default (DB-7).
--
-- Rollback of the pre-request hook alone (if the Data API misbehaves after applying this):
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';
-- Layers (b)-(d) keep protecting without it.

-- ───────────── 6. default privileges (first, so every function below is granted explicitly) ─────────────

-- Postgres grants EXECUTE to PUBLIC on every new function, and this project's per-schema defaults also granted it
-- to anon and authenticated. Existing functions keep their grants; new ones must be granted explicitly.
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- ───────────── 1. AI connector containment ─────────────

-- True when the request's JWT came from the OAuth server (it has a client_id claim). Website sessions, anon and
-- service-role requests, cron and the SQL editor have none.
create function public.is_oauth_client() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ? 'client_id', false)
$$;
revoke all on function public.is_oauth_client() from public;
grant execute on function public.is_oauth_client() to anon, authenticated, service_role;

-- Raises for an OAuth client. Called first by the client RPCs below.
create function public.refuse_oauth_client() returns void
language plpgsql stable set search_path = '' as $$
begin
  if public.is_oauth_client() then
    raise exception 'Not available to connected AI apps. Do this on the website.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.refuse_oauth_client() from public, anon, authenticated;

-- (a) Runs before every Data API request, as the request's role, after PostgREST has set request.path
-- (the raw path, e.g. '/student_profiles' or '/rpc/create_share_link') and request.jwt.claims.
-- An OAuth-client token may only reach the four tables web/lib/mcp/tools.ts used before (e) and the two views of (e).
-- 0043 drops the two base tables from this list once the code that uses the views is deployed.
create function public.api_request_guard() returns void
language plpgsql stable set search_path = '' as $$
declare
  p text;
begin
  if not public.is_oauth_client() then return; end if;
  p := regexp_replace(coalesce(current_setting('request.path', true), ''), '^(/rest/v1)?/+', '');
  if p in ('student_profiles', 'student_colleges', 'transcript_schools', 'transcript_courses',
           'ai_student_profiles', 'ai_student_colleges') then return; end if;
  raise exception 'Connected AI apps can only use the student tables.' using errcode = '42501';
end $$;
revoke all on function public.api_request_guard() from public;
grant execute on function public.api_request_guard() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.api_request_guard';
notify pgrst, 'reload config';

-- (b) Every table that holds per-user data, except the four MCP tables, refuses OAuth clients outright.
-- Found from the catalog (a user_id / teacher_id / student_id column), so a table added before this migration runs
-- (e.g. 0040 portal_passwords) is covered too. Tables with no grant or policy for authenticated are already closed;
-- the extra policy there is harmless.
do $$
declare t text;
begin
  for t in
    select distinct c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and a.attname in ('user_id', 'teacher_id', 'student_id')
       and c.relname not in ('student_profiles', 'student_colleges', 'transcript_schools', 'transcript_courses')
     order by c.relname
  loop
    execute format(
      'create policy no_oauth_clients on public.%I as restrictive for all to authenticated '
      'using (not (select public.is_oauth_client())) with check (not (select public.is_oauth_client()))', t);
  end loop;
end $$;

-- (c) Role checks fail for an OAuth client: teacher_*, task, digest, token and share-link RPCs all start with
-- is_role(), and is_linked() / share_link_student() use it too.
create or replace function public.is_role(p_user uuid, p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not public.is_oauth_client()
     and exists (select 1 from public.user_roles where user_id = p_user and role = p_role)
$$;

-- (d) Column/operation allow-list for OAuth clients on the MCP tables. Mirrors web/lib/mcp/tools.ts:
--   student_profiles: update only (profileColumns, interested, activities, resume); never insert or delete.
--   student_colleges: insert (add_college) and update of plan_key / status / notes / checklist; never delete.
--   transcript_schools: insert only (add_transcript_courses); never delete (it would take the courses with it).
--   transcript_courses: insert / update / delete (no trigger).
-- Everything else (portals, portal_*, aid_offer_usd, custom, plan, reminder_*, essays, display_name, ...) is refused.
-- A new column with a non-null default on student_colleges must be added to the insert list if AI inserts should
-- keep working.
create function public.guard_oauth_student_writes() returns trigger
language plpgsql set search_path = '' as $$
declare
  ok text[];
begin
  if not public.is_oauth_client() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Connected AI apps cannot delete from %.', tg_table_name using errcode = '42501';
  end if;
  if tg_table_name = 'student_profiles' then
    if tg_op = 'INSERT' then
      raise exception 'Connected AI apps cannot create a profile.' using errcode = '42501';
    end if;
    ok := array['sat_total', 'act_composite', 'gpa_unweighted', 'gpa_weighted', 'is_international', 'target_regions',
                'test_details', 'interested', 'activities', 'resume'];
  elsif tg_table_name = 'student_colleges' then
    ok := array['plan_key', 'status', 'notes', 'checklist'];
    if tg_op = 'INSERT' then
      if jsonb_strip_nulls(to_jsonb(new) - (ok || array['id', 'user_id', 'institution_id', 'created_at', 'updated_at'])) <> '{}'::jsonb then
        raise exception 'Connected AI apps cannot set those fields.' using errcode = '42501';
      end if;
      return new;
    end if;
  else
    raise exception 'guard_oauth_student_writes: unexpected % on %', tg_op, tg_table_name;
  end if;
  -- UPDATE: every column outside the allow-list must stay as it was (updated_at is set by the touch trigger).
  if (to_jsonb(new) - ok - 'updated_at') is distinct from (to_jsonb(old) - ok - 'updated_at') then
    raise exception 'Connected AI apps cannot change those fields.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_oauth_student_writes() from public, anon, authenticated;

create trigger oauth_guard before insert or update or delete on public.student_profiles
  for each row execute function public.guard_oauth_student_writes();
create trigger oauth_guard before insert or update or delete on public.student_colleges
  for each row execute function public.guard_oauth_student_writes();
create trigger oauth_guard before delete on public.transcript_schools
  for each row execute function public.guard_oauth_student_writes();

-- (e) The AI tools' views. RLS is per row, so on the base tables an OAuth token could still select portals (saved-login
-- usernames, links, progress), portal_url / portal_username, reminder settings and essays. These views hold exactly the
-- columns web/lib/mcp/tools.ts reads or writes (AI_PROFILE_COLUMNS / AI_COLLEGE_COLUMNS in web/lib/student-rows.ts;
-- slug replaces the institutions(slug) embed), and their grants are exactly its operations:
--   ai_student_profiles: select; update of the guard_oauth_student_writes columns. No insert, no delete.
--   ai_student_colleges: select; insert (add_college); update of plan_key / status / notes / checklist. No delete.
-- SECURITY DEFINER views on purpose (owned by postgres, no security_invoker), so the Supabase advisor reports them as
-- security_definer_view; that is expected. The caller needs no privilege on the base tables, which lets 0043 take the
-- base tables away from OAuth clients while the views keep working. postgres bypasses RLS, so the isolation is the
-- view's own: WHERE user_id = the caller (auth.uid() reads the request's JWT, not the view owner), WITH LOCAL CHECK
-- OPTION (an insert or update can't produce another user's row: SQLSTATE 44000) and security_barrier (a caller's
-- filter functions can't see rows before that WHERE). Writes reach the base-table triggers (oauth_guard, row_cap,
-- touch) with the caller's JWT claims, so (d) still applies to them.
create view public.ai_student_profiles with (security_barrier = true) as
  select user_id, sat_total, act_composite, gpa_unweighted, gpa_weighted, is_international, target_regions, plan,
         test_details, interested, activities, resume, updated_at
    from public.student_profiles
   where user_id = (select auth.uid())
  with local check option;

create view public.ai_student_colleges with (security_barrier = true) as
  select sc.user_id, sc.institution_id, (select i.slug from public.institutions i where i.id = sc.institution_id) as slug,
         sc.plan_key, sc.status, sc.notes, sc.checklist, sc.created_at, sc.updated_at
    from public.student_colleges sc
   where sc.user_id = (select auth.uid())
  with local check option;

alter view public.ai_student_profiles owner to postgres;
alter view public.ai_student_colleges owner to postgres;
comment on view public.ai_student_profiles is
  'AI connector (MCP OAuth) view of the caller''s profile: no saved logins, reminders or essays. Security definer on purpose (0041 section 1e).';
comment on view public.ai_student_colleges is
  'AI connector (MCP OAuth) view of the caller''s list: no saved logins, aid offer or custom-college details. Security definer on purpose (0041 section 1e).';

-- Supabase's default privileges grant everything on a new relation in public to anon, authenticated and service_role.
revoke all on public.ai_student_profiles, public.ai_student_colleges from public, anon, authenticated, service_role;
grant select on public.ai_student_profiles to authenticated;
grant update (sat_total, act_composite, gpa_unweighted, gpa_weighted, is_international, target_regions, test_details,
              interested, activities, resume)
  on public.ai_student_profiles to authenticated;
grant select on public.ai_student_colleges to authenticated;
grant insert (user_id, institution_id, plan_key, status, notes, checklist) on public.ai_student_colleges to authenticated;
grant update (plan_key, status, notes, checklist) on public.ai_student_colleges to authenticated;

-- ───────────── 2. write limits ─────────────

-- Size caps. One profile row per student, so its jsonb gets 256 KB per column; rows that repeat per college or per
-- course get less, so one account's worst case stays in the tens of MB on a 500 MB free plan. Names and labels <= 120
-- characters (school names 200, like transcript_schools.name), notes <= 10 000. Several transcript, recommender,
-- scholarship and note columns already had caps (0026, 0027, 0024, 0030).
alter table public.student_profiles
  add constraint student_profiles_display_name_len check (char_length(display_name) <= 120) not valid,
  add constraint student_profiles_english_test_key_len check (char_length(english_test_key) <= 120) not valid,
  add constraint student_profiles_intended_category_len check (char_length(intended_category) <= 120) not valid,
  add constraint student_profiles_test_details_size check (octet_length(test_details::text) <= 262144) not valid,
  add constraint student_profiles_interested_size check (octet_length(interested::text) <= 262144) not valid,
  add constraint student_profiles_activities_size check (octet_length(activities::text) <= 262144) not valid,
  add constraint student_profiles_resume_size check (octet_length(resume::text) <= 262144) not valid,
  add constraint student_profiles_portals_size check (octet_length(portals::text) <= 262144) not valid,
  add constraint student_profiles_target_regions_size check (octet_length(target_regions::text) <= 262144) not valid,
  add constraint student_profiles_app_essays_size check (octet_length(app_essays::text) <= 262144) not valid,
  add constraint student_profiles_essays_size check (octet_length(essays::text) <= 262144) not valid,
  add constraint student_profiles_study_fields_size check (octet_length(study_fields::text) <= 262144) not valid;

alter table public.student_colleges
  add constraint student_colleges_notes_len check (char_length(notes) <= 10000) not valid,
  add constraint student_colleges_plan_key_len check (char_length(plan_key) <= 120) not valid,
  add constraint student_colleges_checklist_size check (octet_length(checklist::text) <= 65536) not valid,
  add constraint student_colleges_custom_size check (octet_length(custom::text) <= 16384) not valid;

-- The saved-login columns may be moved out by 0040; cap them only while they exist.
do $$
declare r record;
begin
  for r in select * from (values
      ('portal_url', 'char_length(portal_url) <= 2000'),
      ('portal_username', 'char_length(portal_username) <= 320'),
      ('portal_password', 'char_length(portal_password) <= 1000')) v(col, expr)
  loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'student_colleges' and column_name = r.col) then
      execute format('alter table public.student_colleges add constraint %I check (%s) not valid',
                     'student_colleges_' || r.col || '_len', r.expr);
    end if;
  end loop;
end $$;

alter table public.transcript_courses
  add constraint transcript_courses_terms_size check (octet_length(terms::text) <= 16384) not valid,
  add constraint transcript_courses_overrides_size check (octet_length(overrides::text) <= 16384) not valid;

alter table public.classes
  add constraint classes_name_len check (char_length(name) <= 120) not valid,
  add constraint classes_school_year_len check (char_length(school_year) <= 120) not valid;

alter table public.teacher_profiles
  add constraint teacher_profiles_display_name_len check (char_length(display_name) <= 120) not valid,
  add constraint teacher_profiles_school_len check (char_length(school) <= 200) not valid;

-- Row caps per account: BEFORE INSERT, serialised per owner with an advisory lock (the check_task_cap pattern, 0028).
-- Arguments: owner column, cap. SECURITY DEFINER so the count sees every row of that owner whatever RLS shows.
-- Rows inserted earlier by the same statement are counted too (they are visible to a row-level BEFORE trigger).
create function public.enforce_row_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner_col text := tg_argv[0];
  cap int := tg_argv[1]::int;
  owner uuid := (to_jsonb(new) ->> owner_col)::uuid;
  n bigint;
begin
  if owner is null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tg_table_name || ':' || owner::text, 0));
  execute format('select count(*) from %I.%I where %I = $1', tg_table_schema, tg_table_name, owner_col) into n using owner;
  if n >= cap then
    raise exception 'Limit reached: at most % % per account.', cap, replace(tg_table_name, '_', ' ');
  end if;
  return new;
end $$;
revoke all on function public.enforce_row_cap() from public, anon, authenticated;

create trigger row_cap before insert on public.student_colleges for each row execute function public.enforce_row_cap('user_id', '500');
create trigger row_cap before insert on public.recommenders for each row execute function public.enforce_row_cap('user_id', '50');
create trigger row_cap before insert on public.scholarships for each row execute function public.enforce_row_cap('user_id', '300');
create trigger row_cap before insert on public.transcript_schools for each row execute function public.enforce_row_cap('user_id', '20');
create trigger row_cap before insert on public.transcript_courses for each row execute function public.enforce_row_cap('user_id', '600');
create trigger row_cap before insert on public.classes for each row execute function public.enforce_row_cap('teacher_id', '100');
create trigger row_cap before insert on public.join_codes for each row execute function public.enforce_row_cap('teacher_id', '500');
create trigger row_cap before insert on public.teacher_notes for each row execute function public.enforce_row_cap('teacher_id', '2000');
create trigger row_cap before insert on public.teacher_tasks for each row execute function public.enforce_row_cap('teacher_id', '5000');

-- join_codes had only a partial index on teacher_id; the cap counts all of a teacher's codes.
create index join_codes_teacher_id_idx on public.join_codes (teacher_id);

-- ───────────── 3. join codes and roles ─────────────

-- DB-10: 8 symbols from a 31-symbol alphabet (no 0/O/1/I/L), drawn from pgcrypto's CSPRNG. Bytes 248..255 are
-- discarded (248 = 8 * 31) so every symbol is equally likely.
create or replace function public.make_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  b int;
  i int;
  out text := '';
begin
  while length(out) < 8 loop
    bytes := extensions.gen_random_bytes(16);
    for i in 0..15 loop
      b := get_byte(bytes, i);
      if b < 248 then
        out := out || substr(alphabet, (b % 31) + 1, 1);
        exit when length(out) = 8;
      end if;
    end loop;
  end loop;
  return out;
end $$;

-- Same as 0021, plus: OAuth clients refused, and codes revoked more than 30 days ago are deleted (DB-2).
create or replace function public.teacher_new_code(p_kind text, p_class uuid default null, p_expires timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c text;
  tries int := 0;
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  delete from public.join_codes where teacher_id = uid and revoked and created_at < now() - interval '30 days';
  if p_kind = 'class' then
    if p_class is null or not exists (select 1 from public.classes where id = p_class and teacher_id = uid and not archived) then
      raise exception 'class not found';
    end if;
    update public.join_codes set revoked = true where class_id = p_class and not revoked;
  elsif p_kind = 'individual' then
    p_class := null;
    update public.join_codes set revoked = true where teacher_id = uid and kind = 'individual' and not revoked;
  else
    raise exception 'invalid kind';
  end if;
  loop
    tries := tries + 1;
    c := public.make_code();
    begin
      insert into public.join_codes (code, teacher_id, kind, class_id, expires_at) values (c, uid, p_kind, p_class, p_expires);
      return c;
    exception when unique_violation then
      if tries >= 5 then raise exception 'could not create a code, try again'; end if; -- code collision: draw again
    end;
  end loop;
end $$;

-- Same as 0021, plus: OAuth clients refused, and one student's attempts are serialised so parallel calls cannot all
-- pass the 10-per-hour count before any of them logs a failure (DB-3).
create or replace function public.preview_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  jc public.join_codes;
  tp public.teacher_profiles;
  cl public.classes;
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'student') then raise exception 'students only'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('code_attempts:' || uid::text, 0));
  delete from public.code_attempts where at < now() - interval '1 day';
  if (select count(*) from public.code_attempts where user_id = uid and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into jc from public.join_codes
   where code = public.normalize_code(p_code) and not revoked and (expires_at is null or expires_at > now());
  if found and jc.class_id is not null then
    select * into cl from public.classes where id = jc.class_id;
    if cl.archived then jc := null; end if;
  end if;
  if jc.code is null then
    insert into public.code_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into tp from public.teacher_profiles where user_id = jc.teacher_id;
  return jsonb_build_object(
    'ok', true,
    'kind', jc.kind,
    'teacher_name', tp.display_name,
    'school', tp.school,
    'class_name', cl.name,
    'already_linked', exists (select 1 from public.teacher_links where teacher_id = jc.teacher_id and student_id = uid)
  );
end $$;

-- Same as 0021, plus (DB-14): the student's role row is locked for the whole redeem, and the teacher's role row is
-- held and re-checked, so neither side can switch roles half-way (change_my_role locks its own row too).
create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r jsonb;
  jc public.join_codes;
begin
  perform public.refuse_oauth_client();
  perform 1 from public.user_roles where user_id = uid for update;
  r := public.preview_code(p_code); -- same validation, rate limit and errors
  if not (r->>'ok')::boolean then return r; end if;
  select * into jc from public.join_codes where code = public.normalize_code(p_code);
  perform 1 from public.user_roles where user_id = jc.teacher_id and role = 'teacher' for share;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  insert into public.teacher_links (teacher_id, student_id, via) values (jc.teacher_id, uid, jc.kind)
  on conflict (teacher_id, student_id) do nothing;
  if jc.class_id is not null then
    insert into public.class_members (class_id, student_id) values (jc.class_id, uid) on conflict do nothing;
  end if;
  return r;
end $$;

-- Same as 0025, plus: OAuth clients refused, and the caller's role row is locked (DB-14).
create or replace function public.change_my_role(p_role text, p_display_name text default null, p_school text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := auth.uid();
  cur_role text;
  name    text := btrim(coalesce(p_display_name, ''));
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  if p_role is null or p_role not in ('student', 'teacher') then raise exception 'invalid role'; end if;
  select role into cur_role from public.user_roles where user_id = uid for update;
  if cur_role is null then raise exception 'role not set yet'; end if;
  if cur_role = p_role then return; end if;

  if cur_role = 'student' then
    if exists (select 1 from public.teacher_links where student_id = uid) then raise exception 'leave your teachers first'; end if;
    if name = '' and not exists (select 1 from public.teacher_profiles where user_id = uid) then raise exception 'teacher name required'; end if;
    if name <> '' then
      insert into public.teacher_profiles (user_id, display_name, school)
      values (uid, name, nullif(btrim(coalesce(p_school, '')), ''))
      on conflict (user_id) do update set display_name = excluded.display_name, school = excluded.school;
    end if;
  else
    if exists (select 1 from public.teacher_links where teacher_id = uid) then raise exception 'remove your students first'; end if;
    update public.join_codes set revoked = true where teacher_id = uid and not revoked;
    update public.classes set archived = true where teacher_id = uid and not archived;
  end if;

  update public.user_roles set role = p_role where user_id = uid;
end $$;

-- The remaining client RPCs that do not go through is_role(): same bodies as before (0020, 0021, 0028, 0031, 0032),
-- each refusing OAuth clients first.
create or replace function public.set_my_role(p_role text, p_display_name text default null, p_school text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  name text := btrim(coalesce(p_display_name, ''));
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  if p_role is null or p_role not in ('student', 'teacher') then raise exception 'invalid role'; end if;
  if exists (select 1 from public.user_roles where user_id = uid) then raise exception 'role already set'; end if;
  if p_role = 'teacher' and name = '' then raise exception 'teacher name required'; end if;

  insert into public.user_roles (user_id, role) values (uid, p_role);
  if p_role = 'teacher' then
    insert into public.teacher_profiles (user_id, display_name, school)
    values (uid, name, nullif(btrim(coalesce(p_school, '')), ''));
  end if;
end $$;

create or replace function public.my_teachers()
returns table (teacher_id uuid, display_name text, school text, linked_at timestamptz, share_essays boolean, class_names text[])
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  return query
    select l.teacher_id, tp.display_name, tp.school, l.created_at, l.share_essays,
           coalesce((select array_agg(c.name order by c.name) from public.class_members m
                     join public.classes c on c.id = m.class_id
                     where m.student_id = uid and c.teacher_id = l.teacher_id), '{}')
    from public.teacher_links l
    join public.teacher_profiles tp on tp.user_id = l.teacher_id
    where l.student_id = uid
    order by l.created_at;
end $$;

-- A null p_value now means "don't share" (DB-5: sharing essays is opt-in).
create or replace function public.set_share_essays(p_teacher uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  update public.teacher_links set share_essays = coalesce(p_value, false) where teacher_id = p_teacher and student_id = uid;
end $$;

create or replace function public.leave_teacher(p_teacher uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.class_members m using public.classes c where m.class_id = c.id and c.teacher_id = p_teacher and m.student_id = uid;
  delete from public.teacher_links where teacher_id = p_teacher and student_id = uid;
end $$;

create or replace function public.my_tasks()
returns table (task_id uuid, teacher_name text, title text, details text, due_on date, done boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  return query
    select t.id, tp.display_name, t.title, t.details, t.due_on,
           exists (select 1 from public.task_completions tc where tc.task_id = t.id and tc.student_id = uid)
      from public.visible_tasks(uid) t
      join public.teacher_profiles tp on tp.user_id = t.teacher_id
     order by t.due_on nulls last, t.created_at, t.id;
end $$;

create or replace function public.set_task_done(p_task uuid, p_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tid uuid;
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  select t.teacher_id into tid from public.visible_tasks(uid) t where t.id = p_task;
  if tid is null then raise exception 'task not found'; end if;
  if coalesce(p_done, true) then
    insert into public.task_completions (task_id, student_id, teacher_id) values (p_task, uid, tid) on conflict do nothing;
  else
    delete from public.task_completions where task_id = p_task and student_id = uid;
  end if;
end $$;

create or replace function public.revoke_extension_token(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  update public.extension_tokens set revoked_at = now()
  where id = p_id and user_id = uid and revoked_at is null;
end $$;

create or replace function public.revoke_share_link(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  perform public.refuse_oauth_client();
  if uid is null then raise exception 'not signed in'; end if;
  update public.share_links set revoked_at = now()
  where id = p_id and student_id = uid and revoked_at is null;
end $$;

-- Same as 0031, plus: OAuth clients refused; serialised per student; tokens revoked or expired more than 30 days ago
-- are deleted, and at most 50 rows (active + recently revoked) are kept per student (DB-2). Still at most 5 active.
-- Migration 0039 (extension activities access, another branch) replaces the one-argument version with
-- create_extension_token(p_label, p_scopes). Whichever lands first, harden the version that exists and never add a
-- second overload (PostgREST can't choose between two for a call with only p_label).
do $do$
begin
  if to_regprocedure('public.create_extension_token(text, text[])') is not null then
    execute $f$
create or replace function public.create_extension_token(p_label text default 'Chrome extension', p_scopes text[] default '{transcript}')
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tok text;
  sc text[];
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'student') then raise exception 'students only'; end if;
  if p_scopes is null or cardinality(p_scopes) = 0 or array_position(p_scopes, null) is not null
     or not (p_scopes <@ array['transcript', 'activities']::text[]) or not ('transcript' = any (p_scopes)) then
    raise exception 'invalid scopes';
  end if;
  sc := array_remove(array[
          case when 'transcript' = any (p_scopes) then 'transcript' end,
          case when 'activities' = any (p_scopes) then 'activities' end], null);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('extension_tokens:' || uid::text, 0));
  delete from public.extension_tokens
   where user_id = uid and (revoked_at < now() - interval '30 days' or expires_at < now() - interval '30 days');
  if (select count(*) from public.extension_tokens where user_id = uid) >= 50 then
    raise exception 'Too many new extension connections recently. Try again later.';
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.extension_tokens (user_id, token_hash, label, scopes)
  values (uid, extensions.digest(tok, 'sha256'), coalesce(nullif(btrim(p_label), ''), 'Chrome extension'), sc);
  update public.extension_tokens set revoked_at = now()
  where id in (
    select id from public.extension_tokens
    where user_id = uid and revoked_at is null
    order by created_at desc, id
    offset 5
  );
  return tok;
end $$;
$f$;
  else
    execute $f$
create or replace function public.create_extension_token(p_label text default 'Chrome extension')
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'student') then raise exception 'students only'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('extension_tokens:' || uid::text, 0));
  delete from public.extension_tokens
   where user_id = uid and (revoked_at < now() - interval '30 days' or expires_at < now() - interval '30 days');
  if (select count(*) from public.extension_tokens where user_id = uid) >= 50 then
    raise exception 'Too many new extension connections recently. Try again later.';
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.extension_tokens (user_id, token_hash, label)
  values (uid, extensions.digest(tok, 'sha256'), coalesce(nullif(btrim(p_label), ''), 'Chrome extension'));
  update public.extension_tokens set revoked_at = now()
  where id in (
    select id from public.extension_tokens
    where user_id = uid and revoked_at is null
    order by created_at desc, id
    offset 5
  );
  return tok;
end $$;
$f$;
  end if;
end $do$;

-- ───────────── 4. essays are not shared with a new teacher by default (DB-5) ─────────────

-- Existing links keep their current setting.
alter table public.teacher_links alter column share_essays set default false;

-- ───────────── 5. share links expire (DB-8) ─────────────

-- now() is evaluated once here, so every existing link (active ones included) expires 180 days from today.
alter table public.share_links add column expires_at timestamptz not null default now() + interval '180 days';
grant select (expires_at) on public.share_links to authenticated;

-- Same as 0032, plus: OAuth clients refused; links revoked or expired more than 30 days ago are deleted, and at most
-- 50 rows (active + recently replaced) are kept per student (DB-2). The new link gets the 180-day default expiry.
create or replace function public.create_share_link(p_kind text, p_label text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  perform public.refuse_oauth_client();
  if uid is null or not public.is_role(uid, 'student') then raise exception 'students only'; end if;
  if p_kind is null or p_kind not in ('parent', 'portfolio') then raise exception 'unknown link kind'; end if;
  -- Serialize per student so two concurrent calls can't both pass the revoke step and hit the unique index.
  perform pg_advisory_xact_lock(hashtext('share_links:' || uid::text));
  delete from public.share_links
   where student_id = uid and (revoked_at < now() - interval '30 days' or expires_at < now() - interval '30 days');
  if (select count(*) from public.share_links where student_id = uid) >= 50 then
    raise exception 'Too many new links recently. Try again later.';
  end if;
  tok := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/\n', '-_'), '=');
  update public.share_links set revoked_at = now()
  where student_id = uid and kind = p_kind and revoked_at is null;
  insert into public.share_links (student_id, kind, token_hash, label)
  values (uid, p_kind, extensions.digest(tok, 'sha256'),
          left(coalesce(nullif(btrim(p_label), ''), case p_kind when 'parent' then 'Parent link' else 'Portfolio link' end), 100));
  return tok;
end $$;

-- Same as 0032, plus: an expired link resolves to nobody (parent_view / portfolio_view then return null).
create or replace function public.share_link_student(p_token text, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  l_id uuid;
  uid uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  select id, student_id into l_id, uid
  from public.share_links
  where token_hash = extensions.digest(p_token, 'sha256') and kind = p_kind and revoked_at is null and expires_at > now();
  if l_id is null or not public.is_role(uid, 'student') then return null; end if;
  update public.share_links set last_viewed_at = now() where id = l_id;
  return uid;
end $$;

-- ───────────── Account deletion reaches every copy ─────────────
-- Settings > Delete account removes the auth user and relies on ON DELETE CASCADE. 0038's activities backup has no
-- foreign key, so add one (not valid: rows of already-deleted users are left for the owner to drop with the table).
do $$
begin
  if to_regclass('private.activities_backup_0038') is not null
     and not exists (select 1 from pg_constraint where conname = 'activities_backup_0038_user_fk') then
    alter table private.activities_backup_0038
      add constraint activities_backup_0038_user_fk foreign key (user_id) references auth.users (id) on delete cascade not valid;
  end if;
end $$;
