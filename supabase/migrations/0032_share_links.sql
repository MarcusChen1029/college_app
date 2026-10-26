-- Share links: a read-only parent view and a public activity portfolio, both opened by a secret link.
-- Spec: docs/superpowers/specs/2026-10-27-share-links-design.md. Same token pattern as 0031: the token is
-- 32 random bytes (base64url, 43 chars), only its SHA-256 is stored, and it exists in clear exactly once
-- (the create_share_link() return value). parent_view() / portfolio_view() are callable by anon; they answer
-- every unknown, revoked or wrong-kind token with NULL and return an EXPLICIT field list, never whole rows.
-- Never returned by either view: email, portals / portal_* logins, notes, aid offers, essays (titles, links,
-- text), the transcript, phone, address, the resume's contact lines.
-- pgcrypto lives in the "extensions" schema on this project.

create table public.share_links (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('parent', 'portfolio')),
  token_hash     bytea not null unique,
  label          text not null check (char_length(label) between 1 and 100),
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  last_viewed_at timestamptz
);
-- At most one active link per kind per student (create_share_link revokes the old one first).
create unique index share_links_one_active on public.share_links (student_id, kind) where revoked_at is null;

alter table public.share_links enable row level security;
create policy "own share links select" on public.share_links for select to authenticated
  using ((select auth.uid()) = student_id);
create policy "own share links insert" on public.share_links for insert to authenticated
  with check ((select auth.uid()) = student_id);
create policy "own share links update" on public.share_links for update to authenticated
  using ((select auth.uid()) = student_id) with check ((select auth.uid()) = student_id);

-- Clients may list their own links but never read token_hash. Writes go only through the RPCs below
-- (the insert/update policies are defence in depth; no table write privilege is granted). anon gets nothing.
revoke all on table public.share_links from public, anon, authenticated;
grant select (id, kind, label, created_at, revoked_at, last_viewed_at) on public.share_links to authenticated;

-- Creates a link of one kind for the calling student, revoking their previous active link of that kind.
-- Returns the token (the only time it exists in clear).
create function public.create_share_link(p_kind text, p_label text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  tok text;
begin
  if uid is null or not public.is_role(uid, 'student') then raise exception 'students only'; end if;
  if p_kind is null or p_kind not in ('parent', 'portfolio') then raise exception 'unknown link kind'; end if;
  tok := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), E'+/\n', '-_'), '=');
  update public.share_links set revoked_at = now()
  where student_id = uid and kind = p_kind and revoked_at is null;
  insert into public.share_links (student_id, kind, token_hash, label)
  values (uid, p_kind, extensions.digest(tok, 'sha256'),
          left(coalesce(nullif(btrim(p_label), ''), case p_kind when 'parent' then 'Parent link' else 'Portfolio link' end), 100));
  return tok;
end $$;

