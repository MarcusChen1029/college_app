-- Fields discovered while importing the first 10 Common Data Sets.

alter table public.test_policies drop constraint test_policies_policy_check;
alter table public.test_policies add constraint test_policies_policy_check
  check (policy in ('required','recommended','optional','flexible','blind'));

alter table public.admission_stats
  add column in_state_applicants  integer,
  add column in_state_admits      integer,
  add column out_state_applicants integer,
  add column out_state_admits     integer,
  add column source_note          text;   -- e.g. 'admissions_site' when not from the CDS

alter table public.cost_aid
  add column tuition_intl_usd     integer,
  add column intl_extra_fees_usd  integer,
  add column books_usd            integer,
  add column other_usd            integer,
  add column intl_need_aid        boolean,
  add column intl_merit_aid       boolean;

-- TOEFL iBT moved to a 1–6 band scale on 2026-01-21; schools publish both.
insert into public.english_tests (key, name, max_score) values
  ('TOEFL_IBT_2026', 'TOEFL iBT (1–6 scale, from Jan 2026)', 6)
on conflict (key) do update set name = excluded.name, max_score = excluded.max_score;
