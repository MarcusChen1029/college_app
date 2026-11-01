// HTTP side of the payments Edge Function (supabase/functions/payments/index.ts): routes, CORS, sign-in checks,
// student orders and parent pay links. Pure code over a PaymentsBackend (the database), so the web tests
// (web/lib/payments-http.test.ts) run this same file under Node: no npm: imports, no Deno.*, `.ts` imports.
// After editing, redeploy the payments function. Its files: payments/index.ts, _shared/payments-http.ts,
// _shared/payments-core.ts, _shared/ecpay.ts, _shared/pass.ts.
//
// Routes, under `${SUPABASE_URL}/functions/v1/payments`. JSON unless noted; errors are { "error": "<code>" }:
//   GET  /status                      optional Bearer               -> { open, mode }
//   POST /checkout                    Bearer, { entryYear, origin } -> { orderId, action, fields }
//   POST /pay-links                   Bearer, { entryYear, origin } -> { url, expiresAt }
//   GET  /pay-links/<token>                                         -> { studentName, entryYear, from, until, amountTwd,
//                                                                         paid, expired, open }
//   POST /pay-links/<token>/checkout  { origin }                    -> { orderId, action, fields }
//   POST /redeem                      Bearer, { code, entryYear }   -> { entryYear, from, until }
//   POST /notify                      ECPay, form-urlencoded        -> text/plain "1|OK", 400 "0|<reason>", 500
// The function runs with verify_jwt off (ECPay posts without a JWT), so the Bearer token is checked here: a website
// session of a student. Tokens of connected AI apps (they carry client_id) are refused before Supabase is asked.
// `open` = production mode, or stage mode for a payment tester (on pay-link routes: the link's student). ECPay never
// accepts a MerchantTradeNo twice, so every checkout makes a new order; open ATM / CVS orders are shown, not reused.
// A redeem code (migration 0050) costs nothing, so /redeem works in stage mode too: no ECPay, only public.redeem_coupon.

import { buildCheckout, checkCheckout, DEFAULT_ORIGINS, handleNotice } from "./payments-core.ts";
import type { Mode, ModeConfig, PaymentsStore } from "./payments-core.ts";
import { ECPAY_PRODUCTION_URL, ECPAY_STAGE, newMerchantTradeNo } from "./ecpay.ts";
import { offeredEntryYears, PASS_PRICE_TWD, passWindow, taipeiToday } from "./pass.ts";

export type NewOrder = {
  user_id: string;
  merchant_trade_no: string;
  mode: Mode;
  entry_year: number;
  amount_twd: number;
  pass_until: string;
  payer: "student" | "parent";
  pay_link_id: string | null;
};

export type NewPayLink = { user_id: string; entry_year: number; token_hash: string; expires_at: string };

export type PayLinkRow = { id: string; user_id: string; entry_year: number; expires_at: string };

/** A redeem attempt for one account and entry year, with the pass dates worked out here (passWindow). */
export type CouponRedeem = { userId: string; code: string; entryYear: number; passFrom: string; passUntil: string };

/** What public.redeem_coupon returns (migration 0050). */
export type RedeemResult = "redeemed" | "invalid" | "used" | "already_paid" | "rate_limited";

/** The database, as the payments function uses it (service role). Every method throws on a database error. */
export interface PaymentsBackend {
  /** The user id of a valid session token (Supabase Auth getUser); null for an invalid or expired token. */
  userIdForToken(jwt: string): Promise<string | null>;
  /** user_roles.role, or null when the account has no role yet. */
  roleOf(userId: string): Promise<string | null>;
  /** public.is_payment_tester. */
  isTester(userId: string): Promise<boolean>;
  /** Entry years of the user's orders with status 'paid'. */
  paidEntryYears(userId: string): Promise<number[]>;
  /** Inserts a plan_orders row and returns its id. */
  insertOrder(order: NewOrder): Promise<string>;
  insertPayLink(link: NewPayLink): Promise<void>;
  payLinkByHash(tokenHash: string): Promise<PayLinkRow | null>;
  /** student_profiles.display_name and resume, or null when there is no profile row. */
  profileOf(userId: string): Promise<{ display_name: unknown; resume: unknown } | null>;
  /** True when an order made through this pay link is paid. */
  payLinkPaid(payLinkId: string): Promise<boolean>;
  /** public.redeem_coupon: on "redeemed" a NT$0 paid order exists and the plan is rebuilt. */
  redeemCoupon(r: CouponRedeem): Promise<RedeemResult>;
  store: PaymentsStore;
}

