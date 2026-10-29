import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "./i18n/en.ts";
import { zhTW } from "./i18n/zh-TW.ts";
import {
  fmtPassDate,
  fmtTaipei,
  isEcpayCheckoutUrl,
  isUuid,
  keepPolling,
  openPayOrders,
  orderPhase,
  PAYMENT_ERROR_CODES,
  PaymentError,
  paymentErrorKey,
  parseCheckout,
  parseErrorCode,
  parseNewPayLink,
  parseOrder,
  parsePayLinkView,
  payInstructions,
  POLL_CAP_MS,
  POLL_FAST_FOR_MS,
  pollDelay,
  waitingPhase,
  type OrderPhase,
  type OrderView,
} from "./payments-view.ts";

const ID = "3f2b8c1e-5a47-4d6e-9b0a-1c2d3e4f5a6b";

const row = (over: Record<string, unknown> = {}) => ({
  id: ID,
  merchant_trade_no: "TK1029ABCDEF",
  entry_year: 2027,
  amount_twd: 990,
  pass_from: null,
  pass_until: "2027-07-31",
  payer: "student",
  status: "pending",
  payment_type: null,
  payment_info: null,
  created_at: "2026-10-29T08:00:00+00:00",
  paid_at: null,
  expires_at: null,
  ...over,
});

const order = (over: Record<string, unknown> = {}): OrderView => {
  const o = parseOrder(row(over));
  assert.ok(o);
  return o;
};

test("every payment error code has a message, in both languages", () => {
  for (const code of PAYMENT_ERROR_CODES) {
    const key = paymentErrorKey(new PaymentError(code));
    assert.ok(key in en, `${code} -> ${key} missing in en`);
    assert.ok(key in zhTW, `${code} -> ${key} missing in zh-TW`);
  }
});

test("the codes the brief names each get their own message; the rest share the generic one", () => {
  const own = ["closed", "already_paid", "bad_year", "bad_origin", "unauthorized", "not_student", "network", "server"] as const;
  const keys = own.map((c) => paymentErrorKey(new PaymentError(c)));
  assert.equal(new Set(keys).size, own.length);
  assert.equal(paymentErrorKey(new PaymentError("bad_request")), paymentErrorKey(new PaymentError("server")));
  assert.equal(paymentErrorKey(new PaymentError("not_found")), paymentErrorKey(new PaymentError("server")));
  assert.equal(paymentErrorKey(new Error("boom")), paymentErrorKey(new PaymentError("server")));
  assert.equal(paymentErrorKey("nope"), paymentErrorKey(new PaymentError("server")));
});

test("parseErrorCode reads { error } and falls back to server", () => {
  assert.equal(parseErrorCode({ error: "closed" }), "closed");
  assert.equal(parseErrorCode({ error: "already_paid" }), "already_paid");
  assert.equal(parseErrorCode({ error: "mystery" }), "server");
  assert.equal(parseErrorCode({}), "server");
  assert.equal(parseErrorCode(null), "server");
  assert.equal(parseErrorCode("closed"), "server");
});

test("fmtPassDate: zh-TW 2027/7/31, English Jul 31, 2027, junk unchanged", () => {
  assert.equal(fmtPassDate("2027-07-31", "zh-TW"), "2027/7/31");
  assert.equal(fmtPassDate("2027-01-01", "zh-TW"), "2027/1/1");
  assert.equal(fmtPassDate("2027-07-31", "en"), "Jul 31, 2027");
  assert.equal(fmtPassDate("2028-01-01", "en"), "Jan 1, 2028");
  assert.equal(fmtPassDate("soon", "en"), "soon");
  assert.equal(fmtPassDate("2027-13-01", "en"), "2027-13-01");
});

