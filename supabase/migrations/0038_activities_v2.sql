-- Activities in the 2026-27 portal format ("version": 2). Spec: docs/superpowers/specs/2026-10-28-activities-filler-design.md §3.
--
-- 1. public.activities_v2(jsonb): the SQL twin of upgradeActivities() in web/lib/activities.ts. Same rules, same output:
--    stored data in the earlier format is converted, current (version 2) data is only normalised, so running it twice
--    changes nothing. It is checked against web/lib/fixtures/activities-v1.json -> activities-v2.json by
--    scripts/check_activities_sql.mjs (which copies THIS function, between the BEGIN/END markers, into pg_temp).
-- 2. public.portfolio_view(): reads every profile through activities_v2() and returns version 2 entries, with only the
--    fields the resume shows (never `legacy`, `continueInCollege`, the after-high-school dates, `extra`, ids).
-- 3. private.activities_backup_0038: a copy of every profile's activities before the backfill.
-- 4. The backfill (last; its UPDATE waits for the owner's approval in the Supabase MCP prompt).

-- BEGIN activities_v2
create or replace function public.activities_v2(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $fn$
declare
  -- JavaScript's whitespace (String.prototype.trim and /\s/): U+0009-U+000D, space, NBSP, U+1680, U+2000-U+200A,
  -- U+2028, U+2029, U+202F, U+205F, U+3000, U+FEFF. Listed one by one (no ranges) so no collation can change it.
  ws constant text := '[' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32) || chr(160) || chr(5760)
                      || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199)
                      || chr(8200) || chr(8201) || chr(8202)
                      || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279) || ']';
  trim_re constant text := '^' || ws || '+|' || ws || '+$';
  legacy_prefix constant text := 'From your earlier version: ';
  k_grades constant text[] := array['9', '10', '11', '12', 'PG'];
  k_honor_levels constant text[] := array['school', 'state_regional', 'national', 'international'];
  k_uc_categories constant text[] := array['award', 'edprep', 'extracurricular', 'coursework', 'volunteer', 'work'];
  k_award_levels constant text[] := array['school', 'city', 'state', 'regional', 'national', 'international'];
  k_after_years constant jsonb[] := array['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '"10+"']::jsonb[];
  -- OLD_CA_TYPES in activities.ts (old Common App label -> 2026-27 label). Any other value passes through.
  k_old_types constant jsonb := '{
    "Academic": "Academic",
    "Art": "Art",
    "Athletics: Club": "Athletics (other)",
    "Athletics: JV/Varsity": "Athletics (JV or varsity)",
    "Career Oriented": "Career readiness or practicums",
    "Community Service (Volunteer)": "Community service or volunteer work",
    "Computer/Technology": "Computer or technology",
    "Cultural": "Cultural",
    "Dance": "Dance",
    "Debate/Speech": "Debate or speech",
    "Environmental": "Environmental",
    "Family Responsibilities": "Family responsibilities",
    "Foreign Exchange": "Study abroad or foreign exchange",
    "Foreign Language": "Foreign language",
    "Internship": "Internship",
    "Journalism/Publication": "Journalism or publishing",
    "Junior R.O.T.C.": "R.O.T.C. or military",
    "LGBT": "LGBT+",
    "Music: Instrumental": "Music",
    "Music: Vocal": "Music",
    "Religious": "Religious",
    "Research": "Research",
    "Robotics": "Robotics",
    "School Spirit": "School spirit",
    "Science/Math": "Science or math",
    "Social Justice": "Social justice or organizing",
    "Student Govt./Politics": "Student government or politics",
    "Theater/Drama": "Theater or drama",
    "Work (Paid)": "Employment or work (paid)",
    "Other Club/Activity": "Other"
  }';
  -- UC_EDPREP_PROGRAMS in activities.ts (value, label), in order; "18" = Other.
  k_programs constant text[] := array[
    ['1', 'ATDP (Academic Talent Development Program)'],
    ['181', 'boost@BerkeleyHaas'],
    ['281', 'California State Summer School for Mathematics and Science (COSMOS)'],
    ['2', 'Cal-SOAP'],
    ['3', 'CAMP (California Alliance for Minority Participation in Science)'],
    ['4', 'CBOP (Career Based Outreach Program)'],
    ['201', 'College Bound Academy Programs'],
    ['202', 'Council of African American Parents (CAAP)'],
    ['63', 'C-STEM'],
    ['6', 'Early Academic Outreach Program (EAOP)'],
    ['7', 'Educational Guidance Center (EGC)'],
    ['8', 'Educational Talent Search'],
    ['10', 'GEAR UP'],
    ['11', 'MESA (Mathematics, Engineering, Science Achievement) including MESA Schools Programs, SUCCESS Through Collaboration and California Community College Program'],
    ['12', 'PDP (Professional Development Program)'],
    ['13', 'Puente Program'],
    ['241', 'UC Links'],
    ['65', 'UC Merced Transfer Initiative Programs'],
    ['64', 'UC Scholars'],
    ['203', 'UCD Sacramento Area Youth Speaks (SAYS)'],
    ['161', 'UCLA Center for Community College Partnerships (CCCP)/SITE'],
    ['62', 'UCLA VIP Scholars Program'],
    ['15', 'UCSC SAGE (Students Acquiring "A-G" Expectations)'],
    ['9', 'UCSF Internships'],
    ['16', 'Upward Bound'],
    ['261', 'Wonderful Education'],
    ['18', 'Other']
  ];
  k_other constant text := '18';
  k_other_name_max constant int := 30; -- UC_LIMITS.otherProgramName

  src jsonb;
  ca jsonb;
  v1 boolean;
  item jsonb;
  idx bigint;
  e jsonb;
  acts jsonb := '[]'::jsonb;
  honors jsonb := '[]'::jsonb;
  uc jsonb := '[]'::jsonb;
  -- per entry
  pos text;
  cat text;
  nm text;
  job text;
  org text;
  prog text;
  hw jsonb;
  wy jsonb;
  wh jsonb;
  notes text[];
  hours_parts text[];
  g text;
  old_name text;
  match_key text;
  lbl text;
