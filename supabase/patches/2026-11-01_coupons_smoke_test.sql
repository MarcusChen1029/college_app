-- Smoke test for migration 0050_coupons. Run in the dashboard SQL Editor AFTER applying 0050 (or paste 0050 right after
-- "begin;" to dry-run the migration and the test together). It creates throwaway users inside one transaction, calls
-- redeem_coupon as the payments Edge Function does (service role; here postgres), checks what a website session may do,
-- and never commits: the LAST statement deliberately raises "SMOKE RESULT: <n> failures" followed by one PASS/FAIL line
-- per check, which aborts the transaction. Success = "SMOKE RESULT: 0 failures". Real users' rows are never touched.
--
-- Cast: U1 redeems smokefree; U2 already has a paid Fall 2027 pass; U3 runs into the attempt limit; U4 and U5 share a
-- code that can be used once; U6 is the website session.

begin;

create temp table smoke (n serial primary key, name text, expect text, got text) on commit drop;

create function pg_temp.u(k int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000050' || lpad(k::text, 2, '0'))::uuid $$;
create function pg_temp.today() returns date language sql stable as $$ select (now() at time zone 'Asia/Taipei')::date $$;
-- The Fall 2027 pass bought today (supabase/functions/_shared/pass.ts passWindow).
create function pg_temp.r(k int, p_code text, p_year int) returns text language sql as $$
  select public.redeem_coupon(pg_temp.u(k), p_code, p_year::smallint,
                              greatest(pg_temp.today(), make_date(p_year - 1, 1, 1)), make_date(p_year, 7, 31))
$$;
-- Runs p_sql as a website session of user k (role authenticated). 'ok:<first column>' or 'refused <sqlstate>'.
create function pg_temp.as_user(k int, p_sql text) returns text language plpgsql as $$
declare res text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.u(k), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into res;
    res := 'ok:' || coalesce(res, 'null');
  exception when others then
    res := 'refused ' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return res;
end $$;
-- 'raised' when p_sql raises (as postgres), else 'no raise'.
create function pg_temp.raises(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'no raise';
exception when others then
  return 'raised';
end $$;
create function pg_temp.check(p_name text, p_expect text, p_got text) returns void language sql as $$
  insert into smoke (name, expect, got) values (p_name, p_expect, p_got)
$$;

-- ── setup ──
insert into auth.users (id, email) select pg_temp.u(k), 'smoke-0050-u' || k || '@example.invalid' from generate_series(1, 6) k;
insert into public.user_roles (user_id, role) select pg_temp.u(k), 'student' from generate_series(1, 6) k;
insert into public.student_profiles (user_id) select pg_temp.u(k) from generate_series(1, 6) k;
insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_from, pass_until, payer, status, payment_type, paid_at)
values (pg_temp.u(2), 'SMOKE0050U2', 'stage', 2027, 990, pg_temp.today(), date '2027-07-31', 'student', 'paid', 'Credit_CreditCard', now());
select public.recompute_plan(pg_temp.u(2));
insert into public.coupons (code, note) values ('smokefree', 'smoke');
insert into public.coupons (code, active, note) values ('smokeoff', false, 'smoke');
insert into public.coupons (code, expires_at, note) values ('smokeold', now() - interval '1 minute', 'smoke');
insert into public.coupons (code, max_redemptions, note) values ('smokeonce', 1, 'smoke');

-- ── the smokefree code ──
select pg_temp.check('a new code is a free pass and is on', 'free_pass true',
  (select kind || ' ' || active::text from public.coupons where code = 'smokefree'));
select pg_temp.check('U1 redeems smokefree for 2027', 'redeemed', pg_temp.r(1, 'smokefree', 2027));
select pg_temp.check('U1 order: paid NT$0 coupon order in production mode', 'paid 0 coupon production student',
  (select string_agg(status || ' ' || amount_twd || ' ' || payment_type || ' ' || mode || ' ' || payer, ',')
     from public.plan_orders where user_id = pg_temp.u(1)));
select pg_temp.check('U1 trade number is CP + 18', 'ok',
  (select case when merchant_trade_no ~ '^CP[0-9A-F]{18}$' then 'ok' else merchant_trade_no end from public.plan_orders where user_id = pg_temp.u(1)));
select pg_temp.check('U1 plan is the pass, window until 2027-07-31', 'senior 2027 2027-07-31',
  (select plan || ' ' || (plan_windows -> 0 ->> 'entry_year') || ' ' || (plan_windows -> 0 ->> 'until') from public.student_profiles where user_id = pg_temp.u(1)));
select pg_temp.check('U1 redemption points at the order', '1',
  (select count(*)::text from public.coupon_redemptions r join public.plan_orders o on o.id = r.order_id
    where r.user_id = pg_temp.u(1) and r.coupon_code = 'smokefree' and o.user_id = pg_temp.u(1)));
select pg_temp.check('U1 again (other spelling, other year) is used', 'used', pg_temp.r(1, ' Smoke-Free ', 2028));
select pg_temp.check('U1 still has one order', '1', (select count(*)::text from public.plan_orders where user_id = pg_temp.u(1)));
select pg_temp.check('a used code is not a failed attempt', '0', (select count(*)::text from private.coupon_attempts where user_id = pg_temp.u(1)));

-- ── refusals ──
select pg_temp.check('U2 (already paid 2027) is already_paid', 'already_paid', pg_temp.r(2, 'smokefree', 2027));
select pg_temp.check('U2 for 2028 is redeemed', 'redeemed', pg_temp.r(2, 'SMOKEFREE', 2028));
select pg_temp.check('U2 now has two windows', '2', (select jsonb_array_length(plan_windows)::text from public.student_profiles where user_id = pg_temp.u(2)));
select pg_temp.check('unknown code is invalid', 'invalid', pg_temp.r(3, 'nope', 2027));
select pg_temp.check('switched-off code is invalid', 'invalid', pg_temp.r(3, 'smokeoff', 2027));
select pg_temp.check('expired code is invalid', 'invalid', pg_temp.r(3, 'smokeold', 2027));
select pg_temp.check('U4 uses the once-only code', 'redeemed', pg_temp.r(4, 'smokeonce', 2027));
select pg_temp.check('U5 finds it used up (invalid)', 'invalid', pg_temp.r(5, 'smokeonce', 2027));
select pg_temp.check('U3 failures logged', '3', (select count(*)::text from private.coupon_attempts where user_id = pg_temp.u(3)));
select pg_temp.r(3, 'nope' || k, 2027) from generate_series(1, 7) k;
select pg_temp.check('U3 after 10 failures is rate_limited, even with a good code', 'rate_limited', pg_temp.r(3, 'smokefree', 2027));
select pg_temp.check('U3 has no order', '0', (select count(*)::text from public.plan_orders where user_id = pg_temp.u(3)));
select pg_temp.check('missing dates raise', 'raised', pg_temp.raises(format(
  'select public.redeem_coupon(%L::uuid, %L, 2027::smallint, null, null)', pg_temp.u(6), 'smokefree')));
select pg_temp.check('U6 has no order after the raise', '0', (select count(*)::text from public.plan_orders where user_id = pg_temp.u(6)));

-- ── a website session can't reach any of it ──
select pg_temp.check('session cannot call redeem_coupon', 'refused 42501',
  pg_temp.as_user(6, format('select public.redeem_coupon(%L::uuid, %L, 2027::smallint, current_date, date %L)', pg_temp.u(6), 'smokefree', '2027-07-31')));
select pg_temp.check('session cannot read coupons', 'refused 42501', pg_temp.as_user(6, 'select code from public.coupons limit 1'));
select pg_temp.check('session cannot read redemptions', 'refused 42501', pg_temp.as_user(6, 'select coupon_code from public.coupon_redemptions limit 1'));
select pg_temp.check('session cannot read attempts', 'refused 42501', pg_temp.as_user(6, 'select count(*)::text from private.coupon_attempts'));
select pg_temp.check('session cannot insert a coupon', 'refused 42501', pg_temp.as_user(6, $q$insert into public.coupons (code) values ('mine') returning code$q$));
select pg_temp.check('U6 is still Free', 'free []', (select plan || ' ' || plan_windows::text from public.student_profiles where user_id = pg_temp.u(6)));
select pg_temp.check('U1 sees the coupon order in its history', 'ok:coupon',
  pg_temp.as_user(1, 'select payment_type from public.plan_orders limit 1'));

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