test("fmtTaipei shows the Taipei date and clock, not UTC", () => {
  // 15:59:59 UTC on Nov 1 is 23:59:59 in Taipei, the same day; 16:00 UTC is already Nov 2 in Taipei.
  assert.equal(fmtTaipei("2026-11-01T15:59:59.000Z", "zh-TW", true), "2026/11/1 23:59");
  assert.equal(fmtTaipei("2026-11-01T16:00:00.000Z", "zh-TW", true), "2026/11/2 00:00");
  assert.equal(fmtTaipei("2026-11-01T23:59:59+08:00", "en", false), "Nov 1, 2026");
  assert.equal(fmtTaipei("2026-11-05T09:30:00+08:00", "en", true), "Nov 5, 2026 09:30");
  assert.equal(fmtTaipei("not a date", "en", true), "not a date");
});

test("only ECPay's own https payment hosts may receive the checkout form", () => {
  assert.ok(isEcpayCheckoutUrl("https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5"));
  assert.ok(isEcpayCheckoutUrl("https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"));
  assert.ok(!isEcpayCheckoutUrl("http://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"));
  assert.ok(!isEcpayCheckoutUrl("https://payment.ecpay.com.tw.evil.example/x"));
  assert.ok(!isEcpayCheckoutUrl("https://evil.example/payment.ecpay.com.tw"));
  assert.ok(!isEcpayCheckoutUrl("https://payment.ecpay.com.tw@evil.example/x"));
  assert.ok(!isEcpayCheckoutUrl("https://user:pw@payment.ecpay.com.tw/x"));
  assert.ok(!isEcpayCheckoutUrl("/relative"));
  assert.ok(!isEcpayCheckoutUrl(""));
});

test("parseCheckout, parseNewPayLink and parsePayLinkView accept the function's replies and nothing else", () => {
  assert.deepEqual(parseCheckout({ orderId: ID, action: "https://payment.ecpay.com.tw/x", fields: { A: "1", B: "2" } }), {
    orderId: ID,
    action: "https://payment.ecpay.com.tw/x",
    fields: { A: "1", B: "2" },
  });
  assert.equal(parseCheckout({ orderId: ID, action: "x", fields: { A: 1 } }), null);
  assert.equal(parseCheckout({ orderId: ID, action: "x", fields: ["a"] }), null);
  assert.equal(parseCheckout({ action: "x", fields: {} }), null);
  assert.equal(parseCheckout(null), null);

  assert.deepEqual(parseNewPayLink({ url: "https://a/b", expiresAt: "2026-11-05T00:00:00.000Z" }), { url: "https://a/b", expiresAt: "2026-11-05T00:00:00.000Z" });
  assert.equal(parseNewPayLink({ url: "https://a/b" }), null);

  const view = { studentName: "  Amy ", entryYear: 2027, from: "2026-10-29", until: "2027-07-31", amountTwd: 990, paid: false, expired: false, open: true };
  assert.deepEqual(parsePayLinkView(view), { ...view, studentName: "Amy" });
  assert.equal(parsePayLinkView({ ...view, studentName: null })?.studentName, null);
  assert.equal(parsePayLinkView({ ...view, studentName: "   " })?.studentName, null);
  assert.equal(parsePayLinkView({ ...view, paid: "no" }), null);
  assert.equal(parsePayLinkView({ ...view, until: undefined }), null);
});

test("parseOrder reads a plan_orders row and refuses a broken one", () => {
  const o = order({ status: "paid", pass_from: "2026-10-29", paid_at: "2026-10-29T08:01:00+00:00", payment_type: "Credit_CreditCard" });
  assert.equal(o.id, ID);
  assert.equal(o.status, "paid");
  assert.equal(o.passFrom, "2026-10-29");
  assert.equal(o.passUntil, "2027-07-31");
  assert.equal(o.amountTwd, 990);
  assert.equal(o.paymentType, "Credit_CreditCard");
  assert.equal(o.payer, "student");
  assert.equal(o.paymentInfo, null);

  assert.equal(parseOrder(row({ id: "nope" })), null);
  assert.equal(parseOrder(row({ status: "weird" })), null);
  assert.equal(parseOrder(row({ payer: "robot" })), null);
  assert.equal(parseOrder(row({ amount_twd: "990" })), null);
  assert.equal(parseOrder(row({ pass_until: null })), null);
  assert.equal(parseOrder(null), null);
  assert.equal(parseOrder(row({ payment_info: ["x"] }))?.paymentInfo, null);
});

