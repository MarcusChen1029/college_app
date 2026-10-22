import assert from "node:assert/strict";
import { test } from "node:test";
import { docTitle } from "./google-doc-title.ts";
import {
  cleanDocName,
  consentUrl,
  decryptToken,
  docUrl,
  encryptToken,
  hasDriveScope,
  oauthOrigin,
  parseKey,
  pkceChallenge,
  randomToken,
  signState,
  verifyState,
} from "./google-docs.ts";

const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 9);

// Flips one bit of a base64url string's decoded bytes at `at`.
function flip(sealed: string, at: number) {
  const b = Buffer.from(sealed, "base64url");
  b[at] ^= 1;
  return b.toString("base64url");
}

test("the key must be base64 for exactly 32 bytes", () => {
  assert.equal(parseKey(undefined), null);
  assert.equal(parseKey(""), null);
  assert.equal(parseKey(Buffer.alloc(16).toString("base64")), null);
  assert.deepEqual(parseKey(key.toString("base64")), key);
});

test("refresh tokens round-trip and are not stored in the clear", () => {
  const sealed = encryptToken(key, "1//refresh-token", "user-a");
  assert.ok(!sealed.includes("refresh"));
  assert.notEqual(encryptToken(key, "1//refresh-token", "user-a"), sealed, "fresh IV each time");
  assert.equal(decryptToken(key, sealed, "user-a"), "1//refresh-token");
});

test("tampered, wrong-key or wrong-user tokens are rejected", () => {
  const sealed = encryptToken(key, "1//refresh-token", "user-a");
  assert.equal(decryptToken(key, flip(sealed, 0), "user-a"), null, "IV");
  assert.equal(decryptToken(key, flip(sealed, 14), "user-a"), null, "tag");
  assert.equal(decryptToken(key, flip(sealed, 30), "user-a"), null, "ciphertext");
  assert.equal(decryptToken(otherKey, sealed, "user-a"), null);
  assert.equal(decryptToken(key, sealed, "user-b"), null);
  assert.equal(decryptToken(key, "", "user-a"), null);
  assert.equal(decryptToken(key, "not base64 !!", "user-a"), null);
});

test("state verifies, hides the PKCE verifier and expires", () => {
  const now = 1_000_000;
  const s = { userId: "user-a", nonce: "n1", verifier: "v".repeat(43), exp: now + 600_000 };
  const raw = signState(key, s);
  assert.ok(!raw.includes("user-a") && !Buffer.from(raw, "base64url").toString().includes("vvvv"));
  assert.deepEqual(verifyState(key, raw, now), s);
  assert.equal(verifyState(key, raw, now + 600_000), null, "expired");
  assert.equal(verifyState(key, flip(raw, 40), now), null, "tampered");
  assert.equal(verifyState(otherKey, raw, now), null, "other key");
  // A sealed refresh token can't pass as state (separate subkeys).
  assert.equal(verifyState(key, encryptToken(key, JSON.stringify(s), "user-a"), now), null);
});

test("PKCE S256 matches the RFC 7636 example", () => {
  assert.equal(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const v = randomToken();
  assert.equal(v.length, 43);
  assert.match(v, /^[A-Za-z0-9_-]+$/);
});

test("consent URL asks for drive.file only, offline, with PKCE", () => {
  const u = new URL(consentUrl({ clientId: "cid", redirectUri: "https://www.track-ur-college.com/api/google/callback", state: "st", challenge: "ch" }));
  assert.equal(u.origin + u.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  const p = u.searchParams;
  assert.equal(p.get("scope"), "https://www.googleapis.com/auth/drive.file");
  assert.equal(p.get("access_type"), "offline");
  assert.equal(p.get("prompt"), "consent");
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.equal(p.get("code_challenge"), "ch");
  assert.equal(p.get("state"), "st");
  assert.equal(p.get("response_type"), "code");
});

test("only registered origins are used for the redirect URI", () => {
  assert.equal(oauthOrigin("http://localhost:3000/api/google/start"), "http://localhost:3000");
  assert.equal(oauthOrigin("https://www.track-ur-college.com/api/google/start"), "https://www.track-ur-college.com");
  assert.equal(oauthOrigin("https://evil.example/api/google/start"), "https://www.track-ur-college.com");
  assert.equal(oauthOrigin("http://localhost:3001/x"), "https://www.track-ur-college.com");
});

test("granted scope check", () => {
  assert.equal(hasDriveScope("openid https://www.googleapis.com/auth/drive.file"), true);
  assert.equal(hasDriveScope("https://www.googleapis.com/auth/drive.file.x"), false);
  assert.equal(hasDriveScope(undefined), false);
});

test("doc titles and links", () => {
  assert.equal(docTitle({ name: "Brown University", short_name: "Brown" }, "  Why  Brown? ", 0), "Brown_1");
  assert.equal(docTitle({ name: "Rice University", short_name: null }, "", 2), "Rice University_3");
  assert.equal(cleanDocName("  a\nb  "), "a b");
  assert.equal(cleanDocName(42), "Essay");
  assert.equal(cleanDocName("x".repeat(300)).length, 200);
  assert.equal(docUrl({ id: "abc", webViewLink: "https://docs.google.com/document/d/abc/edit?usp=drivesdk" }), "https://docs.google.com/document/d/abc/edit?usp=drivesdk");
  assert.equal(docUrl({ id: "abc" }), "https://docs.google.com/document/d/abc/edit");
  assert.equal(docUrl({ id: "abc", webViewLink: "javascript:alert(1)" }), "https://docs.google.com/document/d/abc/edit");
  assert.equal(docUrl({}), null);
});
