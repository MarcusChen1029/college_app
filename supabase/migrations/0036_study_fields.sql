-- Directions the student wants to study (field keys from web/lib/fields.ts, e.g. "business", "pre_law").
-- First = main direction, optional second. Used by the College match page (/tools/match). Empty = not chosen yet.
alter table public.student_profiles
  add column if not exists study_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(study_fields) = 'array' and jsonb_array_length(study_fields) <= 2);
