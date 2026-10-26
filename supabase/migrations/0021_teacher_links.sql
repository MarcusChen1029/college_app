-- Phase 2 of teacher accounts: classes, join codes, and the student<->teacher link.
-- A teacher_links row IS the access grant that later phases check. Everything here is written
-- through SECURITY DEFINER functions (tables only allow a few reads), and codes are redeemed through
-- preview_code()/redeem_code(), which rate-limit failures and answer every bad code the same way.

create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references auth.users(id) on delete cascade,
  name        text not null check (btrim(name) <> ''),
  school_year text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.classes (teacher_id);

-- kind 'class': class_id set. kind 'individual': class_id null (one active code per teacher).
create table public.join_codes (
  code       text primary key check (code ~ '^[A-Z2-9]{8}$'),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('class', 'individual')),
  class_id   uuid references public.classes(id) on delete cascade,
  expires_at timestamptz,
  revoked    boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'class') = (class_id is not null))
);
create unique index join_codes_one_active_class on public.join_codes (class_id) where class_id is not null and not revoked;
create unique index join_codes_one_active_individual on public.join_codes (teacher_id) where kind = 'individual' and not revoked;

create table public.teacher_links (
  teacher_id   uuid not null references auth.users(id) on delete cascade,
  student_id   uuid not null references auth.users(id) on delete cascade,
  via          text not null check (via in ('class', 'individual')),
  share_essays boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (teacher_id, student_id),
  check (teacher_id <> student_id)
);
create index on public.teacher_links (student_id);

create table public.class_members (
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index on public.class_members (student_id);

-- Failed code attempts, used only by the functions below (RLS on, no policies).
create table public.code_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index on public.code_attempts (user_id, at);

alter table public.classes enable row level security;
alter table public.join_codes enable row level security;
alter table public.teacher_links enable row level security;
alter table public.class_members enable row level security;
alter table public.code_attempts enable row level security;

create policy "own classes read" on public.classes for select to authenticated using ((select auth.uid()) = teacher_id);
create policy "own classes update" on public.classes for update to authenticated
  using ((select auth.uid()) = teacher_id) with check ((select auth.uid()) = teacher_id);
create policy "own codes read" on public.join_codes for select to authenticated using ((select auth.uid()) = teacher_id);
create policy "links read" on public.teacher_links for select to authenticated
  using ((select auth.uid()) in (teacher_id, student_id));
create policy "members read" on public.class_members for select to authenticated
  using ((select auth.uid()) = student_id or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid())));

-- ───────────── helpers (not callable by clients) ─────────────

create function public.is_role(p_user uuid, p_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = p_user and role = p_role)
$$;

-- 8 chars from an alphabet without 0/O/1/I/L, drawn from a CSPRNG (gen_random_uuid).
create function public.make_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  out text := '';
  i int;
begin
  for i in 0..7 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end $$;

