-- Smoke test for migration 0044_payments. Run in the dashboard SQL Editor AFTER applying 0044
-- (or paste 0044 right after "begin;" to dry-run the migration and the test together). Works with or without 0043.
-- It creates throwaway users inside one transaction, acts as each of them (website session = JWT without client_id,
-- AI connector = the same JWT plus client_id, service role = the payments Edge Function, no JWT = the owner in the
-- SQL Editor), and never commits: the LAST statement deliberately raises "SMOKE RESULT: <n> failures" followed by one
-- PASS/FAIL line per check, which aborts the transaction. Success = "SMOKE RESULT: 0 failures".
--
-- Cast: S1 student (website + AI, pays twice, refunds), S2 student with no profile yet (first sign-in), S3 another
-- student (an ended pass, then a pre-order), S4 student who deletes the account, S5 student for the row caps.
-- Real users' rows are only read (section G), except what 0044 itself did to them inside this transaction.

begin;

-- ── setup (postgres) ──
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000044a1', 'smoke-0044-s1@example.invalid'),
  ('00000000-0000-4000-8000-0000000044a2', 'smoke-0044-s2@example.invalid'),
  ('00000000-0000-4000-8000-0000000044a3', 'smoke-0044-s3@example.invalid'),
  ('00000000-0000-4000-8000-0000000044a4', 'smoke-0044-s4@example.invalid'),
  ('00000000-0000-4000-8000-0000000044a5', 'smoke-0044-s5@example.invalid');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000044a1', 'student'), ('00000000-0000-4000-8000-0000000044a2', 'student'),
  ('00000000-0000-4000-8000-0000000044a3', 'student'), ('00000000-0000-4000-8000-0000000044a4', 'student'),
  ('00000000-0000-4000-8000-0000000044a5', 'student');
insert into public.student_profiles (user_id, display_name, sat_total) values
  ('00000000-0000-4000-8000-0000000044a1', 'Smoke S1', 1300),
  ('00000000-0000-4000-8000-0000000044a3', 'Smoke S3', null),
  ('00000000-0000-4000-8000-0000000044a4', 'Smoke S4', null);
-- S1: an open checkout with ATM info. S3: a pass that ended on 2026-07-31.
insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer, status, payment_type, payment_info) values
  ('00000000-0000-4000-8000-0000000044a1', 'SMK44OWN', 'stage', 2027, 990, '2027-07-31', 'student', 'pending', 'ATM_TAISHIN', '{"BankCode":"812"}');
insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_from, pass_until, payer, status, payment_type, paid_at) values
  ('00000000-0000-4000-8000-0000000044a3', 'SMK44S3', 'stage', 2026, 990, '2025-08-01', '2026-07-31', 'student', 'paid', 'Credit_CreditCard', now() - interval '1 year');
insert into public.pay_links (id, user_id, entry_year, token_hash, expires_at) values
  ('00000000-0000-4000-8000-0000000044c1', '00000000-0000-4000-8000-0000000044a1', 2027, 'smokehash44s1', now() + interval '7 days'),
  ('00000000-0000-4000-8000-0000000044c4', '00000000-0000-4000-8000-0000000044a4', 2027, 'smokehash44s4', now() + interval '7 days');
-- S4: a parent's ATM order through the link (with payment info) and a paid card order.
insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer, pay_link_id, status, payment_type, payment_info, expires_at) values
  ('00000000-0000-4000-8000-0000000044a4', 'SMK44D1', 'stage', 2027, 990, '2027-07-31', 'parent', '00000000-0000-4000-8000-0000000044c4', 'awaiting_payment', 'ATM_TAISHIN', '{"BankCode":"812","vAccount":"9103522175887271"}', now() + interval '3 days');
insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_from, pass_until, payer, status, payment_type, ecpay_trade_no, payment_info, paid_at) values
  ('00000000-0000-4000-8000-0000000044a4', 'SMK44D2', 'stage', 2027, 990, '2026-10-01', '2027-07-31', 'student', 'paid', 'Credit_CreditCard', '2410290000000001', '{"card4":"4242"}', now());

create temp table smoke (n serial primary key, name text, expect text, got text) on commit drop;

-- Claims for a caller: the website session, or (p_ai) the AI connector's OAuth token for the same user.
create function pg_temp.c(p_uid text, p_ai boolean) returns jsonb language sql immutable as $$
  select jsonb_build_object('sub', p_uid, 'role', 'authenticated')
         || case when p_ai then '{"client_id":"smoke-client"}'::jsonb else '{}'::jsonb end
