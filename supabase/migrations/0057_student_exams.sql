-- 0057: the student's exam results (Materials > Exams, /materials/exams).
-- Spec: docs/superpowers/specs/2026-11-05-exams-page-design.md. One jsonb document per student: AP / IB / A-level / IGCSE /
-- other exam entries with predicted and final grades as printed. Shape and validation live in web/lib/exams.ts (version 1).
-- Private to the student: no teacher RPC, parent/portfolio view, digest or AI view reads it. AI-connector tokens are refused
-- twice: api_request_guard's allow-list (0051) doesn't name this table, and the restrictive policy below (same as 0043).
-- (0056 is taken by the pre-launch hardening PR #117.)

create table public.student_exams (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{"version": 1, "entries": []}'::jsonb,
  updated_at timestamptz not null default now(),
  -- CASE rather than AND: a CHECK passes when it is NULL (a document without "entries" would), and AND doesn't promise
  -- jsonb_array_length is skipped for a non-array. This way every document is either accepted or refused as a check violation.
  constraint student_exams_data_shape check (
    jsonb_typeof(data) = 'object'
    and case when jsonb_typeof(data -> 'entries') = 'array' then jsonb_array_length(data -> 'entries') <= 80 else false end
    and pg_column_size(data) <= 65536
  )
);
comment on table public.student_exams is
  'Exam results per student (AP, IB, A-level, IGCSE...), one jsonb document {version, entries[]}; shape in web/lib/exams.ts. Private to the student. 0057.';

alter table public.student_exams enable row level security;
create policy "own exams select" on public.student_exams for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own exams insert" on public.student_exams for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own exams update" on public.student_exams for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own exams delete" on public.student_exams for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy no_oauth_clients on public.student_exams as restrictive for all to authenticated
  using (not (select public.is_oauth_client())) with check (not (select public.is_oauth_client()));

create trigger touch before update on public.student_exams
  for each row execute function public.touch_updated_at();

-- 0044: new tables get no default grants.
grant select, insert, update, delete on public.student_exams to authenticated;
