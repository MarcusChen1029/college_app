-- Extension hardening (security audit 2026-10-28, findings EXT-1 and EXT-6). Based on the live definitions from 0031 and 0034.
--
-- EXT-1: the extension's Sign out only cleared chrome.storage.local, so a copied token stayed valid for up to 90 days (the only revoke
-- path, revoke_extension_token(uuid), needs a Supabase session the extension never has). revoke_my_extension_token(p_token) lets the
-- extension revoke the token it holds. The token is the credential: hashed the same way 0031 does, the matching row gets revoked_at.
-- The answer is {"ok": true} for every input (known, unknown, already revoked, empty), so it tells a caller nothing about the token.
--
-- EXT-6: extension_transcript returned columns the fill never reads (free-text notes, class rank, printed GPA, school/course metadata).
-- It now returns only what the filler reads: the planners and portal pickers read, per school, id / name / country / kind /
-- default_period / school_code; per course, the ones listed below (overrides drives the per-system tags). The extension fills the
-- omitted columns with neutral defaults (extension/src/auth.ts). Keep this list in step with that file: a column the fill starts
-- reading has to be added here and there.

create or replace function public.revoke_my_extension_token(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_token is not null and p_token <> '' then
    update public.extension_tokens set revoked_at = now()
    where token_hash = extensions.digest(p_token, 'sha256') and revoked_at is null;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.extension_transcript(p_token text)
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

  -- created_at is selected only to order the rows, then removed from the result.
  select coalesce(jsonb_agg(to_jsonb(s) - 'created_at' order by s.created_at, s.id), '[]'::jsonb) into schools
  from (
    select id, name, country, kind, default_period, school_code, created_at
    from public.transcript_schools where user_id = uid
  ) s;

  select coalesce(jsonb_agg(to_jsonb(c) - 'created_at' order by c.sort_order, c.created_at, c.id), '[]'::jsonb) into courses
  from (
    select id, school_id, academic_year, grade_level, name, period_type, terms, final_grade, grade_scale,
           scale_max, level, credit, credit_unit, subject, sub_subject, language_name, is_summer, is_repeat,
           is_college, college_name, overrides, sort_order, created_at
    from public.transcript_courses where user_id = uid
  ) c;

  return jsonb_build_object('ok', true, 'schools', schools, 'courses', courses);
end $$;

-- Same grants as 0031: callable by anon (the extension has no session); the token is the credential.
revoke all on function public.revoke_my_extension_token(text), public.extension_transcript(text) from public, anon, authenticated;
grant execute on function public.revoke_my_extension_token(text) to anon, authenticated;
grant execute on function public.extension_transcript(text) to anon, authenticated;
