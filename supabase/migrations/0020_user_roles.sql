-- Account roles: every account is a student or a teacher/counselor, chosen once at /welcome.
-- Rows are written only through set_my_role() (no insert/update/delete policies), so a role can't
-- be changed or forged from the client. A teacher claim grants no access to anyone's data by itself;
-- that needs a student to link to the teacher (later phases).

create table public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

create table public.teacher_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  school       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.user_roles enable row level security;
create policy "own role" on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id);

alter table public.teacher_profiles enable row level security;
create policy "own teacher profile read" on public.teacher_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own teacher profile update" on public.teacher_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger touch before update on public.teacher_profiles
  for each row execute function public.touch_updated_at();

create function public.set_my_role(p_role text, p_display_name text default null, p_school text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  name text := btrim(coalesce(p_display_name, ''));
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_role is null or p_role not in ('student', 'teacher') then raise exception 'invalid role'; end if;
  if exists (select 1 from public.user_roles where user_id = uid) then raise exception 'role already set'; end if;
  if p_role = 'teacher' and name = '' then raise exception 'teacher name required'; end if;

  insert into public.user_roles (user_id, role) values (uid, p_role);
  if p_role = 'teacher' then
    insert into public.teacher_profiles (user_id, display_name, school)
    values (uid, name, nullif(btrim(coalesce(p_school, '')), ''));
  end if;
end $$;

revoke all on function public.set_my_role(text, text, text) from public, anon;
grant execute on function public.set_my_role(text, text, text) to authenticated;

-- Everyone who existed before roles was a student.
insert into public.user_roles (user_id, role)
select id, 'student' from auth.users
on conflict do nothing;