test("isUuid", () => {
  assert.ok(isUuid(ID));
  assert.ok(isUuid(ID.toUpperCase()));
  assert.ok(!isUuid("12345"));
  assert.ok(!isUuid(`${ID}x`));
  assert.ok(!isUuid(null));
});

test("payInstructions: ATM account, store code, or nothing", () => {
  assert.deepEqual(payInstructions(order({ payment_info: { BankCode: "812", vAccount: "9103522175887271" } })), {
    kind: "atm",
    bankCode: "812",
    account: "9103522175887271",
  });
  assert.deepEqual(payInstructions(order({ payment_info: { PaymentNo: "LLL22112515887" } })), { kind: "cvs", paymentNo: "LLL22112515887" });
  assert.equal(payInstructions(order({ payment_info: null })), null);
  assert.equal(payInstructions(order({ payment_info: { BankCode: "812" } })), null);
  assert.equal(payInstructions(order({ payment_info: { PaymentNo: "  " } })), null);
});

test("orderPhase: confirming for a minute, then slow; an old pending order is slow at once", () => {
  const created = Date.parse("2026-10-29T08:00:00+00:00");
  const fresh = order({ status: "pending" });
  assert.equal(orderPhase(fresh, 0, created + 1000), "confirming");
  assert.equal(orderPhase(fresh, 59_999, created + 1000), "confirming");
  assert.equal(orderPhase(fresh, POLL_FAST_FOR_MS, created + 1000), "slow");
  // The page was just opened (waited 0), but the order is an hour old.
  assert.equal(orderPhase(fresh, 0, created + 60 * 60 * 1000), "slow");
});

test("orderPhase: paid, refunded, expired, and awaiting with the codes shown until the deadline", () => {
  const now = Date.parse("2026-10-29T09:00:00+00:00");
  assert.equal(orderPhase(order({ status: "paid", pass_from: "2026-10-29" }), 0, now), "paid");
  assert.equal(orderPhase(order({ status: "refunded" }), 0, now), "refunded");
  assert.equal(orderPhase(order({ status: "expired" }), 0, now), "expired");

  const atm = { status: "awaiting_payment", payment_info: { BankCode: "812", vAccount: "123" }, expires_at: "2026-11-01T23:59:59+08:00" };
  assert.equal(orderPhase(order(atm), 0, now), "awaiting");
  assert.equal(orderPhase(order(atm), 999_999, now), "awaiting"); // waiting time doesn't matter once the codes exist
  assert.equal(orderPhase(order(atm), 0, Date.parse("2026-11-02T00:00:00+08:00")), "expired");

  // awaiting_payment without readable codes behaves like a pending order
  assert.equal(orderPhase(order({ status: "awaiting_payment", payment_info: null, created_at: "2026-10-29T08:59:30+00:00" }), 0, now), "confirming");
});

test("pollDelay", () => {
  assert.equal(pollDelay(0), 2000);
  assert.equal(pollDelay(59_999), 2000);
  assert.equal(pollDelay(60_000), 10_000);
});

test("orderPhase: a pending order becomes unheard after 10 minutes of the page's own waiting", () => {
  assert.equal(POLL_CAP_MS, 10 * 60_000);
  const created = Date.parse("2026-10-29T08:00:00+00:00");
  const fresh = order({ status: "pending" });
  assert.equal(orderPhase(fresh, POLL_CAP_MS - 1, created + POLL_CAP_MS), "slow");
  assert.equal(orderPhase(fresh, POLL_CAP_MS, created + POLL_CAP_MS), "unheard");
  // A buyer who spent 30 minutes on ECPay's page still gets the full wait: the order's age alone never caps.
  assert.equal(orderPhase(fresh, 0, created + 30 * 60_000), "slow");
  // An awaiting_payment order without readable codes is capped like a pending one.
  assert.equal(orderPhase(order({ status: "awaiting_payment", payment_info: null }), POLL_CAP_MS, created + POLL_CAP_MS), "unheard");
  // ATM codes are not capped: paying at an ATM can take days.
  const atm = order({ status: "awaiting_payment", payment_info: { BankCode: "812", vAccount: "123" }, expires_at: "2026-11-01T23:59:59+08:00" });
  assert.equal(orderPhase(atm, POLL_CAP_MS * 6, created + POLL_CAP_MS * 6), "awaiting");
});

