-- One row per college with the latest stats, used by the list/compare pages.
create view public.college_summary
with (security_invoker = true) as
select
  i.id, i.slug, i.name, i.short_name, i.country_code, i.state_region, i.city,
  i.latitude, i.longitude, i.setting, i.control, i.undergrad_enrollment, i.pct_international_ug,
  gt.tier_code                              as general_tier,
  s.cds_year, s.applicants, s.admits, s.admit_rate, s.ed_admit_rate, s.intl_admit_rate, s.gpa_avg,
  sat.p25 as sat_p25, sat.p50 as sat_p50, sat.p75 as sat_p75,
  act.p25 as act_p25, act.p50 as act_p50, act.p75 as act_p75,
  tp.policy                                 as test_policy,
  ep.policy                                 as english_policy,
  c.total_coa_usd, c.tuition_usd, c.tuition_out_of_state_usd, c.tuition_intl_usd, c.intl_aid_policy,
  (select coalesce(jsonb_object_agg(t.category_key, t.tier_code), '{}'::jsonb)
     from public.institution_tiers t where t.institution_id = i.id) as tiers,
  (select array_agg(distinct d.plan_key) from public.deadlines d
     where d.institution_id = i.id and d.kind = 'application' and d.plan_key is not null) as plans,
  (select min(d.due_date) from public.deadlines d
     where d.institution_id = i.id and d.kind = 'application' and d.due_date >= current_date) as next_deadline
from public.institutions i
left join public.institution_tiers gt on gt.institution_id = i.id and gt.category_key = 'general'
left join lateral (
  select * from public.admission_stats a where a.institution_id = i.id
  order by (a.source_note is null) desc, a.cds_year desc limit 1
) s on true
left join public.test_score_percentiles sat on sat.institution_id = i.id and sat.cds_year = s.cds_year and sat.test = 'SAT_TOTAL'
left join public.test_score_percentiles act on act.institution_id = i.id and act.cds_year = s.cds_year and act.test = 'ACT_COMPOSITE'
left join lateral (
  select * from public.test_policies p where p.institution_id = i.id order by p.cycle desc limit 1
) tp on true
left join public.english_policies ep on ep.institution_id = i.id
left join lateral (
  select * from public.cost_aid ca where ca.institution_id = i.id order by ca.year desc limit 1
) c on true;

grant select on public.college_summary to anon, authenticated;
