-- College Application Tracker — initial schema
-- Reference data (colleges, stats, deadlines…) is public read-only.
-- Student data (profiles, lists) is private per user via RLS.

-- ───────────────────────── Lookups ─────────────────────────

create table public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null
);

create table public.tiers (
  code        text primary key,           -- 'S','A','B','C','D'
  sort_order  smallint not null unique,   -- 1 = highest
  description text not null
);

create table public.tier_categories (
  key        text primary key,            -- 'general','computer_science',…
  label      text not null,
  sort_order smallint not null
);

create table public.application_plans (
  key         text primary key,           -- 'ED','ED2','EA','REA','RD','ROLLING',…
  label       text not null,
  binding     boolean not null,
  description text
);

create table public.english_tests (
  key       text primary key,             -- 'TOEFL_IBT','IELTS','DUOLINGO',…
  name      text not null,
  max_score numeric
);

-- ───────────────────────── Institutions ─────────────────────────

create table public.institutions (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name                  text not null,
  short_name            text,
  country_code          text not null references public.countries(code),
  state_region          text,
  city                  text,
  latitude              numeric(9,6),
  longitude             numeric(9,6),
  setting               text check (setting in ('urban','suburban','rural')),
  control               text check (control in ('public','private_nonprofit','private_forprofit')),
  website               text,
  admissions_url        text,
  ipeds_unit_id         integer unique,
  undergrad_enrollment  integer,
  pct_international_ug  numeric(5,2),   -- % of degree-seeking undergrads who are nonresidents
  student_faculty_ratio numeric(5,2),
  academic_calendar     text check (academic_calendar in ('semester','quarter','trimester','4-1-4','other')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on public.institutions (country_code, state_region);

-- Every factual row points to where it came from.
create table public.sources (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  kind           text not null check (kind in ('cds','admissions_site','financial_aid_site','ipeds','scorecard','other')),
  title          text,
  url            text not null,
  cds_year       text check (cds_year ~ '^\d{4}-\d{4}$'),
  accessed_on    date not null default current_date
);
create index on public.sources (institution_id);

create table public.institution_tiers (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  category_key   text not null references public.tier_categories(key),
  tier_code      text not null references public.tiers(code),
  rationale      text,
  primary key (institution_id, category_key)
);

-- ───────────────────────── Admissions stats (CDS) ─────────────────────────

-- CDS C1 / C2 / C9 (submit %) / C11 / C12 / C21 + B (intl)
create table public.admission_stats (
  institution_id     uuid not null references public.institutions(id) on delete cascade,
  cds_year           text not null check (cds_year ~ '^\d{4}-\d{4}$'),
  applicants         integer,
  admits             integer,
  enrolled           integer,
  admit_rate         numeric(5,2) generated always as
                       (case when applicants > 0 then round(100.0 * admits / applicants, 2) end) stored,
  ed_applicants      integer,
  ed_admits          integer,
  ed_admit_rate      numeric(5,2) generated always as
                       (case when ed_applicants > 0 then round(100.0 * ed_admits / ed_applicants, 2) end) stored,
  intl_applicants    integer,   -- C1 nonresident rows, where reported
  intl_admits        integer,
  intl_admit_rate    numeric(5,2) generated always as
                       (case when intl_applicants > 0 then round(100.0 * intl_admits / intl_applicants, 2) end) stored,
  waitlist_offered   integer,
  waitlist_accepted  integer,
  waitlist_admitted  integer,
  pct_submit_sat     numeric(5,2),
  pct_submit_act     numeric(5,2),
  gpa_avg            numeric(3,2),   -- C12 average high-school GPA (scale noted in notes)
  pct_reporting_gpa  numeric(5,2),
  gpa_distribution   jsonb,          -- C11 bands, e.g. {"4.0": 61.2, "3.75-3.99": 25.1, …}
  notes              text,
  source_id          uuid references public.sources(id) on delete set null,
  primary key (institution_id, cds_year)
);

-- CDS C9 — one row per test/section
create table public.test_score_percentiles (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  cds_year       text not null check (cds_year ~ '^\d{4}-\d{4}$'),
  test           text not null check (test in ('SAT_TOTAL','SAT_ERW','SAT_MATH','ACT_COMPOSITE','ACT_ENGLISH','ACT_MATH')),
  p25            numeric(6,1),
  p50            numeric(6,1),
  p75            numeric(6,1),
  source_id      uuid references public.sources(id) on delete set null,
  primary key (institution_id, cds_year, test),
  check (p25 is null or p75 is null or p25 <= p75),
  check (p50 is null or ((p25 is null or p25 <= p50) and (p75 is null or p50 <= p75)))
);

-- CDS C7 — relative importance of admission factors
create table public.admission_factors (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  cds_year       text not null check (cds_year ~ '^\d{4}-\d{4}$'),
  factor         text not null check (factor in (
                   'rigor','class_rank','gpa','test_scores','essay','recommendations',
                   'interview','extracurriculars','talent_ability','character',
                   'first_generation','alumni_relation','geographic_residence','state_residency',
                   'religious_affiliation','racial_ethnic_status','volunteer_work',
                   'work_experience','demonstrated_interest')),
  importance     text not null check (importance in ('very_important','important','considered','not_considered')),
  source_id      uuid references public.sources(id) on delete set null,
  primary key (institution_id, cds_year, factor)
);

-- ───────────────────────── Current-cycle policies ─────────────────────────

create table public.test_policies (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  cycle          text not null check (cycle ~ '^\d{4}-\d{2}$'),   -- '2026-27' = entering fall 2027
  policy         text not null check (policy in ('required','optional','blind','flexible')),
  notes          text,
  source_id      uuid references public.sources(id) on delete set null,
  primary key (institution_id, cycle)
);

create table public.application_requirements (
  institution_id        uuid not null references public.institutions(id) on delete cascade,
  cycle                 text not null check (cycle ~ '^\d{4}-\d{2}$'),
  platforms             text[] not null default '{}',   -- 'common_app','coalition','uc_app','questbridge','own'
  supplemental_essays   text,      -- free text: counts vary by program
  teacher_recs          smallint,
  counselor_rec         boolean,
  interview             text check (interview in ('not_offered','optional_informational','optional_evaluative','required','by_invitation')),
  portfolio             text,      -- when/which programs require it
  app_fee_usd           numeric(6,2),
  fee_waiver            boolean,
  css_profile_required  boolean,
  fafsa_required        boolean,
  midyear_report        boolean,
  notes                 text,
  source_id             uuid references public.sources(id) on delete set null,
  primary key (institution_id, cycle)
);

create table public.deadlines (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions(id) on delete cascade,
  cycle             text not null check (cycle ~ '^\d{4}-\d{2}$'),
  kind              text not null check (kind in ('application','priority','scholarship','financial_aid','interview_signup','deposit','other')),
  plan_key          text references public.application_plans(key),
  label             text,
  due_date          date,
  notification_date date,
  notification_note text,     -- e.g. 'mid-December'
  notes             text,
  source_id         uuid references public.sources(id) on delete set null
);
create index on public.deadlines (institution_id, cycle);
create index on public.deadlines (due_date);

create table public.english_requirements (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  test_key       text not null references public.english_tests(key),
  status         text not null check (status in ('required_option','recommended_option','accepted','not_accepted')),
  min_total      numeric(5,1),
  recommended_total numeric(5,1),
  min_subscores  jsonb,
  notes          text,
  source_id      uuid references public.sources(id) on delete set null,
  primary key (institution_id, test_key)
);

-- Policy-level English info (who must submit, waivers)
create table public.english_policies (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  policy         text not null check (policy in ('required_nonnative','recommended','not_required','required_all_international')),
  waiver_notes   text,
  source_id      uuid references public.sources(id) on delete set null
);

-- CDS G1 / H6 + financial aid site
create table public.cost_aid (
  institution_id          uuid not null references public.institutions(id) on delete cascade,
  year                    text not null check (year ~ '^\d{4}-\d{4}$'),
  tuition_usd             integer,
  tuition_out_of_state_usd integer,
  required_fees_usd       integer,
  room_board_usd          integer,
  total_coa_usd           integer,   -- published cost of attendance (incl. books/personal where given)
  intl_aid_policy         text check (intl_aid_policy in ('need_blind_full_need','need_aware_full_need','need_aware_limited','merit_only','none')),
  intl_need_aid_awarded   integer,   -- H6: # nonresidents awarded institutional aid
  intl_avg_award_usd      integer,   -- H6 average award
  meets_full_need         boolean,
  merit_scholarships      boolean,
  merit_separate_app      boolean,
  notes                   text,
  source_id               uuid references public.sources(id) on delete set null,
  primary key (institution_id, year)
);

-- How admission to a major works
create table public.major_admissions (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions(id) on delete cascade,
  program           text not null,          -- 'Computer Science', 'Ross BBA', …
  category_key      text references public.tier_categories(key),
  admit_model       text not null check (admit_model in ('direct_major','school_college','undeclared_open','pre_major_competitive')),
  capped            boolean not null default false,
  internal_transfer text check (internal_transfer in ('open','moderate','hard','very_hard','not_possible')),
  notes             text,
  source_id         uuid references public.sources(id) on delete set null,
  unique (institution_id, program)
);

-- ───────────────────────── Student data (private) ─────────────────────────

create table public.student_profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  sat_total         smallint check (sat_total between 400 and 1600),
  act_composite     smallint check (act_composite between 1 and 36),
  gpa_unweighted    numeric(3,2) check (gpa_unweighted between 0 and 4),
  english_test_key  text references public.english_tests(key),
  english_score     numeric(5,1),
  intended_category text references public.tier_categories(key),
  is_international  boolean not null default false,
  needs_aid         boolean not null default false,
  updated_at        timestamptz not null default now()
);

create table public.student_colleges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  plan_key       text references public.application_plans(key),
  status         text not null default 'researching' check (status in (
                   'researching','planning','in_progress','submitted','interview',
                   'admitted','deferred','waitlisted','rejected','withdrawn','enrolled')),
  fit_override   text check (fit_override in ('reach','target','safety')),
  checklist      jsonb not null default '{}'::jsonb,   -- {"essays":true,"recs":false,"scores_sent":…}
  portal_url     text,
  aid_offer_usd  integer,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, institution_id)
);
create index on public.student_colleges (institution_id);

-- ───────────────────────── RLS ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'countries','tiers','tier_categories','application_plans','english_tests',
    'institutions','sources','institution_tiers','admission_stats','test_score_percentiles',
    'admission_factors','test_policies','application_requirements','deadlines',
    'english_requirements','english_policies','cost_aid','major_admissions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

alter table public.student_profiles enable row level security;
create policy "own profile" on public.student_profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.student_colleges enable row level security;
create policy "own list" on public.student_colleges for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- updated_at maintenance
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger touch before update on public.institutions     for each row execute function public.touch_updated_at();
create trigger touch before update on public.student_profiles for each row execute function public.touch_updated_at();
create trigger touch before update on public.student_colleges for each row execute function public.touch_updated_at();
