# Paid plans with real payments (ECPay) — design

Status: draft for owner review, 2026-10-29. Research behind the provider choice:
`docs/superpowers/research/2026-10-29-payment-providers.md`.

## Changes made while planning (2026-10-29, builder calls; the plan `docs/superpowers/plans/2026-10-29-payments.md` wins)

- Parent links live in their own table `pay_links` (token hash, entry year, expiry); each parent checkout makes a
  new `plan_orders` row pointing at it. ECPay never accepts a `MerchantTradeNo` twice, so no order is reused, and
  `plan_orders` has no token column.
- The parent page is `/share/pay/<token>` (it inherits the share pages' no-referrer / noindex / no-store headers and
  stays out of the role redirect). Function routes are `/pay-links...`.
- Stage testers are rows in `private.payment_testers`, not an env var; stage mode needs no secrets at all (ECPay's
  public stage merchant 3002607 is built in). Production needs the three ECPay secrets or the function refuses.
- The site's CSP `form-action` gains `https://payment-stage.ecpay.com.tw` and `https://payment.ecpay.com.tw`
  (the checkout is a form POST to ECPay).
- The home page still says "Senior plan" (`home.ts`); it is off limits here and is reported as a follow-up.

## Why

Today `web/lib/plans.ts` offers Free (3 colleges), Junior NT$50/month (10) and Senior NT$150/month (unlimited +
Connect AI + extension), and `/pricing` lets any student pick any plan for free ("Payments aren't set up yet").
Monthly prices this low leave almost nothing after payment fees, and an application cycle only lasts a few months
of heavy use. Students do start early, though (some in February or April of junior year), so a calendar "season" is
the wrong unit: what a student pays for is **one application cycle**.

Goal: one paid product that actually collects money, with the plan decided by the server only.

## Decisions (owner, 2026-10-29)

| Topic | Decision |
|---|---|
| Plans | **Free**: up to **5** colleges, basic Copy for AI. **Admission-year pass** (paid): unlimited colleges, full AI context, Connect AI, the application filler extension. Junior is removed. |
| Price | **NT$990**, one payment, no subscription. |
| Validity | Tied to the **entry year** the student picks at checkout ("Fall 2027 entry"). Valid from its **start** until **July 31 of that entry year** (Taipei dates, inclusive). Start = the later of the payment date and **Jan 1 of the year before entry** (Fall 2028 pass: 2027-01-01 at the earliest), so a pass covers at most 19 months and a far-future year is never the best buy. Buying before the start is a **pre-order** (owner, 2026-10-29): paid now, active from its start; the student stays Free until then unless another pass is active. Chosen so it ends before Common App / UC open the next cycle on Aug 1, so one pass can't be stretched over two cycles. Known trade-off: UK results / Clearing (mid-August) fall after the end; the student keeps all data, only paid features stop. |
| Entry years offered | E0, E0+1 and E0+2 (later ones are pre-orders). E0 = this year + 1 from Aug 1 to Dec 31, this year from Jan 1 to Jul 31 (Taipei date). E0 is offered only while at least 30 days remain before its end (so not in July). Nothing preselected; each option shows its start and end ("2027/1/1 起生效，用到 2028/7/31", or "付款後立即生效" when it starts now) and a hint ("正在申請 → 2027；明年申請 → 2028"). |
| After expiry | Back to Free automatically. Every listed college stays; adding more is blocked while over the limit (the existing over-limit message). |
| Currency / region | **TWD only.** Buyers are expected to be in Taiwan. No USD display. |
| Provider | **ECPay (綠界) 一般賣家, individual (個人)**, in the owner's name. Card (Taiwan-issued), ATM virtual account, convenience-store code. Credentials live only in env/secrets, so moving to a registered business later is a key swap, not a code change. |
| Parent pays | Yes: the student creates a **pay link** and sends it (e.g. on LINE). The parent opens it with no account and pays by card, ATM or convenience store; the student is upgraded when the payment lands. |
| Counselor / school plan | Not now. Add it to the roadmap (`docs/competitor-analysis-and-roadmap.md`): schools need a 統編 invoice and seat management, and an individual ECPay account is capped at NT$200,000 per 30 days. |
| Existing users | Live today: 2 Free, 3 Senior, 0 Junior. Every Senior (and any Junior that appears before the migration) is **grandfathered** to the Fall 2027 pass, valid to 2027-07-31, at no charge. Free stays Free (now 5). |
| Refunds | Checkout requires ticking a consent box (immediate activation; the 7-day cancellation right does not apply to online digital services once the buyer agrees, per 通訊交易解除權合理例外情事適用準則). Policy on top of that: **full refund if asked within 7 days of payment.** v1 refunds are manual: owner refunds in the ECPay back office, then runs a prepared SQL patch that marks the order refunded and recomputes the plan. |
| Receipts | No 統一發票 (individual seller). Settings shows the payment history (date, amount, method, entry year, start and end date). |
| Records after account deletion | Owner asked for my call; mine: **kept, anonymized**. The order's `user_id` becomes null and its pay-link token and ATM/CVS payment info are cleared; date, amount, method, entry year and the two trade numbers stay, for refunds, ECPay reconciliation and tax, up to 5 years. The Privacy Policy says so and names ECPay. |
| Contact details | None yet (owner). Not needed for test mode; needed before the ECPay account application (its review checks that the sales page shows the same email / phone as the seller account). |
| Name | "入學年度方案" / "Admission-year pass", shown as "2027 秋季入學方案" / "Fall 2027 pass" (owner, 2026-10-29). |

