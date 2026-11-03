import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AI_CANNOT, AI_TRIAL_WRITES, isAuthorizationId, isKnownAiHost, redirectHost, safeReturnUrl } from "./connect-ai.ts";
import { en } from "./i18n/en.ts";
import { zhTW } from "./i18n/zh-TW.ts";

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

test("the signed-out sign-in text says a free account can read everything and make the trial's changes", () => {
  for (const dict of [en, zhTW]) assert.match(dict["misc.connect.signInBody"], /\{n\}/);
  assert.match(en["misc.connect.signInBody"], /free account can read everything and make \{n\} changes/);
  assert.equal(AI_TRIAL_WRITES, 3);
  const page = readFileSync(new URL("../components/ConnectAi.tsx", import.meta.url), "utf8");
  assert.match(page, /t\("misc\.connect\.signInBody", \{ n: AI_TRIAL_WRITES \}\)/);
});

test("the steps line tells a signed-out visitor to sign in and a signed-in visitor with no address about the pass", () => {
  assert.match(en["misc.connect.stepsNeed"], /once you're signed in/);
  assert.match(en["misc.connect.stepsNeedPass"], /admission-year pass/);
  assert.doesNotMatch(en["misc.connect.stepsNeedPass"], /signed in/);
  assert.match(zhTW["misc.connect.stepsNeedPass"], /入學年度方案/);
  const page = readFileSync(new URL("../components/ConnectAi.tsx", import.meta.url), "utf8");
  assert.match(page, /hasAddress \? t\("misc\.connect\.stepsHave"\) : signedIn \? t\("misc\.connect\.stepsNeedPass"\) : t\("misc\.connect\.stepsNeed"\)/);
  assert.match(page, /<Steps hasAddress=\{hasAddress\} signedIn=\{ready && !!student\.auth\} \/>/);
});

test("what the AI can't do names the weekly summary email and calls the pass a plan, in both languages and in the fallback list", () => {
  assert.equal(en["misc.connect.cannot.3"], "Change your plan, reminder emails or weekly summary email");
  assert.match(zhTW["misc.connect.cannot.3"], /每週摘要/);
  for (const text of [en["misc.connect.cannot.3"], zhTW["misc.connect.cannot.3"], AI_CANNOT[3]]) assert.doesNotMatch(text, /subscription|訂閱/);
  // The English dictionary and the fallback list in connect-ai.ts say the same thing.
  AI_CANNOT.forEach((text, i) => assert.equal(en[`misc.connect.cannot.${i}` as keyof typeof en], text, `cannot.${i}`));
});
