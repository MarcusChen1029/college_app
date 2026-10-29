import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMacValue, ECPAY_PRODUCTION_URL, ECPAY_STAGE, verifyCheckMac } from "../../supabase/functions/_shared/ecpay.ts";
import { DEFAULT_ORIGINS } from "../../supabase/functions/_shared/payments-core.ts";
import type { OrderRow } from "../../supabase/functions/_shared/payments-core.ts";
import {
  allowedOrigins,
  bearerToken,
  isPayLinkToken,
  isWebsiteToken,
  jwtClaims,
  matchRoute,
  newPayLinkToken,
  parseNoticeForm,
  paymentsHandler,
  readModeConfig,
  sha256Hex,
  studentName,
} from "../../supabase/functions/_shared/payments-http.ts";
import type { NewOrder, NewPayLink, PaymentsBackend } from "../../supabase/functions/_shared/payments-http.ts";

// 2026-10-29 12:00 in Taipei: the cycle for Fall 2027 entry, so 2027, 2028 and 2029 are on sale.
const NOW = new Date("2026-10-29T04:00:00Z");
const FN_URL = "https://ref.supabase.co/functions/v1/payments";
const ORIGIN = DEFAULT_ORIGINS[0];
const STAGE_KEYS = { merchantId: ECPAY_STAGE.merchantId, hashKey: ECPAY_STAGE.hashKey, hashIv: ECPAY_STAGE.hashIv };
const PRODUCTION_ENV = {
  ECPAY_MODE: "production",
  ECPAY_MERCHANT_ID: "2000132",
  ECPAY_HASH_KEY: "prodHashKey12345",
  ECPAY_HASH_IV: "prodHashIv123456",
};

const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const STUDENT = jwt({ sub: "student-1", role: "authenticated" });
const TESTER = jwt({ sub: "tester-1", role: "authenticated" });
const TEACHER = jwt({ sub: "teacher-1", role: "authenticated" });
const NO_ROLE = jwt({ sub: "new-1", role: "authenticated" });
const AI_APP = jwt({ sub: "tester-1", role: "authenticated", client_id: "ai-app" });
const UNKNOWN = jwt({ sub: "gone-1", role: "authenticated" });

type StoredOrder = NewOrder & { id: string; status: OrderRow["status"] };
type StoredLink = NewPayLink & { id: string };

// In-memory database. `failOn` makes that method throw (with a detail that must never reach a response).
function fakeBackend(failOn?: string) {
  const calls: string[] = [];
  const sessions = new Map([[STUDENT, "student-1"], [TESTER, "tester-1"], [TEACHER, "teacher-1"], [NO_ROLE, "new-1"], [AI_APP, "tester-1"]]);
  const roles = new Map([["student-1", "student"], ["tester-1", "student"], ["teacher-1", "teacher"]]);
  const testers = new Set(["tester-1"]);
  const orders: StoredOrder[] = [];
  const links: StoredLink[] = [];
  const profiles = new Map<string, { display_name: unknown; resume: unknown }>();
  const hit = (name: string) => {
    calls.push(name);
    if (failOn === name) throw new Error(`${name} failed: secret-detail`);
  };
  const backend: PaymentsBackend = {
    async userIdForToken(t) {
      hit("userIdForToken");
      return sessions.get(t) ?? null;
    },
    async roleOf(id) {
      hit("roleOf");
      return roles.get(id) ?? null;
    },
    async isTester(id) {
      hit("isTester");
      return testers.has(id);
    },
    async paidEntryYears(id) {
      hit("paidEntryYears");
      return orders.filter((o) => o.user_id === id && o.status === "paid").map((o) => o.entry_year);
    },
    async insertOrder(o) {
      hit("insertOrder");
      const id = `order-${orders.length + 1}`;
      orders.push({ ...o, id, status: "pending" });
      return id;
    },
    async insertPayLink(l) {
      hit("insertPayLink");
      links.push({ ...l, id: `link-${links.length + 1}` });
    },
    async payLinkByHash(h) {
      hit("payLinkByHash");
      const l = links.find((x) => x.token_hash === h);
      return l ? { id: l.id, user_id: l.user_id, entry_year: l.entry_year, expires_at: l.expires_at } : null;
    },
    async profileOf(id) {
      hit("profileOf");
      return profiles.get(id) ?? null;
    },
    async payLinkPaid(linkId) {
      hit("payLinkPaid");
      return orders.some((o) => o.pay_link_id === linkId && o.status === "paid");
    },
    store: {
      async orderByTradeNo(no) {
        hit("orderByTradeNo");
        const o = orders.find((x) => x.merchant_trade_no === no);
        if (!o) return null;
        const { id, user_id, merchant_trade_no, mode, entry_year, amount_twd, status, pay_link_id } = o;
        return { id, user_id, merchant_trade_no, mode, entry_year, amount_twd, status, pay_link_id };
      },
      async applyPaid(a) {
        hit("applyPaid");
        const o = orders.find((x) => x.merchant_trade_no === a.merchantTradeNo);
        if (!o) return "not_found";
        if (o.status === "paid") return "already_paid";
        o.status = "paid";
        return "applied";
      },
      async setPaymentInfo() {
        hit("setPaymentInfo");
      },
      async markSimulated() {
        hit("markSimulated");
      },
    },
  };
  return { backend, calls, orders, links, profiles };
}

