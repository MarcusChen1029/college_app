-- Activities access for the Common App / UC fill extension (spec docs/superpowers/specs/2026-10-28-activities-filler-design.md §4.1).
-- Extension tokens (migration 0031) get a scope list. Every token minted before this file keeps {transcript} (the column
-- default): consent is never widened silently. /extension/connect now asks for and records {transcript,activities}.
-- extension_activities() is the activities twin of extension_transcript(): anon-callable, same token checks, and it returns
-- nothing but the student's Common App and UC activities and honors (version 2, through activities_v2() from 0038).
-- extension_transcript() is not changed: every token, old or new, carries 'transcript' (the check below guarantees it).

-- 'transcript' is required in every token: the extension's panel loads the transcript first, so a token without it could
-- not be used at all.
alter table public.extension_tokens
  add column scopes text[] not null default '{transcript}'
    check (scopes <@ array['transcript', 'activities']::text[] and 'transcript' = any (scopes) and array_position(scopes, null) is null);

-- Clients may read which scopes their own tokens hold (RLS "own tokens" limits the rows), never token_hash.
grant select (scopes) on public.extension_tokens to authenticated;

-- The 1-argument version must go: with both a (text) and a (text, text[]) version, PostgREST cannot choose one for a call
-- that passes only p_label or nothing (the deployed site's call until it is redeployed). The new version answers both,
-- minting a {transcript} token, exactly as before.
drop function public.create_extension_token(text);

-- Creates a token for the calling student and returns it (the only time it exists in clear).
-- p_scopes: only 'transcript' and 'activities', and 'transcript' is required. Stored de-duplicated in a fixed order.
-- A student keeps at most 5 active tokens; the oldest beyond that are revoked.
create function public.create_extension_token(p_label text default 'Chrome extension', p_scopes text[] default '{transcript}')
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tok text;
  sc text[];
begin
  if uid is null or not public.is_role(uid, 'student') then raise exception 'students only'; end if;
  if p_scopes is null or cardinality(p_scopes) = 0 or array_position(p_scopes, null) is not null
     or not (p_scopes <@ array['transcript', 'activities']::text[]) or not ('transcript' = any (p_scopes)) then
    raise exception 'invalid scopes';
  end if;
  sc := array_remove(array[
          case when 'transcript' = any (p_scopes) then 'transcript' end,
          case when 'activities' = any (p_scopes) then 'activities' end], null);
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

-- Looks up an active token holding the 'activities' scope and returns that student's activities and honors (and nothing
-- else): { ok: true, activities: { version: 2, commonApp: { activities, honors }, uc } }. A valid token without the scope
-- gets 'no_scope' (the extension then asks the student to reconnect) and is not marked as used.
create function public.extension_activities(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t_id uuid;
  uid uuid;
  t_scopes text[];
  acts jsonb;
begin
  select id, user_id, scopes into t_id, uid, t_scopes
  from public.extension_tokens
  where token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
    and revoked_at is null and expires_at > now();
  if t_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if not public.is_role(uid, 'student') then
    return jsonb_build_object('ok', false, 'error', 'students_only');
  end if;
  if not ('activities' = any (t_scopes)) then
    return jsonb_build_object('ok', false, 'error', 'no_scope');
  end if;
  update public.extension_tokens set last_used_at = now() where id = t_id;

  -- No profile row reads as no activities (activities_v2 turns null into an empty version 2 object).
  acts := public.activities_v2((select sp.activities from public.student_profiles sp where sp.user_id = uid));

  return jsonb_build_object('ok', true, 'activities',
    jsonb_build_object('version', 2, 'commonApp', acts -> 'commonApp', 'uc', acts -> 'uc'));
end $$;

-- Same grants as 0031: creating needs a signed-in student; reading by token is anon-callable.
revoke all on function public.create_extension_token(text, text[]), public.extension_activities(text)
  from public, anon, authenticated;
grant execute on function public.create_extension_token(text, text[]) to authenticated;
grant execute on function public.extension_activities(text) to anon, authenticated;
