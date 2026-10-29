// Payment core: decides when an ECPay notice may upgrade a student and plans the checkout form.
// Pure code (no database, no HTTP, no environment): the edge function wires it to the request and to a PaymentsStore.
// Web tests (web/lib/payments-core.test.ts) run this same file under Node, so: no npm: imports, no Deno.*, `.ts` imports.
// After editing, redeploy every edge function that imports this file.
//
// Trust model for a notice, checked in this order, any failure answers 400 and nothing is written:
//   1. CheckMacValue is valid for this mode's keys.
//   2. MerchantID is ours.
//   3. The order exists under the exact MerchantTradeNo. ECPay lowercases values before hashing, so the MAC alone does
//      not pin the case of MerchantTradeNo (or of any other text value): never trust it for identity or amount.
//   4. The order was made in this mode (the stage keys are public, anyone can sign a stage notice).
//   5. TradeAmt equals the amount stored on the order (compared here, not taken from the notice).
// A store that throws is not caught: the edge function then answers a non-200 and ECPay retries the notice.

import { offeredEntryYears, passWindow } from "./pass.ts";
import { aioFields, checkMacValue, verifyCheckMac } from "./ecpay.ts";
import type { EcpayKeys } from "./ecpay.ts";

export type Mode = "stage" | "production";

export type ModeConfig = { mode: Mode; keys: EcpayKeys; checkoutUrl: string };

export type OrderRow = {
  id: string;
  user_id: string | null;
  merchant_trade_no: string;
  mode: Mode;
  entry_year: number;
  amount_twd: number;
  status: "pending" | "awaiting_payment" | "paid" | "expired" | "refunded";
  pay_link_id: string | null;
};

export interface PaymentsStore {
  orderByTradeNo(no: string): Promise<OrderRow | null>;
  applyPaid(a: {
    merchantTradeNo: string;
    ecpayTradeNo: string;
    paymentType: string;
    paidAt: string;
    passFrom: string;
  }): Promise<"applied" | "already_paid" | "not_found">;
  setPaymentInfo(a: {
    merchantTradeNo: string;
    paymentType: string;
    info: Record<string, string>;
    expiresAt: string;
  }): Promise<void>;
  markSimulated(merchantTradeNo: string): Promise<void>;
}

/** Origins the checkout may send the student back to (the live site and local development). */
export const DEFAULT_ORIGINS: readonly string[] = ["https://www.track-ur-college.com", "http://localhost:3000"];

type NoticeResult = { status: 200 | 400; body: string };

// ECPay wants exactly "1|OK" for a notice it may stop resending.
const ACK: NoticeResult = { status: 200, body: "1|OK" };

