import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMacValue, ECPAY_PRODUCTION_URL, ECPAY_STAGE, ecpayDate, verifyCheckMac } from "../../supabase/functions/_shared/ecpay.ts";
import {
  buildCheckout,
  checkCheckout,
  DEFAULT_ORIGINS,
  handleNotice,
} from "../../supabase/functions/_shared/payments-core.ts";
import type { ModeConfig, OrderRow, PaymentsStore } from "../../supabase/functions/_shared/payments-core.ts";
import type { EcpayKeys } from "../../supabase/functions/_shared/ecpay.ts";

const STAGE_KEYS: EcpayKeys = { merchantId: ECPAY_STAGE.merchantId, hashKey: ECPAY_STAGE.hashKey, hashIv: ECPAY_STAGE.hashIv };
const STAGE: ModeConfig = { mode: "stage", keys: STAGE_KEYS, checkoutUrl: ECPAY_STAGE.checkoutUrl };

// Not real keys: just different from the public stage ones.
const PRODUCTION_KEYS = { merchantId: "2000132", hashKey: "prodHashKey12345", hashIv: "prodHashIv123456" };
const PRODUCTION: ModeConfig = { mode: "production", keys: PRODUCTION_KEYS, checkoutUrl: ECPAY_PRODUCTION_URL };

const TRADE_NO = "TK261029210000abc123";

function order(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "order-1",
    user_id: "user-1",
    merchant_trade_no: TRADE_NO,
    mode: "stage",
    entry_year: 2027,
    amount_twd: 990,
    status: "awaiting_payment",
    pay_link_id: null,
    ...over,
  };
}

type Calls = {
  lookups: string[];
  applyPaid: Parameters<PaymentsStore["applyPaid"]>[0][];
  setPaymentInfo: Parameters<PaymentsStore["setPaymentInfo"]>[0][];
  markSimulated: string[];
};

// In-memory PaymentsStore that records every call. `applyResults` are returned in turn ("applied" once they run out);
// `caseBlind` makes the lookup ignore case, like a citext column would.
function fakeStore(orders: OrderRow[], opts: { applyResults?: Array<"applied" | "already_paid" | "not_found">; caseBlind?: boolean } = {}) {
  const calls: Calls = { lookups: [], applyPaid: [], setPaymentInfo: [], markSimulated: [] };
  const results = [...(opts.applyResults ?? [])];
  const store: PaymentsStore = {
    async orderByTradeNo(no) {
      calls.lookups.push(no);
      const same = (a: string, b: string) => (opts.caseBlind ? a.toLowerCase() === b.toLowerCase() : a === b);
      return orders.find((o) => same(o.merchant_trade_no, no)) ?? null;
    },
    async applyPaid(a) {
      calls.applyPaid.push(a);
      return results.shift() ?? "applied";
    },
    async setPaymentInfo(a) {
      calls.setPaymentInfo.push(a);
    },
    async markSimulated(no) {
      calls.markSimulated.push(no);
    },
  };
  return { store, calls };
}

function writes(c: Calls): number {
  return c.applyPaid.length + c.setPaymentInfo.length + c.markSimulated.length;
}

function logger() {
  const lines: string[] = [];
  return { lines, log: (msg: string) => void lines.push(msg) };
}

// A signed ECPay notice. `over` is applied before signing; use `signed(form, keys)` to sign a hand-built form.
async function signed(form: Record<string, string>, keys: { hashKey: string; hashIv: string } = STAGE_KEYS): Promise<Record<string, string>> {
  return { ...form, CheckMacValue: await checkMacValue(form, keys) };
}

function paidForm(over: Record<string, string> = {}, merchantId = STAGE_KEYS.merchantId): Record<string, string> {
  return {
    MerchantID: merchantId,
    MerchantTradeNo: TRADE_NO,
    StoreID: "",
    RtnCode: "1",
    RtnMsg: "交易成功",
    TradeNo: "2610292100001234",
    TradeAmt: "990",
    PaymentDate: "2026/10/29 21:05:00",
    PaymentType: "Credit_CreditCard",
    PaymentTypeChargeFee: "0",
    TradeDate: "2026/10/29 21:00:00",
    SimulatePaid: "0",
    CustomField1: "",
    ...over,
  };
}