$$;
-- The payments Edge Function's service-role key.
create function pg_temp.svc() returns jsonb language sql immutable as $$ select '{"role":"service_role"}'::jsonb $$;
-- Runs p_sql as that caller (anon when p_claims is null; the claims' role otherwise) with request.path set; returns
-- 'ok:<first column>' or 'refused <sqlstate>: <message>'. Back to postgres afterwards.
create function pg_temp.run(p_claims jsonb, p_path text, p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  perform set_config('request.path', coalesce(p_path, ''), true);
  perform set_config('role', case when p_claims is null then 'anon' else coalesce(p_claims ->> 'role', 'authenticated') end, true);
  begin
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
  exception when others then
    res := 'refused ' || sqlstate || ': ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;
-- Like pg_temp.run, but the pre-request hook runs first, as PostgREST does for every Data API request.
create function pg_temp.req(p_claims jsonb, p_path text, p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
  perform set_config('request.path', coalesce(p_path, ''), true);
  perform set_config('role', case when p_claims is null then 'anon' else coalesce(p_claims ->> 'role', 'authenticated') end, true);
  begin
    perform public.api_request_guard();
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
  exception when others then
    res := 'refused ' || sqlstate || ': ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;
-- The owner in the SQL Editor: postgres, no JWT.
create function pg_temp.own(p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', '', true);
  begin
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
  exception when others then
    res := 'refused ' || sqlstate || ': ' || sqlerrm;
  end;
  return res;
end $$;
create function pg_temp.chk(p_name text, p_expect text, p_got text) returns void language sql as $$
  insert into smoke (name, expect, got) values (p_name, p_expect, p_got)
$$;
-- '<plan>/<plan_windows>' of a profile ('none' when there is no row).
create function pg_temp.pw(p_uid uuid) returns text language sql as $$
  select coalesce((select plan || '/' || plan_windows::text from public.student_profiles where user_id = p_uid), 'none')
$$;

-- ── A. the plan guard: client writes of plan / plan_windows succeed and are ignored (Review Focus 5) ──
select pg_temp.chk('A1 web upsert of own profile (live-client shape) with plan senior + a window succeeds', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/student_profiles',
  $q$with x as (insert into public.student_profiles (user_id, sat_total, act_composite, gpa_unweighted, gpa_weighted, is_international, target_regions, study_fields,
       reminder_emails, plan, test_details, interested, activities, resume, essays, portals, plan_windows)
     values ('00000000-0000-4000-8000-0000000044a1', 1234, null, null, null, false, '[]', '[]', true, 'senior', '{}', '[]', '{}', '{}', '{}', '{}',
       '[{"entry_year":2027,"from":"2026-01-01","until":"2027-07-31"}]')
     on conflict (user_id) do update set sat_total = excluded.sat_total, act_composite = excluded.act_composite, gpa_unweighted = excluded.gpa_unweighted,
       gpa_weighted = excluded.gpa_weighted, is_international = excluded.is_international, target_regions = excluded.target_regions,
       study_fields = excluded.study_fields, reminder_emails = excluded.reminder_emails, plan = excluded.plan, test_details = excluded.test_details,
       interested = excluded.interested, activities = excluded.activities, resume = excluded.resume, essays = excluded.essays,
       portals = excluded.portals, plan_windows = excluded.plan_windows
     returning 1) select count(*)::text from x$q$));
select pg_temp.chk('A2 ...and leaves plan free with no windows (the other fields saved)', 'free/[]/1234',
  (select pg_temp.pw('00000000-0000-4000-8000-0000000044a1') || '/' || sat_total from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a1'));
select pg_temp.chk('A3 web upsert with an old local plan ''junior'' succeeds (reset before the CHECK)', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/student_profiles',
  $q$with x as (insert into public.student_profiles (user_id, plan) values ('00000000-0000-4000-8000-0000000044a1', 'junior')
     on conflict (user_id) do update set plan = excluded.plan returning 1) select count(*)::text from x$q$));
select pg_temp.chk('A4 web update of plan + plan_windows succeeds', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/student_profiles',
  $q$with x as (update public.student_profiles set plan = 'senior', plan_windows = '[{"entry_year":2027,"from":"2026-01-01","until":"2027-07-31"}]'
     where user_id = '00000000-0000-4000-8000-0000000044a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('A5 ...and changes nothing', 'free/[]', pg_temp.pw('00000000-0000-4000-8000-0000000044a1'));
select pg_temp.chk('A6 web first-sign-in insert of a new profile with plan senior + a window succeeds', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a2', false), '/student_profiles',
  $q$with x as (insert into public.student_profiles (user_id, sat_total, plan, plan_windows)
     values ('00000000-0000-4000-8000-0000000044a2', 1100, 'senior', '[{"entry_year":2027,"from":"2026-01-01","until":"2027-07-31"}]')
     on conflict (user_id) do update set sat_total = excluded.sat_total, plan = excluded.plan, plan_windows = excluded.plan_windows returning 1) select count(*)::text from x$q$));
select pg_temp.chk('A7 ...and the new row is free with no windows', 'free/[]', pg_temp.pw('00000000-0000-4000-8000-0000000044a2'));
select pg_temp.chk('A8 AI (client_id) update of sat_total through ai_student_profiles still works', 'ok:1', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000044a1', true), '/ai_student_profiles',
  $q$with x as (update public.ai_student_profiles set sat_total = 1500 where user_id = '00000000-0000-4000-8000-0000000044a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('A9 ...sat_total saved, plan unchanged', 'free/[]/1500',
  (select pg_temp.pw('00000000-0000-4000-8000-0000000044a1') || '/' || sat_total from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a1'));
select pg_temp.chk('A10 AI update of plan_windows through the view refused (read only)', 'refused 42501', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000044a1', true), '/ai_student_profiles',
  $q$with x as (update public.ai_student_profiles set plan_windows = '[{"entry_year":2027}]' where user_id = '00000000-0000-4000-8000-0000000044a1' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('A11 AI reads plan + plan_windows through the view', 'ok:free/[]', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000044a1', true), '/ai_student_profiles',
  $q$select plan || '/' || plan_windows::text from public.ai_student_profiles$q$));

-- ── B. orders and pay links: own orders readable (listed columns), nothing writable, no RPC ──
select pg_temp.chk('B1 web sees only its own orders', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/plan_orders', $q$select count(*)::text from public.plan_orders$q$));
select pg_temp.chk('B2 web select of another user''s order: 0 rows', 'ok:0', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/plan_orders', $q$select count(*)::text from public.plan_orders where merchant_trade_no = 'SMK44S3'$q$));
select pg_temp.chk('B3 web reads the listed columns of its order', 'ok:SMK44OWN/pending/812/2027-07-31', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/plan_orders',
  $q$select merchant_trade_no || '/' || status || '/' || (payment_info ->> 'BankCode') || '/' || pass_until from public.plan_orders$q$));
select pg_temp.chk('B4 web select user_id refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/plan_orders', $q$select user_id::text from public.plan_orders$q$));
select pg_temp.chk('B5 web select ecpay_trade_no / simulated refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/plan_orders', $q$select ecpay_trade_no || simulated::text from public.plan_orders$q$));
select pg_temp.chk('B6 web insert into plan_orders refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/plan_orders',
  $q$with x as (insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer, status)
     values ('00000000-0000-4000-8000-0000000044a1', 'EVIL44', 'production', 2027, 0, '2027-07-31', 'student', 'paid') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('B7 web update of plan_orders refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/plan_orders', $q$with x as (update public.plan_orders set status = 'paid' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('B8 web delete from plan_orders refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/plan_orders', $q$with x as (delete from public.plan_orders returning 1) select count(*)::text from x$q$));
select pg_temp.chk('B9 web select pay_links refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/pay_links', $q$select count(*)::text from public.pay_links$q$));
select pg_temp.chk('B10 web insert into pay_links refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/pay_links',
  $q$with x as (insert into public.pay_links (user_id, entry_year, token_hash, expires_at) values ('00000000-0000-4000-8000-0000000044a1', 2027, 'evil', now()) returning 1) select count(*)::text from x$q$));
select pg_temp.chk('B11 AI select of plan_orders sees nothing (policy)', 'ok:0', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', true), '/plan_orders', $q$select count(*)::text from public.plan_orders$q$));
select pg_temp.chk('B12 AI /plan_orders refused by the pre-request hook', 'refused 42501', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000044a1', true), '/plan_orders', $q$select count(*)::text from public.plan_orders$q$));
select pg_temp.chk('B13 anon select plan_orders refused', 'refused 42501', pg_temp.run(null, '/plan_orders', $q$select count(*)::text from public.plan_orders$q$));
select pg_temp.chk('B14 web apply_paid_order refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/rpc/apply_paid_order',
  $q$select public.apply_paid_order('SMK44OWN', 'x', 'Credit_CreditCard', now(), current_date)$q$));
select pg_temp.chk('B15 anon apply_paid_order refused', 'refused 42501', pg_temp.run(null, '/rpc/apply_paid_order', $q$select public.apply_paid_order('SMK44OWN', 'x', 'Credit_CreditCard', now(), current_date)$q$));
select pg_temp.chk('B16 web recompute_plan refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/rpc/recompute_plan', $q$select public.recompute_plan('00000000-0000-4000-8000-0000000044a1')::text$q$));
select pg_temp.chk('B17 web set_order_payment_info refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/rpc/set_order_payment_info', $q$select public.set_order_payment_info('SMK44OWN', 'ATM', '{}', now())::text$q$));
select pg_temp.chk('B18 web refund_order refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/rpc/refund_order', $q$select public.refund_order('SMK44S3')$q$));
select pg_temp.chk('B19 web is_payment_tester refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/rpc/is_payment_tester', $q$select public.is_payment_tester('00000000-0000-4000-8000-0000000044a1')::text$q$));
select pg_temp.chk('B20 web select payments_needing_review refused', 'refused 42501', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/payments_needing_review', $q$select count(*)::text from public.payments_needing_review$q$));
select pg_temp.chk('B21 the client attempts changed nothing', 'pending/paid/free/[]',
  (select (select status from public.plan_orders where merchant_trade_no = 'SMK44OWN') || '/' || (select status from public.plan_orders where merchant_trade_no = 'SMK44S3')
          || '/' || pg_temp.pw('00000000-0000-4000-8000-0000000044a1')));

-- ── C. the service role (payments Edge Function) and the owner (SQL Editor) ──
select pg_temp.chk('C1 service role creates a checkout order', 'ok:1', pg_temp.run(pg_temp.svc(), '/plan_orders',
  $q$with x as (insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer)
     values ('00000000-0000-4000-8000-0000000044a1', 'SMK44A', 'stage', 2027, 990, '2027-07-31', 'student') returning 1) select count(*)::text from x$q$));
-- (A check that changes a row reads the result in its own statement: a statement doesn't see what a function it calls wrote.)
select pg_temp.chk('C2 service role set_order_payment_info (ATM)', 'ok:', pg_temp.run(pg_temp.svc(), '/rpc/set_order_payment_info',
  $q$select public.set_order_payment_info('SMK44A', 'ATM_TAISHIN', '{"BankCode":"812","vAccount":"9103522175887271"}', now() + interval '3 days')::text$q$));
select pg_temp.chk('C2b ...order awaiting payment with the ATM account and deadline', 'awaiting_payment/812/ATM_TAISHIN/true',
  (select status || '/' || (payment_info ->> 'BankCode') || '/' || payment_type || '/' || (expires_at = now() + interval '3 days')::text from public.plan_orders where merchant_trade_no = 'SMK44A'));
select pg_temp.chk('C3 service role apply_paid_order', 'ok:applied', pg_temp.run(pg_temp.svc(), '/rpc/apply_paid_order',
  $q$select public.apply_paid_order('SMK44A', '2410291234567890', 'ATM_TAISHIN', now(), (now() at time zone 'Asia/Taipei')::date)$q$));
select pg_temp.chk('C4 ...profile senior with one window (2027, from today, to 2027-07-31)', 'senior/1/2027/true/2027-07-31',
  (select plan || '/' || jsonb_array_length(plan_windows) || '/' || (plan_windows -> 0 ->> 'entry_year') || '/'
          || ((plan_windows -> 0 ->> 'from') = ((now() at time zone 'Asia/Taipei')::date)::text)::text || '/' || (plan_windows -> 0 ->> 'until')
     from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a1'));
select pg_temp.chk('C5 ...order paid with both trade numbers', 'paid/2410291234567890/ATM_TAISHIN/true',
  (select status || '/' || ecpay_trade_no || '/' || payment_type || '/' || (paid_at = now())::text from public.plan_orders where merchant_trade_no = 'SMK44A'));
select pg_temp.chk('C6 the same notice again: already_paid', 'ok:already_paid', pg_temp.run(pg_temp.svc(), '/rpc/apply_paid_order',
  $q$select public.apply_paid_order('SMK44A', '2410299999999999', 'Credit_CreditCard', now() + interval '1 hour', date '2027-01-01')$q$));
select pg_temp.chk('C7 ...nothing changed', 'paid/2410291234567890/ATM_TAISHIN/true/senior/1',
  (select status || '/' || ecpay_trade_no || '/' || payment_type || '/' || (paid_at = now())::text from public.plan_orders where merchant_trade_no = 'SMK44A')
  || '/' || (select plan || '/' || jsonb_array_length(plan_windows) from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a1'));
select pg_temp.chk('C8 a paid student''s old client saving plan free + no windows succeeds', 'ok:1', pg_temp.run(pg_temp.c('00000000-0000-4000-8000-0000000044a1', false), '/student_profiles',
  $q$with x as (insert into public.student_profiles (user_id, plan, plan_windows) values ('00000000-0000-4000-8000-0000000044a1', 'free', '[]')
     on conflict (user_id) do update set plan = excluded.plan, plan_windows = excluded.plan_windows returning 1) select count(*)::text from x$q$));
select pg_temp.chk('C9 ...and can''t downgrade itself', 'senior/1', (select plan || '/' || jsonb_array_length(plan_windows) from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a1'));
select pg_temp.chk('C10 AI view shows the pass', 'ok:senior/2027-07-31', pg_temp.req(pg_temp.c('00000000-0000-4000-8000-0000000044a1', true), '/ai_student_profiles',
  $q$select plan || '/' || (plan_windows -> 0 ->> 'until') from public.ai_student_profiles$q$));
select pg_temp.chk('C11 unknown MerchantTradeNo: not_found', 'ok:not_found', pg_temp.run(pg_temp.svc(), '/rpc/apply_paid_order', $q$select public.apply_paid_order('NOPE44', 'x', 'x', now(), current_date)$q$));
select pg_temp.chk('C12 set_order_payment_info on a paid order', 'ok:', pg_temp.run(pg_temp.svc(), '/rpc/set_order_payment_info',
  $q$select public.set_order_payment_info('SMK44A', 'CVS_CVS', '{"PaymentNo":"LLL1"}', now())::text$q$));
select pg_temp.chk('C12b ...changes nothing', 'paid/812/ATM_TAISHIN/true',
  (select status || '/' || (payment_info ->> 'BankCode') || '/' || payment_type || '/' || (expires_at = now() + interval '3 days')::text from public.plan_orders where merchant_trade_no = 'SMK44A'));
select pg_temp.chk('C13 apply_paid_order without pass_from refused', 'refused P0001: apply_paid_order: pass_from is required', pg_temp.run(pg_temp.svc(), '/rpc/apply_paid_order',
  $q$select public.apply_paid_order('SMK44OWN', 'x', 'x', now(), null)$q$));
select pg_temp.chk('C14 a parent checks out through the pay link (service role)', 'ok:1', pg_temp.run(pg_temp.svc(), '/plan_orders',
  $q$with x as (insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer, pay_link_id)
     values ('00000000-0000-4000-8000-0000000044a1', 'SMK44B', 'stage', 2027, 990, '2027-07-31', 'parent', '00000000-0000-4000-8000-0000000044c1') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('C14b ...and pays for the entry year the student already paid: applied', 'ok:applied', pg_temp.run(pg_temp.svc(), '/rpc/apply_paid_order',
  $q$select public.apply_paid_order('SMK44B', '2410290000000002', 'Credit_CreditCard', now(), (now() at time zone 'Asia/Taipei')::date)$q$));
select pg_temp.chk('C15 ...both orders listed in payments_needing_review', 'ok:2/SMK44A,SMK44B', pg_temp.run(pg_temp.svc(), '/payments_needing_review',
  $q$select count(*) || '/' || string_agg(merchant_trade_no, ',' order by merchant_trade_no) from public.payments_needing_review where user_id = '00000000-0000-4000-8000-0000000044a1'$q$));
select pg_temp.chk('C16 ...still one pass (two equal windows), senior', 'senior/2/true', (select plan || '/' || jsonb_array_length(plan_windows) || '/' || (plan_windows -> 0 = plan_windows -> 1)::text
  from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a1'));
select pg_temp.chk('C17 owner refund_order of the duplicate', 'ok:refunded', pg_temp.own($q$select public.refund_order('SMK44B')$q$));
select pg_temp.chk('C18 ...no longer needs review, one window left', '0/senior/1',
  (select (select count(*) from public.payments_needing_review where user_id = '00000000-0000-4000-8000-0000000044a1') || '/' || plan || '/' || jsonb_array_length(plan_windows)
     from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a1'));
select pg_temp.chk('C19 owner refund_order of the last pass', 'ok:refunded', pg_temp.own($q$select public.refund_order('SMK44A')$q$));
select pg_temp.chk('C20 ...windows back to [], plan free', 'free/[]', pg_temp.pw('00000000-0000-4000-8000-0000000044a1'));
select pg_temp.chk('C21 a late duplicate notice for the refunded order: already_paid', 'ok:already_paid', pg_temp.run(pg_temp.svc(), '/rpc/apply_paid_order',
  $q$select public.apply_paid_order('SMK44A', '2410291234567890', 'ATM_TAISHIN', now(), (now() at time zone 'Asia/Taipei')::date)$q$));
select pg_temp.chk('C22 ...the refunded pass stays gone', 'refunded/free/[]', (select status || '/' || pg_temp.pw('00000000-0000-4000-8000-0000000044a1') from public.plan_orders where merchant_trade_no = 'SMK44A'));
select pg_temp.chk('C23 refund_order: again / unknown / unpaid', 'ok:already_refunded/not_found/not_paid',
  pg_temp.own($q$select public.refund_order('SMK44A') || '/' || public.refund_order('NOPE44') || '/' || public.refund_order('SMK44OWN')$q$));
select pg_temp.chk('C24 service role marks a simulated payment (direct update), no upgrade', 'ok:1/pending/free', pg_temp.run(pg_temp.svc(), '/plan_orders',
  $q$with x as (update public.plan_orders set simulated = true where merchant_trade_no = 'SMK44OWN' returning status)
     select count(*) || '/' || min(status) || '/' || (select plan from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a1') from x$q$));
select pg_temp.chk('C25 recompute_plan for a student whose pass ended on 2026-07-31', 'ok:', pg_temp.run(pg_temp.svc(), '/rpc/recompute_plan',
  $q$select public.recompute_plan('00000000-0000-4000-8000-0000000044a3')::text$q$));
select pg_temp.chk('C25b ...free, the ended window kept', 'free/1/2026-07-31',
  (select plan || '/' || jsonb_array_length(plan_windows) || '/' || (plan_windows -> 0 ->> 'until') from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a3'));
select pg_temp.chk('C26 a pre-order (Fall 2029) checkout', 'ok:1', pg_temp.run(pg_temp.svc(), '/plan_orders',
  $q$with x as (insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer)
     values ('00000000-0000-4000-8000-0000000044a3', 'SMK44P', 'stage', 2029, 990, '2029-07-31', 'student') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('C26b ...paid, starting 2028-01-01', 'ok:applied', pg_temp.run(pg_temp.svc(), '/rpc/apply_paid_order',
  $q$select public.apply_paid_order('SMK44P', '2410290000000003', 'Credit_CreditCard', now(), date '2028-01-01')$q$));
select pg_temp.chk('C26c ...senior flag (a window hasn''t ended), windows ordered by start', 'senior/2/2026-07-31/2028-01-01',
  (select plan || '/' || jsonb_array_length(plan_windows) || '/' || (plan_windows -> 0 ->> 'until') || '/' || (plan_windows -> 1 ->> 'from')
     from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a3'));
select pg_temp.chk('C27 S5 has no profile yet', 'none', pg_temp.pw('00000000-0000-4000-8000-0000000044a5'));
insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_from, pass_until, payer, status, paid_at)
  values ('00000000-0000-4000-8000-0000000044a5', 'SMK44S5', 'stage', 2027, 990, '2026-10-29', '2027-07-31', 'student', 'paid', now());
select pg_temp.chk('C27b recompute_plan for a student with no profile', 'ok:', pg_temp.run(pg_temp.svc(), '/rpc/recompute_plan',
  $q$select public.recompute_plan('00000000-0000-4000-8000-0000000044a5')::text$q$));
select pg_temp.chk('C27c ...creates the profile, senior', 'senior/1', (select plan || '/' || jsonb_array_length(plan_windows) from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a5'));
select pg_temp.chk('C28 is_payment_tester: not listed', 'ok:false', pg_temp.run(pg_temp.svc(), '/rpc/is_payment_tester', $q$select public.is_payment_tester('00000000-0000-4000-8000-0000000044a1')::text$q$));
insert into private.payment_testers (user_id) values ('00000000-0000-4000-8000-0000000044a1');
select pg_temp.chk('C28b is_payment_tester: listed by the owner', 'ok:true', pg_temp.run(pg_temp.svc(), '/rpc/is_payment_tester', $q$select public.is_payment_tester('00000000-0000-4000-8000-0000000044a1')::text$q$));
select pg_temp.chk('C29 service role may set plan directly (the guard only holds client roles)', 'ok:1/senior', pg_temp.run(pg_temp.svc(), '/student_profiles',
  $q$with x as (update public.student_profiles set plan = 'senior' where user_id = '00000000-0000-4000-8000-0000000044a2' returning plan) select count(*) || '/' || min(plan) from x$q$));

-- ── D. limits and checks ──
select pg_temp.chk('D1 pay links up to 50 per account', 'ok:50', pg_temp.run(pg_temp.svc(), '/pay_links',
  $q$with x as (insert into public.pay_links (user_id, entry_year, token_hash, expires_at) select '00000000-0000-4000-8000-0000000044a5', 2027, 'cap44-' || g, now() from generate_series(1, 50) g returning 1) select count(*)::text from x$q$));
select pg_temp.chk('D2 51st pay link refused', 'refused P0001: Limit reached: at most 50 pay links', pg_temp.run(pg_temp.svc(), '/pay_links',
  $q$with x as (insert into public.pay_links (user_id, entry_year, token_hash, expires_at) values ('00000000-0000-4000-8000-0000000044a5', 2027, 'cap44-51', now()) returning 1) select count(*)::text from x$q$));
select pg_temp.chk('D3 orders up to 100 per account (S5 has 1)', 'ok:99', pg_temp.run(pg_temp.svc(), '/plan_orders',
  $q$with x as (insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer)
     select '00000000-0000-4000-8000-0000000044a5', 'CAP44N' || g, 'stage', 2027, 990, '2027-07-31', 'student' from generate_series(1, 99) g returning 1) select count(*)::text from x$q$));
select pg_temp.chk('D4 101st order refused', 'refused P0001: Limit reached: at most 100 plan orders', pg_temp.run(pg_temp.svc(), '/plan_orders',
  $q$with x as (insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer)
     values ('00000000-0000-4000-8000-0000000044a5', 'CAP44N101', 'stage', 2027, 990, '2027-07-31', 'student') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('D5 MerchantTradeNo with a dash refused', 'refused 23514', pg_temp.run(pg_temp.svc(), '/plan_orders',
  $q$with x as (insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer) values (null, 'BAD-44', 'stage', 2027, 990, '2027-07-31', 'student') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('D6 MerchantTradeNo of 21 characters refused', 'refused 23514', pg_temp.run(pg_temp.svc(), '/plan_orders',
  $q$with x as (insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_until, payer) values (null, repeat('A', 21), 'stage', 2027, 990, '2027-07-31', 'student') returning 1) select count(*)::text from x$q$));
select pg_temp.chk('D7 unknown status / mode / payer / negative amount refused', 'refused 23514/refused 23514/refused 23514/refused 23514',
  (select string_agg(left(pg_temp.run(pg_temp.svc(), '/plan_orders', s), 13), '/' order by k) from (values
     (1, $q$with x as (update public.plan_orders set status = 'bogus' where merchant_trade_no = 'SMK44OWN' returning 1) select count(*)::text from x$q$),
     (2, $q$with x as (update public.plan_orders set mode = 'test' where merchant_trade_no = 'SMK44OWN' returning 1) select count(*)::text from x$q$),
     (3, $q$with x as (update public.plan_orders set payer = 'school' where merchant_trade_no = 'SMK44OWN' returning 1) select count(*)::text from x$q$),
     (4, $q$with x as (update public.plan_orders set amount_twd = -1 where merchant_trade_no = 'SMK44OWN' returning 1) select count(*)::text from x$q$)) v(k, s)));
select pg_temp.chk('D8 plan ''junior'' refused for the owner (check is free / senior now)', 'refused 23514', pg_temp.own(
  $q$with x as (update public.student_profiles set plan = 'junior' where user_id = '00000000-0000-4000-8000-0000000044a2' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('D9 plan_windows must be an array', 'refused 23514', pg_temp.run(pg_temp.svc(), '/student_profiles',
  $q$with x as (update public.student_profiles set plan_windows = '{}' where user_id = '00000000-0000-4000-8000-0000000044a2' returning 1) select count(*)::text from x$q$));

-- ── E. account deletion keeps the orders, anonymized ──
update public.plan_orders set expires_at = now() where merchant_trade_no = 'SMK44OWN';
select pg_temp.chk('E1 an order''s payment_info survives other updates', '812', (select payment_info ->> 'BankCode' from public.plan_orders where merchant_trade_no = 'SMK44OWN'));
select pg_temp.chk('E2 deleting the auth user', 'ok:1', pg_temp.own($q$with x as (delete from auth.users where id = '00000000-0000-4000-8000-0000000044a4' returning 1) select count(*)::text from x$q$));
select pg_temp.chk('E3 ...orders kept with user_id, payment_info and pay_link_id null; amount, method, trade numbers kept', '2/2/990/awaiting_payment,paid/2410290000000001',
  (select count(*) || '/' || count(*) filter (where user_id is null and payment_info is null and pay_link_id is null) || '/' || min(amount_twd) || '/'
          || string_agg(status, ',' order by merchant_trade_no) || '/' || max(ecpay_trade_no)
     from public.plan_orders where merchant_trade_no in ('SMK44D1', 'SMK44D2')));
select pg_temp.chk('E4 ...the pay link and the profile are gone', '0/0',
  (select (select count(*) from public.pay_links where token_hash = 'smokehash44s4') || '/' || (select count(*) from public.student_profiles where user_id = '00000000-0000-4000-8000-0000000044a4')));
select pg_temp.chk('E5 an ATM notice for an anonymized order', 'ok:', pg_temp.run(pg_temp.svc(), '/rpc/set_order_payment_info',
  $q$select public.set_order_payment_info('SMK44D1', 'ATM_TAISHIN', '{"BankCode":"812"}', now())::text$q$));
select pg_temp.chk('E5b ...stores no payment info', 'awaiting_payment/null', (select status || '/' || coalesce(payment_info::text, 'null') from public.plan_orders where merchant_trade_no = 'SMK44D1'));

-- ── G. grandfathering (real users, as 0044 left them in this transaction) ──
select pg_temp.chk('G1 no plan outside free / senior', '0', (select count(*)::text from public.student_profiles where plan not in ('free', 'senior')));
select pg_temp.chk('G2 every senior (not smoke) has exactly one grandfathered order and the Fall 2027 window', 'true',
  (with s as (select user_id, plan_windows from public.student_profiles where plan = 'senior' and user_id::text not like '00000000-0000-4000-8000-0000000044a%'),
        g as (select user_id from public.plan_orders where payment_type = 'grandfathered')
   select ((select count(*) from s) = (select count(*) from g)
           and (select count(distinct user_id) from g) = (select count(*) from g)
           and not exists (select 1 from s where user_id not in (select user_id from g))
           and not exists (select 1 from s where plan_windows <> jsonb_build_array(jsonb_build_object('entry_year', 2027, 'from', (now() at time zone 'Asia/Taipei')::date, 'until', date '2027-07-31'))))::text
          || ' (n=' || (select count(*) from g) || ')'));
select pg_temp.chk('G3 grandfathered orders: GF + 18 hex, production, 2027, NT$0, paid, to 2027-07-31', 'true',
  (select (count(*) = count(*) filter (where merchant_trade_no ~ '^GF[0-9a-f]{18}$' and mode = 'production' and entry_year = 2027 and amount_twd = 0
            and status = 'paid' and payer = 'student' and pass_from = (now() at time zone 'Asia/Taipei')::date and pass_until = date '2027-07-31' and paid_at is not null))::text
     from public.plan_orders where payment_type = 'grandfathered'));

-- ── I. catalog ──
select pg_temp.chk('I1 guard_plan_columns fires before oauth_guard (and after forbid_plaintext_password when 0043 is in)', 'true',
  (with t as (select string_agg(tgname, ',' order by tgname) s from pg_trigger where tgrelid = 'public.student_profiles'::regclass and not tgisinternal)
   select (position('guard_plan_columns' in s) > 0 and position('guard_plan_columns' in s) < position('oauth_guard' in s)
           and (position('forbid_plaintext_password' in s) = 0 or position('forbid_plaintext_password' in s) < position('guard_plan_columns' in s)))::text || ' ' || s from t));
select pg_temp.chk('I2 the 5 payment functions: EXECUTE for service_role only; trigger functions for nobody', '0/0/5/0',
  (select count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute')) || '/' || count(*) filter (where has_function_privilege('anon', p.oid, 'execute'))
          || '/' || count(*) filter (where has_function_privilege('service_role', p.oid, 'execute') and p.proname not in ('guard_plan_columns', 'anonymize_plan_order'))
          || '/' || count(*) filter (where p.proacl::text ~ '(^|[{,])=X')
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('recompute_plan', 'apply_paid_order', 'set_order_payment_info', 'refund_order', 'is_payment_tester', 'guard_plan_columns', 'anonymize_plan_order')));
select pg_temp.chk('I3 no client role may write orders or touch pay links', 'false',
  (select (has_table_privilege('authenticated', 'public.plan_orders', 'insert') or has_table_privilege('authenticated', 'public.plan_orders', 'update')
        or has_table_privilege('authenticated', 'public.plan_orders', 'delete') or has_table_privilege('anon', 'public.plan_orders', 'select')
        or has_table_privilege('authenticated', 'public.pay_links', 'select') or has_table_privilege('anon', 'public.pay_links', 'select')
        or has_table_privilege('authenticated', 'public.pay_links', 'insert') or has_table_privilege('authenticated', 'private.payment_testers', 'select'))::text));
select pg_temp.chk('I4 authenticated column reads: payment_info yes; user_id / mode / simulated / ecpay_trade_no / pay_link_id no', 'true/false',
  (select has_column_privilege('authenticated', 'public.plan_orders', 'payment_info', 'select')::text || '/' ||
          (has_column_privilege('authenticated', 'public.plan_orders', 'user_id', 'select') or has_column_privilege('authenticated', 'public.plan_orders', 'mode', 'select')
        or has_column_privilege('authenticated', 'public.plan_orders', 'simulated', 'select') or has_column_privilege('authenticated', 'public.plan_orders', 'ecpay_trade_no', 'select')
        or has_column_privilege('authenticated', 'public.plan_orders', 'pay_link_id', 'select'))::text));
select pg_temp.chk('I5 RLS on plan_orders and pay_links', 'true/true',
  (select string_agg(relrowsecurity::text, '/' order by relname desc) from pg_class where oid in ('public.plan_orders'::regclass, 'public.pay_links'::regclass)));
select pg_temp.chk('I6 ai_student_profiles = the 0041 columns + plan_windows', 'user_id,sat_total,act_composite,gpa_unweighted,gpa_weighted,is_international,target_regions,plan,test_details,interested,activities,resume,updated_at,plan_windows',
  (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'ai_student_profiles'));
select pg_temp.chk('I7 ai_student_profiles keeps security_barrier, local check option and owner postgres', 'true/true/postgres',
  (select ('security_barrier=true' = any (c.reloptions))::text || '/' || ('check_option=local' = any (c.reloptions))::text || '/' || pg_get_userbyid(c.relowner)
     from pg_class c where c.oid = 'public.ai_student_profiles'::regclass));
select pg_temp.chk('I8 ai_student_profiles grants: plan_windows select yes / update no; sat_total update yes; anon nothing', 'true/false/true/false',
  (select has_column_privilege('authenticated', 'public.ai_student_profiles', 'plan_windows', 'select')::text || '/' || has_column_privilege('authenticated', 'public.ai_student_profiles', 'plan_windows', 'update')::text
          || '/' || has_column_privilege('authenticated', 'public.ai_student_profiles', 'sat_total', 'update')::text || '/' || has_table_privilege('anon', 'public.ai_student_profiles', 'select')::text));
select pg_temp.chk('I9 payments_needing_review: service_role select only', 'false/false/true/false',
  (select has_table_privilege('authenticated', 'public.payments_needing_review', 'select')::text || '/' || has_table_privilege('anon', 'public.payments_needing_review', 'select')::text
          || '/' || has_table_privilege('service_role', 'public.payments_needing_review', 'select')::text || '/' || has_table_privilege('service_role', 'public.payments_needing_review', 'update')::text));
select pg_temp.chk('I10 teacher, parent, portfolio and extension RPCs don''t return plan_windows', '0',
  (select count(*)::text from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%plan_windows%'
      and (proname like 'teacher\_%' or proname in ('parent_view', 'portfolio_view', 'extension_transcript', 'extension_activities'))));

-- ── result: raises on purpose, so the transaction can never commit ──
do $$
declare f int; s text;
begin
  select count(*) filter (where not coalesce(got like expect || '%', false)),
         string_agg(format('%s %s | %s | %s', case when coalesce(got like expect || '%', false) then 'PASS' else 'FAIL' end, n, name, left(got, 160)), E'\n' order by n)
    into f, s from smoke;
  raise exception E'SMOKE RESULT: % failures\n%', f, s;
end $$;

rollback;