export type HandlerDeps = {
  env: (name: string) => string | undefined;
  backend: PaymentsBackend;
  /** `${SUPABASE_URL}/functions/v1/payments`, no trailing slash (ECPay posts notices to `${functionUrl}/notify`). */
  functionUrl: string;
  log: (msg: string) => void;
  now?: () => Date;
};

export type ErrorCode =
  | "unauthorized"
  | "not_student"
  | "closed"
  | "bad_year"
  | "bad_origin"
  | "already_paid"
  | "bad_request"
  | "not_found"
  | "expired"
  | "invalid_code"
  | "code_used"
  | "rate_limited"
  | "server";

const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  not_student: 403,
  closed: 403,
  bad_year: 400,
  bad_origin: 400,
  already_paid: 400,
  bad_request: 400,
  not_found: 404,
  expired: 410,
  invalid_code: 400,
  code_used: 400,
  rate_limited: 429,
  server: 500,
};

/** Days a parent pay link can be used. */
export const PAY_LINK_DAYS = 7;
/** Longest redeem code passed on to the database (a stored code is at most 32 characters). */
export const MAX_CODE_LENGTH = 64;
const DAY_MS = 24 * 60 * 60 * 1000;

const MISCONFIGURED = "payments misconfigured: ECPAY_MODE=production needs ECPAY_MERCHANT_ID, ECPAY_HASH_KEY and ECPAY_HASH_IV";

// ───────────── configuration ─────────────

/**
 * ECPAY_MODE "production" uses the ECPAY_* secrets and is null (misconfigured) when one is missing: production never
 * falls back to the public stage keys. Any other value, or none, is stage mode with ECPay's public stage merchant.
 */
export function readModeConfig(env: (name: string) => string | undefined): ModeConfig | null {
  if ((env("ECPAY_MODE") ?? "").trim() !== "production") {
    return {
      mode: "stage",
      keys: { merchantId: ECPAY_STAGE.merchantId, hashKey: ECPAY_STAGE.hashKey, hashIv: ECPAY_STAGE.hashIv },
      checkoutUrl: ECPAY_STAGE.checkoutUrl,
    };
  }
  const merchantId = (env("ECPAY_MERCHANT_ID") ?? "").trim();
  const hashKey = (env("ECPAY_HASH_KEY") ?? "").trim();
  const hashIv = (env("ECPAY_HASH_IV") ?? "").trim();
  if (merchantId === "" || hashKey === "" || hashIv === "") return null;
  return { mode: "production", keys: { merchantId, hashKey, hashIv }, checkoutUrl: ECPAY_PRODUCTION_URL };
}

