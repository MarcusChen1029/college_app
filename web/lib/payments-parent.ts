// Pure helpers for the parent pay page (/share/pay/<token>) and the payment history in Settings: which screen a pay link
// is on, what a failed checkout means for that screen, the "came back from ECPay" bookkeeping, and the history row
// states. No React and no browser calls, so the web tests run this file (payments-parent.test.ts).
// Files reached by a test use `.ts` imports and `import type`.

import type { MessageKey } from "./i18n/en.ts";
import { PaymentError, paymentErrorKey, payInstructions, type OrderStatus, type OrderView, type PayLinkView } from "./payments-view.ts";

// ───────────── the pay link screen ─────────────

/**
 * What a parent sees at a pay link. "paid" and "expired" win over "closed": a link that was paid through stays "paid" after
 * its 7 days, and an expired link is a dead end whether or not payment is open. "closed" = payment is not open yet.
 */
export type PayLinkPhase = "paid" | "expired" | "closed" | "ready";

export function payLinkPhase(view: Pick<PayLinkView, "paid" | "expired" | "open">): PayLinkPhase {
  if (view.paid) return "paid";
  if (view.expired) return "expired";
  if (!view.open) return "closed";
  return "ready";
}

/**
 * A screen reached after the view was loaded, because the checkout answered otherwise than the view said.
 * "alreadyPaid" = the year was paid some other way (say by the student), not through this link: no "thank you".
 */
export type PayLinkScreen = PayLinkPhase | "alreadyPaid" | "unavailable" | "missing";

export type CheckoutFailure = { screen: PayLinkScreen } | { error: MessageKey };

/**
 * What a failed pay-link checkout means for the page. The link can change between loading it and pressing Pay (it
 * expires; payment closes; the year is paid some other way or goes off sale), and those are screens, not error lines.
 * Everything else (network, server, bad origin) is an error line and the form stays usable.
 */
export function checkoutFailure(e: unknown): CheckoutFailure {
  if (e instanceof PaymentError) {
    switch (e.code) {
      case "already_paid":
        return { screen: "alreadyPaid" };
      case "expired":
        return { screen: "expired" };
      case "closed":
        return { screen: "closed" };
      case "bad_year":
        return { screen: "unavailable" };
      case "not_found":
        return { screen: "missing" };
      default:
        break;
    }
  }
  return { error: paymentErrorKey(e) };
}

// ───────────── coming back from ECPay ─────────────

/** After ECPay sends the parent back, the page asks every 3 s for up to 60 s whether the payment has landed. */
export const PAY_POLL_MS = 3000;
export const PAY_POLL_FOR_MS = 60_000;

/** True once the page has waited long enough and stops asking. */
export const payPollDone = (waitedMs: number): boolean => waitedMs >= PAY_POLL_FOR_MS;

/** A started payment is remembered for 3 days (the longest an ATM account or store code stays valid). */
export const PAY_STARTED_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/** The sessionStorage key for "this tab sent the parent to ECPay from this link" (just a piece of the token, never all of it). */
export const payStartedKey = (token: string): string => `pay-started:${token.slice(0, 8)}`;

/** Whether a remembered start (the time in ms, as text) is recent enough to mean "this visit is the way back from ECPay". */
export function payStartedFresh(raw: string | null, nowMs: number): boolean {
  if (raw === null || raw.trim() === "") return false;
  const startedMs = Number(raw);
  if (!Number.isFinite(startedMs)) return false;
  const age = nowMs - startedMs;
  return age >= -60_000 && age < PAY_STARTED_MAX_AGE_MS;
}

// ───────────── payment history rows ─────────────

export type PayMethod = "card" | "atm" | "cvs" | "code" | "other";

/**
 * ECPay's PaymentType ("Credit_CreditCard", "ATM_TAISHIN", "WebATM_…", "CVS_CVS", "BARCODE_BARCODE", …) as a method, or "code"
 * for a pass from a redeem code (payment_type "coupon", migration 0050); null when there is none yet.
 */
export function payMethod(paymentType: string | null): PayMethod | null {
  if (paymentType === null || paymentType.trim() === "") return null;
  const type = paymentType.trim().toLowerCase();
  if (type === "coupon") return "code";
  if (type.startsWith("credit") || type === "applepay") return "card";
  if (type.startsWith("atm") || type.startsWith("webatm")) return "atm";
  if (type.startsWith("cvs") || type.startsWith("barcode")) return "cvs";
  return "other";
}

/** An order that never reached ECPay's payment step stops reading "processing" after a day. */
export const PENDING_STALE_MS = 24 * 60 * 60 * 1000;

/** What a history row says about an order: its status, except that a long-abandoned or past-deadline order reads as such. */
export type OrderRowStatus = OrderStatus | "stale";

export function orderRowStatus(order: Pick<OrderView, "status" | "createdAt" | "expiresAt" | "paymentInfo">, nowMs: number): OrderRowStatus {
  if (order.status === "awaiting_payment") {
    // ECPay never reports an ATM / store deadline passing, so the stored deadline decides.
    const deadline = order.expiresAt === null ? NaN : Date.parse(order.expiresAt);
    return payInstructions(order) !== null && !Number.isNaN(deadline) && deadline <= nowMs ? "expired" : "awaiting_payment";
  }
  if (order.status === "pending") {
    const age = nowMs - Date.parse(order.createdAt);
    return Number.isFinite(age) && age >= PENDING_STALE_MS ? "stale" : "pending";
  }
  return order.status;
}

/** True while the order can still turn into a payment, so its row links to the payment details. */
export const orderIsOpen = (status: OrderRowStatus): boolean => status === "pending" || status === "awaiting_payment";
