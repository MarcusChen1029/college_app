-- Student-side transcript: the schools a student attended and every course, in one standardized format.
-- Private to the student. RLS lets only the owner touch their rows, and no teacher RPC reads these tables.
-- Enums and limits are mirrored in web/lib/transcript.ts (validateSchool / validateCourse); keep the two in step.
-- Grades are stored exactly as printed on the transcript; nothing here converts them.

create table public.transcript_schools (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name              text not null check (btrim(name) <> '' and char_length(name) <= 200),
  country           text not null default '' check (char_length(country) <= 100),
  kind              text not null default 'high_school' check (kind in ('high_school','college','other')),
  curriculum        text not null default 'us' check (curriculum in ('us','ib','a_level','igcse','other')),
  default_scale     text not null default 'letter_plus_minus'
                    check (default_scale in ('letter_plus_minus','letter','percent_100','gpa_decimal','ib_7','a_level','gcse_9_1','pass_fail','narrative','other')),
  default_period    text not null default 'semester' check (default_period in ('full_year','semester','trimester','quarter')),
  first_year        int check (first_year between 1990 and 2100),
  last_year         int check (last_year between 1990 and 2100),
  printed_gpa       text not null default '' check (char_length(printed_gpa) <= 40),
  printed_gpa_scale text not null default '' check (char_length(printed_gpa_scale) <= 40),
  gpa_weighted      boolean,
  class_rank        text not null default '' check (char_length(class_rank) <= 100),
  notes             text not null default '' check (char_length(notes) <= 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id)
);
create index on public.transcript_schools (user_id);

create table public.transcript_courses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  school_id      uuid not null,
  academic_year  int not null check (academic_year between 1990 and 2100),
  grade_level    int check (grade_level between 5 and 13),
  name           text not null check (btrim(name) <> '' and char_length(name) <= 200),
  period_type    text not null default 'semester' check (period_type in ('full_year','semester','trimester','quarter')),
  terms          jsonb not null default '[]' check (jsonb_typeof(terms) = 'array'),
  final_grade    text check (char_length(final_grade) <= 40),
  grade_scale    text not null default 'letter_plus_minus'
                 check (grade_scale in ('letter_plus_minus','letter','percent_100','gpa_decimal','ib_7','a_level','gcse_9_1','pass_fail','narrative','other')),
  scale_max      numeric check (scale_max > 0),
  level          text not null default 'regular' check (level in (
                   'regular','accelerated','advanced','honors','high_honors','ap','ib_hl','ib_sl','ib','pre_ib',
                   'a_level','gcse_igcse','college_prep','dual_enrollment','enriched','gifted','intensive','regents','other','none')),
  credit         numeric check (credit between 0 and 100),
  credit_unit    text not null default 'carnegie' check (credit_unit in ('carnegie','semester_hours','quarter_hours','other','not_listed')),
  subject        text not null default 'other' check (subject in (
                   'english','mathematics','science','history_social','world_language','arts','computer_science','business','pe_health','career_technical','other')),
  sub_subject    text check (char_length(sub_subject) <= 40),
  language_name  text not null default '' check (char_length(language_name) <= 100),
  is_summer      boolean not null default false,
  is_repeat      boolean not null default false,
  is_college     boolean not null default false,
  college_name   text not null default '' check (char_length(college_name) <= 200),
  is_withdrawn   boolean not null default false,
  notes          text not null default '' check (char_length(notes) <= 500),
  source         text not null default 'manual' check (source in ('manual','ai_import','mcp')),
  overrides      jsonb not null default '{}' check (jsonb_typeof(overrides) = 'object'),
  sort_order     int not null default 0 check (sort_order between 0 and 100000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- a course can only belong to a school of the same student
  foreign key (school_id, user_id) references public.transcript_schools (id, user_id) on delete cascade
);
create index on public.transcript_courses (user_id);
create index on public.transcript_courses (school_id);

alter table public.transcript_schools enable row level security;
create policy "own transcript schools select" on public.transcript_schools for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own transcript schools insert" on public.transcript_schools for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own transcript schools update" on public.transcript_schools for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own transcript schools delete" on public.transcript_schools for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.transcript_courses enable row level security;
create policy "own transcript courses select" on public.transcript_courses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own transcript courses insert" on public.transcript_courses for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own transcript courses update" on public.transcript_courses for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own transcript courses delete" on public.transcript_courses for delete to authenticated
  using ((select auth.uid()) = user_id);

create trigger touch before update on public.transcript_schools
  for each row execute function public.touch_updated_at();
create trigger touch before update on public.transcript_courses
  for each row execute function public.touch_updated_at();
