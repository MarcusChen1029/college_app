-- Paid plans with ECPay, step 1 of 2 (spec docs/superpowers/specs/2026-10-29-payments-design.md, "Data model").
-- After this migration the plan is server-owned: no website session, AI connector or anon request can grant itself
-- the paid plan. Only the payments Edge Function (service role) and the owner (SQL Editor) change it.
--
-- 1. student_profiles.plan_windows: one {entry_year, from, until} per paid, unrefunded order (a cache of plan_orders,
--    rebuilt by recompute_plan). plan stays as a coarse flag for the client that is live during rollout: 'senior'
--    while any window hasn't ended (Asia/Taipei date), else 'free'. Junior is gone: junior rows become senior first
--    (and are grandfathered with the seniors), then the check allows only free / senior.
-- 2. Trigger guard_plan_columns: for anon / authenticated requests (website sessions and AI connector tokens alike) it
--    silently keeps plan and plan_windows as they were (a new row gets free / []). It never raises, so the LIVE OLD
--    CLIENT KEEPS WORKING: it upserts the whole profile, plan included, on every save and on the first-sign-in merge;
--    that plan value is now simply ignored (even 'junior', since CHECKs run after BEFORE triggers). Trigger names fire
--    in alphabetical order: guard_plan_columns runs after 0043's forbid_plaintext_password and before oauth_guard
--    (0041), so an AI write through the profile view never trips the OAuth guard on a column this trigger reset.
-- 3. plan_orders (one row per checkout attempt; ECPay never accepts a MerchantTradeNo twice) and pay_links (a parent
--    pays through a link; each parent checkout makes a new order pointing at it). Students may read their own orders
--    (listed columns only); every write goes through the service role. Deleting the account keeps the order
--    anonymized (user_id and payment_info cleared, the pay link deleted) for refunds, reconciliation and tax.
-- 4. Service-role functions: apply_paid_order (idempotent; never revives a refunded order), set_order_payment_info
--    (ATM / CVS codes), recompute_plan, refund_order (owner, after refunding in the ECPay back office; see
--    supabase/patches/refund-order.sql), is_payment_tester (stage-mode testers, private.payment_testers), and the
--    view payments_needing_review (a second paid order for an entry year the student already paid for).
-- 5. Grandfathering: every senior profile gets a free Fall 2027 pass (paid order, amount 0, to 2027-07-31).
-- 6. The AI profile view gains plan_windows (read only), so the MCP server can tell when a pass ends.
-- Smoke test: supabase/patches/2026-10-29_payments_smoke_test.sql. 0045 (the server-side college limit) comes later.

-- ───────────── 1. plan columns ─────────────

update public.student_profiles set plan = 'senior' where plan = 'junior';
alter table public.student_profiles drop constraint student_profiles_plan_check;
alter table public.student_profiles add constraint student_profiles_plan_check check (plan in ('free', 'senior'));

alter table public.student_profiles
  add column plan_windows jsonb not null default '[]'::jsonb check (jsonb_typeof(plan_windows) = 'array');
comment on column public.student_profiles.plan_windows is
  'Paid passes as [{entry_year, from, until}] (Taipei dates, inclusive). Written only by public.recompute_plan (0044).';

-- ───────────── 2. plan guard ─────────────

-- Runs as the caller (not SECURITY DEFINER). The JWT role decides: PostgREST sets request.jwt.claims for every Data API
-- request; the service role, cron and the SQL Editor (no claims) pass. current_user is checked as well, so a session
-- that switched to a client role without claims is held to the same rule.
create function public.guard_plan_columns() returns trigger
language plpgsql set search_path = '' as $$
declare
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
begin
  if jwt_role in ('anon', 'authenticated') or current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.plan_windows := '[]'::jsonb;
    else
      new.plan := old.plan;
      new.plan_windows := old.plan_windows;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_plan_columns() from public, anon, authenticated;

create trigger guard_plan_columns before insert or update on public.student_profiles
  for each row execute function public.guard_plan_columns();

-- ───────────── 3. pay links and orders ─────────────

create table public.pay_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  entry_year  smallint not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index pay_links_user_id_idx on public.pay_links (user_id);

