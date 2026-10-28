import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { encryptToken } from "./google-docs.ts";
import { bearerToken, openPassword, sealPassword, tokenSource, VAULT_VERSION, vaultKey } from "./portal-vault.ts";

const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 9);
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SLOT = "system:commonapp";

// Flips one bit of the sealed bytes at `at` (after the version prefix).
function flip(sealed: string, at: number) {
  const [prefix, body] = [sealed.slice(0, 3), sealed.slice(3)];
  const b = Buffer.from(body, "base64url");
  b[at] ^= 1;
  return prefix + b.toString("base64url");
}

test("a password round-trips, carries the version prefix and is never stored in the clear", () => {
  const sealed = sealPassword(key, USER, SLOT, "hunter2-Pässwörd!");
  assert.ok(sealed.startsWith(`${VAULT_VERSION}.`));
  assert.equal(VAULT_VERSION, "v1");
  assert.ok(!sealed.includes("hunter2"));
  assert.notEqual(sealPassword(key, USER, SLOT, "hunter2-Pässwörd!"), sealed, "fresh IV each time");
  assert.equal(openPassword(key, USER, SLOT, sealed), "hunter2-Pässwörd!");
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
  assert.equal(openPassword(key, USER, SLOT, `v1.${google}`), null);
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

test("the backfill script seals rows the server can open, under the slots the site uses", async () => {
  const url = pathToFileURL(join(import.meta.dirname, "..", "..", "scripts", "backfill-portal-passwords.mjs")).href;
  const { backfillEntries, sealRow } = await import(url);
  const inst = "33333333-3333-4333-8333-333333333333";
  const row = "44444444-4444-4444-8444-444444444444";
  const entries = backfillEntries(
    [
      { id: "55555555-5555-4555-8555-555555555555", user_id: USER, institution_id: inst, custom: null, portal_password: "college-pw" },
      { id: row, user_id: USER, institution_id: null, custom: { name: "My College" }, portal_password: "custom-college-pw" },
      { id: "66666666-6666-4666-8666-666666666666", user_id: OTHER, institution_id: inst, custom: null, portal_password: "" },
    ],
    [{ user_id: OTHER, portals: { systems: { commonapp: { url: "", username: "x", password: "ca-pw" }, uc: { username: "y", password: "" } }, campuses: { "uc:UCLA": { password: "bruin" } }, custom: [{ id: "abc-1", password: "c-pw" }] } }],
  );
  const bySlot = Object.fromEntries(entries.map((e: { userId: string; slot: string; password: string }) => [`${e.userId}|${e.slot}`, e.password]));
  assert.deepEqual(bySlot, {
    [`${USER}|college:${inst}`]: "college-pw",
    [`${USER}|college:${row}`]: "custom-college-pw",
    [`${OTHER}|system:commonapp`]: "ca-pw",
    [`${OTHER}|campus:uc:UCLA`]: "bruin",
    [`${OTHER}|custom:abc-1`]: "c-pw",
  });
  for (const e of entries) {
    const r = sealRow(key, e);
    assert.equal(r.user_id, e.userId);
    assert.equal(r.slot, e.slot);
    assert.ok(!r.sealed.includes(e.password));
    assert.equal(openPassword(key, e.userId, e.slot, r.sealed), e.password);
  }
});
