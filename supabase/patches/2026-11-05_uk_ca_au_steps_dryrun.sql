-- DRY RUN (generated): migration 0054 + smoke-test body in one transaction, rolled back.
begin;
-- UK / Canada / Australia application steps, part 1: course and intake deadlines.
-- Spec: docs/superpowers/specs/2026-11-04-uk-ca-au-applications-design.md. Numbered 0054 at apply time
-- (Task 15 takes it from list_migrations + origin/main). Smoke test: supabase/patches/2026-11-05_uk_ca_au_steps_smoke_test.sql.
--
-- A UK / Canadian / Australian university can have its own application rows (program_id null) and one row per course
-- (program_id = programs.id); an Australian row can also be for one intake (Semester 1 's1' / Semester 2 's2').
-- Which rows a student sees mirrors web/lib/course-deadlines.ts (deadlinesForEntry, Task 8) exactly:
--   1. keep a row when its program is none or the picked course (checklist.course = programs.slug of that college),
--      and its intake is none, or no intake is picked (anything but "s1" / "s2" counts as none), or it matches;
--   2. drop a university application row when the picked course has its own application row with the same intake
--      (null equals null). Course rows of ANY date count here, like the TS callers that pass all of a college's rows;
--   3. a course row has no plan, so the plan filter never drops it (web/lib/deadline-rules.ts deadlineApplies).
-- US rows have neither column, so every rule is a no-op for them.
--
-- Objects (latest definition each starts from):
--   programs               + unique (id, institution_id), the target of the composite FK below.
--   deadlines              + program_id uuid (FK (program_id, institution_id) -> programs, on delete cascade, so a course
--                            row always belongs to a course of the SAME college), + intake text check in ('s1','s2'),
--                            + partial index on program_id. Grants: deadlines is read through table-level grants and the
--                            0001 "public read" RLS policy; no migration grants it per column, so the new columns need none.
--   upcoming_deadlines_for (0022:38)  rules 1-3. It feeds teacher_roster / teacher_student / teacher_deadlines (0023:37, :94,
--                            :119), teacher_digest_data (0029:90) and parent_view (0032:139); none of them reads deadlines
--                            directly, so they all follow without being redefined.
--   due_reminders          (0005:44)  the same rules (its own copy of the filters). reminder_log needs no change: course
--                            deadlines are ordinary deadlines rows.
--   parent_view            (0032:91, still the latest)  + 'slug' per college, + checklist keys ucas_ps, ucas_reference,
--                            admissions_test, extra_steps, course, intake, filtered exactly like parentChecklist in
--                            web/lib/share-links.ts (Task 7).
--   college_summary        (0003:2, its only definition)  course rows are left out of plans and next_deadline.
--
-- Headers: every replaced function restates its language, volatility, SECURITY DEFINER, set search_path = '' and its
-- argument defaults; return types are copied unchanged (create or replace refuses a different one). create or replace
-- keeps the owner and the ACL, so nothing is re-granted here. Since 0041 a NEW function gets no EXECUTE for
-- anon/authenticated/PUBLIC, but these are replacements. Roles that must still have EXECUTE after apply (Task 15 Step 6
-- and the smoke test check them):
--   parent_view(text, date)                    anon, authenticated (0032:214-219); never PUBLIC.
--   due_reminders(date)                        service_role only (0005:69-70); not PUBLIC, anon or authenticated.
--   upcoming_deadlines_for(uuid[], date, date) none of PUBLIC, anon, authenticated (0022:63-64); called only from the
--                                              SECURITY DEFINER functions above (owner postgres).
--   college_summary (view)                     SELECT for anon, authenticated (0003:36); create or replace view keeps it.
--                                              WITH (security_invoker = true) is restated, because create or replace view
--                                              replaces the view's options with the ones given.
--
-- Rollout (Task 15): 1. this migration, 2. the deadline-reminders Edge Function, 3. the web merge, 4. the data patch that
-- loads course / intake rows. Per statement:
--   * Does the code that is LIVE today still work after this migration?
--     - programs unique key, deadlines columns, FK, index: additive and nullable. The live web reads deadlines with
--       select("*") (web/lib/data.ts getDeadlines) and gets two extra null keys it ignores; the live Edge Function selects
--       an explicit column list (deadline-reminders/index.ts:176), unaffected.
--     - upcoming_deadlines_for / due_reminders / college_summary: same signatures and columns. Until the data patch no
--       row has program_id or intake, so rule 1 is true for every row, rule 2's NOT EXISTS finds no course row, the plan
--       filter's new "or d.program_id is not null" is false, and "d.program_id is null" in college_summary is true:
--       every caller gets exactly the rows it gets today.
--     - parent_view: adds keys only. The live parent page (normalizeParentView / parentChecklist on main) builds an
--       explicit object and ignores unknown keys.
--   * Does the NEW web code work before this migration is applied?
--     - Mostly: it reads deadlines with select("*") and treats a missing program_id / intake as null (course-deadlines.ts
--       uses == null), so it behaves like today. parent_view without 'slug' makes the parent page fall back to the US
--       checklist (Task 7), so a UK / CA / AU college's parent numbers would not match the student's until this is
--       applied: that is why the migration goes first. A new Edge Function that selects program_id / intake explicitly
--       would fail before it, so the function also deploys after the migration.
--     - No course rows exist until step 4, so steps 1-3 change no visible deadline.

-- ───────────── 1. columns ─────────────

alter table public.programs add constraint programs_id_institution_key unique (id, institution_id);

alter table public.deadlines add column program_id uuid, add column intake text check (intake in ('s1','s2'));
alter table public.deadlines add constraint deadlines_program_fkey foreign key (program_id, institution_id)
  references public.programs (id, institution_id) on delete cascade;
create index deadlines_program_id_idx on public.deadlines (program_id) where program_id is not null;

-- ───────────── 2. teacher / parent deadlines ─────────────

