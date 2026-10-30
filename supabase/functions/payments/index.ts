// Payments (ECPay admission-year pass): student checkout, parent pay links and ECPay's server notices. The only server
// code that creates orders or accepts a payment. Routes, auth and every rule live in ../_shared/payments-http.ts and
// ../_shared/payments-core.ts (unit-tested from web/lib); this file only connects them to the database.
// Deploy with verify_jwt OFF (ECPay posts notices without a JWT; payments-http.ts checks Bearer tokens itself). Files:
// payments/index.ts, _shared/payments-http.ts, _shared/payments-core.ts, _shared/ecpay.ts, _shared/pass.ts.
// Env (function secrets): ECPAY_MODE ("production", else stage with ECPay's public stage merchant),
// ECPAY_MERCHANT_ID / ECPAY_HASH_KEY / ECPAY_HASH_IV (production only; missing -> every request 500),
// APP_ORIGINS (comma list of site origins; default _shared/payments-core.ts DEFAULT_ORIGINS).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { paymentsHandler } from "../_shared/payments-http.ts";
import type { PaymentsBackend } from "../_shared/payments-http.ts";
import type { OrderRow } from "../_shared/payments-core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "");
const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

// Every database error throws: the handler logs it and answers 500 (ECPay then resends a notice).
function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

const ORDER_COLUMNS = "id, user_id, merchant_trade_no, mode, entry_year, amount_twd, status, pay_link_id";

const backend: PaymentsBackend = {
  async userIdForToken(jwt) {
    const { data, error } = await db.auth.getUser(jwt);
    return error || !data.user ? null : data.user.id;
  },
  async roleOf(userId) {
    const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    check("user_roles", error);
    return typeof data?.role === "string" ? data.role : null;
  },
  async isTester(userId) {
    const { data, error } = await db.rpc("is_payment_tester", { p_user: userId });
    check("is_payment_tester", error);
    return data === true;
  },
  async paidEntryYears(userId) {
    const { data, error } = await db.from("plan_orders").select("entry_year").eq("user_id", userId).eq("status", "paid");
    check("plan_orders paid", error);
    return (data ?? []).map((r) => Number(r.entry_year));
  },
  async insertOrder(order) {
    const { data, error } = await db.from("plan_orders").insert(order).select("id").single();
    check("plan_orders insert", error);
    return String(data!.id);
  },
  async insertPayLink(link) {
    const { error } = await db.from("pay_links").insert(link);
    check("pay_links insert", error);
  },
  async payLinkByHash(tokenHash) {
    const { data, error } = await db
      .from("pay_links")
      .select("id, user_id, entry_year, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    check("pay_links", error);
    return data;
  },
  async profileOf(userId) {
    const { data, error } = await db.from("student_profiles").select("display_name, resume").eq("user_id", userId).maybeSingle();
    check("student_profiles", error);
    return data;
  },
  async payLinkPaid(payLinkId) {
    const { count, error } = await db
      .from("plan_orders")
      .select("id", { count: "exact", head: true })
      .eq("pay_link_id", payLinkId)
      .eq("status", "paid");
    check("plan_orders by pay link", error);
    return (count ?? 0) > 0;
  },
  store: {
    async orderByTradeNo(no) {
      const { data, error } = await db.from("plan_orders").select(ORDER_COLUMNS).eq("merchant_trade_no", no).maybeSingle();
      check("plan_orders by trade no", error);
      return data as OrderRow | null;
    },
    async applyPaid(a) {
      const { data, error } = await db.rpc("apply_paid_order", {
        p_merchant_trade_no: a.merchantTradeNo,
        p_ecpay_trade_no: a.ecpayTradeNo,
        p_payment_type: a.paymentType,
        p_paid_at: a.paidAt,
        p_pass_from: a.passFrom,
      });
      check("apply_paid_order", error);
      if (data !== "applied" && data !== "already_paid" && data !== "not_found") {
        throw new Error(`apply_paid_order: unexpected result ${String(data)}`);
      }
      return data;
    },
    async setPaymentInfo(a) {
      const { error } = await db.rpc("set_order_payment_info", {
        p_merchant_trade_no: a.merchantTradeNo,
        p_payment_type: a.paymentType,
        p_info: a.info,
        p_expires_at: a.expiresAt,
      });
      check("set_order_payment_info", error);
    },
    async markSimulated(merchantTradeNo) {
      const { error } = await db.from("plan_orders").update({ simulated: true }).eq("merchant_trade_no", merchantTradeNo);
      check("plan_orders simulated", error);
    },
  },
};

Deno.serve(
  paymentsHandler({
    env: (name) => Deno.env.get(name),
    backend,
    functionUrl: `${SUPABASE_URL}/functions/v1/payments`,
    log: (msg) => console.log(msg),
  }),
);