## Non-goals

- Subscriptions, coupons, installments, foreign cards, USD, PayPal.
- Counselor / school / multi-seat plans (roadmap only).
- Automatic refunds via API.
- Server-side gating of "Copy for AI" full context and of the extension download / extension token. They stay
  client-gated as today (the zip is public in `web/public/downloads/`). Listed as a known gap.

Anti-goals (a failure even if it "works"):
- A student gets the paid plan without a verified payment (client write, forged notify, ECPay "simulate paid" in
  production, a test-card payment on the live site).
- The site that is live during rollout breaks (profile saves failing, first sign-in merge failing).
- Card data ever touching Trakur (ECPay's hosted page only).
- Anything on the home page, footer, ads or tracking changes.

## How it works

### Data model (migration 0045)

Repo migrations end at 0044 (main's `0044_default_table_privileges`; 0043 and 0044 are applied to the project). This
feature takes **0045** and **0046** (first written as 0044/0045, renumbered 2026-10-29 after main's 0044). Re-check `supabase/migrations/` and `list_migrations` before applying.

- `student_profiles` gains `plan_windows jsonb` (default `[]`): one `{ "entry_year", "from", "until" }` per paid,
  unrefunded order, written only by the server (a cache of `plan_orders`, so the client and the MCP server read one
  row). Effective plan = paid if today (Asia/Taipei) is inside any window; anything else is Free. Windows can be
  disjoint (a Fall 2027 pass plus a pre-ordered Fall 2029 pass leave a gap), which is why it's a list, not one date.
  `plan` is kept as a coarse flag for the client that is live during rollout: `'senior'` while any window hasn't
  ended, else `'free'`. The DB key of the paid plan **stays `'senior'`** (the old client then still treats a paid
  user as unlimited, and the MCP server's `isSenior` keeps working); only the display name changes. `plan` check
  becomes `('free', 'senior')`.
- **Plan guard trigger** `guard_plan_columns` on `student_profiles` (BEFORE INSERT OR UPDATE): when the request's JWT role
  (`request.jwt.claims` ->> 'role') is `anon` or `authenticated`, it silently keeps `plan` and `plan_windows` at their
  old values (INSERT: `free`, `[]`). It does not raise, because the live client
  upserts the whole profile including `plan` on every save. Requests with the service role, and direct SQL (no JWT),
  may change them. It must run before `oauth_guard` (trigger names fire alphabetically) so an AI write through
  `ai_student_profiles` never trips the OAuth guard on a reset column. CHECK constraints run after BEFORE triggers,
  so an old client sending `'junior'` is reset, not rejected.
- `plan_orders`: one row per checkout attempt.
  `id uuid`, `user_id` (student, FK auth.users **on delete set null**; a trigger or the account-deletion code also
  clears `pay_token_hash` and `payment_info` then; check `web/lib/account-server.ts`), `merchant_trade_no` (unique,
  <= 20 alnum, ECPay rule), `mode` (`stage` | `production`), `entry_year`, `amount_twd`, `pass_from date`
  (computed when paid: later of the payment date and Jan 1 of entry_year - 1), `pass_until date`, `payer`
  (`student` | `parent`),
  `pay_token_hash` (parent links only, unique), `status` (`pending` | `awaiting_payment` | `paid` | `expired` |
  `refunded`), `payment_type`, `ecpay_trade_no`, `payment_info jsonb` (ATM bank code + account + deadline, or CVS
  code + deadline), `simulated boolean`, `created_at`, `paid_at`, `expires_at`.
  RLS: a student can SELECT their own rows (not `pay_token_hash`, via column grants). No INSERT/UPDATE/DELETE for
  anon/authenticated; all writes go through the payments Edge Function with the service role. Row cap via the
  existing `enforce_row_cap` (e.g. 100 per user).
- `apply_paid_order(...)`: SECURITY DEFINER, EXECUTE granted to `service_role` only (0041 revoked default execute
  grants, so grant explicitly). In one transaction and idempotently: mark the order paid (setting `pass_from`), then
  rebuild the profile's `plan_windows` and `plan` from the paid orders (the same code as `recompute_plan`).
- `recompute_plan(user_id)` + `supabase/patches/refund-order.sql` (owner runs it in the SQL Editor after refunding in
  ECPay): mark refunded, recompute from the remaining paid orders.
- Grandfathering: the migration inserts one `plan_orders` row per grandfathered user (`payment_type = 'grandfathered'`,
  amount 0, paid, Fall 2027) and sets their profile, so the refund recompute treats everyone the same way.
- `ai_student_profiles` (0041 view) gains `plan_windows`; update `AI_PROFILE_COLUMNS` and keep
  `ai-views.test.ts` passing. Teacher, parent and portfolio views must keep not exposing plan data.

### Migration 0046 (applied only after the new web code is live)

`enforce_plan_limit` BEFORE INSERT on `student_colleges` (same advisory-lock pattern as `enforce_row_cap`): for a
non-service request whose effective plan is Free and who already has >= 5 colleges, raise
(`Plan limit reached`). This is what makes the limit server-side. It waits for the deploy because the live client's
first-sign-in merge inserts the whole local list in one upsert and aborts the entire merge on any error.

The new client's merge (my call, builder check 2026-10-29): it inserts only as many local colleges as fit (the
account's existing colleges count first; local ones in `addedAt` order) and **keeps the rest in this browser's copy**
instead of wiping it, with their status, notes, checklist, custom details and paired local passwords untouched. The
student sees "N colleges from this browser didn't fit the Free plan"; after buying the pass, the next load merges
them. (Interested was rejected: it stores slugs only, which loses custom colleges and every per-college field.) New
signed-out lists can't exceed 5, so only lists built under the old "pick any plan" /pricing hit this. The limit
number lives in SQL and `plans.ts`; a test asserts they match.

### Payments Edge Function (`supabase/functions/payments`, verify_jwt off)

Server-side so ECPay's notifications reach it (it needs a public URL; Vercel previews and localhost don't work for
this), and so the same function serves local testing and production. Pure ECPay code (field building,
CheckMacValue with ECPay's .NET-style URL encoding, notify parsing) in `supabase/functions/_shared/ecpay.ts`, unit
tested with a known vector from ECPay's docs.

- `GET /status` -> `{ open }`: open in production mode, or in stage mode for user ids in `ECPAY_TEST_USER_IDS`.
  `/pricing` shows the pay buttons only when open, otherwise "Payment opens soon". This lets the web deploy happen
  before ECPay approves the account.
- `POST /checkout` (student JWT): the caller must be a student (`user_roles`), not a teacher. Validates the entry
  year (one of the offered years, computed on the server's Taipei date) and the return origin against `APP_ORIGINS`. If the student has an unexpired pending order for the
  same year, return it instead of making a new one. Creates the order and returns `{ action, fields }` (ECPay AIO
  form, `ChoosePayment=ALL` minus the methods we don't offer, ATM/CVS deadline 3 days, `ReturnURL` and
  `PaymentInfoURL` = `/notify`, `ClientBackURL` = back to `/pricing?order=<id>` or the pay link). The browser builds
  the form and auto-submits it to ECPay. In stage mode only allow-listed users may check out (the DB is the live
  one, so a test card must never upgrade a real student).
- `POST /pay-link` (student JWT): creates a parent order with a random token (store only its hash; 7-day expiry).
  An order that already has ATM / convenience-store payment info stays payable until ECPay's own deadline (the bank
  account or code still takes money until then), so a new link never cancels it; the student sees every open order.
  Our `expires_at` is ECPay's deadline, never earlier. Returns the URL `<origin>/pay/<token>`.
- `GET /pay-link/<token>` and `POST /pay-link/<token>/checkout` (anon): show what is being bought (pass, entry year,
  end date, NT$990, the student's name as the parent share link shows it, or no name if empty) and start the same
  checkout for that order.
- `POST /notify` (from ECPay, form-encoded): verify CheckMacValue (constant-time). Bad or missing signature ->
  HTTP 400, no DB write, logged. Then: order exists, `mode` and `MerchantID` match, `TradeAmt` == `amount_twd`.
  `RtnCode=1` -> `apply_paid_order`, except `SimulatePaid=1` in production mode (record only, never upgrade).
  ATM/CVS "payment info" notices -> store `payment_info`, status `awaiting_payment`. Reply `1|OK` to every valid
  notice, duplicates included (ECPay retries).
- Every valid paid notice is applied, whatever our order status says. A pass paid while the same entry year is
  already active (e.g. student and parent both paid) is still recorded; it shows in a `payments_needing_review` query
  in the refund patch so the owner can refund it. Because an entry year is only offered while >= 30 days remain and
  ATM/CVS deadlines are 3 days, a payment can't land after its pass has ended.

### Web

- `web/lib/plans.ts`: two plans, Free (limit 5) and the pass (key `senior`, NT$990, unlimited, full AI, Connect AI,
  filler). Helpers: effective plan from (`plan_windows`, today in Taipei), offered entry years, a pass's start and
  end for a payment date.
- `web/lib/student-store.ts` / `student-rows.ts`: `setPlan` goes away; the profile save stops sending `plan` (and the
  new columns). Signed-out students are always Free (the old local `plan` value is ignored). Merge cap as above.
- `/pricing` (`PricingPlans.tsx`): Free card and pass card. Pass card: entry-year picker with end dates, consent
  checkbox, "Pay" (signed in) or "Sign in to buy" (signed out), "Ask a parent to pay" (makes and shows a copyable
  pay link). An open ATM/CVS order shows its payment info and deadline. Back from ECPay (`?order=`): poll the order
  (RLS select) for up to about a minute: "Confirming payment..." -> "Your pass is active until ...". Refund policy
  and contact line next to the button (ECPay's review requires contact info on the sales page; the footer is off
  limits). The "Payments aren't set up yet" text is removed. English and zh-TW.
- `/pay/<token>`: the parent page, no sign-in, zh-TW and English.
- `MyList.tsx`: plan badge and Upgrade link use the new names; the over-limit and list-full messages link to /pricing.
- Settings: current pass ("Fall 2027 pass, until 2027/7/31"), any pre-ordered pass ("Fall 2028 pass, from
  2027/1/1"), and payment history.
- MCP (`web/lib/mcp/rules.ts`, `tools.ts`): `isSenior` and limits use the effective plan (`plan_windows`).
- `ConnectAi`, `OAuthConsent`, `FillerDownload`, `AiContextButton` read the effective plan through `student.plan`.
- New UI text goes through the i18n dictionaries (`i18n.test.ts`).

## Rollout order

1. Apply **0045**. Live (old) client: profile saves keep working; picking a plan on the old /pricing silently does
   nothing (reverts on reload); grandfathered users stay unlimited.
2. Deploy the `payments` function in **stage** mode with ECPay's public stage credentials and the test user in
   `ECPAY_TEST_USER_IDS`.
3. Run the end-to-end test (below) from localhost.
4. Merge and deploy the web app. Live students see "Payment opens soon" until production mode.
5. Apply **0046** (DB limit) once the new client is live.
6. Before payments open (and before the ECPay review, which checks the sales page's contact details): the legal
   pages (merged in PR #56) get the operator name and contact email in `web/lib/legal.ts`, the Terms "Plans and
   payments" section (`legal.terms.plans.*`, currently "Payment is not open yet") gets price, entry-year validity,
   the consent and the 7-day refund policy, and the Privacy Policy adds ECPay as a processor and the order-record
   retention (anonymized, up to 5 years). This ships with step 4 except the contact details, which wait for the
   owner.
7. Owner: ECPay account approved -> set production secrets, `ECPAY_MODE=production`, remove the test allow-list.
   Payments open.

## Secrets / env

Supabase function secrets: `ECPAY_MODE` (`stage` | `production`), `ECPAY_MERCHANT_ID`, `ECPAY_HASH_KEY`,
`ECPAY_HASH_IV`, `ECPAY_TEST_USER_IDS` (stage only), `APP_ORIGINS` (`https://www.track-ur-college.com,
http://localhost:3000`). `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform. Vercel: nothing
new (the web app calls the function under `NEXT_PUBLIC_SUPABASE_URL`).

## Testing and acceptance

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` in `web/` exit 0 (checked by exit code, not RTK text).
- Unit: CheckMacValue vector; notify rejects a bad signature, a wrong amount, an unknown order, a mode mismatch, and
  `SimulatePaid` in production; a duplicate notify is idempotent; offered entry years around Jul 1 / Jul 31 / Aug 1
  and Dec 31 / Jan 1; a pre-order's start (paid before Jan 1 of the year before entry) and an immediate start;
  effective plan the day before a window, inside it, on its last day and after it, and across two disjoint windows;
  plan limits.
- SQL smoke test (`supabase/patches/2026-10-29_payments_smoke_test.sql`, run in a transaction that rolls back): as
  `authenticated`, updating or inserting `plan` / `plan_windows` leaves them unchanged / Free, and the same through
  `ai_student_profiles` with OAuth claims; as the service role, `apply_paid_order` upgrades; deleting the user keeps
  an anonymized order; after 0046, a Free student's 6th college insert fails and a pass holder's succeeds.
- End-to-end in ECPay stage: a throwaway student account (the owner signs it in once in the browser pane; the agent
  can't sign in with Google), card 4311-9522-2222-2222 on the public stage merchant. Screenshots: Free before
  paying, the ECPay page, the pass active only after the notify landed. Also one ATM order simulated paid in the
  stage back office, and one parent pay link.

## Left to the builder

Exact file layout inside the function, the order-number format, polling details, UI layout and copy (within the
existing tokens / `buttonClass` / `toneClass` rules), how the web test runner reaches `_shared/ecpay.ts`.

## Still open (owner, not blocking the build)

- The contact email (and phone, if any) for /pricing and the legal pages. Blocks only the ECPay account application
  and production mode, not the test-mode build. Until it exists, /pricing shows no contact line.
- Opening the ECPay 一般賣家 (個人) account itself: ID, own bank passbook, phone, the public sales URL
  (`https://www.track-ur-college.com/pricing`, Chinese, NT$ prices, contact details), 3 environment photos.