-- Same as 0022, plus rules 1-3 in the institution branch. cp = the student's picked course at this college (at most one:
-- programs is unique on (institution_id, slug)); null when none is picked or the slug is unknown, which keeps the
-- university rows. The custom-college branch is unchanged.
create or replace function public.upcoming_deadlines_for(p_students uuid[], p_from date, p_to date)
returns table (student_id uuid, college_id uuid, college_name text, college_slug text, due_date date, kind text, label text, plan_key text, status text)
language sql stable security definer set search_path = '' as $$
  select sc.user_id, sc.id, i.name, i.slug, d.due_date, d.kind,
         coalesce(d.label, ap.label, initcap(replace(d.kind, '_', ' '))), d.plan_key, sc.status
  from public.student_colleges sc
  join public.institutions i on i.id = sc.institution_id
  join public.deadlines d on d.institution_id = sc.institution_id and d.due_date between p_from and p_to
  left join public.application_plans ap on ap.key = d.plan_key
  left join public.programs cp on cp.institution_id = sc.institution_id and cp.slug = sc.checklist ->> 'course'
  where sc.user_id = any (p_students)
    and sc.status not in ('withdrawn', 'rejected', 'enrolled')
    -- rule 1: no program or the picked course; no intake, no intake picked, or the same intake
    and (d.program_id is null or d.program_id = cp.id)
    and (d.intake is null or coalesce(sc.checklist ->> 'intake', '') not in ('s1', 's2') or d.intake = sc.checklist ->> 'intake')
    -- rule 2: the picked course's own application row (any date) replaces the university's for the same intake
    and (d.kind <> 'application' or d.program_id is not null or not exists (
          select 1 from public.deadlines cd
          where cd.program_id = cp.id and cd.kind = 'application' and cd.intake is not distinct from d.intake))
    and (d.kind <> 'application' or (
          sc.status in ('researching', 'planning', 'in_progress')
          -- rule 3: a course row has no plan
          and (sc.plan_key is null or d.plan_key = sc.plan_key or d.program_id is not null)))
    and (d.kind <> 'deposit' or sc.status = 'admitted')
  union all
  select sc.user_id, sc.id, coalesce(sc.custom ->> 'name', 'Custom college'), 'custom-' || sc.id::text,
         public.safe_date(sc.custom ->> 'deadline'), 'application', 'Application deadline', null, sc.status
  from public.student_colleges sc
  where sc.user_id = any (p_students)
    and sc.institution_id is null
    and sc.status in ('researching', 'planning', 'in_progress')
    and public.safe_date(sc.custom ->> 'deadline') between p_from and p_to
$$;

-- ───────────── 3. reminder emails ─────────────

-- Same as 0005, plus the same join and rules 1-3.
create or replace function public.due_reminders(today date default current_date)
returns table (
  user_id uuid, email text, deadline_id uuid, days_before smallint, due_date date,
  college_name text, college_slug text, deadline_label text, kind text, plan_key text
)
language sql stable security definer set search_path = '' as $$
  select sc.user_id, u.email, d.id, (d.due_date - today)::smallint, d.due_date,
         i.name, i.slug,
         coalesce(d.label, ap.label, initcap(replace(d.kind, '_', ' '))), d.kind, d.plan_key
  from public.student_colleges sc
  join public.student_profiles sp on sp.user_id = sc.user_id and sp.reminder_emails
  join auth.users u on u.id = sc.user_id and u.email is not null
  join public.institutions i on i.id = sc.institution_id
  join public.deadlines d on d.institution_id = sc.institution_id and d.due_date is not null
  left join public.application_plans ap on ap.key = d.plan_key
  left join public.programs cp on cp.institution_id = sc.institution_id and cp.slug = sc.checklist ->> 'course'
  where (d.due_date - today) = any (sp.reminder_days)
    and sc.status not in ('withdrawn', 'rejected', 'enrolled')
    -- rule 1
    and (d.program_id is null or d.program_id = cp.id)
    and (d.intake is null or coalesce(sc.checklist ->> 'intake', '') not in ('s1', 's2') or d.intake = sc.checklist ->> 'intake')
    -- rule 2
    and (d.kind <> 'application' or d.program_id is not null or not exists (
          select 1 from public.deadlines cd
          where cd.program_id = cp.id and cd.kind = 'application' and cd.intake is not distinct from d.intake))
    and (d.kind <> 'application' or (
          sc.status in ('researching', 'planning', 'in_progress')
          -- rule 3
          and (sc.plan_key is null or d.plan_key = sc.plan_key or d.program_id is not null)))
    and (d.kind <> 'deposit' or sc.status = 'admitted')
    and not exists (select 1 from public.reminder_log rl
                    where rl.user_id = sc.user_id and rl.deadline_id = d.id and rl.days_before = (d.due_date - today))
  order by sc.user_id, d.due_date
$$;

-- ───────────── 4. parent link ─────────────

-- Same as 0032, plus each college's slug (picks its country checklist on the parent page) and the UK / CA / AU checklist
-- keys, filtered in SQL exactly like parentChecklist (web/lib/share-links.ts): the three step ticks only when true;
-- extra_steps only its true entries with a safe key; the course only when it is a slug (the parent page never shows
-- it, it only picks which steps count); the intake only "s1" / "s2". Nothing else of the checklist is returned.
create or replace function public.parent_view(p_token text, p_today date default null)
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
        -- null for a custom college
        'slug', i.slug,
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
                         from jsonb_array_elements(public.share_jsonb_array(sc.checklist -> 'essay_list')) e),
          -- UK / Canada / Australia: only what progress counts, so the parent's numbers match the student's
          'ucas_ps', case when sc.checklist -> 'ucas_ps' = 'true'::jsonb then true end,
          'ucas_reference', case when sc.checklist -> 'ucas_reference' = 'true'::jsonb then true end,
          'admissions_test', case when sc.checklist -> 'admissions_test' = 'true'::jsonb then true end,
          'extra_steps', (select jsonb_object_agg(e.key, true)
                          from jsonb_each(case when jsonb_typeof(sc.checklist -> 'extra_steps') = 'object'
                                               then sc.checklist -> 'extra_steps' else '{}'::jsonb end) e
                          where e.value = 'true'::jsonb and e.key ~ '^[a-z0-9_]{1,40}$'),
          'course', case when jsonb_typeof(sc.checklist -> 'course') = 'string' and sc.checklist ->> 'course' ~ '^[a-z0-9-]+$'
                         then sc.checklist -> 'course' end,
          'intake', case when sc.checklist ->> 'intake' in ('s1', 's2') then sc.checklist -> 'intake' end),
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

-- ───────────── 5. college list / compare ─────────────