const OK = { status: 200, body: "1|OK" };

// ---------------------------------------------------------------- handleNotice: rejections

test("a notice with a bad signature is refused before the store is touched", async () => {
  const { store, calls } = fakeStore([order()]);
  const { lines, log } = logger();
  const form = await signed(paidForm());
  form.TradeAmt = "1"; // changed after signing
  const res = await handleNotice(form, { store, config: STAGE, log });
  assert.deepEqual(res, { status: 400, body: "0|CheckMacValue" });
  assert.deepEqual(calls, { lookups: [], applyPaid: [], setPaymentInfo: [], markSimulated: [] });
  assert.equal(lines.length, 1);
});

test("a notice with no signature, or signed with other keys, is refused", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const unsigned = await handleNotice(paidForm(), { store, config: STAGE, log });
  assert.deepEqual(unsigned, { status: 400, body: "0|CheckMacValue" });
  const foreign = await handleNotice(await signed(paidForm(), PRODUCTION_KEYS), { store, config: STAGE, log });
  assert.deepEqual(foreign, { status: 400, body: "0|CheckMacValue" });
  assert.equal(calls.lookups.length + writes(calls), 0);
});

test("a correctly signed notice for another merchant id is refused", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const res = await handleNotice(await signed(paidForm({ MerchantID: "9999999" })), { store, config: STAGE, log });
  assert.deepEqual(res, { status: 400, body: "0|MerchantID" });
  assert.equal(calls.lookups.length + writes(calls), 0);
});

test("a signed notice without MerchantID or RtnCode is refused", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const noMerchant = paidForm();
  delete (noMerchant as Record<string, string | undefined>).MerchantID;
  assert.deepEqual(await handleNotice(await signed(noMerchant), { store, config: STAGE, log }), { status: 400, body: "0|MerchantID" });
  const noRtn = paidForm();
  delete (noRtn as Record<string, string | undefined>).RtnCode;
  assert.deepEqual(await handleNotice(await signed(noRtn), { store, config: STAGE, log }), { status: 400, body: "0|RtnCode" });
  assert.equal(calls.lookups.length + writes(calls), 0);
});

test("an unknown order is refused and logged", async () => {
  const { store, calls } = fakeStore([order()]);
  const { lines, log } = logger();
  const res = await handleNotice(await signed(paidForm({ MerchantTradeNo: "TK000000000000zzzzzz" })), { store, config: STAGE, log });
  assert.deepEqual(res, { status: 400, body: "0|Order" });
  assert.equal(writes(calls), 0);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /TK000000000000zzzzzz/);
});

test("a notice without a MerchantTradeNo is refused without a lookup", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const form = paidForm();
  delete (form as Record<string, string | undefined>).MerchantTradeNo;
  const res = await handleNotice(await signed(form), { store, config: STAGE, log });
  assert.deepEqual(res, { status: 400, body: "0|Order" });
  assert.equal(calls.lookups.length, 0);
});

test("the order is matched on the exact MerchantTradeNo even when the store ignores case", async () => {
  // ECPay lowercases values before hashing, so a signed notice survives a case change; the exact-match check must not.
  const { store, calls } = fakeStore([order()], { caseBlind: true });
  const { log } = logger();
  const res = await handleNotice(await signed(paidForm({ MerchantTradeNo: TRADE_NO.toUpperCase() })), { store, config: STAGE, log });
  assert.deepEqual(res, { status: 400, body: "0|Order" });
  assert.equal(writes(calls), 0);
});

test("an order made in production is refused under the stage config", async () => {
  // The stage keys are public, so anyone can sign a stage notice; it must never reach a production order.
  const { store, calls } = fakeStore([order({ mode: "production" })]);
  const { log } = logger();
  const res = await handleNotice(await signed(paidForm()), { store, config: STAGE, log });
  assert.deepEqual(res, { status: 400, body: "0|Mode" });
  assert.equal(writes(calls), 0);
});

