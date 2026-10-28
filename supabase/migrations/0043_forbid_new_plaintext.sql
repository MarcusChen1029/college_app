-- Portal passwords, step 2 of 2 (after 0040's encrypted store portal_passwords):
-- 1. No new plaintext. Triggers reject an INSERT or UPDATE that puts a non-empty password into
--    student_colleges.portal_password, or a non-empty "password" value into student_profiles.portals (systems.*,
--    campuses.*, custom[]) that the OLD row didn't already hold at the same place. Rows not migrated yet still take
--    unrelated updates (the old value may stay as it is); removing a password is always allowed. So a browser tab
--    still running an older build can't write plaintext back, or bring back a password the student cleared.
-- 2. Compare-and-set functions for the server's verified migration (POST /api/portal-passwords "migrate",
--    web/lib/portal-vault-server.ts; scripts/backfill-portal-passwords.mjs). They remove a plaintext password only if
--    the row still holds exactly the value that was copied, and they can only remove passwords. service_role only:
--    the password travels in the request body, never in a URL filter.
-- 3. Client roles lose portal_password entirely (an AI connector token, which 0041 still lets read student_colleges,
--    can no longer SELECT it). anon/authenticated keep exactly their other privileges on student_colleges, now per
--    column: a NEW column on student_colleges must be granted to authenticated explicitly, or the website and the
--    AI tools can't read or write it. Columns from the live catalog, 2026-10-28.
-- 4. AI-connection (OAuth client_id) tokens lose the base student_profiles / student_colleges tables: the deployed MCP
--    tools use 0041's column-limited views ai_student_profiles / ai_student_colleges instead, so saved-login usernames,
--    links and progress (portals, portal_url, portal_username), reminder settings and essays are out of their reach.
-- Before patch 2026-10-28-drop-portal-password-column.sql drops the column, it drops trigger forbid_plaintext_password
-- on student_colleges and the function strip_college_portal_password (both depend on it).
-- Trigger and helper functions get no client grants and an empty search_path (0041 rules).

-- ───────────── 1. no new plaintext ─────────────

create function public.forbid_plaintext_college_password() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(new.portal_password, '') <> ''
     and (tg_op = 'INSERT' or new.portal_password is distinct from old.portal_password) then
    raise exception 'Portal passwords are not stored here any more; save them on the website (they are encrypted).'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.forbid_plaintext_college_password() from public, anon, authenticated;

