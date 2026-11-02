import assert from "node:assert/strict";
import { test } from "node:test";
import { clientKey, makeLimiter } from "./rate-limit.ts";

test("allows up to the limit, then blocks within the window", () => {
  const allow = makeLimiter({ limit: 3, windowMs: 1000 });
  assert.equal(allow("ip", 0), true);
  assert.equal(allow("ip", 1), true);
  assert.equal(allow("ip", 2), true);
  assert.equal(allow("ip", 3), false);
  assert.equal(allow("ip", 999), false);
});

test("a blocked call does not extend the window", () => {
  const allow = makeLimiter({ limit: 1, windowMs: 1000 });
  assert.equal(allow("ip", 0), true);
  for (let t = 1; t < 1000; t += 100) assert.equal(allow("ip", t), false);
  assert.equal(allow("ip", 1000), true);
});

test("resets after the window", () => {
  const allow = makeLimiter({ limit: 3, windowMs: 1000 });
  for (const t of [0, 1, 2]) assert.equal(allow("ip", t), true);
  assert.equal(allow("ip", 3), false);
  assert.equal(allow("ip", 1001), true);
  // A fresh window: the count starts again from this call.
  assert.equal(allow("ip", 1002), true);
  assert.equal(allow("ip", 1003), true);
  assert.equal(allow("ip", 1004), false);
});

test("keys are independent", () => {
  const allow = makeLimiter({ limit: 1, windowMs: 1000 });
  assert.equal(allow("a", 0), true);
  assert.equal(allow("a", 1), false);
  assert.equal(allow("b", 1), true);
  assert.equal(allow("b", 2), false);
  assert.equal(allow("c", 2), true);
});

test("evicts expired keys so memory stays bounded", () => {
  const allow = makeLimiter({ limit: 3, windowMs: 1000 });
  allow("a", 0);
  allow("b", 0);
  allow("c", 0);
  assert.equal(allow.size(), 3);
  // A later window: the old keys are swept, only the live one is left.
  assert.equal(allow("d", 1500), true);
  assert.equal(allow.size(), 1);
});

test("a key still inside its window survives the sweep and keeps its count", () => {
  const allow = makeLimiter({ limit: 2, windowMs: 1000 });
  allow("old", 0);
  allow("live", 900);
  allow("live", 950);
  // t=1100: "old" (started 0) has expired, "live" (started 900) has not.
  assert.equal(allow("other", 1100), true);
  assert.equal(allow.size(), 2);
  assert.equal(allow("live", 1101), false);
});

test("never holds more than maxKeys keys, even inside one window", () => {
  const allow = makeLimiter({ limit: 5, windowMs: 1000, maxKeys: 3 });
  for (const k of ["a", "b", "c", "d", "e"]) assert.equal(allow(k, 10), true);
  assert.equal(allow.size(), 3);
});

test("clientKey is the first x-forwarded-for address, or anon", () => {
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })), "203.0.113.7");
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "  203.0.113.7  ,10.0.0.1" })), "203.0.113.7");
  assert.equal(clientKey(new Headers()), "anon");
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "" })), "anon");
  assert.equal(clientKey(new Headers({ "x-forwarded-for": " , 10.0.0.1" })), "anon");
});

test("clientKey caps the key at 64 characters, so a client cannot make the limiter hold huge keys", () => {
  const long = "a".repeat(5000);
  assert.equal(clientKey(new Headers({ "x-forwarded-for": long })).length, 64);
  assert.equal(clientKey(new Headers({ "x-forwarded-for": `${long}, 10.0.0.1` })), "a".repeat(64));
  // Trimmed first, then cut: leading spaces do not eat into the 64 characters.
  assert.equal(clientKey(new Headers({ "x-forwarded-for": `   ${"b".repeat(100)}` })), "b".repeat(64));
  // A real address is never cut (an IPv6 address is at most 45 characters).
  const v6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
  assert.equal(clientKey(new Headers({ "x-forwarded-for": v6 })), v6);
  const mapped = "0000:0000:0000:0000:0000:ffff:255.255.255.255";
  assert.equal(clientKey(new Headers({ "x-forwarded-for": mapped })), mapped);
});