test("an order made on stage is refused under the production config", async () => {
  const { store, calls } = fakeStore([order({ mode: "stage" })]);
  const { log } = logger();
  const form = await signed(paidForm({}, PRODUCTION_KEYS.merchantId), PRODUCTION_KEYS);
  const res = await handleNotice(form, { store, config: PRODUCTION, log });
  assert.deepEqual(res, { status: 400, body: "0|Mode" });
  assert.equal(writes(calls), 0);
});

test("a TradeAmt that differs from the order amount is refused", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const res = await handleNotice(await signed(paidForm({ TradeAmt: "100" })), { store, config: STAGE, log });
  assert.deepEqual(res, { status: 400, body: "0|Amount" });
  assert.equal(writes(calls), 0);
});

test("a TradeAmt that is not a plain whole number is refused", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  for (const TradeAmt of ["", "990.0", " 990", "0x3DE", "9.9e2", "-990"]) {
    const res = await handleNotice(await signed(paidForm({ TradeAmt })), { store, config: STAGE, log });
    assert.deepEqual(res, { status: 400, body: "0|Amount" }, JSON.stringify(TradeAmt));
  }
  assert.equal(writes(calls), 0);
});

// ---------------------------------------------------------------- handleNotice: paid

test("a paid notice upgrades once, with the pass starting on the Taipei payment day", async () => {
  const { store, calls } = fakeStore([order({ entry_year: 2027 })]);
  const { log } = logger();
  const res = await handleNotice(await signed(paidForm()), { store, config: STAGE, log });
  assert.deepEqual(res, OK);
  assert.deepEqual(calls.applyPaid, [
    {
      merchantTradeNo: TRADE_NO,
      ecpayTradeNo: "2610292100001234",
      paymentType: "Credit_CreditCard",
      paidAt: "2026-10-29T21:05:00+08:00",
      passFrom: "2026-10-29",
    },
  ]);
  assert.equal(calls.setPaymentInfo.length + calls.markSimulated.length, 0);
});

test("a pass for entry 2028 bought in 2026 starts on January 1 2027", async () => {
  const { store, calls } = fakeStore([order({ entry_year: 2028 })]);
  const { log } = logger();
  const res = await handleNotice(await signed(paidForm()), { store, config: STAGE, log });
  assert.deepEqual(res, OK);
  assert.equal(calls.applyPaid.length, 1);
  assert.equal(calls.applyPaid[0].passFrom, "2027-01-01");
  assert.equal(calls.applyPaid[0].paidAt, "2026-10-29T21:05:00+08:00");
});

test("the Taipei day, not the UTC day, decides when the pass starts", async () => {
  // 2026/10/30 00:30 in Taipei is still Oct 29 in UTC.
  const { store, calls } = fakeStore([order({ entry_year: 2027 })]);
  const { log } = logger();
  await handleNotice(await signed(paidForm({ PaymentDate: "2026/10/30 00:30:00" })), { store, config: STAGE, log });
  assert.equal(calls.applyPaid[0].passFrom, "2026-10-30");
  assert.equal(calls.applyPaid[0].paidAt, "2026-10-30T00:30:00+08:00");
});

test("the same paid notice twice answers 1|OK both times", async () => {
  const { store, calls } = fakeStore([order()], { applyResults: ["applied", "already_paid"] });
  const { log } = logger();
  const form = await signed(paidForm());
  const first = await handleNotice(form, { store, config: STAGE, log });
  const second = await handleNotice(form, { store, config: STAGE, log });
  assert.deepEqual(first, OK);
  assert.deepEqual(second, OK);
  assert.equal(calls.applyPaid.length, 2);
});

test("a second paid order for an entry year that is already active still goes to applyPaid", async () => {
  // Whether a duplicate is refunded or just listed for review is decided in SQL (apply_paid_order), not here.
  const second = "TK261029213000def456";
  const { store, calls } = fakeStore([order({ entry_year: 2027 }), order({ id: "order-2", merchant_trade_no: second, entry_year: 2027 })]);
  const { log } = logger();
  assert.deepEqual(await handleNotice(await signed(paidForm()), { store, config: STAGE, log }), OK);
  assert.deepEqual(await handleNotice(await signed(paidForm({ MerchantTradeNo: second, PaymentDate: "2026/10/29 21:30:00" })), { store, config: STAGE, log }), OK);
  assert.deepEqual(calls.applyPaid.map((a) => a.merchantTradeNo), [TRADE_NO, second]);
});