-- Every non-empty password value in a portals value, as '<place>' and its jsonb value. Places match
-- web/lib/portal-slots.ts: system:<key>, campus:<key>, custom:<id> (custom:#<position> when an entry has no id).
create function public.portal_password_values(p jsonb) returns table (place text, val jsonb)
language sql immutable set search_path = '' as $$
  select 'system:' || e.key, e.value -> 'password'
  from jsonb_each(case when jsonb_typeof(p -> 'systems') = 'object' then p -> 'systems' else '{}'::jsonb end) e
  where jsonb_typeof(e.value) = 'object' and coalesce(e.value ->> 'password', '') <> ''
  union all
  select 'campus:' || e.key, e.value -> 'password'
  from jsonb_each(case when jsonb_typeof(p -> 'campuses') = 'object' then p -> 'campuses' else '{}'::jsonb end) e
  where jsonb_typeof(e.value) = 'object' and coalesce(e.value ->> 'password', '') <> ''
  union all
  select 'custom:' || coalesce(c.value ->> 'id', '#' || c.ord), c.value -> 'password'
  from jsonb_array_elements(case when jsonb_typeof(p -> 'custom') = 'array' then p -> 'custom' else '[]'::jsonb end)
       with ordinality as c(value, ord)
  where jsonb_typeof(c.value) = 'object' and coalesce(c.value ->> 'password', '') <> ''
$$;
revoke all on function public.portal_password_values(jsonb) from public, anon, authenticated;

-- The trigger runs as the caller (authenticated), who has no EXECUTE on the helper above, so it is SECURITY DEFINER:
-- it reads NEW, OLD and, for an INSERT, the student's existing row. The website saves profiles with an upsert
-- (INSERT ... ON CONFLICT DO UPDATE), and BEFORE INSERT triggers fire for the proposed row even when it then becomes
-- an update: so an INSERT is compared with the row already stored for that student (none = nothing to keep), exactly
-- like an UPDATE is compared with OLD. Unchanged passwords pass; new or changed ones don't.
create function public.forbid_plaintext_profile_password() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  was jsonb;
begin
  if tg_op = 'UPDATE' then
    was := old.portals;
  else
    -- Only the caller's own row: comparing with someone else's would tell a guesser whether a password matched.
    select sp.portals into was from public.student_profiles sp
    where sp.user_id = new.user_id and sp.user_id = (select auth.uid());
  end if;
  if exists (
    select 1 from public.portal_password_values(new.portals) n
    where not exists (select 1 from public.portal_password_values(was) o where o.place = n.place and o.val = n.val)
  ) then
    raise exception 'Portal passwords are not stored here any more; save them on the website (they are encrypted).'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.forbid_plaintext_profile_password() from public, anon, authenticated;

create trigger forbid_plaintext_password before insert or update of portal_password on public.student_colleges
  for each row execute function public.forbid_plaintext_college_password();
create trigger forbid_plaintext_password before insert or update of portals on public.student_profiles
  for each row execute function public.forbid_plaintext_profile_password();

-- ───────────── 2. service-role compare-and-set for the verified migration ─────────────

-- The portals value with every "password" key removed (everything else as it was).
create function public.portals_without_passwords(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) <> 'object' then p else p
    || case when jsonb_typeof(p -> 'systems') = 'object' then jsonb_build_object('systems', (
         select coalesce(jsonb_object_agg(e.key, case when jsonb_typeof(e.value) = 'object' then e.value - 'password' else e.value end), '{}'::jsonb)
         from jsonb_each(p -> 'systems') e)) else '{}'::jsonb end
    || case when jsonb_typeof(p -> 'campuses') = 'object' then jsonb_build_object('campuses', (
         select coalesce(jsonb_object_agg(e.key, case when jsonb_typeof(e.value) = 'object' then e.value - 'password' else e.value end), '{}'::jsonb)
         from jsonb_each(p -> 'campuses') e)) else '{}'::jsonb end
    || case when jsonb_typeof(p -> 'custom') = 'array' then jsonb_build_object('custom', (
         select coalesce(jsonb_agg(case when jsonb_typeof(c.value) = 'object' then c.value - 'password' else c.value end order by c.ord), '[]'::jsonb)
         from jsonb_array_elements(p -> 'custom') with ordinality as c(value, ord))) else '{}'::jsonb end
  end
$$;
revoke all on function public.portals_without_passwords(jsonb) from public, anon, authenticated;
grant execute on function public.portals_without_passwords(jsonb) to service_role;

-- Nulls one college row's plaintext password, only if it still holds exactly p_old. True when it did.
create function public.strip_college_portal_password(p_user uuid, p_id uuid, p_old text) returns boolean
language sql volatile set search_path = '' as $$
  with u as (
    update public.student_colleges set portal_password = null
    where id = p_id and user_id = p_user and portal_password = p_old
    returning 1
  )
  select exists (select 1 from u)
$$;
revoke all on function public.strip_college_portal_password(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.strip_college_portal_password(uuid, uuid, text) to service_role;

-- Replaces a profile's portals with p_new, only if the row still holds exactly p_old and p_new differs from it by
-- removed password keys alone. True when it did.
create function public.replace_profile_portals(p_user uuid, p_old jsonb, p_new jsonb) returns boolean
language sql volatile set search_path = '' as $$
  with u as (
    update public.student_profiles set portals = p_new
    where user_id = p_user
      and portals is not distinct from p_old
      and public.portals_without_passwords(p_new) is not distinct from public.portals_without_passwords(p_old)
    returning 1
  )
  select exists (select 1 from u)
$$;
revoke all on function public.replace_profile_portals(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_profile_portals(uuid, jsonb, jsonb) to service_role;

-- ───────────── 3. client roles lose portal_password ─────────────

-- Stop if student_colleges has a column this list doesn't know (it would be left with no grant).
do $$
declare
  extra text;
begin
  select string_agg(column_name, ', ') into extra
  from information_schema.columns
  where table_schema = 'public' and table_name = 'student_colleges'
    and column_name not in ('id', 'user_id', 'institution_id', 'plan_key', 'status', 'fit_override', 'checklist', 'portal_url',
                            'aid_offer_usd', 'notes', 'created_at', 'updated_at', 'portal_username', 'portal_password', 'custom');
  if extra is not null then
    raise exception '0043: student_colleges has columns this migration does not grant: %', extra;
  end if;
end $$;

-- Delete, references, trigger and truncate stay as they are.
revoke select, insert, update on public.student_colleges from anon, authenticated;
grant
  select (id, user_id, institution_id, plan_key, status, fit_override, checklist, portal_url, aid_offer_usd, notes,
          created_at, updated_at, portal_username, custom),
  insert (id, user_id, institution_id, plan_key, status, fit_override, checklist, portal_url, aid_offer_usd, notes,
          created_at, updated_at, portal_username, custom),
  update (id, user_id, institution_id, plan_key, status, fit_override, checklist, portal_url, aid_offer_usd, notes,
          created_at, updated_at, portal_username, custom)
  on public.student_colleges to authenticated;

-- ───────────── 4. AI tokens: the views only ─────────────

-- Same as 0041, minus the two base tables. Applied after the deploy whose web/lib/mcp/tools.ts reads and writes the
-- views (before it, the live MCP code still uses the base tables and every AI tool would fail).
create or replace function public.api_request_guard() returns void
language plpgsql stable set search_path = '' as $$
declare
  p text;
begin
  if not public.is_oauth_client() then return; end if;
  p := regexp_replace(coalesce(current_setting('request.path', true), ''), '^(/rest/v1)?/+', '');
  if p in ('ai_student_profiles', 'ai_student_colleges', 'transcript_schools', 'transcript_courses') then return; end if;
  raise exception 'Connected AI apps can only use the student tables.' using errcode = '42501';
end $$;

-- Second layer, like 0041 (b): if the pre-request hook is ever reset, an OAuth token still sees and changes no base
-- row. The views are unaffected: they are owned by postgres, which bypasses RLS (checked 2026-10-29: rolbypassrls,
-- and neither table forces RLS). Website sessions carry no client_id and pass.
create policy no_oauth_clients on public.student_profiles as restrictive for all to authenticated
  using (not (select public.is_oauth_client())) with check (not (select public.is_oauth_client()));
create policy no_oauth_clients on public.student_colleges as restrictive for all to authenticated
  using (not (select public.is_oauth_client())) with check (not (select public.is_oauth_client()));