// Log lines are one short line: cut long text and drop line breaks so a notice can't fill or forge log lines.
function brief(text: unknown): string {
  return String(text).replace(/[\r\n]+/g, " ").slice(0, 80);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

// ECPay sends times as "yyyy/MM/dd HH:mm:ss" and dates as "yyyy/MM/dd", both on the Taipei clock.
function validDay(y: number, mo: number, d: number): boolean {
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

// "2026/10/29 21:05:00" -> { day: "2026-10-29", iso: "2026-10-29T21:05:00+08:00" }; null when malformed or impossible.
function parseTaipeiDateTime(text: unknown): { day: string; iso: string } | null {
  if (typeof text !== "string") return null;
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (!validDay(y, mo, d) || h > 23 || mi > 59 || s > 59) return null;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  return { day, iso: `${day}T${m[4]}:${m[5]}:${m[6]}+08:00` };
}

// "2026/11/01" -> "2026-11-01"; null when malformed or impossible.
function parseTaipeiDate(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(text);
  if (!m) return null;
  if (!validDay(Number(m[1]), Number(m[2]), Number(m[3]))) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Handles one ECPay server notice (form fields already parsed). Every valid notice answers 200 "1|OK", duplicates and
 * notices we only log included; anything that fails a check answers 400 "0|<reason>" and changes nothing.
 */
export async function handleNotice(
  form: Record<string, string>,
  deps: { store: PaymentsStore; config: ModeConfig; log: (msg: string) => void },
): Promise<NoticeResult> {
  const { store, config, log } = deps;
  const reject = (reason: string, detail?: string): NoticeResult => {
    log(`ecpay notice refused: ${reason}${detail === undefined ? "" : ` ${brief(detail)}`}`);
    return { status: 400, body: `0|${reason}` };
  };

  // 1. Signature. Nothing else in the form is believed (or logged) before this passes.
  if (!(await verifyCheckMac(form, config.keys))) return reject("CheckMacValue");

  // 2. Merchant. An unset merchant id in our own config must not match an absent one.
  if (!isNonEmpty(config.keys.merchantId) || form.MerchantID !== config.keys.merchantId) return reject("MerchantID");
  const rtnCode = form.RtnCode;
  if (!isNonEmpty(rtnCode)) return reject("RtnCode");

  // 3. The order, by the exact trade number (the lookup may be case-blind, so compare what came back).
  const tradeNo = form.MerchantTradeNo;
  if (!isNonEmpty(tradeNo)) return reject("Order", "no MerchantTradeNo");
  const order = await store.orderByTradeNo(tradeNo);
  if (!order || order.merchant_trade_no !== tradeNo) return reject("Order", tradeNo);

  // 4. Mode.
  if (order.mode !== config.mode) return reject("Mode", tradeNo);

  // 5. Amount: whole TWD digits only, equal to what we asked for.
  const tradeAmt = form.TradeAmt;
  if (typeof tradeAmt !== "string" || !/^\d+$/.test(tradeAmt) || Number(tradeAmt) !== order.amount_twd) {
    return reject("Amount", tradeNo);
  }

  const paymentType = typeof form.PaymentType === "string" ? form.PaymentType : "";

  // 6. Paid.
  if (rtnCode === "1") {
    // ECPay's "simulate payment" button sends a genuine-looking paid notice. On the live site it must never upgrade.
    if (form.SimulatePaid === "1" && config.mode === "production") {
      await store.markSimulated(order.merchant_trade_no);
      log(`ecpay notice: simulated payment recorded, not upgraded ${brief(tradeNo)}`);
      return ACK;
    }
    const paidWhen = parseTaipeiDateTime(form.PaymentDate);
    if (!paidWhen) return reject("PaymentDate", tradeNo);
    const outcome = await store.applyPaid({
      merchantTradeNo: order.merchant_trade_no,
      ecpayTradeNo: typeof form.TradeNo === "string" ? form.TradeNo : "",
      paymentType,
      paidAt: paidWhen.iso,
      passFrom: passWindow(order.entry_year, paidWhen.day).from,
    });
    // The order was there a moment ago; if the store lost it, ECPay should try again rather than think we are done.
    if (outcome === "not_found") return reject("Order", `lost between lookup and apply ${tradeNo}`);
    return ACK;
  }

  // 7. Payment information (ATM virtual account, convenience-store code): the student pays later.
  if (rtnCode === "2" || rtnCode === "10100073") {
    const isAtm = rtnCode === "2";
    let expiresAt: string | null;
    if (isAtm) {
      const day = parseTaipeiDate(form.ExpireDate);
      expiresAt = day === null ? null : `${day}T23:59:59+08:00`;
    } else {
      expiresAt = parseTaipeiDateTime(form.ExpireDate)?.iso ?? null;
    }
    if (expiresAt === null) return reject("ExpireDate", tradeNo);
    let info: Record<string, string>;
    if (isAtm) {
      if (!isNonEmpty(form.BankCode) || !isNonEmpty(form.vAccount)) return reject("PaymentInfo", tradeNo);
      info = { BankCode: form.BankCode, vAccount: form.vAccount };
    } else {
      if (!isNonEmpty(form.PaymentNo)) return reject("PaymentInfo", tradeNo);
      info = { PaymentNo: form.PaymentNo };
    }
    await store.setPaymentInfo({ merchantTradeNo: order.merchant_trade_no, paymentType, info, expiresAt });
    log(`ecpay notice: payment info stored ${brief(tradeNo)} (${isAtm ? "ATM" : "CVS"})`);
    return ACK;
  }

  // 8. Anything else (failed or expired payment, ...): nothing to change, but ECPay must stop resending.
  log(`ecpay notice: RtnCode ${brief(rtnCode)} ${brief(form.RtnMsg ?? "")} ${brief(tradeNo)}`);
  return ACK;
}

/** Validates what the browser asked for. Order of checks: year, then origin, then an already-bought year. */
export function checkCheckout(i: {
  entryYear: unknown;
  origin: unknown;
  allowedOrigins: readonly string[];
  today: string;
  paidYears: readonly number[];
}): { ok: true; entryYear: number; origin: string } | { ok: false; error: "bad_year" | "bad_origin" | "already_paid" } {
  const year = i.entryYear;
  if (typeof year !== "number" || !Number.isInteger(year) || !offeredEntryYears(i.today).includes(year)) {
    return { ok: false, error: "bad_year" };
  }
  const origin = i.origin;
  if (typeof origin !== "string" || !i.allowedOrigins.includes(origin)) return { ok: false, error: "bad_origin" };
  if (i.paidYears.includes(year)) return { ok: false, error: "already_paid" };
  return { ok: true, entryYear: year, origin };
}

/** The signed form a browser posts to ECPay's checkout page (`action`), for one order. */
export async function buildCheckout(o: {
  order: { merchant_trade_no: string; entry_year: number; amount_twd: number };
  config: ModeConfig;
  functionUrl: string;
  clientBackUrl: string;
  now: Date;
}): Promise<{ action: string; fields: Record<string, string> }> {
  const fields = aioFields({
    merchantId: o.config.keys.merchantId,
    merchantTradeNo: o.order.merchant_trade_no,
    tradeDate: o.now,
    amount: o.order.amount_twd,
    itemName: `Trakur ${o.order.entry_year} 秋季入學方案`,
    tradeDesc: "Trakur admission-year pass",
    returnUrl: `${o.functionUrl}/notify`,
    paymentInfoUrl: `${o.functionUrl}/notify`,
    clientBackUrl: o.clientBackUrl,
  });
  fields.CheckMacValue = await checkMacValue(fields, o.config.keys);
  return { action: o.config.checkoutUrl, fields };
}
