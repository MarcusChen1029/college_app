import assert from "node:assert/strict";
import { test } from "node:test";

// PAYMENTS_URL is read when the module loads, so the environment is set first and the module loaded after.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key";
const { callPayments, PAYMENTS_URL, PaymentError } = await import("./payments-api.ts");

type Seen = { url: string; init: RequestInit };

function fakeFetch(reply: () => Response | Promise<Response>): { fetchImpl: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    seen.push({ url, init });
    return Promise.resolve(reply());
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const headersOf = (s: Seen) => s.init.headers as Record<string, string>;

test("the payments URL is the function under the Supabase project", () => {
  assert.equal(PAYMENTS_URL, "https://abc.supabase.co/functions/v1/payments");
});

test("a signed-out call sends the publishable key as apikey and no Authorization", async () => {
  const { fetchImpl, seen } = fakeFetch(() => json({ open: true }));
  assert.deepEqual(await callPayments("/status", { token: null }, fetchImpl), { open: true });
  assert.equal(seen[0].url, "https://abc.supabase.co/functions/v1/payments/status");
  assert.equal(seen[0].init.method, "GET");
  assert.equal(headersOf(seen[0]).apikey, "sb_publishable_test_key");
  assert.ok(!("Authorization" in headersOf(seen[0])));
  assert.ok(!("Content-Type" in headersOf(seen[0])));
  assert.equal(seen[0].init.body, undefined);
});

test("a signed-in call sends the session token as the Bearer, never the publishable key", async () => {
  const { fetchImpl, seen } = fakeFetch(() => json({ orderId: "x" }));
  await callPayments("/checkout", { method: "POST", token: "session.jwt.token", body: { entryYear: 2027, origin: "https://app.example" } }, fetchImpl);
  const h = headersOf(seen[0]);
  assert.equal(h.Authorization, "Bearer session.jwt.token");
  assert.equal(h.apikey, "sb_publishable_test_key");
  assert.ok(!h.Authorization.includes("sb_publishable_test_key"));
  assert.equal(h["Content-Type"], "application/json");
  assert.equal(seen[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), { entryYear: 2027, origin: "https://app.example" });
});

test("an error reply becomes a PaymentError with the function's code", async () => {
  for (const [status, code] of [[403, "closed"], [400, "already_paid"], [401, "unauthorized"], [403, "not_student"], [400, "bad_year"], [400, "bad_origin"], [410, "expired"], [404, "not_found"], [500, "server"]] as const) {
    const { fetchImpl } = fakeFetch(() => json({ error: code }, status));
    await assert.rejects(callPayments("/checkout", { method: "POST", body: {} }, fetchImpl), (e: unknown) => e instanceof PaymentError && e.code === code);
  }
});

test("an unreadable error reply is a server error; a failed request is a network error", async () => {
  const html = fakeFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
  await assert.rejects(callPayments("/status", {}, html.fetchImpl), (e: unknown) => e instanceof PaymentError && e.code === "server");

  const unknownCode = fakeFetch(() => json({ error: "teapot" }, 418));
  await assert.rejects(callPayments("/status", {}, unknownCode.fetchImpl), (e: unknown) => e instanceof PaymentError && e.code === "server");

  const offline = (() => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch;
  await assert.rejects(callPayments("/status", {}, offline), (e: unknown) => e instanceof PaymentError && e.code === "network");
});
