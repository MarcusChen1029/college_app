// Pure helpers for the payment screens (pricing page, order status, the parent pay page, payment history): what the
// payments function and the plan_orders table return as typed values, date and error texts, and the order states.
// No React and no browser calls, so the web tests run this file (payments-view.test.ts); lib/payments-api.ts does the
// fetching. Files reached by a test use `.ts` imports and `import type`.

import type { Locale } from "./i18n/core.ts";
import type { MessageKey } from "./i18n/en.ts";
import { taipeiToday } from "./plans.ts";

// ───────────── errors ─────────────

/** Error codes of the payments function (supabase/functions/_shared/payments-http.ts ErrorCode) plus "network". */
export const PAYMENT_ERROR_CODES = [
  "unauthorized",
  "not_student",
  "closed",
  "bad_year",
  "bad_origin",
  "already_paid",
  "bad_request",
  "not_found",
  "expired",
  "server",
  "network",
] as const;
export type PaymentErrorCode = (typeof PAYMENT_ERROR_CODES)[number];

export class PaymentError extends Error {
  code: PaymentErrorCode;
  constructor(code: PaymentErrorCode) {
    super(`payments: ${code}`);
    this.name = "PaymentError";
    this.code = code;
  }
}

/** The error code in a function reply `{ error: "<code>" }`; anything unreadable counts as "server". */
export function parseErrorCode(body: unknown): PaymentErrorCode {
  const code = body && typeof body === "object" ? (body as Record<string, unknown>).error : undefined;
  return (PAYMENT_ERROR_CODES as readonly unknown[]).includes(code) ? (code as PaymentErrorCode) : "server";
}

// Full literal keys, so the unused-key test sees them. A code with no message of its own uses the generic one.
const ERROR_KEYS: Record<PaymentErrorCode, MessageKey> = {
  closed: "payments.error.closed",
  already_paid: "payments.error.alreadyPaid",
  bad_year: "payments.error.badYear",
  bad_origin: "payments.error.badOrigin",
  unauthorized: "payments.error.unauthorized",
  not_student: "payments.error.notStudent",
  expired: "payments.error.expired",
  network: "payments.error.network",
  server: "payments.error.server",
  bad_request: "payments.error.server",
  not_found: "payments.error.server",
};

/** The message to show for a failed payment call. */
export function paymentErrorKey(e: unknown): MessageKey {
  return e instanceof PaymentError ? ERROR_KEYS[e.code] : ERROR_KEYS.server;
}