function setup(env: Record<string, string> = {}, failOn?: string) {
  const fake = fakeBackend(failOn);
  const logs: string[] = [];
  const handle = paymentsHandler({
    env: (name) => env[name],
    backend: fake.backend,
    functionUrl: FN_URL,
    log: (m) => logs.push(m),
    now: () => NOW,
  });
  // Stores a pay link with a known token (as POST /pay-links would) and returns the token. The default expiry is in
  // the format PostgREST returns timestamptz in (microseconds, +00:00).
  async function addLink(userId: string, entryYear: number, expiresAt = "2026-11-05T04:00:00.123456+00:00") {
    const token = newPayLinkToken();
    fake.links.push({ id: `link-${fake.links.length + 1}`, user_id: userId, entry_year: entryYear, token_hash: await sha256Hex(token), expires_at: expiresAt });
    return token;
  }
  return { ...fake, logs, handle, addLink };
}

function req(method: string, path: string, o: { token?: string; origin?: string; json?: unknown; raw?: string; form?: string } = {}) {
  const headers: Record<string, string> = {};
  if (o.token !== undefined) headers.authorization = `Bearer ${o.token}`;
  if (o.origin !== undefined) headers.origin = o.origin;
  let body: string | undefined;
  if (o.json !== undefined) body = JSON.stringify(o.json);
  if (o.raw !== undefined) body = o.raw;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (o.form !== undefined) {
    body = o.form;
    headers["content-type"] = "application/x-www-form-urlencoded";
  }
  return new Request(`https://ref.supabase.co${path}`, { method, headers, body });
}

async function json(res: Response) {
  return JSON.parse(await res.text());
}

const paid = (fake: { orders: StoredOrder[] }, userId: string, entryYear: number) =>
  fake.orders.push({
    id: `paid-${fake.orders.length + 1}`,
    user_id: userId,
    merchant_trade_no: `GF${fake.orders.length}`,
    mode: "production",
    entry_year: entryYear,
    amount_twd: 0,
    pass_until: `${entryYear}-07-31`,
    payer: "student",
    pay_link_id: null,
    status: "paid",
  });

// A signed stage "paid" notice for one order, form-encoded the way ECPay posts it.
async function paidNotice(tradeNo: string, over: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    MerchantID: ECPAY_STAGE.merchantId,
    MerchantTradeNo: tradeNo,
    RtnCode: "1",
    RtnMsg: "Succeeded",
    TradeNo: "2610291200001234",
    TradeAmt: "990",
    PaymentDate: "2026/10/29 12:05:00",
    PaymentType: "Credit_CreditCard",
    TradeDate: "2026/10/29 12:00:00",
    SimulatePaid: "0",
    ...over,
  };
  return new URLSearchParams({ ...fields, CheckMacValue: await checkMacValue(fields, STAGE_KEYS) }).toString();
}

// ───────────── configuration and pure helpers ─────────────