test("a paid notice with a malformed or impossible PaymentDate is refused", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const bad = ["", "2026-10-29 21:05:00", "2026/10/29", "2026/13/29 21:05:00", "2026/02/30 10:00:00", "2026/10/29 24:00:00", "2026/10/29 21:60:00", "2026/10/29 21:05:00 "];
  for (const PaymentDate of bad) {
    const res = await handleNotice(await signed(paidForm({ PaymentDate })), { store, config: STAGE, log });
    assert.deepEqual(res, { status: 400, body: "0|PaymentDate" }, JSON.stringify(PaymentDate));
  }
  const missing = paidForm();
  delete (missing as Record<string, string | undefined>).PaymentDate;
  assert.deepEqual(await handleNotice(await signed(missing), { store, config: STAGE, log }), { status: 400, body: "0|PaymentDate" });
  assert.equal(calls.applyPaid.length, 0);
});

test("applyPaid saying not_found after the lookup found the order is refused so ECPay retries", async () => {
  const { store } = fakeStore([order()], { applyResults: ["not_found"] });
  const { lines, log } = logger();
  const res = await handleNotice(await signed(paidForm()), { store, config: STAGE, log });
  assert.deepEqual(res, { status: 400, body: "0|Order" });
  assert.equal(lines.length, 1);
});

test("a store failure is not swallowed", async () => {
  const { store } = fakeStore([order()]);
  store.applyPaid = async () => {
    throw new Error("database down");
  };
  const { log } = logger();
  await assert.rejects(handleNotice(await signed(paidForm()), { store, config: STAGE, log }), /database down/);
});

// ---------------------------------------------------------------- handleNotice: simulated payments

test("a simulated payment under the production config is recorded, never upgrades", async () => {
  const { store, calls } = fakeStore([order({ mode: "production" })]);
  const { lines, log } = logger();
  const form = await signed(paidForm({ SimulatePaid: "1" }, PRODUCTION_KEYS.merchantId), PRODUCTION_KEYS);
  const res = await handleNotice(form, { store, config: PRODUCTION, log });
  assert.deepEqual(res, OK);
  assert.deepEqual(calls.markSimulated, [TRADE_NO]);
  assert.equal(calls.applyPaid.length, 0);
  assert.equal(lines.length, 1);
});

test("a simulated payment under the stage config upgrades like a real one", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const res = await handleNotice(await signed(paidForm({ SimulatePaid: "1" })), { store, config: STAGE, log });
  assert.deepEqual(res, OK);
  assert.equal(calls.applyPaid.length, 1);
  assert.equal(calls.markSimulated.length, 0);
});

test("a real payment under the production config upgrades", async () => {
  const { store, calls } = fakeStore([order({ mode: "production" })]);
  const { log } = logger();
  const form = await signed(paidForm({ SimulatePaid: "0" }, PRODUCTION_KEYS.merchantId), PRODUCTION_KEYS);
  assert.deepEqual(await handleNotice(form, { store, config: PRODUCTION, log }), OK);
  assert.equal(calls.applyPaid.length, 1);
  assert.equal(calls.markSimulated.length, 0);
});

// ---------------------------------------------------------------- handleNotice: payment info and other codes

test("an ATM payment-info notice stores the account and an end-of-day Taipei expiry", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const form = await signed({
    MerchantID: STAGE_KEYS.merchantId,
    MerchantTradeNo: TRADE_NO,
    RtnCode: "2",
    RtnMsg: "Get VirtualAccount Succeeded",
    TradeNo: "2610292100001234",
    TradeAmt: "990",
    PaymentType: "ATM_TAISHIN",
    TradeDate: "2026/10/29 21:00:00",
    BankCode: "812",
    vAccount: "9103522175887271",
    ExpireDate: "2026/11/01",
  });
  const res = await handleNotice(form, { store, config: STAGE, log });
  assert.deepEqual(res, OK);
  assert.deepEqual(calls.setPaymentInfo, [
    {
      merchantTradeNo: TRADE_NO,
      paymentType: "ATM_TAISHIN",
      info: { BankCode: "812", vAccount: "9103522175887271" },
      expiresAt: "2026-11-01T23:59:59+08:00",
    },
  ]);
  assert.equal(calls.applyPaid.length + calls.markSimulated.length, 0);
});

