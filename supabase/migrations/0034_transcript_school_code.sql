-- The school's code (CEEB / College Board code, as UC, STARS and Common App search by it): lets the extension match the school on a
-- portal by code instead of by a name each portal spells its own way ("Kang Chiao Intl Sch Linkou Cmp"). Optional.
alter table public.transcript_schools
  add column school_code text check (school_code is null or school_code ~ '^[A-Za-z0-9-]{1,12}$');

-- The extension reads the transcript only through this function (migration 0031); add school_code to its column list.
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

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at, s.id), '[]'::jsonb) into schools
  from (
    select id, name, country, kind, curriculum, default_scale, default_period, first_year, last_year,
           printed_gpa, printed_gpa_scale, gpa_weighted, class_rank, school_code, notes, created_at, updated_at
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
