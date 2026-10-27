-- Weighted GPA as printed on the student's transcript (optional, school-specific scale, usually 4.0 to 5.0, rarely up to 6.0).
-- Kept next to gpa_unweighted but never compared with colleges: the CDS GPA averages are unweighted.
-- The admission-test choice (SAT / ACT / both / planning / not taking) lives in test_details.plan (jsonb), so it needs no column.
alter table public.student_profiles
  add column if not exists gpa_weighted numeric(4,2)
    check (gpa_weighted between 0 and 6);
