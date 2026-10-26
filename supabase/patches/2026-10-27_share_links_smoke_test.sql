-- Smoke test for migration 0032_share_links. Run in the dashboard SQL Editor AFTER applying 0032.
-- It creates throwaway users inside one transaction, acts as each of them through the real RPCs, and ROLLS BACK,
-- so nothing is kept. Success = the final notice "share links smoke test: all checks passed".
-- Any failed check raises an exception (and the transaction is rolled back anyway).
--
-- Cast: student S (owns the links; profile and list rows hold planted secrets), student O (another user),
--       anon (a parent / portfolio visitor with no account).

begin;

-- ── setup, as the SQL Editor's postgres role ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000005a1', 'smoke-share-s@example.invalid'),
  ('00000000-0000-4000-8000-0000000005a2', 'smoke-share-o@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000005a1', 'student'), ('00000000-0000-4000-8000-0000000005a2', 'student');
-- Every value a share view must never return carries the marker SMOKESECRET.
insert into public.student_profiles (user_id, display_name, sat_total, portals, essays, resume, activities) values
  ('00000000-0000-4000-8000-0000000005a1', 'Smoke Student', 1400,
   '{"commonApp":{"url":"https://x.invalid","username":"SMOKESECRET-user","password":"SMOKESECRET-pw"}}',
   '{"personal":{"text":"SMOKESECRET essay body"}}',
   '{"header":{"fullName":"Smoke Student","email":"SMOKESECRET@example.invalid","phone":"SMOKESECRET-555","location":"SMOKESECRET town","school":"Smoke High","gradYear":"2027"},
     "options":{"source":"common","showHours":false,"showScores":false}}',
   '{"commonApp":{"activities":[{"id":"a1","type":"Robotics","position":"Captain","organization":"Smoke Robotics","description":"Built robots",
                                 "grades":["11","12"],"timing":["school"],"hoursPerWeek":6,"weeksPerYear":30,"continueInCollege":true}],
                  "honors":[{"id":"h1","title":"Smoke Award","grades":["12"],"levels":["national"]}]},
     "uc":[{"id":"u1","category":"work","name":"SMOKESECRET uc-only entry","organization":"","extra":"","description":"","grades":[],
            "hoursPerWeek":null,"weeksPerYear":null,"awardLevel":null,"awardType":null}]}');
insert into public.student_colleges (user_id, custom, status, plan_key, portal_url, portal_username, portal_password, aid_offer_usd, notes, checklist) values
  ('00000000-0000-4000-8000-0000000005a1', '{"name":"Smoke College","website":"SMOKESECRET-site"}', 'in_progress', null,
   'https://SMOKESECRET.invalid', 'SMOKESECRET-cu', 'SMOKESECRET-cp', 99999, 'SMOKESECRET note',
   '{"transcript":true,"essay_list":[{"id":"e1","title":"SMOKESECRET essay title","url":"https://SMOKESECRET.invalid/doc","status":"final"}]}');

-- Each "act as" step sets the JWT claims auth.uid() reads, then drops to the authenticated (or anon) role.

-- ── S creates links; the token comes back once; a second parent link replaces the first ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005a1","role":"authenticated"}', true);
set local role authenticated;
do $$
declare p1 text; p2 text; pf text; n int;
begin
  p1 := public.create_share_link('parent', 'For Mom');
  p2 := public.create_share_link('parent');
  pf := public.create_share_link('portfolio');
  if p1 !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'FAIL: token is not 43-char base64url: %', p1; end if;
  if p1 = p2 then raise exception 'FAIL: two links got the same token'; end if;
  perform set_config('smoke.p1', p1, true);
  perform set_config('smoke.p2', p2, true);
  perform set_config('smoke.pf', pf, true);

  select count(*) into n from public.share_links where revoked_at is null;
  if n <> 2 then raise exception 'FAIL: expected 2 active links (one per kind), got %', n; end if;
  select count(*) into n from public.share_links;
  if n <> 3 then raise exception 'FAIL: S should see all 3 of their links, got %', n; end if;

  -- token_hash is not readable by clients.
  begin
    perform token_hash from public.share_links limit 1;
    raise exception 'FAIL: client could read token_hash';
  exception when insufficient_privilege then null;
  end;
  -- No direct writes (links are made only through the RPC).
  begin
    insert into public.share_links (kind, token_hash, label) values ('parent', '\x00', 'x');
    raise exception 'FAIL: client inserted a share link directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_share_link('everything');
    raise exception 'FAIL: unknown kind accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
reset role;

-- ── another user cannot read S's links, nor revoke them ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005a2","role":"authenticated"}', true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.share_links;
  if n <> 0 then raise exception 'FAIL: user O sees % of S''s share links', n; end if;
