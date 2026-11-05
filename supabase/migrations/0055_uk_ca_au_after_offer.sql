-- UK / Canada / Australia applications, part 2: after the offer. Citizenship, scholarship currency and the UCAS
-- reply-by date in every deadline view and in the reminder emails.
-- Plan: docs/superpowers/plans/2026-11-04-uk-ca-au-part2-after-offer.md (Task 10). Numbered 0055 at apply time (Task 12,
-- 2026-11-05: list_migrations and origin/main both ended at 0054). Smoke test:
-- supabase/patches/2026-11-06_uk_ca_au_after_offer_smoke_test.sql.
--
-- Objects (latest definition each one starts from):
--   student_profiles.citizenship  text, null or two capital letters. Student-only (Task 3). No grant: student_profiles keeps
--                                 its 0001 table-level grants and "own profile" policy (0051:34, 0049). An AI (OAuth
--                                 client_id) token can't write it: the base table is closed to OAuth tokens by 0043's
--                                 restrictive no_oauth_clients policy (0043:183), ai_student_profiles lists its columns
--                                 explicitly (0041:176) and is not touched here, and guard_oauth_student_writes' allow-list
--                                 (0041:120-153) would refuse the column even if both were gone. Teachers and parents can't
--                                 read it: teacher_roster / teacher_student (0023) and parent_view (0054) build explicit
--                                 key lists.
--   scholarships.currency         'USD' | 'GBP' | 'CAD' | 'AUD', default 'USD' (old rows become USD), mirrors
--                                 web/lib/scholarships.ts CURRENCIES (Task 9). scholarships has no column-level grants
--                                 (only 0027's table-level ones, which predate 0044's default revoke), so the new column is
--                                 readable and writable by the student like the others, under 0027's "own scholarships"
--                                 policies; nothing is granted here.
--   reply_reminder_log            one row per reply-by reminder sent (deadline-reminders Edge Function v8, Task 11). Service
--                                 role only, like student_digest_log (0051:130-141). due_date is in the key, so a changed
--                                 reply-by date is reminded again (as scholarship_reminder_log, 0027:33-42).
--   redact_checklist       (0022:17, its only definition)  also drops 'uk_conditions' (the free-text offer conditions)
--                                 in every branch. Every teacher RPC reads checklists through it (teacher_roster and
--                                 teacher_student, 0023:35 and :89; nothing else returns a checklist to a teacher);
--                                 parent_view already returns an explicit key list without it.
--   upcoming_deadlines_for (0054:78, the latest)  + a third union branch: the UCAS reply-by date (Task 6's rule, below).
--                                 It reaches teacher_deadlines (0023:119), teacher_student (0023:94) and parent_view
--                                 (0054:217). teacher_roster.next_deadline (0023:38) and teacher_digest_data (0029:91) keep
--                                 only kind application / priority, so the 'other' row never reaches them.
--   due_reply_reminders    (new)  the reply-by rows due on `today`, with due_reminders' profile join (0005:54-55) and
--                                 the same reminder_days rule.
--
-- The reply-by rule, mirroring web/lib/uk-offers.ts replyByDeadline (Task 6) exactly. A row exists only when all hold:
--   * the college is GB and not custom: the inner join on institutions drops custom colleges (they have no institution,
--     institution_id is null since 0017), and institutions.country_code = 'GB';
--   * status is 'admitted' (not 'enrolled', not 'submitted');
--   * checklist.uk_reply_by matches ^\d{4}-\d{2}-\d{2}$ and is a real date: safe_date (0022:27-33, "return t::date;
--     exception when others then return null") gives null for '2027-02-30' (22008), so no round-trip check is needed.
--     The regex is still needed, because t::date also accepts '2027-5-5', 'May 5 2027' or 'today'. (If \d matched a
--     non-ASCII digit in this database's locale, the cast would then fail and the row would still be dropped, as in TS.)
--   * the date is in the caller's window (p_from = the caller's today, so the date is >= today);
--   * checklist.uk_reply is not a valid UK_REPLIES value ('firm', 'insurance', 'decline'; "FIRM", 3 or true read as unset);
--   * no GB, non-custom college of the same student has uk_reply = 'firm' (whatever its status, like TS's list). Once the
--     student replies Firm, UCAS declines every other offer (uk-ucas-process.md:73), so no UK college keeps a reply-by date.
--   ->> returns a JSON string's text and other values' JSON text, so only the JSON string "firm" equals 'firm'.
--
-- Headers: each replaced function restates its source's language, volatility, SECURITY DEFINER (or its absence),
-- set search_path = '' and argument names and defaults; return types are copied unchanged (create or replace refuses a
-- different one). create or replace keeps the owner and the ACL, so nothing is re-granted for them. Since 0041 a NEW
-- function gets no EXECUTE for PUBLIC / anon / authenticated (0041:36-37); due_reply_reminders still revokes and grants
-- explicitly. Expected EXECUTE after apply (Task 12 Step 5 and the smoke test check these):
--   due_reply_reminders(date)                  service_role only; not PUBLIC, anon or authenticated.
--   upcoming_deadlines_for(uuid[], date, date) none of PUBLIC, anon, authenticated (0022:63-64).
--   redact_checklist(jsonb, boolean)           none of PUBLIC, anon, authenticated (0022:63); not SECURITY DEFINER.
--   parent_view(text, date)                    unchanged here: anon, authenticated.
--
-- Rollout (Task 12): 1. this migration, 2. the deadline-reminders Edge Function v8, 3. the web merge.
--   * The code that is LIVE today keeps working after this migration:
--     - citizenship is nullable and currency has a default. The live web selects explicit column lists (PROFILE_COLUMNS,
--       SCHOLARSHIP_COLUMNS in web/lib/student-rows.ts) and never sends either column; its upserts and updates set only the
--       columns they send, and its scholarship inserts get 'USD'.
--     - reply_reminder_log and due_reply_reminders are new; nothing live calls them.
--     - redact_checklist and upcoming_deadlines_for keep their signatures and return columns. The live client never writes
--       uk_conditions, uk_reply or uk_reply_by, so redact_checklist removes nothing and the new branch returns no row:
--       every caller gets exactly what it gets today. (Plan 1's smoke test has no admitted GB college, so it still passes.)
--     - The live Edge Function (v7) calls due_reminders, untouched here, and never calls upcoming_deadlines_for.
--   * The NEW code needs this migration: the new web selects student_profiles.citizenship and writes scholarships.currency
--     (each with a column-missing fallback, Tasks 3 and 9), and v8 calls due_reply_reminders and writes
--     reply_reminder_log, which fail without it. So the migration goes first and v8 deploys after it.

-- ───────────── 1. columns ─────────────

alter table public.student_profiles add column citizenship text check (citizenship ~ '^[A-Z]{2}$');

alter table public.scholarships add column currency text not null default 'USD' check (currency in ('USD','GBP','CAD','AUD'));

-- ───────────── 2. reply reminder log ─────────────

create table public.reply_reminder_log (
  user_id            uuid not null references auth.users(id) on delete cascade,
  student_college_id uuid not null references public.student_colleges(id) on delete cascade,
  due_date           date not null,
  days_before        smallint not null,
  sent_at            timestamptz not null default now(),
  primary key (student_college_id, due_date, days_before)
);
-- The primary key covers student_college_id; this covers the user_id foreign key (0004's rule: index every FK).
create index on public.reply_reminder_log (user_id);
-- RLS on, no policy, no client grant (0044 already gives a new table none; revoked again here, as 0051:139). The Edge
-- Function writes it with an upsert (ignoreDuplicates), so service_role gets the same privileges as student_digest_log.
revoke all on public.reply_reminder_log from public, anon, authenticated;
alter table public.reply_reminder_log enable row level security;
grant select, insert, update, delete on public.reply_reminder_log to service_role;

-- ───────────── 3. teachers never see the offer conditions ─────────────

-- Same as 0022:17-24 (signature, sql, immutable, not SECURITY DEFINER, search_path ''), plus "- 'uk_conditions'" in every
-- branch that returns an object. A checklist that isn't an object (checklist has no type check, only a size check,
-- 0041:232) is returned as it is, as before: "- 'key'" raises on a scalar, which would break the teacher RPCs, and a
-- non-object holds no uk_conditions key. Every other input gives exactly 0022's result.
create or replace function public.redact_checklist(p jsonb, p_share boolean) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then p
    when p_share or jsonb_typeof(p -> 'essay_list') is distinct from 'array' then p - 'uk_conditions'
    else jsonb_set(p, '{essay_list}',
           coalesce((select jsonb_agg(jsonb_build_object('status', e ->> 'status')) from jsonb_array_elements(p -> 'essay_list') e), '[]'::jsonb))
         - 'uk_conditions'
  end
$$;

-- ───────────── 4. teacher / parent deadlines ─────────────

-- Same as 0054:78-110 (branches 1 and 2 unchanged), plus branch 3: the UCAS reply-by date (rule in the header).
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
  union all
  -- branch 3: the UCAS reply-by date of an admitted, unanswered UK offer (web/lib/uk-offers.ts replyByDeadline).
  -- The inner join on institutions leaves out custom colleges, as TS's "non-custom".
  select sc.user_id, sc.id, i.name, i.slug, public.safe_date(sc.checklist ->> 'uk_reply_by'), 'other', 'UCAS reply-by date', null, sc.status
  from public.student_colleges sc join public.institutions i on i.id = sc.institution_id
  where sc.user_id = any (p_students) and i.country_code = 'GB' and sc.status = 'admitted'
    and coalesce(sc.checklist ->> 'uk_reply', '') not in ('firm', 'insurance', 'decline')
    and coalesce(sc.checklist ->> 'uk_reply_by', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and public.safe_date(sc.checklist ->> 'uk_reply_by') between p_from and p_to
    -- once any UK college is the Firm choice, UCAS declines the rest (uk-ucas-process.md:73)
    and not exists (select 1 from public.student_colleges o join public.institutions oi on oi.id = o.institution_id
                    where o.user_id = sc.user_id and oi.country_code = 'GB' and o.checklist ->> 'uk_reply' = 'firm')
$$;

-- ───────────── 5. reply-by reminder emails ─────────────

-- Reply-by dates due on `today`: branch 3's rule, with due_reminders' profile join (0005:54-55: reminders on, an email)
-- and its day rule (exactly N days away, N one of the student's reminder_days, which are 1..60 by 0005:12), minus what
-- reply_reminder_log already holds for that college, date and N.
create function public.due_reply_reminders(today date default current_date)
returns table (user_id uuid, email text, student_college_id uuid, days_before smallint, due_date date, college_name text, college_slug text, label text)
language sql stable security definer set search_path = '' as $$
  select sc.user_id, u.email, sc.id, (r.due - today)::smallint, r.due, i.name, i.slug, 'UCAS reply-by date'::text
  from public.student_colleges sc
  join public.student_profiles sp on sp.user_id = sc.user_id and sp.reminder_emails
  join auth.users u on u.id = sc.user_id and u.email is not null
  join public.institutions i on i.id = sc.institution_id
  cross join lateral (select public.safe_date(sc.checklist ->> 'uk_reply_by') as due) r
  where i.country_code = 'GB' and sc.status = 'admitted'
    and coalesce(sc.checklist ->> 'uk_reply', '') not in ('firm', 'insurance', 'decline')
    and coalesce(sc.checklist ->> 'uk_reply_by', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and (r.due - today) = any (sp.reminder_days)
    -- once any UK college is the Firm choice, UCAS declines the rest (uk-ucas-process.md:73)
    and not exists (select 1 from public.student_colleges o join public.institutions oi on oi.id = o.institution_id
                    where o.user_id = sc.user_id and oi.country_code = 'GB' and o.checklist ->> 'uk_reply' = 'firm')
    and not exists (select 1 from public.reply_reminder_log rl
                    where rl.student_college_id = sc.id and rl.due_date = r.due and rl.days_before = (r.due - today))
  order by sc.user_id, r.due
$$;
revoke execute on function public.due_reply_reminders(date) from public, anon, authenticated;
grant execute on function public.due_reply_reminders(date) to service_role;
