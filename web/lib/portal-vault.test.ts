import assert from "node:assert/strict";
import { test } from "node:test";
import { encryptToken } from "./google-docs.ts";
import {
  bearerToken,
  keyDecision,
  openPassword,
  sealedKeyId,
  sealedWithKey,
  sealPassword,
  tokenSource,
  VAULT_VERSION,
  vaultKey,
  vaultKeyId,
} from "./portal-vault.ts";

const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 9);
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SLOT = "system:commonapp";

// Flips one bit of the sealed bytes at `at` (after "v1.<key id>.").
function flip(sealed: string, at: number) {
  const cut = sealed.lastIndexOf(".") + 1;
  const b = Buffer.from(sealed.slice(cut), "base64url");
  b[at] ^= 1;
  return sealed.slice(0, cut) + b.toString("base64url");
}

test("a password round-trips, carries the version and key id, and is never stored in the clear", () => {
  const sealed = sealPassword(key, USER, SLOT, "hunter2-Pässwörd!");
  assert.ok(sealed.startsWith(`${VAULT_VERSION}.${vaultKeyId(key)}.`));
  assert.equal(VAULT_VERSION, "v1");
  assert.equal(sealedKeyId(sealed), vaultKeyId(key));
  assert.ok(sealedWithKey(key, sealed) && !sealedWithKey(otherKey, sealed));
  assert.ok(!sealed.includes("hunter2"));
  assert.notEqual(sealPassword(key, USER, SLOT, "hunter2-Pässwörd!"), sealed, "fresh IV each time");
  assert.equal(openPassword(key, USER, SLOT, sealed), "hunter2-Pässwörd!");
});

test("the key id: stable per key, different across keys, 16 url-safe characters, never the key", () => {
  assert.equal(vaultKeyId(key), vaultKeyId(Buffer.alloc(32, 7)));
  assert.notEqual(vaultKeyId(key), vaultKeyId(otherKey));
  assert.match(vaultKeyId(key), /^[A-Za-z0-9_-]{16}$/);
  assert.ok(!vaultKeyId(key).includes(key.toString("base64").slice(0, 8)));
  assert.equal(sealedKeyId("v1.garbage"), null);
  assert.equal(sealedKeyId("v2.abc.def"), null);
});

test("a row naming another key id never opens, even if its body would", () => {
  const sealed = sealPassword(key, USER, SLOT, "s3cret");
  const relabelled = `v1.${vaultKeyId(otherKey)}.${sealed.slice(sealed.lastIndexOf(".") + 1)}`;
  assert.equal(openPassword(key, USER, SLOT, relabelled), null);
  assert.equal(sealedWithKey(key, relabelled), false);
});

test("key decision: only the stored key id may act; only production claims an empty store", () => {
  assert.equal(keyDecision("abc", "abc", false), "ok");
  assert.equal(keyDecision("abc", "xyz", true), "mismatch", "a deployment with another key never acts, even production");
  assert.equal(keyDecision(null, "xyz", true), "claim");
  assert.equal(keyDecision(null, "xyz", false), "unclaimed", "a preview or laptop never claims the store");
});

test("opening fails closed: wrong user, slot or key, tampering, garbage, missing or unknown prefix", () => {
  const sealed = sealPassword(key, USER, SLOT, "s3cret");
  assert.equal(openPassword(key, OTHER, SLOT, sealed), null, "copied onto another user's row");
  assert.equal(openPassword(key, USER, "system:ucas", sealed), null, "moved into another slot");
  assert.equal(openPassword(otherKey, USER, SLOT, sealed), null, "another key");
  assert.equal(openPassword(key, USER, SLOT, flip(sealed, 0)), null, "IV changed");
  assert.equal(openPassword(key, USER, SLOT, flip(sealed, 20)), null, "tag changed");
  assert.equal(openPassword(key, USER, SLOT, flip(sealed, 30)), null, "ciphertext changed");
  assert.equal(openPassword(key, USER, SLOT, sealed.slice(3)), null, "no version prefix");
  assert.equal(openPassword(key, USER, SLOT, `v2.${sealed.slice(3)}`), null, "unknown version");
  assert.equal(openPassword(key, USER, SLOT, "v1.not-a-ciphertext"), null);
  assert.equal(openPassword(key, USER, SLOT, "v1."), null);
  assert.equal(openPassword(key, USER, SLOT, ""), null);
});

test("its own key derivation: a Google refresh token sealed under the same master key doesn't open as a password", () => {
  const google = encryptToken(key, "1//refresh", USER);
  assert.equal(openPassword(key, USER, SLOT, `v1.${vaultKeyId(key)}.${google}`), null);
});

test("master key: PORTAL_ENCRYPTION_KEY first, else GOOGLE_TOKEN_ENCRYPTION_KEY; a bad dedicated key never falls back", () => {
  const a = key.toString("base64");
  const b = otherKey.toString("base64");
  assert.deepEqual(vaultKey({ GOOGLE_TOKEN_ENCRYPTION_KEY: a }), key);
  assert.deepEqual(vaultKey({ PORTAL_ENCRYPTION_KEY: b, GOOGLE_TOKEN_ENCRYPTION_KEY: a }), otherKey);
  assert.deepEqual(vaultKey({ PORTAL_ENCRYPTION_KEY: "  ", GOOGLE_TOKEN_ENCRYPTION_KEY: a }), key, "blank counts as unset");
  assert.equal(vaultKey({ PORTAL_ENCRYPTION_KEY: "short", GOOGLE_TOKEN_ENCRYPTION_KEY: a }), null);
  assert.equal(vaultKey({ GOOGLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }), null);
  assert.equal(vaultKey({}), null);
});

const jwt = (claims: unknown) => `${Buffer.from('{"alg":"ES256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

test("tokens issued to an AI connection (they carry client_id) are told apart from website session tokens", () => {
  assert.equal(tokenSource(jwt({ sub: USER, role: "authenticated", session_id: "s" })), "website");
  assert.equal(tokenSource(jwt({ sub: USER, role: "authenticated", client_id: "claude-ai" })), "ai_client");
  // Whatever the value: present at all means an OAuth client.
  assert.equal(tokenSource(jwt({ sub: USER, client_id: "" })), "ai_client");
  assert.equal(tokenSource(jwt({ sub: USER, client_id: null })), "ai_client");
  assert.equal(tokenSource("not-a-jwt"), "invalid");
  assert.equal(tokenSource("a..c"), "invalid");
  assert.equal(tokenSource(`a.${Buffer.from("[1,2]").toString("base64url")}.c`), "invalid");
  assert.equal(tokenSource(`a.${Buffer.from("not json").toString("base64url")}.c`), "invalid");
});

test("bearer header parsing", () => {
  assert.equal(bearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(bearerToken("bearer  abc"), "abc");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken("Bearer a b"), null);
  assert.equal(bearerToken(null), null);
});