test("a convenience-store payment-info notice stores the payment number and the Taipei expiry time", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const form = await signed({
    MerchantID: STAGE_KEYS.merchantId,
    MerchantTradeNo: TRADE_NO,
    RtnCode: "10100073",
    RtnMsg: "Get CVS Code Succeeded.",
    TradeNo: "2610292100001234",
    TradeAmt: "990",
    PaymentType: "CVS_CVS",
    TradeDate: "2026/10/29 21:00:00",
    PaymentNo: "LLL26102912345",
    ExpireDate: "2026/11/01 21:00:00",
  });
  const res = await handleNotice(form, { store, config: STAGE, log });
  assert.deepEqual(res, OK);
  assert.deepEqual(calls.setPaymentInfo, [
    { merchantTradeNo: TRADE_NO, paymentType: "CVS_CVS", info: { PaymentNo: "LLL26102912345" }, expiresAt: "2026-11-01T21:00:00+08:00" },
  ]);
  assert.equal(calls.applyPaid.length + calls.markSimulated.length, 0);
});

test("a payment-info notice with an unreadable expiry or no account is refused", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const atm = { MerchantID: STAGE_KEYS.merchantId, MerchantTradeNo: TRADE_NO, RtnCode: "2", TradeAmt: "990", PaymentType: "ATM_TAISHIN", BankCode: "812", vAccount: "9103522175887271", ExpireDate: "2026/11/01" };
  const cvs = { MerchantID: STAGE_KEYS.merchantId, MerchantTradeNo: TRADE_NO, RtnCode: "10100073", TradeAmt: "990", PaymentType: "CVS_CVS", PaymentNo: "LLL26102912345", ExpireDate: "2026/11/01 21:00:00" };
  const expect = async (form: Record<string, string>, body: string) =>
    assert.deepEqual(await handleNotice(await signed(form), { store, config: STAGE, log }), { status: 400, body });
  await expect({ ...atm, ExpireDate: "2026-11-01" }, "0|ExpireDate");
  await expect({ ...atm, ExpireDate: "2026/11/01 21:00:00" }, "0|ExpireDate"); // ATM sends a date only
  await expect({ ...atm, ExpireDate: "2026/02/30" }, "0|ExpireDate");
  await expect({ ...atm, vAccount: "" }, "0|PaymentInfo");
  await expect({ ...atm, BankCode: "" }, "0|PaymentInfo");
  await expect({ ...cvs, ExpireDate: "2026/11/01" }, "0|ExpireDate"); // CVS sends a date and time
  await expect({ ...cvs, PaymentNo: "" }, "0|PaymentInfo");
  assert.equal(calls.setPaymentInfo.length, 0);
});

test("a payment-info notice with the wrong amount is refused before anything is stored", async () => {
  const { store, calls } = fakeStore([order()]);
  const { log } = logger();
  const form = await signed({ MerchantID: STAGE_KEYS.merchantId, MerchantTradeNo: TRADE_NO, RtnCode: "2", TradeAmt: "10", PaymentType: "ATM_TAISHIN", BankCode: "812", vAccount: "9103522175887271", ExpireDate: "2026/11/01" });
  assert.deepEqual(await handleNotice(form, { store, config: STAGE, log }), { status: 400, body: "0|Amount" });
  assert.equal(calls.setPaymentInfo.length, 0);
});

test("any other RtnCode is logged with its message and answered 1|OK without touching the order", async () => {
  const { store, calls } = fakeStore([order()]);
  const { lines, log } = logger();
  const form = await signed(paidForm({ RtnCode: "10300066", RtnMsg: "Payment failed: card declined" }));
  const res = await handleNotice(form, { store, config: STAGE, log });
  assert.deepEqual(res, OK);
  assert.equal(writes(calls), 0);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /card declined/);
});