create function public.normalize_code(p_code text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g')
$$;

revoke all on function public.is_role(uuid, text), public.make_code(), public.normalize_code(text) from public, anon, authenticated;

-- ───────────── teacher functions ─────────────

-- Revokes the active code for a scope and issues a fresh one. p_kind 'class' needs p_class.
create function public.teacher_new_code(p_kind text, p_class uuid default null, p_expires timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c text;
  tries int := 0;
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if p_kind = 'class' then
    if p_class is null or not exists (select 1 from public.classes where id = p_class and teacher_id = uid and not archived) then
      raise exception 'class not found';
    end if;
    update public.join_codes set revoked = true where class_id = p_class and not revoked;
  elsif p_kind = 'individual' then
    p_class := null;
    update public.join_codes set revoked = true where teacher_id = uid and kind = 'individual' and not revoked;
  else
    raise exception 'invalid kind';
  end if;
  loop
    tries := tries + 1;
    c := public.make_code();
    begin
      insert into public.join_codes (code, teacher_id, kind, class_id, expires_at) values (c, uid, p_kind, p_class, p_expires);
      return c;
    exception when unique_violation then
      if tries >= 5 then raise exception 'could not create a code, try again'; end if; -- code collision: draw again
    end;
  end loop;
end $$;

create function public.teacher_revoke_code(p_kind text, p_class uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if p_kind = 'class' then
    update public.join_codes set revoked = true where teacher_id = uid and class_id = p_class and not revoked;
  elsif p_kind = 'individual' then
    update public.join_codes set revoked = true where teacher_id = uid and kind = 'individual' and not revoked;
  else
    raise exception 'invalid kind';
  end if;
end $$;

create function public.teacher_create_class(p_name text, p_school_year text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'class name required'; end if;
  insert into public.classes (teacher_id, name, school_year)
  values (uid, btrim(p_name), nullif(btrim(coalesce(p_school_year, '')), ''))
  returning id into cid;
  return jsonb_build_object('id', cid, 'code', public.teacher_new_code('class', cid));
end $$;

-- Archiving also turns the class code off.
create function public.teacher_archive_class(p_class uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  update public.classes set archived = p_archived where id = p_class and teacher_id = uid;
  if not found then raise exception 'class not found'; end if;
  if p_archived then update public.join_codes set revoked = true where class_id = p_class and not revoked; end if;
end $$;

-- Every student linked to the caller, with the classes they are in. Name falls back to the email prefix.
create function public.teacher_students()
returns table (student_id uuid, display_name text, email text, linked_at timestamptz, class_ids uuid[])
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  return query
    select l.student_id,
           coalesce(nullif(btrim(sp.display_name), ''), split_part(u.email, '@', 1)),
           u.email::text,
           l.created_at,
           coalesce((select array_agg(m.class_id) from public.class_members m
                     join public.classes c on c.id = m.class_id
                     where m.student_id = l.student_id and c.teacher_id = uid), '{}')
    from public.teacher_links l
    join auth.users u on u.id = l.student_id
    left join public.student_profiles sp on sp.user_id = l.student_id
    where l.teacher_id = uid
    order by 2;
end $$;

create function public.teacher_remove_student(p_student uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  delete from public.class_members m using public.classes c where m.class_id = c.id and c.teacher_id = uid and m.student_id = p_student;
  delete from public.teacher_links where teacher_id = uid and student_id = p_student;
end $$;

create function public.teacher_remove_from_class(p_class uuid, p_student uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_role(uid, 'teacher') then raise exception 'teachers only'; end if;
  delete from public.class_members m using public.classes c
   where m.class_id = c.id and c.id = p_class and c.teacher_id = uid and m.student_id = p_student;
end $$;

-- ───────────── student functions ─────────────

-- Looks a code up for the confirm screen. Returns {ok:true,...} or {ok:false,error:'invalid'|'rate_limited'}.
-- Failures are returned, not raised, because a raise would roll back the logged attempt. Every unusable code
-- (unknown, revoked, expired, archived class) looks the same; 10 failures per hour per user are allowed.
create function public.preview_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  jc public.join_codes;
  tp public.teacher_profiles;
  cl public.classes;
begin
  if uid is null or not public.is_role(uid, 'student') then raise exception 'students only'; end if;
  delete from public.code_attempts where at < now() - interval '1 day';
  if (select count(*) from public.code_attempts where user_id = uid and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into jc from public.join_codes
   where code = public.normalize_code(p_code) and not revoked and (expires_at is null or expires_at > now());
  if found and jc.class_id is not null then
    select * into cl from public.classes where id = jc.class_id;
    if cl.archived then jc := null; end if;
  end if;
  if jc.code is null then
    insert into public.code_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into tp from public.teacher_profiles where user_id = jc.teacher_id;
  return jsonb_build_object(
    'ok', true,
    'kind', jc.kind,
    'teacher_name', tp.display_name,
    'school', tp.school,
    'class_name', cl.name,
    'already_linked', exists (select 1 from public.teacher_links where teacher_id = jc.teacher_id and student_id = uid)
  );
end $$;

create function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r jsonb;
  jc public.join_codes;
begin
  r := public.preview_code(p_code); -- same validation, rate limit and errors
  if not (r->>'ok')::boolean then return r; end if;
  select * into jc from public.join_codes where code = public.normalize_code(p_code);
  insert into public.teacher_links (teacher_id, student_id, via) values (jc.teacher_id, uid, jc.kind)
  on conflict (teacher_id, student_id) do nothing;
  if jc.class_id is not null then
    insert into public.class_members (class_id, student_id) values (jc.class_id, uid) on conflict do nothing;
  end if;
  return r;
end $$;

create function public.my_teachers()
returns table (teacher_id uuid, display_name text, school text, linked_at timestamptz, share_essays boolean, class_names text[])
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  return query
    select l.teacher_id, tp.display_name, tp.school, l.created_at, l.share_essays,
           coalesce((select array_agg(c.name order by c.name) from public.class_members m
                     join public.classes c on c.id = m.class_id
                     where m.student_id = uid and c.teacher_id = l.teacher_id), '{}')
    from public.teacher_links l
    join public.teacher_profiles tp on tp.user_id = l.teacher_id
    where l.student_id = uid
    order by l.created_at;
end $$;

create function public.set_share_essays(p_teacher uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.teacher_links set share_essays = coalesce(p_value, true) where teacher_id = p_teacher and student_id = uid;
end $$;

create function public.leave_teacher(p_teacher uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.class_members m using public.classes c where m.class_id = c.id and c.teacher_id = p_teacher and m.student_id = uid;
  delete from public.teacher_links where teacher_id = p_teacher and student_id = uid;
end $$;

-- Client-callable functions: signed-in users only.
do $$
declare f text;
begin
  foreach f in array array[
    'teacher_new_code(text, uuid, timestamptz)', 'teacher_revoke_code(text, uuid)', 'teacher_create_class(text, text)',
    'teacher_archive_class(uuid, boolean)', 'teacher_students()', 'teacher_remove_student(uuid)',
    'teacher_remove_from_class(uuid, uuid)', 'preview_code(text)', 'redeem_code(text)', 'my_teachers()',
    'set_share_essays(uuid, boolean)', 'leave_teacher(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