begin
  src := case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end;
  -- upgradeActivities: `src.version !== 2` (a jsonb 2.0 equals 2, as in JavaScript; "2" does not).
  v1 := (src -> 'version') is distinct from '2'::jsonb;
  ca := case when jsonb_typeof(src -> 'commonApp') = 'object' then src -> 'commonApp' else '{}'::jsonb end;

  -- ── Common App activities ──
  for item, idx in
    select a.el, a.ord
    from jsonb_array_elements(case when jsonb_typeof(ca -> 'activities') = 'array' then ca -> 'activities' else '[]'::jsonb end)
         with ordinality as a(el, ord)
  loop
    continue when jsonb_typeof(item) is distinct from 'object';
    pos := case when jsonb_typeof(item -> 'position') = 'string' then item ->> 'position' else '' end;
    e := jsonb_build_object(
      'id', case when jsonb_typeof(item -> 'id') = 'string' and regexp_replace(item ->> 'id', trim_re, '', 'g') <> ''
                 then item -> 'id' else to_jsonb('legacy-ca-' || (idx - 1)::text) end,
      'type', coalesce(k_old_types -> (case when jsonb_typeof(item -> 'type') = 'string' then item ->> 'type' else '' end),
                       to_jsonb(case when jsonb_typeof(item -> 'type') = 'string' then item ->> 'type' else '' end)),
      'sport', case when jsonb_typeof(item -> 'sport') = 'string' then item ->> 'sport' else '' end,
      -- The old form had no leadership question; a non-blank role was the only hint. Absent key only.
      'leadership', case when (item -> 'leadership') is null
                           then case when regexp_replace(pos, trim_re, '', 'g') <> '' then 'true'::jsonb end
                         when jsonb_typeof(item -> 'leadership') = 'boolean' then item -> 'leadership' end,
      'position', pos,
      'organization', case when jsonb_typeof(item -> 'organization') = 'string' then item ->> 'organization' else '' end,
      'description', case when jsonb_typeof(item -> 'description') = 'string' then item ->> 'description' else '' end,
      'grades', coalesce((select jsonb_agg(x.el order by x.ord)
                          from jsonb_array_elements(case when jsonb_typeof(item -> 'grades') = 'array' then item -> 'grades' else '[]'::jsonb end)
                               with ordinality as x(el, ord)
                          where jsonb_typeof(x.el) = 'string' and (x.el #>> '{}') = any (k_grades)), '[]'::jsonb),
      'timing', case jsonb_typeof(item -> 'timing')
                  when 'array' then (
                    select case when bool_or(x.el = '"school"'::jsonb) and bool_or(x.el = '"break"'::jsonb) then '"all"'::jsonb
                                when bool_or(x.el = '"school"'::jsonb) then '"school"'::jsonb
                                when bool_or(x.el = '"break"'::jsonb) then '"break"'::jsonb end
                    from jsonb_array_elements(item -> 'timing') as x(el))
                  when 'string' then case when (item ->> 'timing') in ('school', 'break', 'all') then item -> 'timing' end
                end,
      'afterStart', case when jsonb_typeof(item -> 'afterStart') = 'string' and (item ->> 'afterStart') <> '' then item -> 'afterStart' end,
      'stillParticipating', case when jsonb_typeof(item -> 'stillParticipating') = 'boolean' then item -> 'stillParticipating' end,
      'afterEnd', case when jsonb_typeof(item -> 'afterEnd') = 'string' and (item ->> 'afterEnd') <> '' then item -> 'afterEnd' end,
      'hoursPerWeek', case when jsonb_typeof(item -> 'hoursPerWeek') = 'number' then item -> 'hoursPerWeek' end,
      'weeksPerYear', case when jsonb_typeof(item -> 'weeksPerYear') = 'number' then item -> 'weeksPerYear' end,
      'continueInCollege', case when (item -> 'continueInCollege') = 'true'::jsonb then '"yes"'::jsonb
                                when (item -> 'continueInCollege') = 'false'::jsonb then '"no"'::jsonb
                                when jsonb_typeof(item -> 'continueInCollege') = 'string'
                                     and (item ->> 'continueInCollege') in ('yes', 'no', 'not_sure') then item -> 'continueInCollege' end
    );
    if jsonb_typeof(item -> 'legacy') = 'string' and (item ->> 'legacy') <> '' then
      e := e || jsonb_build_object('legacy', item ->> 'legacy');
    end if;
    acts := acts || jsonb_build_array(e);
  end loop;

  -- ── Common App honors ──
  for item, idx in
    select a.el, a.ord
    from jsonb_array_elements(case when jsonb_typeof(ca -> 'honors') = 'array' then ca -> 'honors' else '[]'::jsonb end)
         with ordinality as a(el, ord)
  loop
    continue when jsonb_typeof(item) is distinct from 'object';
    honors := honors || jsonb_build_array(jsonb_build_object(
      'id', case when jsonb_typeof(item -> 'id') = 'string' and regexp_replace(item ->> 'id', trim_re, '', 'g') <> ''
                 then item -> 'id' else to_jsonb('legacy-honor-' || (idx - 1)::text) end,
      'title', case when jsonb_typeof(item -> 'title') = 'string' then item ->> 'title' else '' end,
      'grades', coalesce((select jsonb_agg(x.el order by x.ord)
                          from jsonb_array_elements(case when jsonb_typeof(item -> 'grades') = 'array' then item -> 'grades' else '[]'::jsonb end)
                               with ordinality as x(el, ord)
                          where jsonb_typeof(x.el) = 'string' and (x.el #>> '{}') = any (k_grades)), '[]'::jsonb),
      'levels', coalesce((select jsonb_agg(x.el order by x.ord)
                          from jsonb_array_elements(case when jsonb_typeof(item -> 'levels') = 'array' then item -> 'levels' else '[]'::jsonb end)
                               with ordinality as x(el, ord)
                          where jsonb_typeof(x.el) = 'string' and (x.el #>> '{}') = any (k_honor_levels)), '[]'::jsonb)
    ));
  end loop;

  -- ── UC ──
  for item, idx in
    select a.el, a.ord
    from jsonb_array_elements(case when jsonb_typeof(src -> 'uc') = 'array' then src -> 'uc' else '[]'::jsonb end)
         with ordinality as a(el, ord)
  loop
    continue when jsonb_typeof(item) is distinct from 'object';
    cat := case when jsonb_typeof(item -> 'category') = 'string' and (item ->> 'category') = any (k_uc_categories)
                then item ->> 'category' else 'extracurricular' end;
    nm := case when jsonb_typeof(item -> 'name') = 'string' then item ->> 'name' else '' end;
    job := case when jsonb_typeof(item -> 'jobTitle') = 'string' then item ->> 'jobTitle' else '' end;
    org := case when jsonb_typeof(item -> 'organization') = 'string' then item ->> 'organization' else '' end;
    prog := case when jsonb_typeof(item -> 'program') = 'string' and (item ->> 'program') <> '' then item ->> 'program' end;
    hw := case when jsonb_typeof(item -> 'hoursPerWeek') = 'number' then item -> 'hoursPerWeek' end;
    wy := case when jsonb_typeof(item -> 'weeksPerYear') = 'number' then item -> 'weeksPerYear' end;
    notes := case when jsonb_typeof(item -> 'legacy') = 'string' and (item ->> 'legacy') <> '' then array[item ->> 'legacy'] else '{}'::text[] end;

    -- workHours: per grade (in GRADES order), only grades whose value is an object.
    wh := '{}'::jsonb;
    if jsonb_typeof(item -> 'workHours') = 'object' then
      foreach g in array k_grades loop
        if jsonb_typeof(item -> 'workHours' -> g) = 'object' then
          wh := wh || jsonb_build_object(g, jsonb_build_object(
            'schoolYear', case when jsonb_typeof(item -> 'workHours' -> g -> 'schoolYear') = 'number' then item -> 'workHours' -> g -> 'schoolYear' end,
            'summer', case when jsonb_typeof(item -> 'workHours' -> g -> 'summer') = 'number' then item -> 'workHours' -> g -> 'summer' end));
        end if;
      end loop;
    end if;

    if v1 and cat = 'work' then
      -- The earlier work entry kept the job title in `name` and the employer in `organization`.
      job := nm;
      nm := org;
      -- The old hours have no matching question (UC asks per grade): kept as a note, printed as JavaScript prints numbers.
      hours_parts := '{}'::text[];
      if hw is not null then hours_parts := array_append(hours_parts, trim_scale((hw #>> '{}')::numeric)::text || ' hours/week'); end if;
      if wy is not null then hours_parts := array_append(hours_parts, trim_scale((wy #>> '{}')::numeric)::text || ' weeks/year'); end if;
      if cardinality(hours_parts) > 0 then notes := array_append(notes, legacy_prefix || array_to_string(hours_parts, ', ')); end if;
      hw := null;
      wy := null;
    elsif v1 then
      if cat = 'edprep' then
        old_name := regexp_replace(nm, trim_re, '', 'g');
        match_key := regexp_replace(regexp_replace(lower(old_name), ws || '+', ' ', 'g'), trim_re, '', 'g');
        prog := null;
        if match_key <> '' then
          -- ucProgramFor: the full label, the text in its last "( )", or the text before its first " (". Other excluded.
          for j in 1 .. array_length(k_programs, 1) loop
            continue when k_programs[j][1] = k_other;
            lbl := k_programs[j][2];
            if match_key = any (array[
                 regexp_replace(regexp_replace(lower(lbl), ws || '+', ' ', 'g'), trim_re, '', 'g'),
                 regexp_replace(regexp_replace(lower(substring(lbl from '\(([^()]*)\)[^()]*$')), ws || '+', ' ', 'g'), trim_re, '', 'g'),
                 regexp_replace(regexp_replace(lower(split_part(lbl, ' (', 1)), ws || '+', ' ', 'g'), trim_re, '', 'g')]) then
              prog := k_programs[j][1];
              exit;
            end if;
          end loop;
        end if;
        if prog is not null then
          nm := '';
        elsif old_name = '' then
          nm := ''; -- nothing to go on: left for the student
        -- ucTextLength: JavaScript length (UTF-16 units: a character above U+FFFF counts 2) + one more per line break.
        elsif length(old_name)
              + (select count(*)::int from generate_series(1, length(old_name)) as s(cp_i) where ascii(substr(old_name, s.cp_i, 1)) > 65535)
              + (length(old_name) - length(replace(old_name, chr(10), ''))) <= k_other_name_max then
          prog := k_other;
          nm := old_name;
        else
          prog := k_other; -- too long for UC's Other box
          nm := '';
          notes := array_append(notes, legacy_prefix || old_name);
        end if;
      end if;
      -- Only work had an employer question, but the old MCP tool accepted `organization` on any category.
      if regexp_replace(org, trim_re, '', 'g') <> '' then
        notes := array_append(notes, legacy_prefix || 'organization ' || org);
      end if;
    end if;

    e := jsonb_build_object(
      'id', case when jsonb_typeof(item -> 'id') = 'string' and regexp_replace(item ->> 'id', trim_re, '', 'g') <> ''
                 then item -> 'id' else to_jsonb('legacy-uc-' || (idx - 1)::text) end,
      'category', cat,
      'name', nm,
      'jobTitle', job,
      'extra', case when jsonb_typeof(item -> 'extra') = 'string' then item ->> 'extra' else '' end,
      'description', case when jsonb_typeof(item -> 'description') = 'string' then item ->> 'description' else '' end,
      'grades', coalesce((select jsonb_agg(x.el order by x.ord)
                          from jsonb_array_elements(case when jsonb_typeof(item -> 'grades') = 'array' then item -> 'grades' else '[]'::jsonb end)
                               with ordinality as x(el, ord)
                          where jsonb_typeof(x.el) = 'string' and (x.el #>> '{}') = any (k_grades)), '[]'::jsonb),
      'hoursPerWeek', hw,
      'weeksPerYear', wy,
      'afterYears', case when (item -> 'afterYears') = any (k_after_years) then item -> 'afterYears' end,
      'afterMonths', case when jsonb_typeof(item -> 'afterMonths') = 'number' then item -> 'afterMonths' end,
      -- Old entries held one level (`awardLevel`); current ones hold a list.
      'awardLevels', case when jsonb_typeof(item -> 'awardLevels') = 'array' then
                            coalesce((select jsonb_agg(x.el order by x.ord)
                                      from jsonb_array_elements(item -> 'awardLevels') with ordinality as x(el, ord)
                                      where jsonb_typeof(x.el) = 'string' and (x.el #>> '{}') = any (k_award_levels)), '[]'::jsonb)
                          when jsonb_typeof(item -> 'awardLevel') = 'string' and (item ->> 'awardLevel') = any (k_award_levels) then
                            jsonb_build_array(item -> 'awardLevel')
                          else '[]'::jsonb end,
      'awardType', case when (item ->> 'awardType') in ('academic', 'non_academic') and jsonb_typeof(item -> 'awardType') = 'string'
                        then item -> 'awardType' end,
      'program', prog,
      'workHours', wh,
      'stillWorking', case when jsonb_typeof(item -> 'stillWorking') = 'boolean' then item -> 'stillWorking' end,
      'start', case when jsonb_typeof(item -> 'start') = 'string' and (item ->> 'start') <> '' then item -> 'start' end,
      'end', case when jsonb_typeof(item -> 'end') = 'string' and (item ->> 'end') <> '' then item -> 'end' end
    );
    if cardinality(notes) > 0 then e := e || jsonb_build_object('legacy', array_to_string(notes, '; ')); end if;
    if jsonb_typeof(item -> 'fromId') = 'string' and (item ->> 'fromId') <> '' then
      e := e || jsonb_build_object('fromId', item ->> 'fromId');
    end if;
    uc := uc || jsonb_build_array(e);
  end loop;

  return jsonb_build_object('version', 2, 'commonApp', jsonb_build_object('activities', acts, 'honors', honors), 'uc', uc);
end $fn$;
-- END activities_v2

-- Only SECURITY DEFINER functions (portfolio_view, the extension RPCs) call it; it is not an API endpoint.
revoke all on function public.activities_v2(jsonb) from public, anon, authenticated;

-- Public portfolio (replaces the 0032 definition): what the student's resume shows, minus all contact details.
-- Activities are read through activities_v2() (so a profile not yet backfilled reads the same) and returned as
-- version 2 entries carrying only what the resume builder (web/lib/resume.ts) uses. Never returned: `legacy` (the
-- student's private note), `continueInCollege`, the after-high-school dates, `extra`, ids. A role is returned only when
-- the leadership answer is yes (the only time the resume shows it). Hours, weeks and the work-hours grid only when the
-- resume shows hours. A UC entry copied from Common App says so with `fromCommonApp` (the resume lists it once).
create or replace function public.portfolio_view(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.share_link_student(p_token, 'portfolio');
  sp public.student_profiles;
  acts jsonb;
  src text;
  show_hours boolean;
  show_scores boolean;
  ca_acts jsonb := '[]'::jsonb;
  ca_honors jsonb := '[]'::jsonb;
  uc jsonb := '[]'::jsonb;
begin
  if uid is null then return null; end if;
  select * into sp from public.student_profiles where user_id = uid;
  acts := public.activities_v2(sp.activities);
  src := coalesce(sp.resume #>> '{options,source}', 'both');
  if src not in ('common', 'uc', 'both') then src := 'both'; end if;
  -- Same defaults as the resume page (DEFAULT_OPTIONS in web/lib/resume.ts): on unless explicitly false.
  show_hours := (sp.resume #> '{options,showHours}') is distinct from 'false'::jsonb;
  show_scores := (sp.resume #> '{options,showScores}') is distinct from 'false'::jsonb;

  if src <> 'uc' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'type', e -> 'type', 'sport', e -> 'sport', 'leadership', e -> 'leadership',
             'position', case when (e -> 'leadership') = 'true'::jsonb then e -> 'position' else '""'::jsonb end,
             'organization', e -> 'organization', 'description', e -> 'description',
             'grades', e -> 'grades', 'timing', e -> 'timing',
             'hoursPerWeek', case when show_hours then e -> 'hoursPerWeek' end,
             'weeksPerYear', case when show_hours then e -> 'weeksPerYear' end) order by n), '[]'::jsonb)
      into ca_acts
      from jsonb_array_elements(acts #> '{commonApp,activities}') with ordinality a(e, n);
    select coalesce(jsonb_agg(jsonb_build_object(
             'title', e -> 'title', 'grades', e -> 'grades', 'levels', e -> 'levels') order by n), '[]'::jsonb)
      into ca_honors
      from jsonb_array_elements(acts #> '{commonApp,honors}') with ordinality a(e, n);
  end if;
  if src <> 'common' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'category', e -> 'category', 'name', e -> 'name', 'jobTitle', e -> 'jobTitle', 'program', e -> 'program',
             'description', e -> 'description', 'grades', e -> 'grades', 'awardLevels', e -> 'awardLevels',
             'fromCommonApp', coalesce(e ->> 'fromId', '') <> '',
             'hoursPerWeek', case when show_hours then e -> 'hoursPerWeek' end,
             'weeksPerYear', case when show_hours then e -> 'weeksPerYear' end,
             'workHours', case when show_hours then e -> 'workHours' else '{}'::jsonb end) order by n), '[]'::jsonb)
      into uc
      from jsonb_array_elements(acts -> 'uc') with ordinality a(e, n);
  end if;

  return jsonb_build_object(
    'kind', 'portfolio',
    'header', jsonb_build_object(
      'fullName', coalesce(nullif(btrim(sp.resume #>> '{header,fullName}'), ''), nullif(btrim(sp.display_name), '')),
      'school', nullif(btrim(sp.resume #>> '{header,school}'), ''),
      'gradYear', nullif(btrim(sp.resume #>> '{header,gradYear}'), '')),
    'options', jsonb_build_object('source', src, 'showHours', show_hours, 'showScores', show_scores),
    'activities', jsonb_build_object('version', 2, 'commonApp', jsonb_build_object('activities', ca_acts, 'honors', ca_honors), 'uc', uc),
    'scores', case when show_scores then jsonb_build_object(
        'gpa', sp.gpa_unweighted, 'sat', sp.sat_total, 'act', sp.act_composite,
        'satSections', sp.test_details -> 'sat',
        'english', sp.test_details -> 'english') end
  );
end $$;

-- create or replace keeps the 0032 grants; restated so this file stands on its own.
revoke all on function public.portfolio_view(text) from public, anon, authenticated;
grant execute on function public.portfolio_view(text) to anon, authenticated;

-- Every profile's activities as they were before the backfill (private schema: not reachable through the API).
create table if not exists private.activities_backup_0038 (
  user_id    uuid not null,
  activities jsonb,
  saved_at   timestamptz not null default now()
);
revoke all on table private.activities_backup_0038 from public, anon, authenticated;

-- ── Backfill (run last, after the web part of PR 1 is live; the UPDATE waits for the owner's approval) ──
-- The backup first; a profile already backed up is not copied twice, so re-running is safe.
insert into private.activities_backup_0038 (user_id, activities, saved_at)
select sp.user_id, sp.activities, now()
from public.student_profiles sp
where not exists (select 1 from private.activities_backup_0038 b where b.user_id = sp.user_id);

-- Same test as the app (`version !== 2`); unlike a ::int cast it cannot fail on an odd stored value.
update public.student_profiles
set activities = public.activities_v2(activities)
where (activities -> 'version') is distinct from '2'::jsonb;
