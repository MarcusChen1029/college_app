import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenSource } from "./request-token.ts";

// The account-deletion and Google Docs routes accept only the website's own session (tokenSource === "website").
const jwt = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

test("only website session tokens may delete an account or link Google", () => {
  assert.equal(tokenSource(jwt({ sub: "u1", role: "authenticated" })), "website");
  assert.equal(tokenSource(jwt({ sub: "u1", role: "authenticated", client_id: "ai-app" })), "ai_client");
  assert.equal(tokenSource(jwt({ sub: "u1", client_id: null })), "ai_client");
  assert.equal(tokenSource("not-a-jwt"), "invalid");
  assert.equal(tokenSource("a.%%%.c"), "invalid");
});
