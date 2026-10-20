-- Data fixes found after the initial load (already reflected in data/*.json and the generated seed).
-- NYU: final CDS incl. section G → average GPA 3.81 and 2026-27 tuition / food & housing.
-- Berkeley: undergrad count (OPA Quick Facts), nonresident tuition, international aid policy.
-- UIUC: verified EA/RD dates and notification dates.
begin;

update sources set title = 'NYU Common Data Set 2025-2026 (final, incl. section G, July 2026)',
  url = 'https://www.nyu.edu/content/dam/nyu/institutionalResearch/documents/cds-2025-2026/CDS%202025-2026%20FINAL(including%20G%20July_2026).xlsx'
  where id = '6cc348b4-0b2c-5cd2-9e79-fe426275c348';
update admission_stats set gpa_avg = 3.81,
  notes = 'ED I 11/1 → 12/15; ED II 1/1 → 2/15; no EA. NYU does not report waitlist or ED applicant counts. For portfolio/audition programs artistic talent is Very Important.'
  where institution_id = 'a89d4ad5-df02-5c82-9adc-dc8b82e72709' and cds_year = '2025-2026';
update cost_aid set tuition_usd = 68574, room_board_usd = 25250, books_usd = null, other_usd = null, total_coa_usd = null,
  notes = 'CDS G1 (2026-27). Tuition & fees vary by school — e.g. Stern $70,464, Tisch $75,326 (NYU cost-of-attendance page). H6: need-based and non-need-based aid available to nonresidents.; NYU Promise: 100% of demonstrated need met for first-year students admitted to the New York campus.',
  source_id = '6cc348b4-0b2c-5cd2-9e79-fe426275c348'
  where institution_id = 'a89d4ad5-df02-5c82-9adc-dc8b82e72709' and year = '2026-2027';

update institutions set undergrad_enrollment = 33122, pct_international_ug = 9.82 where slug = 'uc-berkeley';
insert into sources (id, institution_id, kind, title, url, accessed_on) values
 ('631d6315-3ae6-578b-a4ba-6eaf9fca4191', 'caa9a1af-8f82-5061-8a81-0334c772233f', 'other', 'UC Berkeley Quick Facts (Office of Planning & Analysis)', 'https://opa.berkeley.edu/campus-data/uc-berkeley-quick-facts', '2026-10-20'),
 ('e870406f-2ba8-50c7-84ac-73a0fe775230', 'caa9a1af-8f82-5061-8a81-0334c772233f', 'financial_aid_site', 'Berkeley — Scholarship Opportunities for International Students', 'https://financialaid.berkeley.edu/types-of-aid-at-berkeley/scholarships/regents-and-chancellors-scholarship/international-student-scholarships/', '2026-10-20'),
 ('65f4d179-3890-533f-85a7-7e0ad6a3ce2e', '4bbd7e56-a2f5-5ab6-9af7-1e0b6c3abb6d', 'admissions_site', 'Illinois — First-Year Dates & Deadlines', 'https://www.admissions.illinois.edu/first-year-dates/', '2026-10-20')
on conflict (id) do nothing;
update cost_aid set tuition_out_of_state_usd = 57484, tuition_intl_usd = 57484, intl_aid_policy = 'need_aware_limited', intl_need_aid = true,
  merit_scholarships = true, merit_separate_app = false,
  notes = 'Tuition & fees for the newest cohort; nonresidents (incl. international) add Nonresident Supplemental Tuition of $39,270. Housing in a residence hall; health insurance $5,066 extra. Total shown is the California-resident cost of attendance.; International students can''t get federal, state or general need-based university aid, but are automatically considered for a few institutional scholarships (Regents'' & Chancellor''s, Robinson International Scholars, International Leaders, Swaniker Scholars).'
  where institution_id = 'caa9a1af-8f82-5061-8a81-0334c772233f' and year = '2026-2027';

insert into deadlines (id, institution_id, cycle, kind, plan_key, label, due_date, notification_date, notes, source_id) values
 ('620461ae-744c-5e39-a389-93d7cf70ae5e', '4bbd7e56-a2f5-5ab6-9af7-1e0b6c3abb6d', '2026-27', 'application', 'EA', null, '2026-11-01', '2027-01-29', 'All required materials due by Nov 7.', '65f4d179-3890-533f-85a7-7e0ad6a3ce2e'),
 ('2daa6b50-a78a-5142-8385-066030b184f5', '4bbd7e56-a2f5-5ab6-9af7-1e0b6c3abb6d', '2026-27', 'application', 'RD', null, '2027-01-05', '2027-02-26', 'All required materials due by Jan 11.', '65f4d179-3890-533f-85a7-7e0ad6a3ce2e'),
 ('b70dda1f-ddde-5cde-b72c-e60abdcf2c42', '4bbd7e56-a2f5-5ab6-9af7-1e0b6c3abb6d', '2026-27', 'deposit', null, 'Enrollment deposit', '2027-05-01', null, null, '65f4d179-3890-533f-85a7-7e0ad6a3ce2e')
on conflict (id) do update set due_date = excluded.due_date, notification_date = excluded.notification_date,
  notes = excluded.notes, source_id = excluded.source_id, label = excluded.label;

commit;