end $$;
reset role;
-- O cannot revoke S's link even knowing its id (looked up here as postgres).
do $$
declare sid uuid;
begin
  select id into sid from public.share_links
  where student_id = '00000000-0000-4000-8000-0000000005a1' and kind = 'parent' and revoked_at is null;
  perform set_config('smoke.parent_id', sid::text, true);
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005a2","role":"authenticated"}', true);
set local role authenticated;
select public.revoke_share_link(current_setting('smoke.parent_id')::uuid);
reset role;
do $$
begin
  if exists (select 1 from public.share_links where id = current_setting('smoke.parent_id')::uuid and revoked_at is not null) then
    raise exception 'FAIL: user O revoked S''s link';
  end if;
end $$;

-- ── anon: no table access; the views work by token and leak nothing ──
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare v jsonb; pv jsonb; forbidden text[] := array['email','portals','portal_url','portal_username','portal_password','notes',
  'aid_offer_usd','essays','resume','transcript','phone','location','title','url','user_id','student_id','token_hash','website'];
  bad text;
begin
  begin
    perform 1 from public.share_links limit 1;
    raise exception 'FAIL: anon can read share_links';
  exception when insufficient_privilege then null;
  end;

  -- Old (replaced) parent token is dead; the current one works.
  if public.parent_view(current_setting('smoke.p1')) is not null then raise exception 'FAIL: replaced parent token still works'; end if;
  v := public.parent_view(current_setting('smoke.p2'));
  if v is null then raise exception 'FAIL: active parent token returned null'; end if;
  if v #>> '{student,name}' is distinct from 'Smoke Student' or v #>> '{student,grad_year}' is distinct from '2027' then
    raise exception 'FAIL: parent view student block wrong: %', v -> 'student';
  end if;
  if jsonb_array_length(v -> 'colleges') <> 1 or v #>> '{colleges,0,checklist,essay_list,0,status}' <> 'final' then
    raise exception 'FAIL: parent view colleges wrong: %', v -> 'colleges';
  end if;

  -- No forbidden key anywhere in the tree, and no planted secret anywhere in the text. The one allowed
  -- "transcript" key is the checklist's "transcript sent" tick, which must stay a plain boolean (or null).
  select k into bad
  from jsonb_path_query(v #- '{colleges,0,checklist,transcript}', '$.**') p(x),
       lateral jsonb_object_keys(case when jsonb_typeof(p.x) = 'object' then p.x else '{}'::jsonb end) k
  where k = any (forbidden) limit 1;
  if bad is not null then raise exception 'FAIL: parent view has forbidden key %', bad; end if;
  if coalesce(jsonb_typeof(v #> '{colleges,0,checklist,transcript}'), 'null') not in ('boolean', 'null') then
    raise exception 'FAIL: checklist transcript is not a tick: %', v #> '{colleges,0,checklist,transcript}';
  end if;
  if v::text like '%SMOKESECRET%' then raise exception 'FAIL: parent view leaks a secret: %', v; end if;

  -- Wrong kind: a portfolio token does not open the parent view (and vice versa); junk is null, not an error.
  if public.parent_view(current_setting('smoke.pf')) is not null then raise exception 'FAIL: portfolio token opened parent view'; end if;
  if public.portfolio_view(current_setting('smoke.p2')) is not null then raise exception 'FAIL: parent token opened portfolio'; end if;
  if public.parent_view('abc') is not null or public.parent_view(null) is not null then raise exception 'FAIL: junk token not null'; end if;

  -- Portfolio: resume header without contact lines; source=common hides UC entries; hours and scores off.
  pv := public.portfolio_view(current_setting('smoke.pf'));
  if pv is null then raise exception 'FAIL: active portfolio token returned null'; end if;
  if pv::text like '%SMOKESECRET%' then raise exception 'FAIL: portfolio leaks a secret: %', pv; end if;
  if pv #>> '{header,fullName}' is distinct from 'Smoke Student' or pv -> 'scores' is distinct from 'null'::jsonb then
    raise exception 'FAIL: portfolio header/scores wrong: %', pv;
  end if;
  if jsonb_array_length(pv #> '{activities,commonApp,activities}') <> 1
     or pv #> '{activities,commonApp,activities,0,hoursPerWeek}' <> 'null'::jsonb
     or jsonb_array_length(pv #> '{activities,uc}') <> 0 then
    raise exception 'FAIL: portfolio activities wrong: %', pv -> 'activities';
  end if;
end $$;
reset role;

-- last_viewed_at was stamped by the views.
do $$
begin
  if exists (select 1 from public.share_links
             where student_id = '00000000-0000-4000-8000-0000000005a1' and revoked_at is null and last_viewed_at is null) then
    raise exception 'FAIL: last_viewed_at not stamped';
  end if;
end $$;

-- ── S revokes the parent link; the token then returns null ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005a1","role":"authenticated"}', true);
set local role authenticated;
select public.revoke_share_link(current_setting('smoke.parent_id')::uuid);
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
begin
  if public.parent_view(current_setting('smoke.p2')) is not null then raise exception 'FAIL: revoked parent token still works'; end if;
  if public.portfolio_view(current_setting('smoke.pf')) is null then raise exception 'FAIL: revoking parent killed the portfolio link'; end if;
  begin
    perform public.create_share_link('parent');
    raise exception 'FAIL: anon created a share link';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  raise notice 'share links smoke test: all checks passed';
end $$;

rollback;
