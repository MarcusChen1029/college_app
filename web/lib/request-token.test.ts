import assert from "node:assert/strict";
import { test } from "node:test";
import { bearerToken, tokenSource } from "./request-token.ts";

const USER = "11111111-1111-4111-8111-111111111111";

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
