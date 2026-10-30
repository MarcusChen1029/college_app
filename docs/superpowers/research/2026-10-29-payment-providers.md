# Payment providers for a one-time "application season pass" (Trakur, Taiwan-based)

Research date: 2026-10-29. Researcher: subagent (read-only web research; nothing in the repo was changed except this file).
Question: which ONE provider should a small Taiwan-based web app use to sell a one-time pass (NT$990-1,490 for Taiwan buyers, about US$29-49 elsewhere), with hosted checkout plus a verified server-to-server notification that upgrades the student's plan.

Source hygiene: most vendor docs show no publication date. Where a page showed a date, `Last-Modified` header, "Last updated" line or version, it is quoted. Otherwise the entry says "no date on page, fetched 2026-10-29". Firecrawl was out of credits, so everything was fetched with WebFetch, WebSearch and plain HTTP reads of the official pages. Anything I could not confirm from a primary page is marked **uncertain**.

---

## 1. Recommendation

- **Individual owner (no company, possibly a parent holds the account): ECPay (綠界) 一般賣家 / 個人.** It is the only one of the six that an individual can open with just an ID and a Taiwan bank account, it has ATM virtual account and convenience-store code payment, it costs about 3% on cards, and its test environment needs no approval. Hard limits: the account holder must be 18+ with their own ID and bank account; domestic (Taiwan-issued) cards and TWD only, so foreign buyers without a Taiwan card cannot pay.
- **Individual owner who needs international buyers more than ATM/CVS: Paddle** (merchant of record). It lets individuals and sole traders in without business registration, charges TWD and USD, and accepts foreign cards. Cost is 5% + US$0.50, plus a 3% FX margin when the sale is in TWD (roughly 9-10% all-in on a NT$990-1,490 sale; my estimate, exchange rate not sourced). No ATM/CVS.
- **Company owner (有統編): ECPay 特約賣家** (adds foreign cards 3.5-3.8%, lower card rate 1.85-2.75%, NT$5,000 setup + NT$13,000/yr) or NewebPay. Stripe is not available to a Taiwan company either.
- **Not viable now:** Stripe (Taiwan not a supported country; only the Atlas US-LLC workaround). TapPay needs a bank acquiring contract plus fees. Lemon Squeezy works on paper (Taiwan bank payouts listed) but the company says its future is Stripe Managed Payments, charges USD only, and has no ATM/CVS.

Key blockers, in order of impact: (1) ECPay individual = domestic cards only; (2) Paddle/LS = no ATM/CVS for teens without cards; (3) tax registration kicks in at NT$50,000/month if the pass counts as a service (see section 5; the thresholds you remembered are outdated).

---

## 2. Comparison tables

### Table A: who can open an account, fees, currencies, merchant-of-record (points 1-4)