test("waitingPhase: an order not read yet (age unknown) goes confirming, slow, unheard", () => {
  assert.equal(waitingPhase(0, NaN), "confirming");
  assert.equal(waitingPhase(POLL_FAST_FOR_MS, NaN), "slow");
  assert.equal(waitingPhase(POLL_CAP_MS, NaN), "unheard");
  assert.equal(waitingPhase(0, 2 * POLL_FAST_FOR_MS), "slow");
});

test("keepPolling: stops on paid, refunded, expired (a passed ATM / store deadline included) and after the cap", () => {
  const all: Record<OrderPhase, boolean> = { confirming: true, slow: true, awaiting: true, unheard: false, paid: false, refunded: false, expired: false };
  for (const [phase, keep] of Object.entries(all)) assert.equal(keepPolling(phase as OrderPhase), keep, phase);
  // An awaiting_payment order whose deadline passed: its status never changes, but its phase does, so polling stops.
  const past = order({ status: "awaiting_payment", payment_info: { PaymentNo: "LLL22112515887" }, expires_at: "2026-11-01T12:00:00+08:00" });
  assert.equal(keepPolling(orderPhase(past, 0, Date.parse("2026-11-01T12:00:01+08:00"))), false);
  assert.equal(keepPolling(orderPhase(past, 0, Date.parse("2026-11-01T11:59:59+08:00"))), true);
});

test("openPayOrders: ATM / store orders with codes, before the deadline, for a year not owned", () => {
  const now = Date.parse("2026-10-30T09:00:00+08:00");
  const atm = order({ id: "11111111-1111-4111-8111-111111111111", status: "awaiting_payment", payment_info: { BankCode: "812", vAccount: "9103522175887271" }, expires_at: "2026-11-01T23:59:59+08:00" });
  const cvs = order({ id: "22222222-2222-4222-8222-222222222222", entry_year: 2028, status: "awaiting_payment", payment_info: { PaymentNo: "LLL22112515887" }, expires_at: "2026-11-02T09:00:00+08:00" });
  const late = order({ id: "33333333-3333-4333-8333-333333333333", status: "awaiting_payment", payment_info: { PaymentNo: "X1" }, expires_at: "2026-10-30T08:59:59+08:00" });
  const noCodes = order({ id: "44444444-4444-4444-8444-444444444444", status: "awaiting_payment", payment_info: null });
  const pending = order({ id: "55555555-5555-4555-8555-555555555555", status: "pending" });
  const paid = order({ id: "66666666-6666-4666-8666-666666666666", status: "paid", pass_from: "2026-10-29", payment_info: { BankCode: "812", vAccount: "1" } });
  const rows = [atm, cvs, late, noCodes, pending, paid];

  const open = openPayOrders(rows, new Set(), now);
  assert.deepEqual(open.map((o) => o.order.id), [atm.id, cvs.id]);
  assert.deepEqual(open[0].how, { kind: "atm", bankCode: "812", account: "9103522175887271" });
  assert.deepEqual(open[1].how, { kind: "cvs", paymentNo: "LLL22112515887" });
  // The 2027 pass got paid some other way meanwhile: its ATM code is no longer offered.
  assert.deepEqual(openPayOrders(rows, new Set([2027]), now).map((o) => o.order.id), [cvs.id]);
  assert.deepEqual(openPayOrders([], new Set(), now), []);
});