-- Revokes one of the caller's own links. Revoking twice, or someone else's link, does nothing.
create function public.revoke_share_link(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  update public.share_links set revoked_at = now()
  where id = p_id and student_id = uid and revoked_at is null;
end $$;

-- Internal: the student behind an active link of p_kind (and stamps last_viewed_at), or null.
-- A link whose owner is no longer a student (switched to teacher) stops working too.
create function public.share_link_student(p_token text, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  l_id uuid;
  uid uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  select id, student_id into l_id, uid
  from public.share_links
  where token_hash = extensions.digest(p_token, 'sha256') and kind = p_kind and revoked_at is null;
  if l_id is null or not public.is_role(uid, 'student') then return null; end if;
  update public.share_links set last_viewed_at = now() where id = l_id;
  return uid;
end $$;

-- Internal: a jsonb array, or [] for anything else (null, object, scalar).
create function public.share_jsonb_array(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end
$$;

-- Parent (read-only) view. p_today is the viewer's local date, clamped to +-2 days of the server's (as in 0023).
create function public.parent_view(p_token text, p_today date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.share_link_student(p_token, 'parent');
  today date := least(greatest(coalesce(p_today, current_date), current_date - 2), current_date + 2);
  sp public.student_profiles;
  recs jsonb;
  schols jsonb;
begin
  if uid is null then return null; end if;
  select * into sp from public.student_profiles where user_id = uid;

  -- 0026 / 0027 may not be applied yet; counts are null until they are.
  if to_regclass('public.recommenders') is not null then
    execute 'select jsonb_build_object(''total'', count(*), ''submitted'', count(*) filter (where status in (''submitted'', ''thanked'')))
             from public.recommenders where user_id = $1' into recs using uid;
  end if;
  if to_regclass('public.scholarships') is not null then
    execute 'select jsonb_build_object(''total'', count(*), ''submitted'', count(*) filter (where status = ''submitted''),
                                       ''awarded'', count(*) filter (where status = ''awarded''))
             from public.scholarships where user_id = $1' into schols using uid;
  end if;

  return jsonb_build_object(
    'kind', 'parent',
    'student', jsonb_build_object(
      'name', coalesce(nullif(btrim(sp.display_name), ''), nullif(btrim(sp.resume #>> '{header,fullName}'), '')),
      'school', nullif(btrim(sp.resume #>> '{header,school}'), ''),
      'grad_year', nullif(btrim(sp.resume #>> '{header,gradYear}'), '')),
    'updated_at', greatest(sp.updated_at, (select max(sc.updated_at) from public.student_colleges sc where sc.user_id = uid)),
    'colleges', coalesce((select jsonb_agg(jsonb_build_object(
        'name', coalesce(i.name, sc.custom ->> 'name', 'Custom college'),
        'custom', sc.institution_id is null,
        'status', sc.status,
        'plan', sc.plan_key,
        'checklist', jsonb_build_object(
          'recommendations', sc.checklist -> 'recommendations',
          'transcript', sc.checklist -> 'transcript',
          'test_scores', sc.checklist -> 'test_scores',
          'english_test', sc.checklist -> 'english_test',
          'no_essays', sc.checklist -> 'no_essays',
          'test_plan', sc.checklist -> 'test_plan',
          'english_plan', sc.checklist -> 'english_plan',
          -- statuses only: never essay titles or links
          'essay_list', (select coalesce(jsonb_agg(jsonb_build_object('status', e ->> 'status')), '[]'::jsonb)
                         from jsonb_array_elements(public.share_jsonb_array(sc.checklist -> 'essay_list')) e)),
        'deadlines', coalesce((select jsonb_agg(jsonb_build_object(
                         'due_date', x.due_date, 'kind', x.kind, 'label', x.label, 'plan', x.plan_key) order by x.due_date)
                       from public.upcoming_deadlines_for(array[uid], today, today + 400) x
                       where x.college_id = sc.id), '[]'::jsonb)
      ) order by sc.created_at, sc.id)
      from public.student_colleges sc
      left join public.institutions i on i.id = sc.institution_id
      where sc.user_id = uid), '[]'::jsonb),
    'recommenders', recs,
    'scholarships', schols
  );
end $$;

-- Public portfolio: what the student's resume shows (same source / hours / scores options), minus all contact
-- details (email, phone, location are never returned, whatever the resume header holds).
create function public.portfolio_view(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.share_link_student(p_token, 'portfolio');
  sp public.student_profiles;
  src text;
  show_hours boolean;
  show_scores boolean;
  ca_acts jsonb := '[]'::jsonb;
  ca_honors jsonb := '[]'::jsonb;
  uc jsonb := '[]'::jsonb;
begin
  if uid is null then return null; end if;
  select * into sp from public.student_profiles where user_id = uid;
  src := coalesce(sp.resume #>> '{options,source}', 'both');
  if src not in ('common', 'uc', 'both') then src := 'both'; end if;
  -- Same defaults as the resume page (DEFAULT_OPTIONS in web/lib/resume.ts): on unless explicitly false.
  show_hours := (sp.resume #> '{options,showHours}') is distinct from 'false'::jsonb;
  show_scores := (sp.resume #> '{options,showScores}') is distinct from 'false'::jsonb;

  if src <> 'uc' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'type', e ->> 'type', 'position', e ->> 'position', 'organization', e ->> 'organization',
             'description', e ->> 'description', 'grades', public.share_jsonb_array(e -> 'grades'),
             'timing', public.share_jsonb_array(e -> 'timing'),
             'hoursPerWeek', case when show_hours then e -> 'hoursPerWeek' end,
             'weeksPerYear', case when show_hours then e -> 'weeksPerYear' end) order by n), '[]'::jsonb)
      into ca_acts
      from jsonb_array_elements(public.share_jsonb_array(sp.activities #> '{commonApp,activities}')) with ordinality a(e, n);
    select coalesce(jsonb_agg(jsonb_build_object(
             'title', e ->> 'title', 'grades', public.share_jsonb_array(e -> 'grades'),
             'levels', public.share_jsonb_array(e -> 'levels')) order by n), '[]'::jsonb)
      into ca_honors
      from jsonb_array_elements(public.share_jsonb_array(sp.activities #> '{commonApp,honors}')) with ordinality a(e, n);
  end if;
  if src <> 'common' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'category', e ->> 'category', 'name', e ->> 'name', 'organization', e ->> 'organization',
             'description', e ->> 'description', 'grades', public.share_jsonb_array(e -> 'grades'),
             'awardLevel', e ->> 'awardLevel',
             'fromCommonApp', coalesce(e ->> 'fromId', '') <> '',
             'hoursPerWeek', case when show_hours then e -> 'hoursPerWeek' end,
             'weeksPerYear', case when show_hours then e -> 'weeksPerYear' end) order by n), '[]'::jsonb)
      into uc
      from jsonb_array_elements(public.share_jsonb_array(sp.activities -> 'uc')) with ordinality a(e, n);
  end if;

  return jsonb_build_object(
    'kind', 'portfolio',
    'header', jsonb_build_object(
      'fullName', coalesce(nullif(btrim(sp.resume #>> '{header,fullName}'), ''), nullif(btrim(sp.display_name), '')),
      'school', nullif(btrim(sp.resume #>> '{header,school}'), ''),
      'gradYear', nullif(btrim(sp.resume #>> '{header,gradYear}'), '')),
    'options', jsonb_build_object('source', src, 'showHours', show_hours, 'showScores', show_scores),
    'activities', jsonb_build_object('commonApp', jsonb_build_object('activities', ca_acts, 'honors', ca_honors), 'uc', uc),
    'scores', case when show_scores then jsonb_build_object(
        'gpa', sp.gpa_unweighted, 'sat', sp.sat_total, 'act', sp.act_composite,
        'satSections', sp.test_details -> 'sat',
        'english', sp.test_details -> 'english') end
  );
end $$;

revoke all on function public.create_share_link(text, text), public.revoke_share_link(uuid),
  public.share_link_student(text, text), public.share_jsonb_array(jsonb),
  public.parent_view(text, date), public.portfolio_view(text)
  from public, anon, authenticated;
grant execute on function public.create_share_link(text, text), public.revoke_share_link(uuid) to authenticated;
grant execute on function public.parent_view(text, date), public.portfolio_view(text) to anon, authenticated;