| Provider | 1. Who can open it / min age / Taiwan supported? | 2. Fees (one-time card; ATM/CVS; monthly/setup) | 3. Currencies / foreign cards | 4. Merchant of record? |
|---|---|---|---|---|
| **ECPay 綠界** | Taiwan **individual (個人賣家)** or business (商務) as 一般賣家; 特約賣家 via sales consultant. Registration page: "註冊須年滿18歲，且不開放海外個人註冊". Terms: must be a person with full legal capacity or a registered entity. Individual needs own ID, own Taiwan bank passbook, a public sales URL (Chinese UI, NT$ prices). | Card (domestic) 2.75% (min NT$5) + NT$1 per-order fee (tax incl.); ATM virtual account 1% (min NT$15); convenience-store code NT$31, barcode NT$16 (all ex-tax, +5% 營業稅 on settlement). No monthly or setup fee is listed for 一般賣家 on the fee page. 特約: setup NT$5,000 + NT$13,000/1yr, card 1.85-2.75%, foreign card 3.5-3.8%. Individual cap: NT$200,000 per 30 days (business NT$500,000). | **TWD only** (site must price in NT$). Foreign cards **only for 特約賣家**; 一般賣家 = domestic single-payment cards only. | No. Seller of record is you. ECPay has its own 電子發票 service (needs 稅籍資料函). |
| **TapPay** | Payment gateway, not an acquirer. Production needs a bank acquiring merchant account ("使用銀行的正式收單帳號"). Individual eligibility **not found** (onboarding inquiry template asks "Enterprise type (Company name/individual)"). Min age not found. Taiwan is home market. | Setup NT$5,000 one-time + membership NT$11,000/yr; card 2.75% domestic / 3.5% international; online ATM 1% (min NT$15); gateway fee NT$2/txn (English page) vs 0.3% (zh page) for non-Shopify (pages disagree); all ex-tax, +5%; rates "after risk assessment". Acquirer fee not on page. | Cards Visa/MC/JCB/AMEX/UnionPay incl. foreign; Apple/Google/Samsung Pay; LINE Pay, JKOPay etc. No CVS code payment (only CVS cash-on-delivery 1.5%). Currency: NT$ (quotes in NTD); USD **not found**. | No. |
| **NewebPay 藍新** (brief) | Personal member ("個人身份註冊使用", free registration, "最快一天上線", limit NT$200,000 on fee page / "NT$100,000起" on register page) or company. Min age **not found**. Whether personal members can use the MPG API **not confirmed officially** (a third-party tutorial says individuals can). | Card domestic 2.8% (tax incl.), foreign card 3.5%, installments 3-15%; ATM virtual account 1.0% (min NT$10), ATM transfer 1% (cap NT$20); CVS code NT$28, barcode NT$20 (tax incl.); withdrawal NT$10 (first 5 free/month). No annual or setup fee stated. | TWD; foreign cards listed at 3.5% (whether available to personal members **uncertain**). USD **not found**. | No. |
| **Stripe** | **Taiwan is NOT on the supported-country list** (page lists 50+ countries incl. Hong Kong, Japan, Singapore, Thailand, Malaysia; zero mentions of Taiwan in the raw page). Workaround: Stripe Atlas Delaware C-corp/LLC, US$500 one-time + US$100/yr registered agent. Age: 13+; if under 18 a parent/guardian must be added as representative and is liable (Stripe Services Agreement 1.2(b)). | US: 2.9% + 30c domestic cards; +1.5% international cards; +1% if currency conversion. No setup/monthly fee. ATM/CVS: none. | Many currencies incl. TWD in general; but requires a supported-country account first. | No (Stripe "Managed Payments" MoR is only in 35+ countries per Lemon Squeezy CEO post; Taiwan not in Stripe's list). |
| **Paddle** | Individuals and sole traders accepted: "Business verification (not required for individuals or sole traders)"; identity verification of the person via government ID (Sumsub). Works "anywhere in the world" except sanctioned list; **Taiwan is not on the unsupported list**. Min age **not found**. | Pay-as-you-go 5% + 50c per checkout transaction; no monthly fee; products under $10 need bespoke pricing. FX margin when a sale must be converted into your balance currency: 2% USD/EUR/GBP, 2.5% CZK/DKK/NOK/THB, **3% all other incl. TWD** (MSA 7.1). Payout wire fee $15 SWIFT in some cases. | Charge in TWD (listed payment currency, tax-inclusive for TW) and USD; foreign cards yes. Balance/payout currencies USD, EUR, GBP, AUD, CAD. | **Yes** (calculates, collects, remits tax; Paddle is the seller). No ATM/CVS. |
| **Lemon Squeezy** | Taiwan **bank payouts supported** (listed) and PayPal in 200+ countries. Store activation = questionnaire + government-ID identity verification (KYC & KYB). Individuals not explicitly addressed; min age **not found**. Signup page loads (auth.lemonsqueezy.com/signup/business-intent, 200 OK on 2026-10-29). | 5% + 50c per order; +1.5% international (non-US) cards; +1.5% PayPal. Payout: Stripe bank outside US 1% per payout; PayPal 3% (cap $30). Payouts 1st and 15th. | Shows 130 currencies incl. TWD but **always charges USD**; payouts in USD (converted at mid-market to your bank currency if chosen). Cards, PayPal, Apple/Google Pay, Alipay, WeChat Pay, ACH. No ATM/CVS. | **Yes** (docs: Lemon Squeezy is the merchant of record; the 2026 CEO post positions Stripe Managed Payments as the successor). |

### Table B: test/sandbox, webhook, hosted checkout (points 5-6)

| Provider | 5. Test mode / test cards / works before approval? | 6. Server notification verification; hosted checkout? |
|---|---|---|
| **ECPay** | Public shared stage environment, **no merchant approval needed**: stage URL `payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`; public stage MerchantIDs 3002607 (with 3D) and 2000132 (no 3D); test card **4311-9522-2222-2222**, CVV 222, any future expiry; stage has no foreign-card service; HashKey/HashIV are on the docs page (not copied here). ATM/CVS can be "simulated paid" from the vendor back office. | Hosted payment page (browser form-POST redirect to ECPay; we never see card data). Server notice to `ReturnURL`: POST form incl. `CheckMacValue`; verify by sorting params A-Z, prepend `HashKey=`, append `&HashIV=`, URL-encode (.NET style), lowercase, **SHA256**, uppercase; must reply `1\|OK`; resent 5-15 min later, up to 4 times/day. Check idempotency by MerchantTradeNo. A 400-character parameter limit was reported in a search summary (not confirmed on a primary page). |
| **TapPay** | Sandbox `sandbox.tappaysdk.com`; test card **4242 4242 4242 4242**, CCV 123, any future expiry (also JCB/AMEX test cards); fixed test prime string for server testing; wallets need support contact. Portal registration gives sandbox keys; whether that needs approval **not confirmed**. | Card data is typed into TapPay Fields on our page (iframe fields, card number never touches our server) -> `prime` -> server `pay-by-prime` with `x-api-key: partner_key`. Backend Notify is POSTed JSON; **no signature documented**; docs say frontend redirect data "may be forged" and tell you to call the Record API (`rec_trade_id`) to confirm. Retries at 1, 2, 4, 8, 16 min (max 5). Link Pay (連結收款) is a hosted payment link. |
| **NewebPay** | Separate test site `cwww.newebpay.com` (test gateway `ccore.newebpay.com/MPG/mpg_gateway`); third-party tutorials show test card 4000-2211-1111-1111, and one says first test registration needs ID upload and review (so sandbox may not work before approval). Official MPG manual PDF returned 403 to me, so test card/validity are **unverified officially**. | MPG hosted page (redirect). Request/notify use `TradeInfo` (AES-encrypted with HashKey/HashIV) and `TradeSha` (SHA256 over `HashKey=..&<TradeInfo>&HashIV=..`); described by third-party tutorials and the NewebPay donation-platform manual; MPG manual not opened. |
| **Stripe** | Sandboxes in Dashboard, test card **4242 4242 4242 4242** (Taiwan-issued test card 4000 0015 8000 0008); needs a Stripe account (country must be supported, so via Atlas). | Hosted Stripe Checkout exists. `Stripe-Signature` header, HMAC-SHA256 of timestamp + raw body with `whsec_` secret; official libraries verify; default 5-minute tolerance. |
| **Paddle** | Separate sandbox account (sandbox-vendors.paddle.com/signup); docs: **no approval required** for website approval or hosted checkout in sandbox. Test cards: 4242 4242 4242 4242 (no 3DS), 4000 0038 0000 0446 (3DS), 4000 0000 0000 0002 (declined), 4000 0566 5566 5556 (Visa debit), 4000 0027 6000 3184 (initial success, later decline). Sandbox rejects real cards. | Checkout is Paddle.js overlay or inline (PCI vault, 3DS2) on our own approved domain, plus transaction payment links; no card data on our server. `Paddle-Signature: ts=...;h1=...`; HMAC-SHA256 over `ts:rawBody` with the per-destination secret; SDKs (Node, Python, PHP, Go) verify with a 5-second default tolerance. |
| **Lemon Squeezy** | Test mode is on by default after signup; works before activation. Test cards: Visa 4242 4242 4242 4242, MC 5555 5555 5555 4444, Amex 3782 822463 10005, 3DS 4000 0027 6000 3184, decline 4000 0000 0000 9995. File downloads disabled in test mode. | Hosted checkout and overlay. `X-Signature` header = HMAC-SHA256 hex digest of the raw body using your signing secret (docs give a Node `timingSafeEqual` example). |

### Table C: payout, approval, blockers (points 7-8)

| Provider | 7. Payout to Taiwan; approval time; what they require | 8. Blockers |
|---|---|---|
| **ECPay** | To a Taiwan bank account in the seller's own name (account-name must match); credit-card/ATM proceeds paid out within 10 days of payment; withdrawal fee NT$15 to other banks (free to SinoPac); if you do not set auto-withdraw, balance above NT$100,000 is withdrawn monthly. Needs: ID photos, passbook photo, public sales URL with contact info on it, 3 environment photos (individual). Approval time for individuals **not found** (business: 2-5 working days per a support-page snippet). | 18+ and no overseas individuals; domestic cards only (individual); TWD pricing and Chinese UI required; NT$200k/30-day cap; ECPay notes that since 2023-01-01 an individual selling online above a set amount must complete 稅籍登記 and 商業登記; ECPay trade-management rules apply (not reviewed here). |
| **TapPay** | Funds settle through the acquiring bank/TapPay per contract; "approximately 2~4 weeks from application to going online". Requires contacting sales; document list not published. | Acquirer contract; NT$5,000 + NT$11,000/yr; no webhook signature; individual eligibility unknown (a third-party blog opinion says it is not suited to pure individuals; not official). |
| **NewebPay** | Taiwan bank; settlement 7-10 days after payment/capture depending on method; personal member needs verification (ID); "fastest 1 day to go live". | API access for personal members unconfirmed; personal cap NT$200k (or 100k); sandbox may need approval. |
| **Stripe** | Atlas company gets a US bank/Stripe payout (a Treasury account for Atlas founders was announced at Sessions 2026, per a search summary; not verified). Taiwan-direct payout: not available. | Not available in Taiwan. Atlas adds a US entity: US$500 + US$100/yr, plus US/Delaware compliance and Taiwan tax questions (not researched). |
| **Paddle** | Wire transfer or Payoneer (MSA 7.5 also mentions PayPal); monthly: balance converted on the 1st, sent by the 15th, up to 3 working days to arrive; threshold min $100 (adjustable). Verification: domain review (auto for most; 5-7 business days if manual), business verification not needed for individuals (2-4 business days if required), identity verification (instant or 1-3 business days; government ID + proof of address + possible liveness via Sumsub). Domain must show: product description, pricing, deliverables, Terms/Refund/Privacy policies reachable from navigation, sole proprietor's brand/legal name in the Terms, live HTTPS. | AUP prohibits human services not tied to software, certification/exam-prep, government services, travel, etc. A college-application tracker is software but sits near "education/consulting", so describe it as software on the site; Paddle decides in its sole discretion. 14-day refund right at Paddle's discretion; chargebacks charged back to you (up to 20 USD fee each). Monthly payout + $100 threshold; $15 SWIFT possible; 3% FX margin on TWD sales. No ATM/CVS. |
| **Lemon Squeezy** | Taiwan listed for bank payouts; payouts 1st and 15th; Stripe bank payout 1% (outside US) or PayPal (3%, cap $30), PayPal must be a verified Personal or Business account. Activation approvals "typically 2-3 business days" (docs). | Official blog (2026-01-28): CEO admits slower support and fewer updates, says the team is building Stripe Managed Payments, "Very soon we will announce public access"; Lemon Squeezy continues but no shutdown or pause announced by LS itself. Third-party 2026 articles conflict on whether new merchants are gated (**uncertain**). USD-only charging, no ATM/CVS, prohibited list includes "Services of any kind", PLR resale, etc. Entity now "Sold through Link, LLC f/k/a Lemon Squeezy LLC". |

---

## 3. Per-provider notes

### ECPay (綠界科技)
- Types: 一般賣家 (個人 or 商務) and 特約賣家 (VIP). Page "選擇最適合您的綠界科技服務": 一般賣家 = credit card "僅國內卡單期", 特約 adds installments, foreign cards, UnionPay, JKOPay etc. and must go through a sales consultant.
- Fee page lists "國外信用卡: 限特約賣家" and "ATM虛擬帳號 1%, 每筆最低收取 15 元", "超商代碼 31 元". Notes: online fees get 5% 營業稅 added at settlement; credit-card orders have a NT$1 handling fee (from 2025-04-01 announcement nID=5603, dated 2025-01-22). Deferred-delivery goods (virtual, service) are called out for **installment** fee increases for 特約 sellers only (announcement nID=5637, 2025-02-27); not applicable to single-payment cards for 一般賣家 as far as the notice says.
- Individual requirements (support.ecpay.com.tw/4862): own ID front/back, own passbook cover, mobile number never used on ECPay, email, selling URL that is Chinese-language, NT$-priced, not a marketplace/social/Google Form, and showing the same email/phone as the seller record; 3 environment photos. Same ID can only open one account.
- Age: registration page says 18+. Terms (effective 民國115年04月30日 = 2026-04-30) require "完全行為能力". If the owner is under 18, a parent must be the registered seller (their own ID, passbook, and tax responsibility).
- Test integration: public stage merchant IDs and test card (section 2). `ReturnURL` is the authoritative server notice; do not rely on `OrderResultURL` (browser side).
- Suggested mapping for Trakur: pass `CustomField1 = user id` (50 chars) and `MerchantTradeNo` unique; on `RtnCode=1` and valid `CheckMacValue` and matching `TradeAmt`, upgrade the plan idempotently, reply `1|OK`. ATM/CVS are asynchronous: you get a "payment info" notice first, and the "paid" notice later; handle both.

### TapPay
- A gateway (Cherri Tech). Docs list supported acquiring banks (Cathay, E.SUN, Taishin, CTBC, SinoPac, KGI, TCB, First, Taipei Fubon, Union, Chang Hwa...). You need a bank merchant account; TapPay onboarding is "2~4 weeks".
- Pricing (English page vs zh page differ on the gateway usage fee: NT$2/txn vs 0.3%); both show NT$5,000 setup and NT$11,000/yr. A zh heading says "免系統建置費" which contradicts the NT$5,000 line (zh pricing page text). Get a written quote.
- Webhook has no signature in the docs: you must re-query via the Record API before trusting a notification.

### NewebPay (brief)
- Fee page (Last-Modified 2026-10-28) and register page (Last-Modified 2026-10-28) are official. Personal members can register free and go live quickly with a monthly cap; foreign card rate 3.5% appears on the general fee table.
- Unknowns: age rule, personal-member API (MPG) access, approval wait for sandbox.

### Stripe
- `stripe.com/global` lists Australia ... United States and does not contain Taiwan (checked in the raw HTML text; fetched 2026-10-29; page has no as-of date).
- Atlas: "Incorporate for $500", "$100 annually after your first year", "Apply online from almost anywhere in the world" (stripe.com/atlas). Whether a Taiwan resident can use it, and the tax consequences for Taiwan, were not verified. Note only; not recommended for a student founder.
- Stripe Services Agreement 1.2(b): 13+ may open an account; under-18 needs an adult representative.

### Paddle
- Pricing page: "5% + 50¢ per Checkout transaction", "No monthly fees, migration fees, or hidden extras", Merchant of Record.
- MSA "Last updated: 6 October 2026": reseller model, refunds within 14 days at Paddle's discretion (10.2), chargeback fees (10.4), FX margin (7.1), payout threshold $100 and date (7.2), self-billed invoices, "Supplier remains responsible for ... local invoicing, e-invoicing" (7.3).
- Taiwan is in the buyer-country table as `TW | Taiwan | TWD | Inclusive`; the unsupported-country list (sanctions) does not include Taiwan.
- Payout currencies: balance can be USD, EUR, GBP, AUD, CAD. Payouts to a Taiwan bank would arrive via SWIFT wire (the $15 fee applies when the payout currency differs from the bank's country currency) or Payoneer; PayPal is mentioned in the MSA but not on the payout help page.

### Lemon Squeezy
- Official pages (all fetched 2026-10-29): fees, supported countries, getting paid, test mode, prohibited products, webhook signing.
- 2026-01-28 CEO blog: "slower support responses and less frequent product updates", Stripe Managed Payments supports merchants in "35+ countries", users outside Stripe countries are pointed to Atlas; "Very soon we will announce public access ... Our goal is to provide Lemon Squeezy users an easy way to migrate". 2025-04-29 blog: existing Lemon Squeezy users need no action. No official statement that new Lemon Squeezy signups are closed; the signup page responds.
- LS terms: sub-processor entity "Sold through Link, LLC f/k/a Lemon Squeezy LLC"; age rule not found in the pages I read.

---

## 4. Money check (my arithmetic, not vendor-published)

Using each vendor's list price; ignores withdrawal fees and acquirer-specific negotiation.

| Sale | ECPay (個人) | Paddle | Lemon Squeezy |
|---|---|---|---|
| NT$990 by card | 2.75% = NT$27.2, x1.05 tax = 28.6 + NT$1 = about NT$29.6 (3.0%) | not computed in NT$ (needs an FX rate, not sourced) | USD only |
| NT$1,490 by card | about NT$44 (3.0%) | - | - |
| ATM virtual account NT$990 / 1,490 | min NT$15 x1.05 = NT$15.75 (1.6% / 1.1%) | n/a | n/a |
| CVS code NT$990 / 1,490 | NT$31 x1.05 = NT$32.6 (3.3% / 2.2%) | n/a | n/a |
| US$39 card sale | cannot be sold (individual) | 5% + $0.50 = $2.45 (6.3%); add 3% FX if the sale was in TWD | 5% + 1.5% intl + $0.50 = $3.04 (7.8%), plus about 1% payout fee (about 8.8%) |

TapPay card at NT$1,490: about NT$45 (3.0%) per sale, but the NT$5,000 setup plus NT$11,000/yr membership is a fixed cost of NT$16,000 in year one. That alone equals the per-sale fee on roughly 360 passes at NT$1,490 (16,000 / 45), so it only pays off at volume.

---

## 5. Taiwan rules for an individual selling a digital service online

1. **Your remembered thresholds are out of date.** Since **2025-01-01** the 起徵點 is **NT$100,000/month for goods and NT$50,000/month for services** (it was NT$80,000 and NT$40,000 through 2024-12-31).
   - MOF press release "自114年1月1日起調高小規模營業人營業稅起徵點", 2024-12-12 (page footer updated 2026-10-28): https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=4e040848cb7044ce8d2c8540bd628f5f . Legal order cited by the tax portal: 台財稅字第11304677940號 (2024-12-12).
   - MOF tax portal page updated 114-10-30 (2025-10-30): body text still shows the old 80k/40k, footnote gives the new 100k/50k: https://www.etax.nat.gov.tw/etwmain/tax-info/network-transaction-taxtation-area/press/3EYDDZV . Q&A page (updated 114-02-05): Q6 says below the threshold an individual online seller may "暫免" 稅籍登記; once a month's sales exceed it, register immediately: https://www.etax.nat.gov.tw/etwmain/tax-info/network-transaction-taxtation-area/q-and-a .
   - **Goods vs services for a software pass: not stated on any page I read (the MOF press release only names 裝潢業 as a service example). Treat it as 勞務 (NT$50,000) to be safe.** That is about 51 passes/month at NT$990 or 34 at NT$1,490, which a Q4 application season could exceed. Confirm with the local 國稅局 (tax bureau) before launch.
2. Below the threshold you owe no business tax and need no 稅籍登記, but the profit still goes into your annual personal income tax return (etax Q&A, Q15).
3. **商業登記:** 商業登記法 第5條 款五: small-scale commerce with "每月銷售額未達營業稅起徵點" may be exempt from 商業登記 (law.moj.gov.tw 商業登記法 Art. 5, data cutoff 民國115年10月16日).
4. **ECPay's own notice** (fee page, footnote): since 2023-01-01, "個人以營利為目的，於網路平台、行動用裝程式或其他電子方式銷售達一定金額時，應辦理稅籍登記及商業登記", citing 台財稅字第10904512340號令. I could not open that order itself.
5. **Invoices.** 營業稅法 第32條: a 營業人 must issue a 統一發票 for each sale, but "小規模營業人，得掣發普通收據，免用統一發票" (law.moj.gov.tw, cutoff 2026-10-16). 統一發票使用辦法 第4條 款1 lists 小規模營業人 as exempt, and 第7條 defines 電子發票 as one form of 統一發票 (it says nothing that makes e-invoices mandatory). MOF press release 2026-03-19: small businesses with monthly sales under NT$200,000 "仍得免用統一發票，按稅率1%查定課徵營業稅" (https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=3ee59a0b82a94e35a7cfc684d8e12d0d). An older MOF page (2020-09-28, old thresholds) says online sellers who reach the NT$200,000 invoice standard without registering face penalties.
   - So: **an unregistered individual under the threshold has no invoice to issue (my inference; not stated in one sentence anywhere)**; a registered 小規模營業人 under NT$200,000/month may use 普通收據; above that a 統一發票 (paper or electronic) is needed. **Whether e-invoices are mandatory per sale: not found / uncertain.**
6. With a merchant of record (Paddle, LS) the buyer's invoice comes from the MoR; you are the supplier to the MoR. Paddle's MSA says the supplier remains responsible for local invoicing/e-invoicing duties and offers self-billed invoices. How Taiwan treats those payouts (export of services? threshold counting?) was **not researched**; ask a Taiwanese accountant.

---

## 6. Open questions (not confirmed)

- Minimum age for Paddle and Lemon Squeezy accounts (not in the pages read; both use government-ID checks, so a parent-held account is the safe route).
- Whether Paddle in practice onboards Taiwan-resident individuals: no document excludes Taiwan, but no page says "Taiwan sellers supported" either.
- Individual approval time at ECPay; whether NewebPay personal members can call the MPG API; whether TapPay serves individuals.
- NewebPay MPG manual (403): test card and signature details come from third-party tutorials.
- Software pass = goods or service for the 起徵點; e-invoice mandatory or not.
- Lemon Squeezy: whether new merchants are being gated (third-party articles disagree; no official notice found).
- ECPay 交易管理規章 (what products are barred) was not read; read it before applying.

---

## 7. Sources (all fetched 2026-10-29 unless noted)

ECPay
- Fee table: https://www.ecpay.com.tw/Business/payment_fees (no date on page; includes post-2025-04-01 fees)
- Service types: https://support.ecpay.com.tw/26291/ ; activation: https://support.ecpay.com.tw/25120/ ; prepare data: https://support.ecpay.com.tw/4862/ ; verification: https://support.ecpay.com.tw/5095/
- Registration page (18+): https://member.ecpay.com.tw/MemberReg/MemberRegister ; member terms (effective 民國115年04月30日): https://support.ecpay.com.tw/10075/
- Announcements: https://www.ecpay.com.tw/announcement/DetailAnnouncement?nID=5603 (2025-01-22), https://www.ecpay.com.tw/announcement/DetailAnnouncement?nID=5637 (2025-02-27)
- Developer docs: https://developers.ecpay.com.tw/2866/ (card), https://developers.ecpay.com.tw/2878/ (payment result notice), https://developers.ecpay.com.tw/2902/ (CheckMacValue), https://developers.ecpay.com.tw/45895/ (test merchants and test card); none carries a date

TapPay
- Docs: https://docs.tappaysdk.com/tutorial/zh/home.html (Last-Modified 2026-10-01), /back.html, /reference.html (test cards, sandbox)
- Pricing: https://www.tappaysdk.com/taiwan-zhtw/help/pricing and https://www.tappaysdk.com/taiwan-en/help/pricing (© 2023 footer; the two language versions differ)
- Onboarding: https://www.tappaysdk.com/taiwan-en/help/onboarding (page text read via WebFetch)

NewebPay
- https://www.newebpay.com/website/Page/content/service_fare (Last-Modified 2026-10-28), https://www.newebpay.com/website/Page/content/register (Last-Modified 2026-10-28)
- Third-party only: https://hackmd.io/@hexschool/SkObrGZcWe , https://blog.hungwin.com.tw/core-mvc-newebpay/

Stripe
- https://stripe.com/global (no as-of date; © 2026), https://stripe.com/pricing , https://stripe.com/atlas , https://stripe.com/legal/ssa , https://docs.stripe.com/testing , https://docs.stripe.com/webhooks , https://docs.stripe.com/sandboxes , https://docs.stripe.com/tax/supported-countries (Taiwan: digital products VAT, 10/1/2025; this is Stripe Tax, not account availability)

Paddle
- https://www.paddle.com/pricing ; MSA https://www.paddle.com/legal/terms ("Last updated: 6 October 2026")
- Help: https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle , /account-verification/what-is-account-verification , /what-is-business-verification , /what-is-identity-verification , /what-is-domain-verification , https://www.paddle.com/help/manage/get-paid/when-and-how-do-i-get-paid , /is-there-a-fee-taken-for-payouts , https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle
- Docs: https://developer.paddle.com/concepts/sell/supported-countries-locales.md , /supported-currencies.md , /payment-methods.md , https://developer.paddle.com/webhooks/signature-verification , https://developer.paddle.com/build/tools/sandbox , /build/transactions/default-payment-link.md

Lemon Squeezy
- https://www.lemonsqueezy.com/blog/2026-update (2026-01-28), https://www.lemonsqueezy.com/blog/stripe-lemon-squeezy-update-2025 (2025-04-29)
- Docs: https://docs.lemonsqueezy.com/help/getting-started/fees , /supported-countries , /getting-paid , /test-mode , /activate-your-store , /verify-your-identity , /prohibited-products , https://docs.lemonsqueezy.com/help/payments/currencies , /merchant-of-record , /sales-tax-vat , https://docs.lemonsqueezy.com/help/checkout/payment-methods , https://docs.lemonsqueezy.com/help/webhooks/signing-requests
- Signup page reachable: https://app.lemonsqueezy.com/register -> https://auth.lemonsqueezy.com/signup/business-intent (HTTP 200)
- Third-party (conflicting, unofficial) on LS gating: dodopayments.com, fungies.io, designrevision.com, passivekit.com 2026 articles

Taiwan tax
- https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=4e040848cb7044ce8d2c8540bd628f5f (thresholds, 2024-12-12)
- https://www.etax.nat.gov.tw/etwmain/tax-info/network-transaction-taxtation-area/press/3EYDDZV (updated 2025-10-30) and /q-and-a (updated 2025-02-05)
- https://www.mof.gov.tw/singlehtml/384fb3077bb349ea973e7fc6f13b6974?cntId=3ee59a0b82a94e35a7cfc684d8e12d0d (2026-03-19, NT$200,000 invoice exemption) and ?cntId=28ce994c38ac454d89be3157e2eaa1aa (2020-09-28, old thresholds)
- Laws (全國法規資料庫, data cutoff 民國115年10月16日): 營業稅法 Art. 32 https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=G0340080&flno=32 ; 統一發票使用辦法 Art. 4 and 7 https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=G0340082&flno=4 ; 商業登記法 Art. 5 https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=J0080004&flno=5
