-- Re-seeding deletes institutions → sources, which sets source_id null in every child table.
-- Index those FKs so that stays fast once all US colleges are loaded.
create index on public.admission_stats (source_id);
create index on public.test_score_percentiles (source_id);
create index on public.admission_factors (source_id);
create index on public.test_policies (source_id);
create index on public.application_requirements (source_id);
create index on public.deadlines (source_id);
create index on public.english_requirements (source_id);
create index on public.english_policies (source_id);
create index on public.cost_aid (source_id);
create index on public.major_admissions (source_id);