/** APP_ORIGINS (comma list; entries trimmed, trailing "/" dropped), or DEFAULT_ORIGINS when it lists none. */
export function allowedOrigins(env: (name: string) => string | undefined): string[] {
  const list = (env("APP_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => s !== "");
  return list.length > 0 ? list : [...DEFAULT_ORIGINS];
}

// ───────────── small pure helpers ─────────────

export type Route =
  | { name: "status" }
  | { name: "checkout" }
  | { name: "createPayLink" }
  | { name: "viewPayLink"; token: string }
  | { name: "payLinkCheckout"; token: string }
  | { name: "redeem" }
  | { name: "notify" };

/**
 * The route for a method and URL path; null when nothing matches (wrong method included). The path may start with
 * /functions/v1 and /payments (the function's own name), or not.
 */
export function matchRoute(method: string, pathname: string): Route | null {
  let parts = pathname.split("/").filter((p) => p !== "");
  if (parts[0] === "functions" && parts[1] === "v1") parts = parts.slice(2);
  if (parts[0] === "payments") parts = parts.slice(1);
  if (parts.length === 0 || parts.length > 3) return null;
  const [a, b, c] = parts;
  if (parts.length === 1) {
    if (a === "status" && method === "GET") return { name: "status" };
    if (a === "checkout" && method === "POST") return { name: "checkout" };
    if (a === "notify" && method === "POST") return { name: "notify" };
    if (a === "pay-links" && method === "POST") return { name: "createPayLink" };
    if (a === "redeem" && method === "POST") return { name: "redeem" };
    return null;
  }
  if (a !== "pay-links") return null;
  if (parts.length === 2) return method === "GET" ? { name: "viewPayLink", token: b } : null;
  return c === "checkout" && method === "POST" ? { name: "payLinkCheckout", token: b } : null;
}

/** CORS headers for an allowed Origin; only Vary for any other (or none). */
export function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> {
  if (origin === null || !allowed.includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

/** The token of an "Authorization: Bearer <token>" header, else null. */
export function bearerToken(authorization: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  return m ? m[1] : null;
}

/** The decoded payload (middle segment) of a JWT; null when it is not a JSON object. The signature is NOT checked. */
export function jwtClaims(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    return claims as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * True for a token that may be a website session: a readable payload without a client_id claim (whatever its value).
 * Connected AI apps' tokens carry client_id. Supabase still has to accept the token (userIdForToken).
 */
export function isWebsiteToken(jwt: string): boolean {
  const claims = jwtClaims(jwt);
  return claims !== null && !Object.hasOwn(claims, "client_id");
}

/** Pay-link tokens: 32 random bytes in base64url without padding, exactly 43 characters (as isShareToken). */
export function isPayLinkToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function newPayLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Lower-case hex SHA-256 of the UTF-8 text (what pay_links.token_hash stores). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** display_name, else resume.header.fullName, trimmed and non-empty, else null (as parent_view in 0032). */
export function studentName(profile: { display_name: unknown; resume: unknown } | null): string | null {
  const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  if (profile === null) return null;
  const resume = profile.resume;
  const header = resume && typeof resume === "object" ? (resume as Record<string, unknown>).header : undefined;
  const fullName = header && typeof header === "object" ? (header as Record<string, unknown>).fullName : undefined;
  return text(profile.display_name) ?? text(fullName);
}

/** An ECPay notice body as one field per key; null when a key appears twice (we can't tell which one ECPay signed). */
export function parseNoticeForm(body: string): Record<string, string> | null {
  const seen = new Set<string>();
  const entries: Array<[string, string]> = [];
  for (const [key, value] of new URLSearchParams(body)) {
    if (seen.has(key)) return null;
    seen.add(key);
    entries.push([key, value]);
  }
  // fromEntries defines own properties, so even a key named __proto__ stays a plain field.
  return Object.fromEntries(entries);
}

// One short log line: no line breaks, so request text can't forge log lines.
function oneLine(value: unknown): string {
  return String(value).replace(/[\r\n]+/g, " ").slice(0, 120);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ───────────── the handler ─────────────

type Ctx = {
  config: ModeConfig;
  origins: string[];
  backend: PaymentsBackend;
  functionUrl: string;
  log: (msg: string) => void;
  now: () => Date;
};

type Reply = { status: number; body: unknown };

const ok = (body: unknown): Reply => ({ status: 200, body });
const fail = (code: ErrorCode): Reply => ({ status: ERROR_STATUS[code], body: { error: code } });

/** The fetch handler for Deno.serve. Reads the configuration once. */
export function paymentsHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  const config = readModeConfig(deps.env);
  const origins = allowedOrigins(deps.env);
  const ctx: Ctx | null =
    config === null
      ? null
      : { config, origins, backend: deps.backend, functionUrl: deps.functionUrl, log: deps.log, now: deps.now ?? (() => new Date()) };

  return async (req: Request): Promise<Response> => {
    const route = matchRoute(req.method, new URL(req.url).pathname);
    if (route?.name === "notify") {
      if (ctx === null) {
        deps.log(MISCONFIGURED);
        return plainText("0|Server", 500);
      }
      return notify(ctx, req);
    }

    const cors = corsHeaders(req.headers.get("origin"), origins);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let reply: Reply;
    if (ctx === null) {
      deps.log(MISCONFIGURED);
      reply = fail("server");
    } else if (route === null) {
      reply = fail("not_found");
    } else {
      try {
        reply = await dispatch(ctx, req, route);
      } catch (e) {
        ctx.log(`payments ${route.name} failed: ${oneLine(errorText(e))}`);
        reply = fail("server");
      }
    }
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  };
}

function plainText(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

function dispatch(ctx: Ctx, req: Request, route: Route): Promise<Reply> {
  switch (route.name) {
    case "status":
      return status(ctx, req);
    case "checkout":
      return studentCheckout(ctx, req);
    case "createPayLink":
      return createPayLink(ctx, req);
    case "viewPayLink":
      return viewPayLink(ctx, route.token);
    case "payLinkCheckout":
      return payLinkCheckout(ctx, req, route.token);
    case "redeem":
      return redeem(ctx, req);
    case "notify":
      // Answered before dispatch (text/plain, not JSON).
      return Promise.resolve(fail("not_found"));
  }
}

// The signed-in user of a website session token, or null (no token, an AI app's token, or one Supabase rejects).
async function sessionUser(ctx: Ctx, req: Request): Promise<string | null> {
  const jwt = bearerToken(req.headers.get("authorization"));
  if (jwt === null || !isWebsiteToken(jwt)) return null;
  return ctx.backend.userIdForToken(jwt);
}

async function signedInStudent(
  ctx: Ctx,
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; error: "unauthorized" | "not_student" }> {
  const userId = await sessionUser(ctx, req);
  if (userId === null) return { ok: false, error: "unauthorized" };
  if ((await ctx.backend.roleOf(userId)) !== "student") return { ok: false, error: "not_student" };
  return { ok: true, userId };
}

async function isOpen(ctx: Ctx, userId: string | null): Promise<boolean> {
  if (ctx.config.mode === "production") return true;
  return userId !== null && (await ctx.backend.isTester(userId));
}

async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await req.json();
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// A link whose expiry can't be read counts as expired.
function isExpired(link: PayLinkRow, at: Date): boolean {
  const t = Date.parse(link.expires_at);
  return !(t > at.getTime());
}

async function findPayLink(ctx: Ctx, token: string): Promise<PayLinkRow | null> {
  if (!isPayLinkToken(token)) return null;
  return ctx.backend.payLinkByHash(await sha256Hex(token));
}

// Inserts a new order (a new MerchantTradeNo every time) and signs its ECPay checkout form.
async function placeOrder(
  ctx: Ctx,
  o: {
    userId: string;
    entryYear: number;
    payer: "student" | "parent";
    payLinkId: string | null;
    at: Date;
    today: string;
    backUrl: (orderId: string) => string;
  },
): Promise<Reply> {
  const order: NewOrder = {
    user_id: o.userId,
    merchant_trade_no: newMerchantTradeNo(o.at),
    mode: ctx.config.mode,
    entry_year: o.entryYear,
    amount_twd: PASS_PRICE_TWD,
    pass_until: passWindow(o.entryYear, o.today).until,
    payer: o.payer,
    pay_link_id: o.payLinkId,
  };
  const orderId = await ctx.backend.insertOrder(order);
  const { action, fields } = await buildCheckout({
    order,
    config: ctx.config,
    functionUrl: ctx.functionUrl,
    clientBackUrl: o.backUrl(orderId),
    now: o.at,
  });
  return ok({ orderId, action, fields });
}

async function status(ctx: Ctx, req: Request): Promise<Reply> {
  if (ctx.config.mode === "production") return ok({ open: true, mode: ctx.config.mode });
  return ok({ open: await isOpen(ctx, await sessionUser(ctx, req)), mode: ctx.config.mode });
}

async function studentCheckout(ctx: Ctx, req: Request): Promise<Reply> {
  const who = await signedInStudent(ctx, req);
  if (!who.ok) return fail(who.error);
  if (!(await isOpen(ctx, who.userId))) return fail("closed");
  const body = await readJsonObject(req);
  if (body === null) return fail("bad_request");
  const at = ctx.now();
  const today = taipeiToday(at);
  const checked = checkCheckout({
    entryYear: body.entryYear,
    origin: body.origin,
    allowedOrigins: ctx.origins,
    today,
    paidYears: await ctx.backend.paidEntryYears(who.userId),
  });
  if (!checked.ok) return fail(checked.error);
  return placeOrder(ctx, {
    userId: who.userId,
    entryYear: checked.entryYear,
    payer: "student",
    payLinkId: null,
    at,
    today,
    backUrl: (orderId) => `${checked.origin}/pricing?order=${encodeURIComponent(orderId)}`,
  });
}

async function createPayLink(ctx: Ctx, req: Request): Promise<Reply> {
  const who = await signedInStudent(ctx, req);
  if (!who.ok) return fail(who.error);
  if (!(await isOpen(ctx, who.userId))) return fail("closed");
  const body = await readJsonObject(req);
  if (body === null) return fail("bad_request");
  const at = ctx.now();
  const checked = checkCheckout({
    entryYear: body.entryYear,
    origin: body.origin,
    allowedOrigins: ctx.origins,
    today: taipeiToday(at),
    paidYears: await ctx.backend.paidEntryYears(who.userId),
  });
  if (!checked.ok) return fail(checked.error);
  const token = newPayLinkToken();
  const expiresAt = new Date(at.getTime() + PAY_LINK_DAYS * DAY_MS).toISOString();
  await ctx.backend.insertPayLink({
    user_id: who.userId,
    entry_year: checked.entryYear,
    token_hash: await sha256Hex(token),
    expires_at: expiresAt,
  });
  return ok({ url: `${checked.origin}/share/pay/${token}`, expiresAt });
}

async function viewPayLink(ctx: Ctx, token: string): Promise<Reply> {
  const link = await findPayLink(ctx, token);
  if (link === null) return fail("not_found");
  const at = ctx.now();
  const pass = passWindow(link.entry_year, taipeiToday(at));
  const [profile, paid, open] = await Promise.all([
    ctx.backend.profileOf(link.user_id),
    ctx.backend.payLinkPaid(link.id),
    isOpen(ctx, link.user_id),
  ]);
  return ok({
    studentName: studentName(profile),
    entryYear: link.entry_year,
    from: pass.from,
    until: pass.until,
    amountTwd: PASS_PRICE_TWD,
    paid,
    expired: isExpired(link, at),
    open,
  });
}

async function payLinkCheckout(ctx: Ctx, req: Request, token: string): Promise<Reply> {
  const link = await findPayLink(ctx, token);
  if (link === null) return fail("not_found");
  const at = ctx.now();
  if (isExpired(link, at)) return fail("expired");
  if (!(await isOpen(ctx, link.user_id))) return fail("closed");
  const body = await readJsonObject(req);
  if (body === null) return fail("bad_request");
  const today = taipeiToday(at);
  const checked = checkCheckout({
    entryYear: link.entry_year,
    origin: body.origin,
    allowedOrigins: ctx.origins,
    today,
    paidYears: await ctx.backend.paidEntryYears(link.user_id),
  });
  if (!checked.ok) return fail(checked.error);
  return placeOrder(ctx, {
    userId: link.user_id,
    entryYear: checked.entryYear,
    payer: "parent",
    payLinkId: link.id,
    at,
    today,
    backUrl: () => `${checked.origin}/share/pay/${token}`,
  });
}

const REDEEM_ERRORS: Record<Exclude<RedeemResult, "redeemed">, ErrorCode> = {
  invalid: "invalid_code",
  used: "code_used",
  already_paid: "already_paid",
  rate_limited: "rate_limited",
};

// A redeem code for the signed-in student and an entry year on sale today (the year is checked like a checkout's, so a
// code never makes a pass the student could not buy). Not limited to `open`: nothing is paid, ECPay is not involved.
async function redeem(ctx: Ctx, req: Request): Promise<Reply> {
  const who = await signedInStudent(ctx, req);
  if (!who.ok) return fail(who.error);
  const body = await readJsonObject(req);
  if (body === null) return fail("bad_request");
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (code === "" || code.length > MAX_CODE_LENGTH) return fail("bad_request");
  const year = body.entryYear;
  const today = taipeiToday(ctx.now());
  if (typeof year !== "number" || !Number.isInteger(year) || !offeredEntryYears(today).includes(year)) return fail("bad_year");
  if ((await ctx.backend.paidEntryYears(who.userId)).includes(year)) return fail("already_paid");
  const pass = passWindow(year, today);
  const result = await ctx.backend.redeemCoupon({ userId: who.userId, code, entryYear: year, passFrom: pass.from, passUntil: pass.until });
  if (result !== "redeemed") return fail(REDEEM_ERRORS[result]);
  return ok({ entryYear: year, from: pass.from, until: pass.until });
}

// ECPay's server notice. Any answer but "1|OK" makes ECPay send it again later, so a store error answers 500.
// ECPay sends no card data; nothing from the form is logged before handleNotice has checked the signature.
async function notify(ctx: Ctx, req: Request): Promise<Response> {
  try {
    const form = parseNoticeForm(await req.text());
    if (form === null) {
      ctx.log("ecpay notice refused: Fields (a key appears twice)");
      return plainText("0|Fields", 400);
    }
    const result = await handleNotice(form, { store: ctx.backend.store, config: ctx.config, log: ctx.log });
    if (result.status === 200) {
      ctx.log(`ecpay notice answered 1|OK ${oneLine(form.MerchantTradeNo)} RtnCode ${oneLine(form.RtnCode)}`);
    }
    return plainText(result.body, result.status);
  } catch (e) {
    ctx.log(`ecpay notice failed, answered 500 so ECPay retries: ${oneLine(errorText(e))}`);
    return plainText("0|Server", 500);
  }
}