test("mode config: production needs all three secrets and never falls back to the stage keys", () => {
  const prod = readModeConfig((n) => (PRODUCTION_ENV as Record<string, string>)[n]);
  assert.deepEqual(prod, {
    mode: "production",
    keys: { merchantId: "2000132", hashKey: "prodHashKey12345", hashIv: "prodHashIv123456" },
    checkoutUrl: ECPAY_PRODUCTION_URL,
  });
  for (const missing of ["ECPAY_MERCHANT_ID", "ECPAY_HASH_KEY", "ECPAY_HASH_IV"]) {
    const env: Record<string, string> = { ...PRODUCTION_ENV, [missing]: " " };
    assert.equal(readModeConfig((n) => env[n]), null, missing);
  }
  const stage = { mode: "stage", keys: STAGE_KEYS, checkoutUrl: ECPAY_STAGE.checkoutUrl };
  for (const mode of [undefined, "", "stage", "Production", "live"]) {
    assert.deepEqual(readModeConfig((n) => (n === "ECPAY_MODE" ? mode : undefined)), stage, String(mode));
  }
});

test("allowed origins: APP_ORIGINS list trimmed, else the defaults", () => {
  const env = (v: string | undefined) => (n: string) => (n === "APP_ORIGINS" ? v : undefined);
  assert.deepEqual(allowedOrigins(env(" https://a.test/ , ,https://b.test")), ["https://a.test", "https://b.test"]);
  assert.deepEqual(allowedOrigins(env(undefined)), [...DEFAULT_ORIGINS]);
  assert.deepEqual(allowedOrigins(env(" , ")), [...DEFAULT_ORIGINS]);
});

test("routes: methods, tokens and the optional /functions/v1/payments prefix", () => {
  for (const prefix of ["", "/payments", "/functions/v1/payments"]) {
    assert.deepEqual(matchRoute("GET", `${prefix}/status`), { name: "status" }, prefix);
    assert.deepEqual(matchRoute("POST", `${prefix}/checkout`), { name: "checkout" });
    assert.deepEqual(matchRoute("POST", `${prefix}/pay-links`), { name: "createPayLink" });
    assert.deepEqual(matchRoute("GET", `${prefix}/pay-links/abc`), { name: "viewPayLink", token: "abc" });
    assert.deepEqual(matchRoute("POST", `${prefix}/pay-links/abc/checkout`), { name: "payLinkCheckout", token: "abc" });
    assert.deepEqual(matchRoute("POST", `${prefix}/notify`), { name: "notify" });
  }
  for (const [method, path] of [
    ["POST", "/payments/status"],
    ["GET", "/payments/checkout"],
    ["GET", "/payments/notify"],
    ["GET", "/payments/pay-links"],
    ["POST", "/payments/pay-links/abc"],
    ["GET", "/payments/pay-links/abc/checkout"],
    ["POST", "/payments/pay-links/abc/other"],
    ["POST", "/payments/pay-links/abc/checkout/x"],
    ["GET", "/payments"],
    ["GET", "/payments/other"],
  ]) {
    assert.equal(matchRoute(method, path), null, `${method} ${path}`);
  }
});

test("tokens: AI-app tokens (client_id, whatever its value) and unreadable ones are not website sessions", () => {
  assert.equal(isWebsiteToken(STUDENT), true);
  assert.equal(isWebsiteToken(AI_APP), false);
  assert.equal(isWebsiteToken(jwt({ sub: "u", client_id: null })), false);
  assert.equal(isWebsiteToken("not-a-jwt"), false);
  assert.equal(isWebsiteToken("a.%%%.c"), false);
  assert.equal(isWebsiteToken(`h.${Buffer.from("[1]").toString("base64url")}.s`), false);
  // UTF-8 claims (names) decode, at every padding length.
  for (const name of ["陳", "陳小", "陳小明"]) assert.equal(jwtClaims(jwt({ sub: "u", name }))?.name, name);
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken("bearer x"), "x");
  assert.equal(bearerToken("Basic x"), null);
  assert.equal(bearerToken("Bearer"), null);
  assert.equal(bearerToken(null), null);
});

