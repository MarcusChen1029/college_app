-- Phase 4 of teacher accounts: private teacher notes about a linked student.
-- Only the teacher who wrote a note can read or change it; students never see them. The composite foreign key
-- ties a note to the teacher<->student link, so a note can only be written for a linked student and is deleted
-- automatically when the link ends (student leaves, teacher removes them, or either account is deleted).

create table public.teacher_notes (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null default auth.uid(),
  student_id uuid not null,
  body       text not null check (btrim(body) <> '' and char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (teacher_id, student_id) references public.teacher_links (teacher_id, student_id) on delete cascade
);
create index on public.teacher_notes (teacher_id, student_id, created_at desc);

alter table public.teacher_notes enable row level security;
create policy "own notes" on public.teacher_notes for all to authenticated
  using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id);

create trigger touch before update on public.teacher_notes
  for each row execute function public.touch_updated_at();
