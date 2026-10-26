-- Lets a user switch between student and teacher/counselor from their account page.
-- Safe by construction: a switch is refused while the account still has links (a student must leave their
-- teachers, a teacher must remove their students), so nobody keeps access they shouldn't have and no
-- private notes are orphaned. Leaving teacher mode turns every join code off and archives the classes.
-- The old side's data is kept (a student's list and profile, a teacher's name and school) so switching back restores it.

create function public.change_my_role(p_role text, p_display_name text default null, p_school text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  cur_role text;
  name    text := btrim(coalesce(p_display_name, ''));
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_role is null or p_role not in ('student', 'teacher') then raise exception 'invalid role'; end if;
  select role into cur_role from public.user_roles where user_id = uid;
  if cur_role is null then raise exception 'role not set yet'; end if;
  if cur_role = p_role then return; end if;

  if cur_role = 'student' then
    if exists (select 1 from public.teacher_links where student_id = uid) then raise exception 'leave your teachers first'; end if;
    if name = '' and not exists (select 1 from public.teacher_profiles where user_id = uid) then raise exception 'teacher name required'; end if;
    if name <> '' then
      insert into public.teacher_profiles (user_id, display_name, school)
      values (uid, name, nullif(btrim(coalesce(p_school, '')), ''))
      on conflict (user_id) do update set display_name = excluded.display_name, school = excluded.school;
    end if;
  else
    if exists (select 1 from public.teacher_links where teacher_id = uid) then raise exception 'remove your students first'; end if;
    update public.join_codes set revoked = true where teacher_id = uid and not revoked;
    update public.classes set archived = true where teacher_id = uid and not archived;
  end if;

  update public.user_roles set role = p_role where user_id = uid;
end $$;

revoke all on function public.change_my_role(text, text, text) from public, anon;
grant execute on function public.change_my_role(text, text, text) to authenticated;
