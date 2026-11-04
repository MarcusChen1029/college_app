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
