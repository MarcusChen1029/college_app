-- Transcript-only tokens for the Common App fill extension.
-- The extension must read ONLY the student's transcript. A Supabase session would also expose the
-- student tables that hold portal passwords, so the extension gets an opaque token instead.
-- Only the SHA-256 of a token is stored; the token itself exists in clear exactly once, when it is
-- created. extension_transcript() is callable by anon, so it answers every bad token the same way and
-- returns nothing but the two transcript tables.
-- pgcrypto lives in the "extensions" schema on this project.

create table public.extension_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash   bytea not null unique,
  label        text not null default 'Chrome extension' check (char_length(label) <= 100),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz not null default now() + interval '90 days',
  revoked_at   timestamptz
);
create index on public.extension_tokens (user_id);

alter table public.extension_tokens enable row level security;
create policy "own tokens" on public.extension_tokens for select to authenticated
  using ((select auth.uid()) = user_id);

-- Clients may list their tokens but never read token_hash, and never write the table directly.
revoke all on table public.extension_tokens from public, anon, authenticated;
grant select (id, label, created_at, last_used_at, expires_at, revoked_at) on public.extension_tokens to authenticated;

-- Creates a token for the calling student and returns it (the only time it exists in clear).
-- A student keeps at most 5 active tokens; the oldest beyond that are revoked.
create function public.create_extension_token(p_label text default 'Chrome extension')
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  if uid is null or not public.is_role(uid, 'student') then raise exception 'students only'; end if;
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

-- Looks up an active token and returns that student's transcript (and nothing else).
create function public.extension_transcript(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  t_id uuid;
  uid uuid;
  schools jsonb;
  courses jsonb;
begin
  select id, user_id into t_id, uid
  from public.extension_tokens
  where token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
    and revoked_at is null and expires_at > now();
  if t_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;
  if not public.is_role(uid, 'student') then
    return jsonb_build_object('ok', false, 'error', 'students_only');
  end if;
  update public.extension_tokens set last_used_at = now() where id = t_id;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at, s.id), '[]'::jsonb) into schools
  from (
    select id, name, country, kind, curriculum, default_scale, default_period, first_year, last_year,
           printed_gpa, printed_gpa_scale, gpa_weighted, class_rank, notes, created_at, updated_at
    from public.transcript_schools where user_id = uid
  ) s;

  select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order, c.created_at, c.id), '[]'::jsonb) into courses
  from (
    select id, school_id, academic_year, grade_level, name, period_type, terms, final_grade, grade_scale,
           scale_max, level, credit, credit_unit, subject, sub_subject, language_name, is_summer, is_repeat,
           is_college, college_name, is_withdrawn, notes, source, overrides, sort_order, created_at, updated_at
    from public.transcript_courses where user_id = uid
  ) c;

  return jsonb_build_object('ok', true, 'schools', schools, 'courses', courses);
end $$;

-- Revokes one of the caller's own tokens.
create function public.revoke_extension_token(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.extension_tokens set revoked_at = now()
  where id = p_id and user_id = uid and revoked_at is null;
end $$;

revoke all on function public.create_extension_token(text), public.extension_transcript(text), public.revoke_extension_token(uuid)
  from public, anon, authenticated;
grant execute on function public.create_extension_token(text) to authenticated;
grant execute on function public.revoke_extension_token(uuid) to authenticated;
grant execute on function public.extension_transcript(text) to anon, authenticated;
