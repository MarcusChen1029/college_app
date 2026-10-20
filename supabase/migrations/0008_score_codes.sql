-- Score-reporting codes students enter when sending SAT/ACT/English test scores.
-- One row per college per test; code is text to keep leading zeros (ACT "0434").
-- code null + notes = no numeric code (e.g. pick the school by name in the Duolingo portal).
create table public.score_codes (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  test_key       text not null check (test_key in ('sat','act','toefl','ielts','duolingo','pte')),
  code           text check (code ~ '^[0-9A-Za-z-]{1,12}$'),
  notes          text,
  source_id      uuid references public.sources(id) on delete set null,
  primary key (institution_id, test_key)
);
create index on public.score_codes (source_id);

alter table public.score_codes enable row level security;
create policy "public read" on public.score_codes for select to anon, authenticated using (true);
