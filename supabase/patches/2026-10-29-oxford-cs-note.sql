-- Oxford Computer Science: the course note shown to students carried an internal research memo
-- ("re-verify before publishing, so it is not stored in intl_fee_gbp"). Same facts, student-facing wording;
-- matches data/colleges/oxford.json. Touches one row; run in the Supabase SQL Editor.
update public.programs
set notes = 'Interview, success rate and intake are a 3-year average (2023-25). The course page lists an overseas fee of GBP 66,580 a year, which is unusually high and not yet confirmed, so it is not shown as this course''s fee.'
where id = '1e286e4f-743a-5e95-9d97-00c145b84a3f'
  and slug = 'computer-science';