test("log lines stay short and never carry the keys or the signature", async () => {
  const { store } = fakeStore([order()]);
  const { lines, log } = logger();
  const long = "x".repeat(5000);
  const forms = [
    await signed(paidForm({ RtnCode: "0", RtnMsg: long })),
    await signed(paidForm({ MerchantTradeNo: long })),
    await signed(paidForm({ SimulatePaid: "1", TradeAmt: "5" })),
    { ...(await signed(paidForm())), TradeAmt: "5" },
  ];
  for (const form of forms) await handleNotice(form, { store, config: STAGE, log });
  assert.equal(lines.length, forms.length);
  for (const line of lines) {
    assert.ok(line.length < 300, `log line too long: ${line.length}`);
    assert.ok(!line.includes(STAGE_KEYS.hashKey) && !line.includes(STAGE_KEYS.hashIv), line);
    assert.ok(!/[0-9A-F]{64}/.test(line), line);
    assert.ok(!/[\r\n]/.test(line), line);
  }
});

// ---------------------------------------------------------------- checkCheckout

const TODAY = "2026-10-29"; // offered entry years: 2027, 2028, 2029
const ORIGIN = "https://www.track-ur-college.com";

test("DEFAULT_ORIGINS lists the live site and local development", () => {
  assert.deepEqual([...DEFAULT_ORIGINS], ["https://www.track-ur-college.com", "http://localhost:3000"]);
});

test("checkCheckout accepts an offered year from an allowed origin", () => {
  assert.deepEqual(checkCheckout({ entryYear: 2028, origin: ORIGIN, allowedOrigins: DEFAULT_ORIGINS, today: TODAY, paidYears: [] }), {
    ok: true,
    entryYear: 2028,
    origin: ORIGIN,
  });
  assert.deepEqual(checkCheckout({ entryYear: 2028, origin: "http://localhost:3000", allowedOrigins: DEFAULT_ORIGINS, today: TODAY, paidYears: [2027] }), {
    ok: true,
    entryYear: 2028,
    origin: "http://localhost:3000",
  });
});

test("checkCheckout refuses a year that is not on sale", () => {
  const base = { origin: ORIGIN, allowedOrigins: DEFAULT_ORIGINS, today: TODAY, paidYears: [] as number[] };
  assert.deepEqual(checkCheckout({ ...base, entryYear: 2030 }), { ok: false, error: "bad_year" });
  assert.deepEqual(checkCheckout({ ...base, entryYear: 2026 }), { ok: false, error: "bad_year" });
  // In July the running cycle's pass is no longer sold.
  assert.deepEqual(checkCheckout({ ...base, entryYear: 2027, today: "2027-07-15" }), { ok: false, error: "bad_year" });
  assert.deepEqual(checkCheckout({ ...base, entryYear: 2028, today: "2027-07-15" }), { ok: true, entryYear: 2028, origin: ORIGIN });
});

test("checkCheckout needs a whole number, not a string or anything else", () => {
  const base = { origin: ORIGIN, allowedOrigins: DEFAULT_ORIGINS, today: TODAY, paidYears: [] as number[] };
  for (const entryYear of ["2027", 2027.5, Number.NaN, null, undefined, [2027], { year: 2027 }, true]) {
    assert.deepEqual(checkCheckout({ ...base, entryYear }), { ok: false, error: "bad_year" }, String(entryYear));
  }
});

test("checkCheckout refuses an origin that is not on the list, compared exactly", () => {
  const base = { entryYear: 2027, allowedOrigins: DEFAULT_ORIGINS, today: TODAY, paidYears: [] as number[] };
  for (const origin of ["https://evil.example", "https://www.track-ur-college.com/", "http://www.track-ur-college.com", "https://www.track-ur-college.com.evil.example", "HTTPS://WWW.TRACK-UR-COLLEGE.COM", "", null, undefined, 3, ["https://www.track-ur-college.com"]]) {
    assert.deepEqual(checkCheckout({ ...base, origin }), { ok: false, error: "bad_origin" }, String(origin));
  }
});