create table public.plan_orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete set null,
  merchant_trade_no text not null unique check (merchant_trade_no ~ '^[A-Za-z0-9]{1,20}$'),
  mode              text not null check (mode in ('stage', 'production')),
  entry_year        smallint not null,
  amount_twd        int not null check (amount_twd >= 0),
  pass_from         date,
  pass_until        date not null,
  payer             text not null check (payer in ('student', 'parent')),
  pay_link_id       uuid references public.pay_links (id) on delete set null,
  status            text not null default 'pending'
                    check (status in ('pending', 'awaiting_payment', 'paid', 'expired', 'refunded')),
  payment_type      text,
  ecpay_trade_no    text, -- not unique: a notice may carry an empty TradeNo
  payment_info      jsonb,
  simulated         boolean not null default false,
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  expires_at        timestamptz
);
create index plan_orders_user_id_created_at_idx on public.plan_orders (user_id, created_at);
create index plan_orders_pay_link_id_idx on public.plan_orders (pay_link_id);

-- Account deletion sets user_id null (on delete set null runs as an UPDATE, so this fires): the ATM account / CVS code
-- goes with it. Date, amount, method, entry year and both trade numbers stay.
create function public.anonymize_plan_order() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.user_id is not null and new.user_id is null then
    new.payment_info := null;
  end if;
  return new;
end $$;
revoke all on function public.anonymize_plan_order() from public, anon, authenticated;
create trigger anonymize_plan_order before update on public.plan_orders
  for each row execute function public.anonymize_plan_order();

create trigger row_cap before insert on public.plan_orders for each row execute function public.enforce_row_cap('user_id', '100');
create trigger row_cap before insert on public.pay_links for each row execute function public.enforce_row_cap('user_id', '50');

-- Supabase's default privileges grant everything on a new table in public to anon, authenticated and service_role.
revoke all on public.plan_orders, public.pay_links from public, anon, authenticated;
alter table public.plan_orders enable row level security;
alter table public.pay_links enable row level security;
-- A student reads their own payment history. Not user_id, mode, pay_link_id, ecpay_trade_no or simulated.
grant select (id, merchant_trade_no, entry_year, amount_twd, pass_from, pass_until, payer, status, payment_type,
              payment_info, created_at, paid_at, expires_at)
  on public.plan_orders to authenticated;
create policy "own orders" on public.plan_orders for select to authenticated
  using (user_id = (select auth.uid()) and not (select public.is_oauth_client()));
-- pay_links: no client grant and no policy (the Edge Function resolves tokens with the service role).
grant all on public.plan_orders, public.pay_links to service_role;

comment on table public.plan_orders is
  'One row per checkout attempt (0044). Written only by the payments Edge Function (service role) and the owner.';
comment on table public.pay_links is
  'Parent pay links (0044): SHA-256 hex of the token. Service role only.';

-- Stage-mode testers (the owner adds rows in the SQL Editor). Not exposed through the Data API.
create table private.payment_testers (
  user_id uuid primary key references auth.users (id) on delete cascade
);
revoke all on private.payment_testers from public, anon, authenticated;

-- ───────────── 4. service-role functions ─────────────

