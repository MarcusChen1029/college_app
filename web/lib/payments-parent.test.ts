import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "./i18n/en.ts";
import { zhTW } from "./i18n/zh-TW.ts";
import {
  checkoutFailure,
  orderIsOpen,
  orderRowStatus,
  PAY_POLL_FOR_MS,
  PAY_POLL_MS,
  PAY_STARTED_MAX_AGE_MS,
  payLinkPhase,
  payMethod,
  payPollDone,
  payStartedFresh,
  payStartedKey,
  PENDING_STALE_MS,
} from "./payments-parent.ts";
import { PAYMENT_ERROR_CODES, PaymentError, paymentErrorKey, type PaymentErrorCode } from "./payments-view.ts";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test("payLinkPhase: paid wins over expired, expired over closed, closed over ready", () => {
  assert.equal(payLinkPhase({ paid: true, expired: true, open: false }), "paid");
  assert.equal(payLinkPhase({ paid: false, expired: true, open: false }), "expired");
  assert.equal(payLinkPhase({ paid: false, expired: true, open: true }), "expired");
  assert.equal(payLinkPhase({ paid: false, expired: false, open: false }), "closed");
  assert.equal(payLinkPhase({ paid: false, expired: false, open: true }), "ready");
});

test("checkoutFailure: link changes become screens, anything else an error line", () => {
  const fail = (code: PaymentErrorCode) => checkoutFailure(new PaymentError(code));
  assert.deepEqual(fail("already_paid"), { screen: "paid" });
  assert.deepEqual(fail("expired"), { screen: "expired" });
  assert.deepEqual(fail("closed"), { screen: "closed" });
  assert.deepEqual(fail("bad_year"), { screen: "unavailable" });
  assert.deepEqual(fail("not_found"), { screen: "missing" });
  for (const code of ["network", "server", "bad_origin", "bad_request", "unauthorized", "not_student"] as const) {
    assert.deepEqual(fail(code), { error: paymentErrorKey(new PaymentError(code)) }, code);
  }
  // not a PaymentError at all: the generic server message
  assert.deepEqual(checkoutFailure(new Error("boom")), { error: "payments.error.server" });
  assert.deepEqual(checkoutFailure(undefined), { error: "payments.error.server" });
});

test("checkoutFailure covers every payment error code with a defined result", () => {
  for (const code of PAYMENT_ERROR_CODES) {
    const f = checkoutFailure(new PaymentError(code));
    if ("error" in f) assert.ok(f.error in en && f.error in zhTW, `${code} -> ${f.error} has no translation`);
    else assert.ok(["paid", "expired", "closed", "unavailable", "missing"].includes(f.screen), code);
  }
});

test("polling: every 3 s for 60 s", () => {
  assert.equal(PAY_POLL_MS, 3000);
  assert.equal(PAY_POLL_FOR_MS, 60_000);
  assert.equal(payPollDone(0), false);
  assert.equal(payPollDone(59_999), false);
  assert.equal(payPollDone(60_000), true);
  assert.equal(payPollDone(90_000), true);
});

test("payStartedKey keeps only a piece of the token", () => {
  const token = "A".repeat(8) + "secret-part-of-the-token-0123456789abcdefghi";
  const key = payStartedKey(token);
  assert.equal(key, "pay-started:AAAAAAAA");
  assert.ok(!key.includes("secret"));
});

test("payStartedFresh: a start counts for 3 days and not from the future", () => {
  assert.equal(payStartedFresh(null, NOW), false);
  assert.equal(payStartedFresh("", NOW), false);
  assert.equal(payStartedFresh("abc", NOW), false);
  assert.equal(payStartedFresh(String(NOW - 1000), NOW), true);
  assert.equal(payStartedFresh(String(NOW - PAY_STARTED_MAX_AGE_MS + 1), NOW), true);
  assert.equal(payStartedFresh(String(NOW - PAY_STARTED_MAX_AGE_MS), NOW), false);
  assert.equal(payStartedFresh(String(NOW + 10_000), NOW), true); // small clock skew
  assert.equal(payStartedFresh(String(NOW + 3_600_000), NOW), false);
});

test("payMethod reads ECPay payment types", () => {
  assert.equal(payMethod(null), null);
  assert.equal(payMethod(""), null);
  assert.equal(payMethod("Credit_CreditCard"), "card");
  assert.equal(payMethod("ApplePay"), "card");
  assert.equal(payMethod("ATM_TAISHIN"), "atm");
  assert.equal(payMethod("WebATM_TAISHIN"), "atm");
  assert.equal(payMethod("CVS_CVS"), "cvs");
  assert.equal(payMethod("CVS_OK"), "cvs");
  assert.equal(payMethod("BARCODE_BARCODE"), "cvs");
  assert.equal(payMethod("TWQR_OPAY"), "other");
});

const order = (over: Record<string, unknown> = {}) => ({
  status: "pending" as const,
  createdAt: ago(60_000),
  expiresAt: null as string | null,
  paymentInfo: null as Record<string, unknown> | null,
  ...over,
});

test("orderRowStatus: settled states pass through", () => {
  assert.equal(orderRowStatus(order({ status: "paid", createdAt: ago(10 * PENDING_STALE_MS) }), NOW), "paid");
  assert.equal(orderRowStatus(order({ status: "refunded" }), NOW), "refunded");
  assert.equal(orderRowStatus(order({ status: "expired" }), NOW), "expired");
});

test("orderRowStatus: a pending order reads as not completed after a day", () => {
  assert.equal(orderRowStatus(order(), NOW), "pending");
  assert.equal(orderRowStatus(order({ createdAt: ago(PENDING_STALE_MS - 1) }), NOW), "pending");
  assert.equal(orderRowStatus(order({ createdAt: ago(PENDING_STALE_MS) }), NOW), "stale");
  assert.equal(orderRowStatus(order({ createdAt: "not a date" }), NOW), "pending");
});

test("orderRowStatus: an ATM / store order expires at its stored deadline", () => {
  const atm = { BankCode: "812", vAccount: "9103522175887271" };
  const waiting = order({ status: "awaiting_payment", paymentInfo: atm });
  assert.equal(orderRowStatus({ ...waiting, expiresAt: new Date(NOW + 60_000).toISOString() }, NOW), "awaiting_payment");
  assert.equal(orderRowStatus({ ...waiting, expiresAt: new Date(NOW - 1).toISOString() }, NOW), "expired");
  assert.equal(orderRowStatus({ ...waiting, expiresAt: null }, NOW), "awaiting_payment");
  assert.equal(orderRowStatus({ ...waiting, expiresAt: "garbage" }, NOW), "awaiting_payment");
  // no instructions to pay with: the deadline does not decide
  assert.equal(orderRowStatus(order({ status: "awaiting_payment", expiresAt: new Date(NOW - 1).toISOString() }), NOW), "awaiting_payment");
});

test("orderIsOpen: only an order that can still turn into a payment links to its details", () => {
  assert.equal(orderIsOpen("pending"), true);
  assert.equal(orderIsOpen("awaiting_payment"), true);
  for (const s of ["paid", "expired", "refunded", "stale"] as const) assert.equal(orderIsOpen(s), false, s);
});
