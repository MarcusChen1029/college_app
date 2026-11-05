-- 2026-11-05: deactivate the live free-pass redeem code (security assessment finding 1).
-- The code was a short dictionary word with no redemption limit and no expiry; redeeming it records a real
-- production "paid" pass for the account. Applied to the live project on 2026-11-05 through the Supabase MCP
-- (owner approved). Existing redemptions and their orders are left as they are.
--
-- Future redeem codes: 16+ random characters (gen_random_bytes), max_redemptions and expires_at set, e.g.
--   insert into public.coupons (code, kind, active, max_redemptions, expires_at, note)
--   values (encode(gen_random_bytes(12), 'base64'), 'free_pass', true, 10, now() + interval '30 days', 'why');

update public.coupons
set active = false
where active = true;

-- Check: every coupon is now inactive.
select length(code) as code_len, kind, active, max_redemptions, expires_at from public.coupons;