test("checkCheckout refuses a year the student already bought", () => {
  const base = { origin: ORIGIN, allowedOrigins: DEFAULT_ORIGINS, today: TODAY };
  assert.deepEqual(checkCheckout({ ...base, entryYear: 2027, paidYears: [2027] }), { ok: false, error: "already_paid" });
  assert.deepEqual(checkCheckout({ ...base, entryYear: 2028, paidYears: [2027] }), { ok: true, entryYear: 2028, origin: ORIGIN });
});

test("checkCheckout reports a bad year before a bad origin before an already-paid year", () => {
  assert.deepEqual(checkCheckout({ entryYear: 2030, origin: "https://evil.example", allowedOrigins: DEFAULT_ORIGINS, today: TODAY, paidYears: [2030] }), { ok: false, error: "bad_year" });
  assert.deepEqual(checkCheckout({ entryYear: 2027, origin: "https://evil.example", allowedOrigins: DEFAULT_ORIGINS, today: TODAY, paidYears: [2027] }), { ok: false, error: "bad_origin" });
});

// ---------------------------------------------------------------- buildCheckout

const FUNCTION_URL = "https://eyvmtaggayqizllaseiu.supabase.co/functions/v1/ecpay";
const NOW = new Date("2026-10-29T13:00:00Z"); // 21:00 in Taipei

test("buildCheckout builds the signed stage form for the order", async () => {
  const { action, fields } = await buildCheckout({
    order: { merchant_trade_no: TRADE_NO, entry_year: 2027, amount_twd: 990 },
    config: STAGE,
    functionUrl: FUNCTION_URL,
    clientBackUrl: "https://www.track-ur-college.com/settings",
    now: NOW,
  });
  assert.equal(action, ECPAY_STAGE.checkoutUrl);
  assert.equal(fields.MerchantID, ECPAY_STAGE.merchantId);
  assert.equal(fields.MerchantTradeNo, TRADE_NO);
  assert.equal(fields.MerchantTradeDate, ecpayDate(NOW));
  assert.equal(fields.MerchantTradeDate, "2026/10/29 21:00:00");
  assert.equal(fields.TotalAmount, "990");
  assert.equal(fields.ItemName, "Trakur 2027 秋季入學方案");
  assert.equal(fields.TradeDesc, "Trakur admission-year pass");
  assert.equal(fields.ReturnURL, `${FUNCTION_URL}/notify`);
  assert.equal(fields.PaymentInfoURL, `${FUNCTION_URL}/notify`);
  assert.equal(fields.ClientBackURL, "https://www.track-ur-college.com/settings");
  assert.equal(fields.ChoosePayment, "ALL");
  assert.equal(fields.EncryptType, "1");
  assert.equal(fields.ExpireDate, "3");
  assert.equal(fields.StoreExpireDate, "4320");
  assert.match(fields.CheckMacValue, /^[0-9A-F]{64}$/);
  assert.equal(await verifyCheckMac(fields, STAGE_KEYS), true);
});

test("buildCheckout signs with the keys of the mode it is given", async () => {
  const { action, fields } = await buildCheckout({
    order: { merchant_trade_no: TRADE_NO, entry_year: 2028, amount_twd: 990 },
    config: PRODUCTION,
    functionUrl: FUNCTION_URL,
    clientBackUrl: "https://www.track-ur-college.com/settings",
    now: NOW,
  });
  assert.equal(action, ECPAY_PRODUCTION_URL);
  assert.equal(fields.MerchantID, PRODUCTION_KEYS.merchantId);
  assert.equal(fields.ItemName, "Trakur 2028 秋季入學方案");
  assert.equal(await verifyCheckMac(fields, PRODUCTION_KEYS), true);
  assert.equal(await verifyCheckMac(fields, STAGE_KEYS), false);
});

test("buildCheckout fields change the signature when tampered with", async () => {
  const { fields } = await buildCheckout({
    order: { merchant_trade_no: TRADE_NO, entry_year: 2027, amount_twd: 990 },
    config: STAGE,
    functionUrl: FUNCTION_URL,
    clientBackUrl: "https://www.track-ur-college.com/settings",
    now: NOW,
  });
  assert.equal(await verifyCheckMac({ ...fields, TotalAmount: "1" }, STAGE_KEYS), false);
});
