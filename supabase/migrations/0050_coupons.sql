-- Redeem codes (coupons). A student enters a code under the account menu > Redeem code (/redeem); the payments Edge
-- Function (POST /redeem, supabase/functions/_shared/payments-http.ts) checks the session and the entry year, then
-- calls redeem_coupon with the service role. The plan stays server-owned (0045): guard_plan_columns resets plan and
-- plan_windows for website sessions, so a code can only grant a pass through this service-role function.
--
-- 1. coupons: one row per code. kind 'free_pass' (the only kind so far) grants the admission-year pass for the entry
--    year the student picks, as a paid order of NT$0 (payment_type 'coupon'), so refund_order, recompute_plan and the
--    payment history treat it like any other pass. Codes are stored lowercase; what the student types is lowercased and
--    stripped of spaces and dashes first. active / expires_at / max_redemptions switch a code off (owner, SQL Editor).
-- 2. coupon_redemptions: one per code per account (unique), pointing at the order it made. Deleting the account keeps
--    the row with user_id null (the order is anonymized by 0045), so max_redemptions still counts it.
-- 3. private.coupon_attempts: failed tries (an unknown, switched-off, expired or used-up code), 10 per hour per user, as
--    for join codes (0021). Failures are returned, not raised, so the logged attempt is not rolled back.
-- 4. No codes here: this repository is public, so the owner adds codes in the SQL Editor, e.g.
--      insert into public.coupons (code, note) values ('<code>', '<who it is for>');
--    and switches one off with
--      update public.coupons set active = false where code = '<code>';
-- Smoke test: supabase/patches/2026-11-01_coupons_smoke_test.sql.

create table public.coupons (
  code             text primary key check (code ~ '^[a-z0-9]{3,32}$'),
  kind             text not null default 'free_pass' check (kind in ('free_pass')),
  active           boolean not null default true,
  max_redemptions  int check (max_redemptions > 0),
  expires_at       timestamptz,
  note             text,
  created_at       timestamptz not null default now()
);

create table public.coupon_redemptions (
  id           uuid primary key default gen_random_uuid(),
  coupon_code  text not null references public.coupons (code) on update cascade,
  user_id      uuid references auth.users (id) on delete set null,
  order_id     uuid references public.plan_orders (id) on delete set null,
  redeemed_at  timestamptz not null default now(),
  unique (coupon_code, user_id)
);
create index coupon_redemptions_user_id_idx on public.coupon_redemptions (user_id);
create index coupon_redemptions_order_id_idx on public.coupon_redemptions (order_id);

-- No client grant and no policy: only redeem_coupon (and the owner) read or write these.
revoke all on public.coupons, public.coupon_redemptions from public, anon, authenticated;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
grant all on public.coupons, public.coupon_redemptions to service_role;

comment on table public.coupons is
  'Redeem codes (0050). Lowercase code; kind free_pass grants the admission-year pass. Owner-managed (SQL Editor).';
comment on table public.coupon_redemptions is
  'One row per code per account (0050), written only by public.redeem_coupon.';

create table private.coupon_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index coupon_attempts_user_id_at_idx on private.coupon_attempts (user_id, at);
revoke all on private.coupon_attempts from public, anon, authenticated;

-- Redeems a code for p_user and the pass dates the caller worked out (supabase/functions/_shared/pass.ts passWindow).
-- Returns 'redeemed', 'invalid' (unknown, switched off, expired or used up: all look the same), 'used' (this account
-- already redeemed this code), 'already_paid' (the account has a pass for that entry year) or 'rate_limited'.
create function public.redeem_coupon(p_user uuid, p_code text, p_entry_year smallint, p_pass_from date, p_pass_until date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  norm text := lower(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  c public.coupons;
  new_order uuid;
begin
  if p_user is null or p_entry_year is null or p_pass_from is null or p_pass_until is null or p_pass_until < p_pass_from then
    raise exception 'redeem_coupon: user, entry year and pass dates are required';
  end if;
  -- One redemption at a time per account: the checks below then see any order an earlier call made.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('coupon:' || p_user::text, 0));

  delete from private.coupon_attempts where at < now() - interval '1 day';
  if (select count(*) from private.coupon_attempts where user_id = p_user and at > now() - interval '1 hour') >= 10 then
    return 'rate_limited';
  end if;

  -- The row lock serialises redemptions of one code, so max_redemptions holds.
  select * into c from public.coupons where code = norm for update;
  if not found or not c.active or (c.expires_at is not null and c.expires_at <= now()) then
    insert into private.coupon_attempts (user_id) values (p_user);
    return 'invalid';
  end if;
  if exists (select 1 from public.coupon_redemptions where coupon_code = c.code and user_id = p_user) then
    return 'used';
  end if;
  if c.max_redemptions is not null
     and (select count(*) from public.coupon_redemptions where coupon_code = c.code) >= c.max_redemptions then
    insert into private.coupon_attempts (user_id) values (p_user);
    return 'invalid';
  end if;
  if exists (select 1 from public.plan_orders where user_id = p_user and entry_year = p_entry_year and status = 'paid') then
    return 'already_paid';
  end if;

  insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_from, pass_until, payer,
                                  status, payment_type, paid_at)
  values (p_user, 'CP' || upper(left(replace(gen_random_uuid()::text, '-', ''), 18)), 'production', p_entry_year, 0,
          p_pass_from, p_pass_until, 'student', 'paid', 'coupon', now())
  returning id into new_order;
  insert into public.coupon_redemptions (coupon_code, user_id, order_id) values (c.code, p_user, new_order);
  perform public.recompute_plan(p_user);
  return 'redeemed';
end $$;

revoke all on function public.redeem_coupon(uuid, text, smallint, date, date) from public, anon, authenticated;
grant execute on function public.redeem_coupon(uuid, text, smallint, date, date) to service_role;
