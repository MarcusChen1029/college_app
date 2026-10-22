-- Course-level ("programs") data for countries that apply to a course rather than a college (UK / UCAS).
-- One row per course per institution. Public read-only, like the other reference tables.
-- Every row carries its own source_url + retrieved_on (course pages carry no page date).

create table public.programs (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid not null references public.institutions(id) on delete cascade,
  slug                 text not null check (slug ~ '^[a-z0-9-]+$'),
  name                 text not null,
  award                text,              -- 'BSc', 'MA (Hons)', 'LLB', 'MBChB'…
  ucas_code            text,              -- 'G400'
  duration_years       smallint check (duration_years is null or duration_years between 1 and 8),
  a_level_offer        text,              -- 'A*AA, with A* and A in Maths and Further Maths'
  ib_offer             text,              -- '39 points, 766 at HL'
  ib_points            smallint check (ib_points is null or ib_points between 0 and 45),
  required_subjects    text,
  admissions_test      text,              -- 'TMUA', 'UCAT', 'LNAT'…
  interviewed_pct      numeric(5,2) check (interviewed_pct is null or interviewed_pct between 0 and 100),
  success_pct          numeric(5,2) check (success_pct is null or success_pct between 0 and 100),
  intake               integer check (intake is null or intake > 0),
  intl_fee_gbp         integer check (intl_fee_gbp is null or intl_fee_gbp > 0),   -- per year, overseas fee
  application_deadline date,
  ielts_overall        numeric(3,1) check (ielts_overall is null or ielts_overall between 0 and 9),
  ielts_component      numeric(3,1) check (ielts_component is null or ielts_component between 0 and 9),
  toefl_note           text,              -- TOEFL has two scales (old 0-120, new 1-6 from 2026-01-21)
  english_note         text,
  notes                text,
  source_url           text not null,
  retrieved_on         date not null,
  unique (institution_id, slug)
);
create index on public.programs (institution_id);

alter table public.programs enable row level security;
create policy "public read" on public.programs for select to anon, authenticated using (true);
