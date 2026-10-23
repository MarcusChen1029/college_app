-- Custom colleges: a student can add a college we don't have. It is a normal list row with no
-- institution; its details (name, location, deadline, website) live in `custom`.
alter table public.student_colleges alter column institution_id drop not null;
alter table public.student_colleges add column custom jsonb;
alter table public.student_colleges
  add constraint student_colleges_institution_or_custom check (institution_id is not null or custom is not null);