-- Rebuilds plan_windows and plan from the user's paid orders (refunded ones don't count).
create function public.recompute_plan(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  windows jsonb;
  active boolean;
begin
  if p_user is null then return; end if;
  insert into public.student_profiles (user_id) values (p_user) on conflict (user_id) do nothing;
  select coalesce(jsonb_agg(jsonb_build_object('entry_year', o.entry_year, 'from', o.pass_from, 'until', o.pass_until)
                            order by o.pass_from, o.entry_year, o.created_at, o.id), '[]'::jsonb),
         coalesce(bool_or(o.pass_until >= (now() at time zone 'Asia/Taipei')::date), false)
    into windows, active
    from public.plan_orders o
   where o.user_id = p_user and o.status = 'paid';
  update public.student_profiles
     set plan_windows = windows, plan = case when active then 'senior' else 'free' end
   where user_id = p_user;
end $$;

-- Marks an order paid and rebuilds the plan, in one transaction. 'not_found' only when no row has that number;
-- 'already_paid' for a paid or refunded order (no change: a late duplicate notice never revives a refunded pass).
-- The row lock makes a duplicate notice that arrives at the same moment wait and then see 'paid'.
create function public.apply_paid_order(p_merchant_trade_no text, p_ecpay_trade_no text, p_payment_type text,
                                        p_paid_at timestamptz, p_pass_from date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  o public.plan_orders;
begin
  select * into o from public.plan_orders where merchant_trade_no = p_merchant_trade_no for update;
  if not found then return 'not_found'; end if;
  if o.status in ('paid', 'refunded') then return 'already_paid'; end if;
  if p_pass_from is null then raise exception 'apply_paid_order: pass_from is required'; end if;
  update public.plan_orders
     set status = 'paid',
         ecpay_trade_no = coalesce(nullif(p_ecpay_trade_no, ''), ecpay_trade_no),
         payment_type = coalesce(nullif(p_payment_type, ''), payment_type),
         paid_at = coalesce(p_paid_at, now()),
         pass_from = p_pass_from
   where id = o.id;
  perform public.recompute_plan(o.user_id);
  return 'applied';
end $$;

-- ATM virtual account / CVS code notice: stores the code and its deadline. A paid or refunded order is left alone;
-- an anonymized order (account deleted) gets no payment info.
create function public.set_order_payment_info(p_merchant_trade_no text, p_payment_type text, p_info jsonb,
                                              p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.plan_orders
     set status = 'awaiting_payment',
         payment_type = coalesce(nullif(p_payment_type, ''), payment_type),
         payment_info = case when user_id is null then null else p_info end,
         expires_at = p_expires_at
   where merchant_trade_no = p_merchant_trade_no and status not in ('paid', 'refunded');
end $$;

-- For the owner (SQL Editor), AFTER refunding in the ECPay back office. Returns 'refunded', 'already_refunded',
-- 'not_paid' or 'not_found'.
create function public.refund_order(p_merchant_trade_no text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  o public.plan_orders;
begin
  select * into o from public.plan_orders where merchant_trade_no = p_merchant_trade_no for update;
  if not found then return 'not_found'; end if;
  if o.status = 'refunded' then return 'already_refunded'; end if;
  if o.status <> 'paid' then return 'not_paid'; end if;
  update public.plan_orders set status = 'refunded' where id = o.id;
  perform public.recompute_plan(o.user_id);
  return 'refunded';
end $$;

create function public.is_payment_tester(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.payment_testers where user_id = p_user)
$$;

revoke all on function public.recompute_plan(uuid) from public, anon, authenticated;
revoke all on function public.apply_paid_order(text, text, text, timestamptz, date) from public, anon, authenticated;
revoke all on function public.set_order_payment_info(text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.refund_order(text) from public, anon, authenticated;
revoke all on function public.is_payment_tester(uuid) from public, anon, authenticated;
grant execute on function public.recompute_plan(uuid) to service_role;
grant execute on function public.apply_paid_order(text, text, text, timestamptz, date) to service_role;
grant execute on function public.set_order_payment_info(text, text, jsonb, timestamptz) to service_role;
grant execute on function public.refund_order(text) to service_role;
grant execute on function public.is_payment_tester(uuid) to service_role;

-- Paid orders whose student has another paid (unrefunded) order for the same entry year, e.g. a parent paid by ATM
-- after the student paid by card. Refund one of them (refund-order.sql). Every such order is listed.
create view public.payments_needing_review with (security_invoker = true) as
  select o.user_id, o.entry_year, o.merchant_trade_no, o.mode, o.payer, o.amount_twd, o.payment_type, o.ecpay_trade_no,
         o.paid_at, o.pass_from, o.pass_until, o.created_at, o.id
    from public.plan_orders o
   where o.status = 'paid' and o.user_id is not null
     and exists (select 1 from public.plan_orders d
                  where d.user_id = o.user_id and d.entry_year = o.entry_year and d.status = 'paid' and d.id <> o.id)
   order by o.user_id, o.entry_year, o.paid_at;
revoke all on public.payments_needing_review from public, anon, authenticated, service_role;
grant select on public.payments_needing_review to service_role;

-- ───────────── 5. grandfathering ─────────────

-- Every senior (junior rows became senior above) gets the Fall 2027 pass to 2027-07-31, at no charge, as a paid order,
-- so a later refund or recompute treats everyone the same way.
insert into public.plan_orders (user_id, merchant_trade_no, mode, entry_year, amount_twd, pass_from, pass_until, payer,
                                status, payment_type, paid_at)
select sp.user_id, 'GF' || left(replace(sp.user_id::text, '-', ''), 18), 'production', 2027, 0,
       (now() at time zone 'Asia/Taipei')::date, date '2027-07-31', 'student', 'paid', 'grandfathered', now()
  from public.student_profiles sp
 where sp.plan = 'senior';

do $$
declare u uuid;
begin
  for u in select user_id from public.plan_orders where payment_type = 'grandfathered' loop
    perform public.recompute_plan(u);
  end loop;
end $$;

-- ───────────── 6. the AI profile view gains plan_windows ─────────────

-- The 0041 definition with plan_windows appended (a replaced view may only add columns at the end). Its owner,
-- comment and grants stay: authenticated may select every column; the update grant still lists only the 0041
-- columns, so plan_windows is read only.
create or replace view public.ai_student_profiles with (security_barrier = true) as
  select user_id, sat_total, act_composite, gpa_unweighted, gpa_weighted, is_international, target_regions, plan,
         test_details, interested, activities, resume, updated_at, plan_windows
    from public.student_profiles
   where user_id = (select auth.uid())
  with local check option;
