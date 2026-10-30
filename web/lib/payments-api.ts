"use client";

// The browser's side of payments: calls to the payments Edge Function (supabase/functions/payments, routes in
// supabase/functions/_shared/payments-http.ts), the student's own orders, and the hidden form that hands the buyer to
// ECPay's hosted payment page. Every failure surfaces as a PaymentError carrying the function's error code, so the
// screens can show one translated message per code (lib/payments-view.ts paymentErrorKey).
// Relative imports carry `.ts` so payments-api.test.ts can load this file under Node.

import {
  isEcpayCheckoutUrl,
  isUuid,
  ORDER_COLUMNS,
  PaymentError,
  parseCheckout,
  parseErrorCode,
  parseNewPayLink,
  parseOrder,
  parsePayLinkView,
  type OrderView,
  type PayLinkView,
} from "./payments-view.ts";
import { browserSupabase } from "./supabase-browser.ts";

export { PaymentError } from "./payments-view.ts";
export type { OrderView, PayLinkView } from "./payments-view.ts";

export const PAYMENTS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/payments`;

type CallOptions = { method?: "GET" | "POST"; body?: unknown; token?: string | null };

/**
 * One call to the payments function; resolves with the parsed JSON reply. The publishable key goes in `apikey` on every
 * call; `Authorization: Bearer` is only ever the signed-in student's session token (never the publishable key).
 * Throws PaymentError: the function's `{ error }` code, or "network" when the request itself failed.
 */
export async function callPayments(path: string, opts: CallOptions = {}, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const headers: Record<string, string> = { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetchImpl(`${PAYMENTS_URL}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
    });
  } catch {
    throw new PaymentError("network");
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // an empty or non-JSON reply: handled below
  }
  if (!res.ok) throw new PaymentError(parseErrorCode(json));
  return json;
}

// The signed-in student's session token, or null (signed out, or the browser client isn't configured).
async function sessionToken(): Promise<string | null> {
  try {
    const { data } = await browserSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Whether buying is open for this visitor (production: everyone; stage mode: payment testers). A failed request counts as closed. */
export async function fetchPaymentStatus(): Promise<{ open: boolean }> {
  try {
    const body = await callPayments("/status", { token: await sessionToken() });
    return { open: !!body && typeof body === "object" && (body as Record<string, unknown>).open === true };
  } catch {
    return { open: false };
  }
}

/**
 * Makes an order for the signed-in student and sends the browser to ECPay's payment page (this call returns just before
 * the page leaves). Throws PaymentError("unauthorized") when signed out.
 */
export async function startCheckout(entryYear: number): Promise<void> {
  const token = await sessionToken();
  if (!token) throw new PaymentError("unauthorized");
  const form = parseCheckout(await callPayments("/checkout", { method: "POST", token, body: { entryYear, origin: window.location.origin } }));
  if (form === null) throw new PaymentError("server");
  submitEcpayForm(form.action, form.fields);
}

/** The same for a parent paying through a pay-link token (no sign-in). */
export async function startPayLinkCheckout(token: string): Promise<void> {
  const form = parseCheckout(await callPayments(`/pay-links/${encodeURIComponent(token)}/checkout`, { method: "POST", body: { origin: window.location.origin } }));
  if (form === null) throw new PaymentError("server");
  submitEcpayForm(form.action, form.fields);
}

/** A link a parent can pay through (valid for 7 days) for one entry year. */
export async function createPayLink(entryYear: number): Promise<{ url: string; expiresAt: string }> {
  const token = await sessionToken();
  if (!token) throw new PaymentError("unauthorized");
  const link = parseNewPayLink(await callPayments("/pay-links", { method: "POST", token, body: { entryYear, origin: window.location.origin } }));
  if (link === null) throw new PaymentError("server");
  return link;
}

/** What a parent sees at a pay link. null when no such link exists; other failures throw PaymentError (e.g. "network"). */
export async function fetchPayLink(token: string): Promise<PayLinkView | null> {
  try {
    return parsePayLinkView(await callPayments(`/pay-links/${encodeURIComponent(token)}`));
  } catch (e) {
    if (e instanceof PaymentError && e.code === "not_found") return null;
    throw e;
  }
}

/** One of the signed-in student's orders; null when there is none with that id. Throws PaymentError("server") when the read fails. */
export async function fetchOrder(id: string): Promise<OrderView | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await browserSupabase().from("plan_orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new PaymentError("server");
  return parseOrder(data);
}

/** The signed-in student's orders, newest first. Throws PaymentError("server") when the read fails. */
export async function listOrders(): Promise<OrderView[]> {
  const { data, error } = await browserSupabase().from("plan_orders").select(ORDER_COLUMNS).order("created_at", { ascending: false }).limit(100);
  if (error) throw new PaymentError("server");
  return (data ?? []).flatMap((row) => parseOrder(row) ?? []);
}

/**
 * Posts the signed checkout fields to ECPay with a hidden form (ECPay's payment page only takes a form post).
 * Only ECPay's own payment hosts are accepted as the destination.
 */
export function submitEcpayForm(action: string, fields: Record<string, string>): void {
  if (!isEcpayCheckoutUrl(action)) throw new PaymentError("server");
  const form = document.createElement("form");
  form.method = "post";
  form.action = action;
  form.acceptCharset = "UTF-8";
  form.hidden = true;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  // Not form.submit(): a field called "submit" would replace that method.
  HTMLFormElement.prototype.submit.call(form);
}