// ───────────── dates ─────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** "2027-07-31" as "2027/7/31" (zh-TW) or "Jul 31, 2027" (en). Text that isn't an ISO date comes back unchanged. */
export function fmtPassDate(iso: string, locale: Locale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12) return iso;
  return locale === "zh-TW" ? `${year}/${month}/${day}` : `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** A timestamp on the Taipei clock: the date, plus " HH:MM" when `withClock`. Unreadable text comes back unchanged. */
export function fmtTaipei(iso: string, locale: Locale, withClock: boolean): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const date = fmtPassDate(taipeiToday(new Date(ms)), locale);
  return withClock ? `${date} ${new Date(ms + TAIPEI_OFFSET_MS).toISOString().slice(11, 16)}` : date;
}

// ───────────── ECPay form ─────────────

const ECPAY_HOSTS: readonly string[] = ["payment-stage.ecpay.com.tw", "payment.ecpay.com.tw"];

/** True only for an https address on ECPay's test or live payment host (the CSP form-action allows the same two). */
export function isEcpayCheckoutUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.username === "" && u.password === "" && ECPAY_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

export type CheckoutForm = { orderId: string; action: string; fields: Record<string, string> };

/** The `{ orderId, action, fields }` reply of the checkout routes; null when it has another shape. */
export function parseCheckout(body: unknown): CheckoutForm | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.orderId !== "string" || typeof b.action !== "string") return null;
  if (!b.fields || typeof b.fields !== "object" || Array.isArray(b.fields)) return null;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.fields)) {
    if (typeof v !== "string") return null;
    fields[k] = v;
  }
  return { orderId: b.orderId, action: b.action, fields };
}

/** The `{ url, expiresAt }` reply of POST /pay-links; null when it has another shape. */
export function parseNewPayLink(body: unknown): { url: string; expiresAt: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  return typeof b.url === "string" && typeof b.expiresAt === "string" ? { url: b.url, expiresAt: b.expiresAt } : null;
}

// ───────────── parent pay links ─────────────

/** What a parent sees before paying (GET /pay-links/<token>). `from` and `until` are Taipei dates. */
export type PayLinkView = {
  studentName: string | null;
  entryYear: number;
  from: string;
  until: string;
  amountTwd: number;
  paid: boolean;
  expired: boolean;
  open: boolean;
};

export function parsePayLinkView(body: unknown): PayLinkView | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.entryYear !== "number" || typeof b.from !== "string" || typeof b.until !== "string") return null;
  if (typeof b.amountTwd !== "number" || typeof b.paid !== "boolean" || typeof b.expired !== "boolean" || typeof b.open !== "boolean") return null;
  const name = typeof b.studentName === "string" && b.studentName.trim() !== "" ? b.studentName.trim() : null;
  return { studentName: name, entryYear: b.entryYear, from: b.from, until: b.until, amountTwd: b.amountTwd, paid: b.paid, expired: b.expired, open: b.open };
}

// ───────────── orders ─────────────

const ORDER_STATUSES = ["pending", "awaiting_payment", "paid", "expired", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The plan_orders columns a student may read (RLS and column grants of migration 0045). */
export const ORDER_COLUMNS =
  "id, merchant_trade_no, entry_year, amount_twd, pass_from, pass_until, payer, status, payment_type, payment_info, created_at, paid_at, expires_at";

export type OrderView = {
  id: string;
  merchantTradeNo: string;
  entryYear: number;
  amountTwd: number;
  /** Set when the order is paid. */
  passFrom: string | null;
  passUntil: string;
  payer: "student" | "parent";
  status: OrderStatus;
  /** ECPay's payment type, e.g. "Credit_CreditCard", "ATM_TAISHIN", "CVS_CVS". */
  paymentType: string | null;
  /** ATM `{ BankCode, vAccount }` or convenience-store `{ PaymentNo }` while the student still has to pay. */
  paymentInfo: Record<string, unknown> | null;
  createdAt: string;
  paidAt: string | null;
  /** Deadline of an ATM account or convenience-store code. */
  expiresAt: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** One plan_orders row as an OrderView; null when a required column is missing or has the wrong type. */
export function parseOrder(row: unknown): OrderView | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const status = (ORDER_STATUSES as readonly unknown[]).includes(r.status) ? (r.status as OrderStatus) : null;
  const payer = r.payer === "student" || r.payer === "parent" ? r.payer : null;
  const info = r.payment_info && typeof r.payment_info === "object" && !Array.isArray(r.payment_info) ? (r.payment_info as Record<string, unknown>) : null;
  if (!isUuid(r.id) || status === null || payer === null) return null;
  if (typeof r.entry_year !== "number" || typeof r.amount_twd !== "number") return null;
  const merchantTradeNo = text(r.merchant_trade_no);
  const passUntil = text(r.pass_until);
  const createdAt = text(r.created_at);
  if (merchantTradeNo === null || passUntil === null || createdAt === null) return null;
  return {
    id: r.id,
    merchantTradeNo,
    entryYear: r.entry_year,
    amountTwd: r.amount_twd,
    passFrom: text(r.pass_from),
    passUntil,
    payer,
    status,
    paymentType: text(r.payment_type),
    paymentInfo: info,
    createdAt,
    paidAt: text(r.paid_at),
    expiresAt: text(r.expires_at),
  };
}

export type PayInstructions = { kind: "atm"; bankCode: string; account: string } | { kind: "cvs"; paymentNo: string };

/** The ATM account or convenience-store code stored with an order; null when there is none (or it is unreadable). */
export function payInstructions(order: Pick<OrderView, "paymentInfo">): PayInstructions | null {
  const info = order.paymentInfo;
  if (info === null) return null;
  const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const bankCode = text(info.BankCode);
  const account = text(info.vAccount);
  if (bankCode !== null && account !== null) return { kind: "atm", bankCode, account };
  const paymentNo = text(info.PaymentNo);
  return paymentNo !== null ? { kind: "cvs", paymentNo } : null;
}

/** The order page polls every 2 s for the first minute, then every 10 s (ATM and store payments can take days). */
export const POLL_FAST_MS = 2000;
export const POLL_FAST_FOR_MS = 60_000;
export const POLL_SLOW_MS = 10_000;

export const pollDelay = (waitedMs: number): number => (waitedMs < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS);

/** True once the order can't change any more, so polling stops. */
export const isSettled = (status: OrderStatus): boolean => status === "paid" || status === "refunded" || status === "expired";

export type OrderPhase = "confirming" | "slow" | "awaiting" | "paid" | "expired" | "refunded";

/**
 * What the order page shows. A pending order is "confirming" for the first minute (counted from opening the page, or
 * from the order's creation when that is longer ago: an old link must not claim to be confirming), then "slow".
 * An ATM / store order with its codes is "awaiting" until the deadline, which ECPay never reports, then "expired".
 */
export function orderPhase(order: OrderView, waitedMs: number, nowMs: number): OrderPhase {
  if (order.status === "paid") return "paid";
  if (order.status === "refunded") return "refunded";
  if (order.status === "expired") return "expired";
  if (order.status === "awaiting_payment" && payInstructions(order) !== null) {
    const deadline = order.expiresAt === null ? NaN : Date.parse(order.expiresAt);
    return Number.isNaN(deadline) || deadline > nowMs ? "awaiting" : "expired";
  }
  const age = nowMs - Date.parse(order.createdAt);
  return Math.max(waitedMs, Number.isFinite(age) ? age : 0) >= POLL_FAST_FOR_MS ? "slow" : "confirming";
}
