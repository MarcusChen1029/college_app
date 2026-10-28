import assert from "node:assert/strict";
import { test } from "node:test";
import { isAuthorizationId, isKnownAiHost, redirectHost, safeReturnUrl } from "./connect-ai.ts";

test("safeReturnUrl allows https anywhere and http only on this computer", () => {
  assert.equal(safeReturnUrl("https://claude.ai/api/mcp/auth_callback?code=1"), "https://claude.ai/api/mcp/auth_callback?code=1");
  assert.equal(safeReturnUrl("http://localhost:6274/oauth/callback"), "http://localhost:6274/oauth/callback");
  assert.equal(safeReturnUrl("http://127.0.0.1:3000/cb"), "http://127.0.0.1:3000/cb");
  assert.equal(safeReturnUrl("http://evil.example/cb"), null);
});

test("safeReturnUrl refuses script and odd schemes", () => {
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "vbscript:x", "file:///etc/passwd", "myapp://cb", "//evil.example", "", null, undefined]) {
    assert.equal(safeReturnUrl(bad), null, String(bad));
  }
});

test("isKnownAiHost trusts the return host, not the app's name", () => {
  assert.ok(isKnownAiHost("https://claude.ai/api/mcp/auth_callback"));
  assert.ok(isKnownAiHost("https://chatgpt.com/connector_platform_oauth_redirect"));
  assert.ok(isKnownAiHost("https://www.claude.com/cb"));
  assert.ok(!isKnownAiHost("https://claude.ai.evil.example/cb"));
  assert.ok(!isKnownAiHost("https://evilclaude.ai/cb"));
  assert.ok(!isKnownAiHost("http://localhost:6274/cb"));
  assert.ok(!isKnownAiHost("not a url"));
});

test("authorization ids and hosts", () => {
  assert.ok(isAuthorizationId("abcDEF123_-xyz"));
  assert.ok(!isAuthorizationId("../../etc"));
  assert.equal(redirectHost("https://claude.ai/x"), "claude.ai");
  assert.equal(redirectHost("nope"), null);
});