-- Same as 0003 (every column, same order and types; same options), plus "d.program_id is null" in both deadline
-- subqueries: the list, compare and explore pages and the public MCP show the university's own rounds, never a course's
-- date (which would make next_deadline earlier than any university round, or add a course row's plan to plans).
create or replace view public.college_summary
with (security_invoker = true) as
select
  i.id, i.slug, i.name, i.short_name, i.country_code, i.state_region, i.city,
  i.latitude, i.longitude, i.setting, i.control, i.undergrad_enrollment, i.pct_international_ug,
  gt.tier_code                              as general_tier,
  s.cds_year, s.applicants, s.admits, s.admit_rate, s.ed_admit_rate, s.intl_admit_rate, s.gpa_avg,
  sat.p25 as sat_p25, sat.p50 as sat_p50, sat.p75 as sat_p75,
  act.p25 as act_p25, act.p50 as act_p50, act.p75 as act_p75,
  tp.policy                                 as test_policy,
  ep.policy                                 as english_policy,
  c.total_coa_usd, c.tuition_usd, c.tuition_out_of_state_usd, c.tuition_intl_usd, c.intl_aid_policy,
  (select coalesce(jsonb_object_agg(t.category_key, t.tier_code), '{}'::jsonb)
     from public.institution_tiers t where t.institution_id = i.id) as tiers,
  (select array_agg(distinct d.plan_key) from public.deadlines d
     where d.institution_id = i.id and d.kind = 'application' and d.plan_key is not null and d.program_id is null) as plans,
  (select min(d.due_date) from public.deadlines d
     where d.institution_id = i.id and d.kind = 'application' and d.due_date >= current_date and d.program_id is null) as next_deadline
from public.institutions i
left join public.institution_tiers gt on gt.institution_id = i.id and gt.category_key = 'general'
left join lateral (
  select * from public.admission_stats a where a.institution_id = i.id
  order by (a.source_note is null) desc, a.cds_year desc limit 1
) s on true
left join public.test_score_percentiles sat on sat.institution_id = i.id and sat.cds_year = s.cds_year and sat.test = 'SAT_TOTAL'
left join public.test_score_percentiles act on act.institution_id = i.id and act.cds_year = s.cds_year and act.test = 'ACT_COMPOSITE'
left join lateral (
  select * from public.test_policies p where p.institution_id = i.id order by p.cycle desc limit 1
) tp on true
left join public.english_policies ep on ep.institution_id = i.id
left join lateral (
  select * from public.cost_aid ca where ca.institution_id = i.id order by ca.year desc limit 1
) c on true;


-- ── setup, as the SQL Editor's postgres role, with no JWT claims (the plan-limit trigger then lets inserts pass) ──
select set_config('request.jwt.claims', '', true);

insert into public.countries (code, name) values ('GB', 'United Kingdom'), ('AU', 'Australia'), ('US', 'United States')
  on conflict (code) do nothing;
insert into public.application_plans (key, label, binding) values
  ('ED', 'Early Decision', true), ('EA', 'Early Action', false), ('RD', 'Regular Decision', false)
  on conflict (key) do nothing;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000009e0', 'ukcaau-smoke-t1@example.invalid'),
  ('00000000-0000-4000-8000-0000000009e1', 'ukcaau-smoke-g1@example.invalid'),
  ('00000000-0000-4000-8000-0000000009e2', 'ukcaau-smoke-g2@example.invalid'),
  ('00000000-0000-4000-8000-0000000009e3', 'ukcaau-smoke-g3@example.invalid'),
  ('00000000-0000-4000-8000-0000000009e4', 'ukcaau-smoke-g4@example.invalid'),
  ('00000000-0000-4000-8000-0000000009f1', 'ukcaau-smoke-au1@example.invalid'),
  ('00000000-0000-4000-8000-0000000009f2', 'ukcaau-smoke-au2@example.invalid'),
  ('00000000-0000-4000-8000-0000000009f3', 'ukcaau-smoke-au3@example.invalid'),
  ('00000000-0000-4000-8000-0000000009f4', 'ukcaau-smoke-au4@example.invalid'),
  ('00000000-0000-4000-8000-0000000009d1', 'ukcaau-smoke-u1@example.invalid'),
  ('00000000-0000-4000-8000-0000000009d2', 'ukcaau-smoke-u2@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000009e0', 'teacher'),
  ('00000000-0000-4000-8000-0000000009e1', 'student'), ('00000000-0000-4000-8000-0000000009e2', 'student'),
  ('00000000-0000-4000-8000-0000000009e3', 'student'), ('00000000-0000-4000-8000-0000000009e4', 'student'),
  ('00000000-0000-4000-8000-0000000009f1', 'student'), ('00000000-0000-4000-8000-0000000009f2', 'student'),
  ('00000000-0000-4000-8000-0000000009f3', 'student'), ('00000000-0000-4000-8000-0000000009f4', 'student'),
  ('00000000-0000-4000-8000-0000000009d1', 'student'), ('00000000-0000-4000-8000-0000000009d2', 'student');
insert into public.student_profiles (user_id, display_name, reminder_emails, reminder_days)
select u, n, true, '{14}'::smallint[] from (values
  ('00000000-0000-4000-8000-0000000009e1'::uuid, 'Smoke G1'), ('00000000-0000-4000-8000-0000000009e2'::uuid, 'Smoke G2'),
  ('00000000-0000-4000-8000-0000000009e3'::uuid, 'Smoke G3'), ('00000000-0000-4000-8000-0000000009e4'::uuid, 'Smoke G4'),
  ('00000000-0000-4000-8000-0000000009f1'::uuid, 'Smoke AU1'), ('00000000-0000-4000-8000-0000000009f2'::uuid, 'Smoke AU2'),
  ('00000000-0000-4000-8000-0000000009f3'::uuid, 'Smoke AU3'), ('00000000-0000-4000-8000-0000000009f4'::uuid, 'Smoke AU4'),
  ('00000000-0000-4000-8000-0000000009d1'::uuid, 'Smoke U1'), ('00000000-0000-4000-8000-0000000009d2'::uuid, 'Smoke U2')
) v(u, n);

insert into public.institutions (id, slug, name, country_code) values
  ('00000000-0000-4000-8000-000000000a01', 'smoke-gb', 'UK CA AU Smoke GB', 'GB'),
  ('00000000-0000-4000-8000-000000000a02', 'smoke-au', 'UK CA AU Smoke AU', 'AU'),
  ('00000000-0000-4000-8000-000000000a03', 'smoke-us', 'UK CA AU Smoke US', 'US'),
  ('00000000-0000-4000-8000-000000000a04', 'smoke-sum', 'UK CA AU Smoke Summary', 'GB');
insert into public.programs (id, institution_id, slug, name, source_url, retrieved_on) values
  ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000a01', 'x', 'Smoke X', 'https://example.invalid/x', '2026-11-05'),
  ('00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-000000000a01', 'y', 'Smoke Y', 'https://example.invalid/y', '2026-11-05'),
  ('00000000-0000-4000-8000-000000000b03', '00000000-0000-4000-8000-000000000a02', 'x', 'Smoke X', 'https://example.invalid/x', '2026-11-05'),
  ('00000000-0000-4000-8000-000000000b04', '00000000-0000-4000-8000-000000000a04', 'z', 'Smoke Z', 'https://example.invalid/z', '2026-11-05');
insert into public.deadlines (id, institution_id, cycle, kind, plan_key, label, due_date, program_id, intake) values
  ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000a01', '2026-27', 'application', 'RD', 'U13', '2027-01-13', null, null),
  ('00000000-0000-4000-8000-000000000c02', '00000000-0000-4000-8000-000000000a01', '2026-27', 'application', 'RD', 'U15', '2026-10-15', null, null),
  ('00000000-0000-4000-8000-000000000c03', '00000000-0000-4000-8000-000000000a01', '2026-27', 'scholarship', null, 'S', '2027-02-01', null, null),
  ('00000000-0000-4000-8000-000000000c04', '00000000-0000-4000-8000-000000000a01', '2026-27', 'application', null, 'CX', '2027-01-13', '00000000-0000-4000-8000-000000000b01', null),
  ('00000000-0000-4000-8000-000000000c05', '00000000-0000-4000-8000-000000000a01', '2026-27', 'application', 'EA', 'CY', '2027-01-20', '00000000-0000-4000-8000-000000000b02', null),
  ('00000000-0000-4000-8000-000000000c11', '00000000-0000-4000-8000-000000000a02', '2026-27', 'application', null, 'A1', '2026-11-30', null, 's1'),
  ('00000000-0000-4000-8000-000000000c12', '00000000-0000-4000-8000-000000000a02', '2026-27', 'application', null, 'A2', '2027-04-30', null, 's2'),
  ('00000000-0000-4000-8000-000000000c13', '00000000-0000-4000-8000-000000000a02', '2026-27', 'application', null, 'K1', '2026-10-31', '00000000-0000-4000-8000-000000000b03', 's1'),
  ('00000000-0000-4000-8000-000000000c14', '00000000-0000-4000-8000-000000000a02', '2026-27', 'application', null, 'K0', '2026-12-15', '00000000-0000-4000-8000-000000000b03', null),
  ('00000000-0000-4000-8000-000000000c15', '00000000-0000-4000-8000-000000000a02', '2026-27', 'scholarship', null, 'KS', '2027-03-31', '00000000-0000-4000-8000-000000000b03', 's2'),
  ('00000000-0000-4000-8000-000000000c21', '00000000-0000-4000-8000-000000000a03', '2026-27', 'application', 'ED', 'ED', '2026-11-01', null, null),
  ('00000000-0000-4000-8000-000000000c22', '00000000-0000-4000-8000-000000000a03', '2026-27', 'application', 'RD', 'RD', '2027-01-05', null, null),
  ('00000000-0000-4000-8000-000000000c23', '00000000-0000-4000-8000-000000000a03', '2026-27', 'scholarship', null, 'S', '2027-02-15', null, null),
  ('00000000-0000-4000-8000-000000000c31', '00000000-0000-4000-8000-000000000a04', '2026-27', 'application', 'RD', 'SUM-U', current_date + 60, null, null),
  ('00000000-0000-4000-8000-000000000c32', '00000000-0000-4000-8000-000000000a04', '2026-27', 'application', 'EA', 'SUM-Z', current_date + 30, '00000000-0000-4000-8000-000000000b04', null);
insert into public.student_colleges (user_id, institution_id, status, plan_key, checklist) values
  ('00000000-0000-4000-8000-0000000009e1', '00000000-0000-4000-8000-000000000a01', 'planning', 'RD',
   -- {course:x} for the deadline checks; the other keys only feed part F (none of them changes a deadline rule).
   '{"course":"x","ucas_ps":true,"ucas_reference":"yes","admissions_test":false,"recommendations":true,
     "extra_steps":{"ok":true,"bad":"yes","Bad-Key":true},
     "essay_list":[{"title":"Secret essay","url":"https://docs.google.com/document/d/smoke","status":"drafting"}]}'),
  ('00000000-0000-4000-8000-0000000009e2', '00000000-0000-4000-8000-000000000a01', 'planning', null, '{}'),
  ('00000000-0000-4000-8000-0000000009e3', '00000000-0000-4000-8000-000000000a01', 'planning', null, '{"course":"nope"}'),
  ('00000000-0000-4000-8000-0000000009e4', '00000000-0000-4000-8000-000000000a01', 'planning', 'ED', '{"course":"y"}'),
  ('00000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-000000000a02', 'planning', null, '{"course":"x","intake":"s2"}'),
  ('00000000-0000-4000-8000-0000000009f2', '00000000-0000-4000-8000-000000000a02', 'planning', null, '{"course":"x"}'),
  ('00000000-0000-4000-8000-0000000009f3', '00000000-0000-4000-8000-000000000a02', 'planning', null, '{}'),
  ('00000000-0000-4000-8000-0000000009f4', '00000000-0000-4000-8000-000000000a02', 'planning', null, '{"course":"x","intake":"s3"}'),
  ('00000000-0000-4000-8000-0000000009d1', '00000000-0000-4000-8000-000000000a03', 'planning', 'ED', '{}'),
  ('00000000-0000-4000-8000-0000000009d2', '00000000-0000-4000-8000-000000000a03', 'planning', 'RD', '{"course":"Bad Course","intake":"s1"}');
insert into public.teacher_links (teacher_id, student_id, via, created_at) values
  ('00000000-0000-4000-8000-0000000009e0', '00000000-0000-4000-8000-0000000009e1', 'individual', now()),
  ('00000000-0000-4000-8000-0000000009e0', '00000000-0000-4000-8000-0000000009e2', 'individual', now());

-- ═════════════ part A: the schema, function headers, grants and view options ═════════════
do $$
declare
  f record;
  p record;
begin
  if (select format_type(atttypid, atttypmod) from pg_attribute
       where attrelid = 'public.deadlines'::regclass and attname = 'program_id' and not attisdropped) is distinct from 'uuid' then
    raise exception 'FAIL: deadlines.program_id missing or not uuid';
  end if;
  if (select format_type(atttypid, atttypmod) from pg_attribute
       where attrelid = 'public.deadlines'::regclass and attname = 'intake' and not attisdropped) is distinct from 'text' then
    raise exception 'FAIL: deadlines.intake missing or not text';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'programs_id_institution_key'
                  and conrelid = 'public.programs'::regclass and contype = 'u') then
    raise exception 'FAIL: unique (id, institution_id) on programs missing';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deadlines_program_fkey' and conrelid = 'public.deadlines'::regclass
                  and contype = 'f' and confrelid = 'public.programs'::regclass and confdeltype = 'c') then
    raise exception 'FAIL: deadlines_program_fkey missing, or not ON DELETE CASCADE';
  end if;
  if to_regclass('public.deadlines_program_id_idx') is null then
    raise exception 'FAIL: deadlines_program_id_idx missing';
  end if;

  -- Each replaced function: SECURITY DEFINER, search_path = '', same language, volatility and arguments with defaults.
  -- (Return types can't have changed: create or replace refuses that.)
  for f in select * from (values
      ('public.upcoming_deadlines_for(uuid[],date,date)', 'sql', 's', 'p_students uuid[], p_from date, p_to date'),
      ('public.due_reminders(date)', 'sql', 's', 'today date DEFAULT CURRENT_DATE'),
      ('public.parent_view(text,date)', 'plpgsql', 'v', 'p_token text, p_today date DEFAULT NULL%')
    ) v(sig, lang, vol, args)
  loop
    select pr.prosecdef, pr.proconfig, l.lanname, pr.provolatile::text as vol, pg_get_function_arguments(pr.oid) as args
      into p
      from pg_proc pr join pg_language l on l.oid = pr.prolang
     where pr.oid = f.sig::regprocedure;
    if not p.prosecdef then raise exception 'FAIL: % is not SECURITY DEFINER', f.sig; end if;
    if not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c in ('search_path=""', 'search_path=')) then
      raise exception 'FAIL: % does not set search_path = '''' (proconfig %)', f.sig, p.proconfig;
    end if;
    if p.lanname <> f.lang or p.vol <> f.vol then
      raise exception 'FAIL: % language or volatility changed (%, %)', f.sig, p.lanname, p.vol;
    end if;
    if p.args not ilike f.args then raise exception 'FAIL: % arguments or defaults changed (%)', f.sig, p.args; end if;
  end loop;

  -- EXECUTE after apply: parent_view anon + authenticated; due_reminders service_role only; upcoming_deadlines_for no client.
  if not has_function_privilege('anon', 'public.parent_view(text,date)', 'execute')
     or not has_function_privilege('authenticated', 'public.parent_view(text,date)', 'execute') then
    raise exception 'FAIL: parent_view lost EXECUTE for anon or authenticated';
  end if;
  if not has_function_privilege('service_role', 'public.due_reminders(date)', 'execute') then
    raise exception 'FAIL: due_reminders lost EXECUTE for service_role';
  end if;
  if has_function_privilege('anon', 'public.due_reminders(date)', 'execute')
     or has_function_privilege('authenticated', 'public.due_reminders(date)', 'execute') then
    raise exception 'FAIL: due_reminders is executable by anon or authenticated';
  end if;
  if has_function_privilege('anon', 'public.upcoming_deadlines_for(uuid[],date,date)', 'execute')
     or has_function_privilege('authenticated', 'public.upcoming_deadlines_for(uuid[],date,date)', 'execute') then
    raise exception 'FAIL: upcoming_deadlines_for is executable by anon or authenticated';
  end if;
  if exists (select 1 from pg_proc pr, aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) a
              where pr.oid in ('public.upcoming_deadlines_for(uuid[],date,date)'::regprocedure,
                               'public.due_reminders(date)'::regprocedure, 'public.parent_view(text,date)'::regprocedure)
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'FAIL: PUBLIC has EXECUTE on a replaced function';
  end if;

  -- college_summary: same columns in the same order, security_invoker kept, SELECT for anon and authenticated.
  if (select string_agg(attname::text, ',' order by attnum) from pg_attribute
       where attrelid = 'public.college_summary'::regclass and attnum > 0 and not attisdropped)
     is distinct from 'id,slug,name,short_name,country_code,state_region,city,latitude,longitude,setting,control,'
                   || 'undergrad_enrollment,pct_international_ug,general_tier,cds_year,applicants,admits,admit_rate,'
                   || 'ed_admit_rate,intl_admit_rate,gpa_avg,sat_p25,sat_p50,sat_p75,act_p25,act_p50,act_p75,test_policy,'
                   || 'english_policy,total_coa_usd,tuition_usd,tuition_out_of_state_usd,tuition_intl_usd,intl_aid_policy,'
                   || 'tiers,plans,next_deadline' then
    raise exception 'FAIL: college_summary columns changed';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.college_summary'::regclass
                  and 'security_invoker=true' = any (coalesce(reloptions, '{}'::text[]))) then
    raise exception 'FAIL: college_summary lost security_invoker';
  end if;
  if not has_table_privilege('anon', 'public.college_summary', 'select')
     or not has_table_privilege('authenticated', 'public.college_summary', 'select') then
    raise exception 'FAIL: college_summary lost SELECT for anon or authenticated';
  end if;
end $$;

-- ═════════════ part B: the constraints refuse a bad intake and a course of another college ═════════════
-- (Positive controls: A1 / K1 were stored with 's1', CX with smoke-gb's own course.)
do $$
begin
  begin
    insert into public.deadlines (institution_id, cycle, kind, label, due_date, intake)
    values ('00000000-0000-4000-8000-000000000a02', '2026-27', 'application', 'bad intake', '2027-01-01', 's3');
    raise exception 'FAIL: intake s3 was accepted';
  exception when check_violation then null;
  end;
  begin
    -- smoke-gb row pointing at smoke-au's course x
    insert into public.deadlines (institution_id, cycle, kind, label, due_date, program_id)
    values ('00000000-0000-4000-8000-000000000a01', '2026-27', 'application', 'cross college', '2027-01-01',
            '00000000-0000-4000-8000-000000000b03');
    raise exception 'FAIL: a deadline accepted a course of another college';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ═════════════ part C: upcoming_deadlines_for (feeds the teacher and parent views), checks (a)-(d) ═════════════
-- Explicit window 2026-09-01 .. 2027-12-31 (holds every fixture row). Each case first asserts that every expected row
-- is there (so it can't pass on an empty result), then that nothing else is, then that no row came twice.
do $$
declare
  c record;
  got text[];
begin
  for c in select * from (values
      ('(a) GB course x, plan RD',     '00000000-0000-4000-8000-0000000009e1'::uuid, 'smoke-gb', '2026-09-01'::date, array['CX', 'S']),
      ('(a) GB course y, plan ED',     '00000000-0000-4000-8000-0000000009e4'::uuid, 'smoke-gb', '2026-09-01'::date, array['CY', 'S']),
      ('(b) GB no course',             '00000000-0000-4000-8000-0000000009e2'::uuid, 'smoke-gb', '2026-09-01'::date, array['U13', 'U15', 'S']),
      ('(b) GB unknown course',        '00000000-0000-4000-8000-0000000009e3'::uuid, 'smoke-gb', '2026-09-01'::date, array['U13', 'U15', 'S']),
      -- AU, by web/lib/course-deadlines.ts. Rows: A1 uni app s1, A2 uni app s2, K1 x app s1, K0 x app none, KS x schol s2.
      --   AU1 {x, s2}: rule 1 keeps A2, K0, KS (A1 and K1 are s1). Kept course application intakes = {none} (K0),
      --        so rule 2 drops no-intake university applications only: A2 (s2) stays. -> A2, K0, KS
      --   AU2 {x}: rule 1 keeps all five. Course application intakes = {s1 (K1), none (K0)}; KS is a scholarship and
      --        covers nothing. Rule 2 drops A1 (s1); A2 (s2) stays. -> K1, K0, KS, A2
      --   AU3 {}: rule 1 drops every course row. -> A1, A2
      --   AU4 {x, s3}: s3 counts as no intake, so the same as AU2. -> K1, K0, KS, A2
      -- A wrong subquery fails here: one without "kind = 'application'" lets KS (s2) remove A2 for AU1/AU2/AU4; one
      -- that treats a NULL course intake as "any intake", or ignores the intake, lets K0 remove A2 for AU1/AU2/AU4;
      -- one that drops course rows of other kinds loses KS.
      ('(c) AU course x, s2',          '00000000-0000-4000-8000-0000000009f1'::uuid, 'smoke-au', '2026-09-01'::date, array['A2', 'K0', 'KS']),
      ('(c) AU course x',              '00000000-0000-4000-8000-0000000009f2'::uuid, 'smoke-au', '2026-09-01'::date, array['K1', 'K0', 'KS', 'A2']),
      ('(c) AU no course',             '00000000-0000-4000-8000-0000000009f3'::uuid, 'smoke-au', '2026-09-01'::date, array['A1', 'A2']),
      ('(c) AU course x, intake s3',   '00000000-0000-4000-8000-0000000009f4'::uuid, 'smoke-au', '2026-09-01'::date, array['K1', 'K0', 'KS', 'A2']),
      -- K1 (2026-10-31) is outside this window but still replaces A1 (rule 2 counts course rows of any date);
      -- K0 (2026-12-15) and KS (2027-03-31) are inside it ...
      ('(c) AU course x, from 11-01',  '00000000-0000-4000-8000-0000000009f2'::uuid, 'smoke-au', '2026-11-01'::date, array['A2', 'K0', 'KS']),
      -- ... while the same window does hold A1 for a student without a course.
      ('(c) AU no course, from 11-01', '00000000-0000-4000-8000-0000000009f3'::uuid, 'smoke-au', '2026-11-01'::date, array['A1', 'A2']),
      ('(d) US plan ED',               '00000000-0000-4000-8000-0000000009d1'::uuid, 'smoke-us', '2026-09-01'::date, array['ED', 'S']),
      ('(d) US plan RD, odd checklist','00000000-0000-4000-8000-0000000009d2'::uuid, 'smoke-us', '2026-09-01'::date, array['RD', 'S'])
    ) t(name, sid, inst, from_date, want)
  loop
    select coalesce(array_agg(x.label), '{}') into got
      from public.upcoming_deadlines_for(array[c.sid], c.from_date, '2027-12-31') x
     where x.college_slug = c.inst;
    if not (got @> c.want) then
      raise exception 'FAIL: upcoming_deadlines_for % is missing a row: want %, got %', c.name, c.want, got;
    end if;
    if not (got <@ c.want) then
      raise exception 'FAIL: upcoming_deadlines_for % has an extra row: want %, got %', c.name, c.want, got;
    end if;
    if cardinality(got) <> cardinality(c.want) then
      raise exception 'FAIL: upcoming_deadlines_for % returned a row twice: %', c.name, got;
    end if;
  end loop;
end $$;

-- ═════════════ part D: due_reminders (its own copy of the filters), checks (a')-(d') and (e) ═════════════
-- For every case and EVERY row of that college: due_reminders(row's date - 14) sends it to the student exactly when the
-- row is in the expected set. Every expected row must be seen (counted), so an empty loop can't pass.
do $$
declare
  c record;
  r record;
  want boolean;
  got boolean;
  hits int;
begin
  for c in select * from (values
      ('(a'') GB course x, plan RD',   '00000000-0000-4000-8000-0000000009e1'::uuid, 'smoke-gb', array['CX', 'S']),
      ('(a'') GB course y, plan ED',   '00000000-0000-4000-8000-0000000009e4'::uuid, 'smoke-gb', array['CY', 'S']),
      ('(b'') GB no course',           '00000000-0000-4000-8000-0000000009e2'::uuid, 'smoke-gb', array['U13', 'U15', 'S']),
      ('(b'') GB unknown course',      '00000000-0000-4000-8000-0000000009e3'::uuid, 'smoke-gb', array['U13', 'U15', 'S']),
      -- Same expectations as part C (derivation there).
      ('(c'') AU course x, s2',        '00000000-0000-4000-8000-0000000009f1'::uuid, 'smoke-au', array['A2', 'K0', 'KS']),
      ('(c'') AU course x',            '00000000-0000-4000-8000-0000000009f2'::uuid, 'smoke-au', array['K1', 'K0', 'KS', 'A2']),
      ('(c'') AU no course',           '00000000-0000-4000-8000-0000000009f3'::uuid, 'smoke-au', array['A1', 'A2']),
      ('(c'') AU course x, intake s3', '00000000-0000-4000-8000-0000000009f4'::uuid, 'smoke-au', array['K1', 'K0', 'KS', 'A2']),
      ('(d'') US plan ED',             '00000000-0000-4000-8000-0000000009d1'::uuid, 'smoke-us', array['ED', 'S']),
      ('(d'') US plan RD',             '00000000-0000-4000-8000-0000000009d2'::uuid, 'smoke-us', array['RD', 'S'])
    ) t(name, sid, inst, want)
  loop
    hits := 0;
    for r in select d.id, d.label, d.due_date from public.deadlines d
               join public.institutions i on i.id = d.institution_id where i.slug = c.inst
    loop
      want := r.label = any (c.want);
      got := exists (select 1 from public.due_reminders(r.due_date - 14) x
                      where x.user_id = c.sid and x.deadline_id = r.id and x.days_before = 14);
      if got <> want then
        raise exception 'FAIL: due_reminders(%) for %: % should be %', r.due_date - 14, c.name, r.label,
          case when want then 'sent' else 'not sent' end;
      end if;
      if got then hits := hits + 1; end if;
    end loop;
    if hits <> cardinality(c.want) then
      raise exception 'FAIL: due_reminders % sent % of the % expected rows', c.name, hits, cardinality(c.want);
    end if;
  end loop;

  -- (e) 2026-12-30 is 14 days before 2027-01-13: G1 gets CX and not U13; G2 (no course) gets U13 that same day.
  if not exists (select 1 from public.due_reminders('2026-12-30') x
                  where x.user_id = '00000000-0000-4000-8000-0000000009e1' and x.deadline_label = 'CX'
                    and x.college_slug = 'smoke-gb' and x.days_before = 14) then
    raise exception 'FAIL: (e) due_reminders(2026-12-30) has no CX for the course-x student';
  end if;
  if exists (select 1 from public.due_reminders('2026-12-30') x
              where x.user_id = '00000000-0000-4000-8000-0000000009e1' and x.deadline_label = 'U13') then
    raise exception 'FAIL: (e) due_reminders(2026-12-30) sends U13 to the course-x student';
  end if;
  if not exists (select 1 from public.due_reminders('2026-12-30') x
                  where x.user_id = '00000000-0000-4000-8000-0000000009e2' and x.deadline_label = 'U13') then
    raise exception 'FAIL: (e) due_reminders(2026-12-30) has no U13 for the student without a course';
  end if;
end $$;

-- ═════════════ part E: college_summary (h), read as anon ═════════════
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare
  r record;
begin
  select s.next_deadline, s.plans into r from public.college_summary s where s.slug = 'smoke-sum';
  if not found then raise exception 'FAIL: (h) anon cannot see smoke-sum in college_summary'; end if;
  if r.next_deadline is distinct from current_date + 60 then
    raise exception 'FAIL: (h) next_deadline should be the university round (%), got %', current_date + 60, r.next_deadline;
  end if;
  -- The course row's EA must not appear; the university row's RD must.
  if r.plans is distinct from array['RD'] then raise exception 'FAIL: (h) plans should be {RD}, got %', r.plans; end if;
  if array_position(r.plans, null) is not null then raise exception 'FAIL: (h) plans has a NULL element'; end if;
end $$;
reset role;

-- ═════════════ part F: parent_view (f), links minted by the students, opened as anon ═════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009e1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform set_config('smoke.parent_g1', public.create_share_link('parent', 'Smoke parent'), true); end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009f1","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform set_config('smoke.parent_au1', public.create_share_link('parent', 'Smoke parent'), true); end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009f4","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform set_config('smoke.parent_au4', public.create_share_link('parent', 'Smoke parent'), true); end $$;
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009d2","role":"authenticated"}', true);
set local role authenticated;
do $$ begin perform set_config('smoke.parent_u2', public.create_share_link('parent', 'Smoke parent'), true); end $$;
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare
  -- The exact field lists of the migration's parent_view body (0032's, plus 'slug' per college and the six new
  -- checklist keys). Anything else in the body would reach anon, so every level is pinned, for every view below.
  top_keys constant text[] := array['kind', 'student', 'updated_at', 'colleges', 'recommenders', 'scholarships'];
  student_keys constant text[] := array['name', 'school', 'grad_year'];
  rec_keys constant text[] := array['total', 'submitted'];
  schol_keys constant text[] := array['total', 'submitted', 'awarded'];
  college_keys constant text[] := array['name', 'slug', 'custom', 'status', 'plan', 'checklist', 'deadlines'];
  deadline_keys constant text[] := array['due_date', 'kind', 'label', 'plan'];
  keys constant text[] := array['recommendations', 'transcript', 'test_scores', 'english_test', 'no_essays', 'test_plan',
    'english_plan', 'essay_list', 'ucas_ps', 'ucas_reference', 'admissions_test', 'extra_steps', 'course', 'intake'];
  v jsonb;
  c jsonb;
  k text[];
  tok text;
  col jsonb;
  dl jsonb;
  n_colleges int := 0;
  n_deadlines int := 0;
begin
  -- Exact key sets at every level of all four views (a field such as a college's portal_url added to the body fails).
  foreach tok in array array['smoke.parent_g1', 'smoke.parent_au1', 'smoke.parent_au4', 'smoke.parent_u2'] loop
    v := public.parent_view(current_setting(tok), current_date);
    if v is null then raise exception 'FAIL: (f) parent_view returned null for % (as anon)', tok; end if;
    select coalesce(array_agg(x), '{}') into k from jsonb_object_keys(v) x;
    if not (k @> top_keys and k <@ top_keys) then
      raise exception 'FAIL: (f) % top-level keys should be exactly %, got %', tok, top_keys, k;
    end if;
    select coalesce(array_agg(x), '{}') into k from jsonb_object_keys(v -> 'student') x;
    if not (k @> student_keys and k <@ student_keys) then
      raise exception 'FAIL: (f) % student keys should be exactly %, got %', tok, student_keys, k;
    end if;
    -- recommenders / scholarships: exactly these counts, or null when 0026 / 0027 are not applied
    if jsonb_typeof(v -> 'recommenders') = 'object' then
      select coalesce(array_agg(x), '{}') into k from jsonb_object_keys(v -> 'recommenders') x;
      if not (k @> rec_keys and k <@ rec_keys) then
        raise exception 'FAIL: (f) % recommenders keys should be exactly %, got %', tok, rec_keys, k;
      end if;
    elsif v -> 'recommenders' is distinct from 'null'::jsonb then
      raise exception 'FAIL: (f) % recommenders should be an object or null, got %', tok, v -> 'recommenders';
    end if;
    if jsonb_typeof(v -> 'scholarships') = 'object' then
      select coalesce(array_agg(x), '{}') into k from jsonb_object_keys(v -> 'scholarships') x;
      if not (k @> schol_keys and k <@ schol_keys) then
        raise exception 'FAIL: (f) % scholarships keys should be exactly %, got %', tok, schol_keys, k;
      end if;
    elsif v -> 'scholarships' is distinct from 'null'::jsonb then
      raise exception 'FAIL: (f) % scholarships should be an object or null, got %', tok, v -> 'scholarships';
    end if;
    if jsonb_typeof(v -> 'colleges') is distinct from 'array' then
      raise exception 'FAIL: (f) % colleges is not an array', tok;
    end if;
    for col in select x from jsonb_array_elements(v -> 'colleges') x loop
      n_colleges := n_colleges + 1;
      select coalesce(array_agg(x), '{}') into k from jsonb_object_keys(col) x;
      if not (k @> college_keys and k <@ college_keys) then
        raise exception 'FAIL: (f) % college keys should be exactly %, got %', tok, college_keys, k;
      end if;
      select coalesce(array_agg(x), '{}') into k from jsonb_object_keys(col -> 'checklist') x;
      if not (k @> keys and k <@ keys) then
        raise exception 'FAIL: (f) % checklist keys should be exactly %, got %', tok, keys, k;
      end if;
      if jsonb_typeof(col -> 'deadlines') is distinct from 'array' then
        raise exception 'FAIL: (f) % deadlines is not an array', tok;
      end if;
      for dl in select x from jsonb_array_elements(col -> 'deadlines') x loop
        n_deadlines := n_deadlines + 1;
        select coalesce(array_agg(x), '{}') into k from jsonb_object_keys(dl) x;
        if not (k @> deadline_keys and k <@ deadline_keys) then
          raise exception 'FAIL: (f) % deadline keys should be exactly %, got %', tok, deadline_keys, k;
        end if;
      end loop;
    end loop;
  end loop;
  -- Each student has one college; G1 alone has two deadlines (asserted below), so the loops did look at something.
  if n_colleges <> 4 or n_deadlines < 2 then
    raise exception 'FAIL: (f) key checks saw % colleges and % deadlines (want 4 and at least 2)', n_colleges, n_deadlines;
  end if;

  -- G1 (GB): slug, course, filtered extra_steps and step ticks, essay statuses only, the course's deadlines.
  v := public.parent_view(current_setting('smoke.parent_g1'), current_date);
  if v is null then raise exception 'FAIL: (f) parent_view returned null for an active link (as anon)'; end if;
  select x into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'smoke-gb';
  if c is null then raise exception 'FAIL: (f) no college with slug smoke-gb: %', v -> 'colleges'; end if;
  select coalesce(array_agg(x), '{}') into k from jsonb_object_keys(c -> 'checklist') x;
  if not (k @> keys and k <@ keys) then raise exception 'FAIL: (f) checklist keys should be exactly %, got %', keys, k; end if;
  if c #> '{checklist,course}' is distinct from '"x"'::jsonb then
    raise exception 'FAIL: (f) checklist.course should be "x", got %', c #> '{checklist,course}';
  end if;
  if c #> '{checklist,extra_steps}' is distinct from '{"ok": true}'::jsonb then
    raise exception 'FAIL: (f) extra_steps should be {"ok": true}, got %', c #> '{checklist,extra_steps}';
  end if;
  if c #> '{checklist,ucas_ps}' is distinct from 'true'::jsonb then raise exception 'FAIL: (f) ucas_ps true was dropped'; end if;
  if c #> '{checklist,ucas_reference}' is distinct from 'null'::jsonb then
    raise exception 'FAIL: (f) ucas_reference "yes" should come back null, got %', c #> '{checklist,ucas_reference}';
  end if;
  if c #> '{checklist,admissions_test}' is distinct from 'null'::jsonb then
    raise exception 'FAIL: (f) admissions_test false should come back null, got %', c #> '{checklist,admissions_test}';
  end if;
  if c #> '{checklist,intake}' is distinct from 'null'::jsonb then raise exception 'FAIL: (f) G1 has no intake'; end if;
  if c #> '{checklist,recommendations}' is distinct from 'true'::jsonb then raise exception 'FAIL: (f) recommendations lost'; end if;
  if c #> '{checklist,essay_list}' is distinct from '[{"status": "drafting"}]'::jsonb then
    raise exception 'FAIL: (f) essay_list should hold the status only, got %', c #> '{checklist,essay_list}';
  end if;
  select coalesce(array_agg(d ->> 'label'), '{}') into k from jsonb_array_elements(c -> 'deadlines') d;
  if not (k @> array['CX', 'S'] and k <@ array['CX', 'S'] and cardinality(k) = 2) then
    raise exception 'FAIL: (f) parent deadlines should be CX and S (run before 2027-01-13), got %', k;
  end if;

  -- AU1: intake s2 passes through.
  v := public.parent_view(current_setting('smoke.parent_au1'), current_date);
  select x into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'smoke-au';
  if c is null then raise exception 'FAIL: (f) no college with slug smoke-au for AU1'; end if;
  if c #> '{checklist,intake}' is distinct from '"s2"'::jsonb or c #> '{checklist,course}' is distinct from '"x"'::jsonb then
    raise exception 'FAIL: (f) AU1 should send intake "s2" and course "x", got %', c -> 'checklist';
  end if;

  -- AU4: intake s3 is dropped, the course stays.
  v := public.parent_view(current_setting('smoke.parent_au4'), current_date);
  select x into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'smoke-au';
  if c is null then raise exception 'FAIL: (f) no college with slug smoke-au for AU4'; end if;
  if c #> '{checklist,intake}' is distinct from 'null'::jsonb or c #> '{checklist,course}' is distinct from '"x"'::jsonb then
    raise exception 'FAIL: (f) AU4 should send no intake and course "x", got %', c -> 'checklist';
  end if;

  -- U2: a course that isn't a slug is dropped; s1 passes; extra_steps with nothing stored is null.
  v := public.parent_view(current_setting('smoke.parent_u2'), current_date);
  select x into c from jsonb_array_elements(v -> 'colleges') x where x ->> 'slug' = 'smoke-us';
  if c is null then raise exception 'FAIL: (f) no college with slug smoke-us for U2'; end if;
  if c #> '{checklist,course}' is distinct from 'null'::jsonb or c #> '{checklist,intake}' is distinct from '"s1"'::jsonb
     or c #> '{checklist,extra_steps}' is distinct from 'null'::jsonb then
    raise exception 'FAIL: (f) U2 should send no course, intake "s1" and no extra_steps, got %', c -> 'checklist';
  end if;
end $$;
reset role;

-- ═════════════ part G: teacher views (g), as T1 ═════════════
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000009e0","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  g1 constant uuid := '00000000-0000-4000-8000-0000000009e1';
  g2 constant uuid := '00000000-0000-4000-8000-0000000009e2';
  k text[];
begin
  if not exists (select 1 from public.teacher_deadlines(365, current_date) x
                  where x.student_id = g1 and x.college_slug = 'smoke-gb' and x.label = 'CX') then
    raise exception 'FAIL: (g) teacher_deadlines has no CX for the course-x student (run before 2027-01-13)';
  end if;
  if exists (select 1 from public.teacher_deadlines(365, current_date) x
              where x.student_id = g1 and x.college_slug = 'smoke-gb' and x.label = 'U13') then
    raise exception 'FAIL: (g) teacher_deadlines lists U13 for the course-x student';
  end if;
  if not exists (select 1 from public.teacher_deadlines(365, current_date) x
                  where x.student_id = g2 and x.college_slug = 'smoke-gb' and x.label = 'U13') then
    raise exception 'FAIL: (g) teacher_deadlines has no U13 for the student without a course';
  end if;
  -- teacher_student: the same student's college deadlines are exactly CX and S.
  select coalesce(array_agg(d ->> 'label'), '{}') into k
    from jsonb_array_elements(public.teacher_student(g1, current_date) -> 'colleges') c
    cross join lateral jsonb_array_elements(c -> 'deadlines') d
   where c ->> 'slug' = 'smoke-gb';
  if not (k @> array['CX', 'S'] and k <@ array['CX', 'S'] and cardinality(k) = 2) then
    raise exception 'FAIL: (g) teacher_student deadlines should be CX and S, got %', k;
  end if;
end $$;
reset role;

-- ═════════════ part H: deleting a course deletes its rows (on delete cascade) ═════════════
select set_config('request.jwt.claims', '', true);
delete from public.programs where id = '00000000-0000-4000-8000-000000000b02';
do $$
begin
  if exists (select 1 from public.deadlines where id = '00000000-0000-4000-8000-000000000c05') then
    raise exception 'FAIL: CY outlived its course';
  end if;
  if not exists (select 1 from public.deadlines where id = '00000000-0000-4000-8000-000000000c04') then
    raise exception 'FAIL: deleting course y took CX with it';
  end if;
  raise notice 'uk_ca_au_steps smoke test: all checks passed, rolling back';
end $$;

rollback;
select count(*) as persisted_columns from information_schema.columns where table_schema='public' and table_name='deadlines' and column_name in ('program_id','intake');
