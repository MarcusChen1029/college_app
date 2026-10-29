import assert from "node:assert/strict";
import { test } from "node:test";
import { contentSecurityPolicy, securityHeaders, shareHeaders } from "./security-headers.ts";

const url = "https://abc.supabase.co";

test("CSP blocks framing, plugins, base-tag hijacks and off-site form posts", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: url, dev: false });
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("base-uri 'self'"));
  assert.ok(csp.includes("form-action 'self'"));
});

test("CSP lets forms post only to this site and ECPay's checkout", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: url, dev: false });
  const directive = csp.split("; ").find((d) => d.startsWith("form-action "));
  assert.equal(directive, "form-action 'self' https://payment-stage.ecpay.com.tw https://payment.ecpay.com.tw");
});

test("CSP lets pages talk only to this site and Supabase", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: url, dev: false });
  assert.ok(csp.includes("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co;"));
});

test("CSP allows eval only in development", () => {
  assert.ok(!contentSecurityPolicy({ supabaseUrl: url, dev: false }).includes("unsafe-eval"));
  assert.ok(contentSecurityPolicy({ supabaseUrl: url, dev: true }).includes("'unsafe-eval'"));
});

test("CSP survives a missing or broken Supabase URL", () => {
  assert.ok(contentSecurityPolicy({ dev: false }).includes("connect-src 'self';"));
  assert.ok(contentSecurityPolicy({ supabaseUrl: "not a url", dev: false }).includes("connect-src 'self';"));
});

test("every page gets the standard hardening headers", () => {
  const keys = securityHeaders({ supabaseUrl: url, dev: false }).map((h) => h.key);
  for (const k of ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"]) {
    assert.ok(keys.includes(k), k);
  }
});

test("share pages never leak their token through Referer or search engines", () => {
  const byKey = Object.fromEntries(shareHeaders.map((h) => [h.key, h.value]));
  assert.equal(byKey["Referrer-Policy"], "no-referrer");
  assert.ok(byKey["X-Robots-Tag"].includes("noindex"));
});