test("pay-link tokens: 43 base64url characters, hashed as lower-case SHA-256 hex", async () => {
  const a = newPayLinkToken();
  assert.equal(a.length, 43);
  assert.ok(isPayLinkToken(a));
  assert.notEqual(newPayLinkToken(), a);
  assert.equal(isPayLinkToken(a.slice(1)), false);
  assert.equal(isPayLinkToken(`${a.slice(1)}=`), false);
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("student name: display name, else the résumé name, trimmed; blank is null", () => {
  assert.equal(studentName({ display_name: "  Amy Chen ", resume: { header: { fullName: "Other" } } }), "Amy Chen");
  assert.equal(studentName({ display_name: "  ", resume: { header: { fullName: " Bo Lin " } } }), "Bo Lin");
  assert.equal(studentName({ display_name: null, resume: {} }), null);
  assert.equal(studentName({ display_name: null, resume: null }), null);
  assert.equal(studentName(null), null);
});

test("notice form: one field per key, decoded; a repeated key is refused", () => {
  assert.deepEqual(parseNoticeForm("a=1&b=x+y%26z"), { a: "1", b: "x y&z" });
  assert.equal(parseNoticeForm("MerchantID=1&MerchantID=2"), null);
  assert.deepEqual(parseNoticeForm(""), {});
  const proto = parseNoticeForm("__proto__=x");
  assert.deepEqual(Object.keys(proto ?? {}), ["__proto__"]);
});

// ───────────── the handler ─────────────

test("misconfigured production: every request 500, nothing read", async () => {
  const s = setup({ ECPAY_MODE: "production", ECPAY_MERCHANT_ID: "2000132" });
  const res = await s.handle(req("GET", "/payments/status", { origin: ORIGIN }));
  assert.equal(res.status, 500);
  assert.deepEqual(await json(res), { error: "server" });
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  const notice = await s.handle(req("POST", "/payments/notify", { form: "a=1" }));
  assert.equal(notice.status, 500);
  assert.equal(await notice.text(), "0|Server");
  assert.deepEqual(s.calls, []);
  assert.ok(s.logs.some((l) => l.startsWith("payments misconfigured")));
});

test("CORS: preflight and responses carry the origin only when it is allowed", async () => {
  const s = setup();
  const pre = await s.handle(req("OPTIONS", "/payments/checkout", { origin: ORIGIN }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(pre.headers.get("access-control-allow-headers"), "authorization, content-type, apikey, x-client-info");
  assert.equal(pre.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal(pre.headers.get("vary"), "Origin");
  const evil = await s.handle(req("OPTIONS", "/payments/checkout", { origin: "https://evil.example" }));
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  const status = await s.handle(req("GET", "/payments/status", { origin: ORIGIN }));
  assert.equal(status.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match(status.headers.get("content-type") ?? "", /^application\/json/);
  // APP_ORIGINS replaces the defaults.
  const custom = setup({ APP_ORIGINS: "https://preview.test" });
  const res = await custom.handle(req("GET", "/payments/status", { origin: ORIGIN }));
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("unknown route or method: 404 not_found", async () => {
  const s = setup();
  for (const r of [req("GET", "/payments/checkout"), req("GET", "/payments/nope"), req("POST", "/payments/status")]) {
    const res = await s.handle(r);
    assert.equal(res.status, 404);
    assert.deepEqual(await json(res), { error: "not_found" });
  }
});

test("status: stage is open only for a payment tester's website session; production for everyone", async () => {
  const s = setup();
  const open = async (token?: string) => json(await s.handle(req("GET", "/functions/v1/payments/status", { token })));
  assert.deepEqual(await open(), { open: false, mode: "stage" });
  assert.deepEqual(await open(STUDENT), { open: false, mode: "stage" });
  assert.deepEqual(await open("garbage"), { open: false, mode: "stage" });
  assert.deepEqual(await open(TESTER), { open: true, mode: "stage" });
  s.calls.length = 0;
  assert.deepEqual(await open(AI_APP), { open: false, mode: "stage" });
  assert.deepEqual(s.calls, [], "an AI app's token is refused before Supabase is asked");

  const p = setup(PRODUCTION_ENV);
  assert.deepEqual(await json(await p.handle(req("GET", "/payments/status"))), { open: true, mode: "production" });
  assert.deepEqual(p.calls, []);
});

test("checkout: sign-in, role and open checks, in that order", async () => {
  const s = setup();
  const body = { entryYear: 2027, origin: ORIGIN };
  const cases: Array<[string | undefined, number, string]> = [
    [undefined, 401, "unauthorized"],
    [AI_APP, 401, "unauthorized"],
    [UNKNOWN, 401, "unauthorized"],
    [TEACHER, 403, "not_student"],
    [NO_ROLE, 403, "not_student"],
    [STUDENT, 403, "closed"],
  ];
  for (const [token, code, error] of cases) {
    const res = await s.handle(req("POST", "/payments/checkout", { token, json: body }));
    assert.equal(res.status, code, error);
    assert.deepEqual(await json(res), { error });
  }
  assert.equal(s.orders.length, 0);
});

test("checkout: body, year, origin and already-paid checks", async () => {
  const s = setup();
  paid(s, "tester-1", 2029);
  const cases: Array<[{ json?: unknown; raw?: string }, string]> = [
    [{ raw: "not json" }, "bad_request"],
    [{ json: [2027] }, "bad_request"],
    [{}, "bad_request"],
    [{ json: { entryYear: 2026, origin: ORIGIN } }, "bad_year"],
    [{ json: { entryYear: "2027", origin: ORIGIN } }, "bad_year"],
    [{ json: { entryYear: 2027, origin: "https://evil.example" } }, "bad_origin"],
    [{ json: { entryYear: 2027, origin: `${ORIGIN}/` } }, "bad_origin"],
    [{ json: { entryYear: 2029, origin: ORIGIN } }, "already_paid"],
  ];
  for (const [b, error] of cases) {
    const res = await s.handle(req("POST", "/payments/checkout", { token: TESTER, ...b }));
    assert.equal(res.status, 400, error);
    assert.deepEqual(await json(res), { error });
  }
  assert.equal(s.calls.includes("insertOrder"), false);
});

test("checkout: a new stage order per click and a signed form back to /pricing", async () => {
  const s = setup();
  const res = await s.handle(req("POST", "/payments/checkout", { token: TESTER, origin: ORIGIN, json: { entryYear: 2027, origin: ORIGIN } }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  const out = await json(res);
  assert.equal(s.orders.length, 1);
  const { merchant_trade_no, ...order } = s.orders[0];
  assert.match(merchant_trade_no, /^TK261029120000[0-9a-z]{6}$/);
  assert.deepEqual(order, {
    user_id: "tester-1",
    mode: "stage",
    entry_year: 2027,
    amount_twd: 990,
    pass_until: "2027-07-31",
    payer: "student",
    pay_link_id: null,
    id: "order-1",
    status: "pending",
  });
  assert.equal(out.orderId, "order-1");
  assert.equal(out.action, ECPAY_STAGE.checkoutUrl);
  assert.equal(out.fields.MerchantID, ECPAY_STAGE.merchantId);
  assert.equal(out.fields.MerchantTradeNo, merchant_trade_no);
  assert.equal(out.fields.TotalAmount, "990");
  assert.equal(out.fields.ReturnURL, `${FN_URL}/notify`);
  assert.equal(out.fields.PaymentInfoURL, `${FN_URL}/notify`);
  assert.equal(out.fields.ClientBackURL, `${ORIGIN}/pricing?order=order-1`);
  assert.ok(await verifyCheckMac(out.fields, STAGE_KEYS));

  // A second click: another order with another trade number (ECPay never takes one twice).
  await s.handle(req("POST", "/payments/checkout", { token: TESTER, json: { entryYear: 2027, origin: ORIGIN } }));
  assert.equal(s.orders.length, 2);
  assert.notEqual(s.orders[1].merchant_trade_no, merchant_trade_no);
});

test("checkout in production: any student, production URL and mode", async () => {
  const s = setup(PRODUCTION_ENV);
  const res = await s.handle(req("POST", "/payments/checkout", { token: STUDENT, json: { entryYear: 2028, origin: ORIGIN } }));
  assert.equal(res.status, 200);
  const out = await json(res);
  assert.equal(out.action, ECPAY_PRODUCTION_URL);
  assert.equal(out.fields.MerchantID, "2000132");
  assert.equal(s.orders[0].mode, "production");
  assert.equal(s.orders[0].pass_until, "2028-07-31");
  assert.equal(s.calls.includes("isTester"), false);
});

test("pay link: created for the student, 7 days, only the token's hash stored", async () => {
  const s = setup();
  const res = await s.handle(req("POST", "/payments/pay-links", { token: TESTER, json: { entryYear: 2028, origin: ORIGIN } }));
  assert.equal(res.status, 200);
  const out = await json(res);
  const m = new RegExp(`^${ORIGIN}/share/pay/([A-Za-z0-9_-]{43})$`).exec(out.url);
  assert.ok(m, out.url);
  assert.equal(out.expiresAt, "2026-11-05T04:00:00.000Z");
  assert.deepEqual(s.links, [
    { user_id: "tester-1", entry_year: 2028, token_hash: await sha256Hex(m[1]), expires_at: out.expiresAt, id: "link-1" },
  ]);
  for (const [token, code, error] of [[undefined, 401, "unauthorized"], [STUDENT, 403, "closed"], [TEACHER, 403, "not_student"]] as const) {
    const r = await s.handle(req("POST", "/payments/pay-links", { token, json: { entryYear: 2028, origin: ORIGIN } }));
    assert.equal(r.status, code);
    assert.deepEqual(await json(r), { error });
  }
  paid(s, "tester-1", 2027);
  const dup = await s.handle(req("POST", "/payments/pay-links", { token: TESTER, json: { entryYear: 2027, origin: ORIGIN } }));
  assert.deepEqual(await json(dup), { error: "already_paid" });
  assert.equal(s.links.length, 1);
});

test("pay link view: what the parent buys, for whom, and whether it is open", async () => {
  const s = setup();
  s.profiles.set("tester-1", { display_name: " Amy Chen ", resume: null });
  const token = await s.addLink("tester-1", 2028);
  const res = await s.handle(req("GET", `/payments/pay-links/${token}`));
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), {
    studentName: "Amy Chen",
    entryYear: 2028,
    from: "2027-01-01",
    until: "2028-07-31",
    amountTwd: 990,
    paid: false,
    expired: false,
    open: true,
  });
  // The link's student decides `open` in stage; no profile means no name.
  const other = await s.addLink("student-1", 2027);
  const view = await json(await s.handle(req("GET", `/payments/pay-links/${other}`)));
  assert.equal(view.open, false);
  assert.equal(view.studentName, null);
  assert.equal(view.from, "2026-10-29");
  // Expired exactly now.
  const old = await s.addLink("tester-1", 2027, NOW.toISOString());
  assert.equal((await json(await s.handle(req("GET", `/payments/pay-links/${old}`)))).expired, true);
});

test("pay link view: malformed or unknown tokens are 404 (malformed ones are never looked up)", async () => {
  const s = setup();
  const short = await s.handle(req("GET", "/payments/pay-links/abc"));
  assert.equal(short.status, 404);
  assert.deepEqual(await json(short), { error: "not_found" });
  assert.equal(s.calls.includes("payLinkByHash"), false);
  const unknown = await s.handle(req("GET", `/payments/pay-links/${newPayLinkToken()}`));
  assert.equal(unknown.status, 404);
});

test("pay link checkout: expired 410, closed 403, origin and already-paid 400", async () => {
  const s = setup();
  const cases: Array<[string, number, string]> = [
    [await s.addLink("tester-1", 2027, "2026-10-29T03:59:59+00:00"), 410, "expired"],
    [await s.addLink("tester-1", 2027, "not a date"), 410, "expired"],
    [await s.addLink("student-1", 2027), 403, "closed"],
    [newPayLinkToken(), 404, "not_found"],
  ];
  for (const [token, code, error] of cases) {
    const res = await s.handle(req("POST", `/payments/pay-links/${token}/checkout`, { json: { origin: ORIGIN } }));
    assert.equal(res.status, code, error);
    assert.deepEqual(await json(res), { error });
  }
  const live = await s.addLink("tester-1", 2027);
  const bad = await s.handle(req("POST", `/payments/pay-links/${live}/checkout`, { json: { origin: "https://evil.example" } }));
  assert.deepEqual(await json(bad), { error: "bad_origin" });
  const empty = await s.handle(req("POST", `/payments/pay-links/${live}/checkout`, { raw: "" }));
  assert.deepEqual(await json(empty), { error: "bad_request" });
  paid(s, "tester-1", 2027);
  const dup = await s.handle(req("POST", `/payments/pay-links/${live}/checkout`, { json: { origin: ORIGIN } }));
  assert.deepEqual(await json(dup), { error: "already_paid" });
  assert.equal(s.calls.includes("insertOrder"), false);
});

test("pay link checkout, then ECPay's paid notice: the parent's order upgrades the student and the link shows paid", async () => {
  const s = setup();
  const token = await s.addLink("tester-1", 2028);
  const res = await s.handle(req("POST", `/payments/pay-links/${token}/checkout`, { origin: ORIGIN, json: { origin: ORIGIN } }));
  assert.equal(res.status, 200);
  const out = await json(res);
  const order = s.orders[0];
  assert.equal(out.orderId, order.id);
  assert.equal(order.user_id, "tester-1");
  assert.equal(order.payer, "parent");
  assert.equal(order.pay_link_id, "link-1");
  assert.equal(order.entry_year, 2028);
  assert.equal(order.pass_until, "2028-07-31");
  assert.equal(out.fields.ClientBackURL, `${ORIGIN}/share/pay/${token}`);
  assert.ok(await verifyCheckMac(out.fields, STAGE_KEYS));

  const notice = await s.handle(req("POST", "/payments/notify", { form: await paidNotice(order.merchant_trade_no) }));
  assert.equal(notice.status, 200);
  assert.equal(await notice.text(), "1|OK");
  assert.match(notice.headers.get("content-type") ?? "", /^text\/plain/);
  assert.equal(notice.headers.get("access-control-allow-origin"), null);
  assert.equal(order.status, "paid");
  assert.ok(s.logs.some((l) => l.includes(order.merchant_trade_no)));
  assert.equal((await json(await s.handle(req("GET", `/payments/pay-links/${token}`)))).paid, true);
});

test("notify: a repeated key or a bad signature is 400 and writes nothing", async () => {
  const s = setup();
  await s.handle(req("POST", "/payments/checkout", { token: TESTER, json: { entryYear: 2027, origin: ORIGIN } }));
  const tradeNo = s.orders[0].merchant_trade_no;
  const twice = await s.handle(req("POST", "/payments/notify", { form: `${await paidNotice(tradeNo)}&RtnCode=1` }));
  assert.equal(twice.status, 400);
  assert.equal(await twice.text(), "0|Fields");
  const forged = (await paidNotice(tradeNo)).replace(/CheckMacValue=[0-9A-F]+/, `CheckMacValue=${"0".repeat(64)}`);
  const bad = await s.handle(req("POST", "/payments/notify", { form: forged }));
  assert.equal(bad.status, 400);
  assert.equal(await bad.text(), "0|CheckMacValue");
  assert.equal(s.orders[0].status, "pending");
  assert.equal(s.calls.includes("applyPaid"), false);
});

test("store errors: notify answers 500 (ECPay retries), JSON routes { error: server }, no detail leaks", async () => {
  const s = setup({}, "orderByTradeNo");
  const notice = await s.handle(req("POST", "/payments/notify", { form: await paidNotice("TK261029120000abcdef") }));
  assert.equal(notice.status, 500);
  assert.equal(await notice.text(), "0|Server");
  assert.ok(s.logs.some((l) => l.includes("secret-detail")), "the detail goes to the log");

  const j = setup({}, "paidEntryYears");
  const res = await j.handle(req("POST", "/payments/checkout", { token: TESTER, json: { entryYear: 2027, origin: ORIGIN } }));
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.equal(text, '{"error":"server"}');
});
