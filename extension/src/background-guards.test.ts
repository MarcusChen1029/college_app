import assert from "node:assert/strict";
import { test } from "node:test";
import { createPanelListener, isOwnPageSender, restrictStorageToTrustedContexts, type MessageSender } from "./background-guards.ts";
import type { PanelRequest, PanelResponse } from "./messages.ts";

const ID = "omnpdpbgbbdbnnaimhppoclimbeeognl";
const BASE = `chrome-extension://${ID}/`;

const panel: MessageSender = { id: ID, url: `${BASE}panel.html` };
const contentScript: MessageSender = { id: ID, url: "https://apply.commonapp.org/common/13/55", tab: { id: 3 } };

test("isOwnPageSender: only the extension's own page (the side panel) passes", () => {
  assert.equal(isOwnPageSender(panel, ID, BASE), true);
  // A content script has the extension's id too, but it sits in a tab and reports the portal's URL.
  assert.equal(isOwnPageSender(contentScript, ID, BASE), false);
  // Even an extension-looking URL is refused when the sender is in a tab.
  assert.equal(isOwnPageSender({ id: ID, url: `${BASE}panel.html`, tab: { id: 1 } }, ID, BASE), false);
  // Another extension, a missing url, a missing sender.
  assert.equal(isOwnPageSender({ id: "otherextensionidotherextensionid", url: "chrome-extension://otherextensionidotherextensionid/panel.html" }, ID, BASE), false);
  assert.equal(isOwnPageSender({ id: ID }, ID, BASE), false);
  assert.equal(isOwnPageSender({ url: `${BASE}panel.html` }, ID, BASE), false);
  assert.equal(isOwnPageSender(undefined, ID, BASE), false);
  assert.equal(isOwnPageSender(null, ID, BASE), false);
});

test("isOwnPageSender: look-alike addresses do not pass", () => {
  assert.equal(isOwnPageSender({ id: ID, url: `https://evil.example/${BASE}panel.html` }, ID, BASE), false);
  assert.equal(isOwnPageSender({ id: ID, url: `chrome-extension://${ID}x/panel.html` }, ID, BASE), false);
  assert.equal(isOwnPageSender({ id: ID, url: `chrome-extension://${ID.slice(0, -1)}/panel.html` }, ID, BASE), false);
  assert.equal(isOwnPageSender({ id: ID, url: `chrome-extension://${ID}` }, ID, BASE), false);
});

function listener() {
  const handled: PanelRequest[] = [];
  const handle = async (msg: PanelRequest): Promise<PanelResponse> => {
    handled.push(msg);
    if (msg.type === "loadTranscript") return { type: "loadTranscript", result: { ok: false, reason: "signed_out" } };
    if (msg.type === "loadActivities") return { type: "loadActivities", result: { ok: false, reason: "signed_out" } };
    if (msg.type === "signOut") return { type: "signOut" };
    return { type: "signIn", ok: true };
  };
  return { on: createPanelListener({ extensionId: ID, extensionUrl: BASE, handle }), handled };
}

test("the panel's requests are answered", async () => {
  const { on, handled } = listener();
  for (const type of ["loadTranscript", "loadActivities", "signIn", "signOut"] as const) {
    const answer = new Promise<PanelResponse | undefined>((resolve) => assert.equal(on({ type }, panel, resolve), true));
    assert.equal((await answer)?.type, type);
  }
  assert.deepEqual(handled.map((m) => m.type), ["loadTranscript", "loadActivities", "signIn", "signOut"]);
});

test("a content script (any tab) gets no transcript, no sign-in window and no sign-out", async () => {
  const { on, handled } = listener();
  let answered = 0;
  for (const type of ["loadTranscript", "loadActivities", "signIn", "signOut"]) assert.equal(on({ type }, contentScript, () => answered++), false);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(handled, []);
  assert.equal(answered, 0);
});

test("messages of other types, or no type, are ignored even from the panel", () => {
  const { on, handled } = listener();
  for (const msg of [{ type: "ready" }, { type: "fill" }, { type: 7 }, {}, null, undefined, "loadTranscript", ["loadTranscript"]]) assert.equal(on(msg, panel, () => {}), false);
  assert.deepEqual(handled, []);
});

test("a failing handler answers undefined instead of hanging the panel", async () => {
  const on = createPanelListener({ extensionId: ID, extensionUrl: BASE, handle: async () => { throw new Error("boom"); } });
  const answer = await new Promise<PanelResponse | undefined>((resolve) => on({ type: "loadTranscript" }, panel, resolve));
  assert.equal(answer, undefined);
});

test("restrictStorageToTrustedContexts asks for TRUSTED_CONTEXTS, and never throws on older Chrome or a failing call", async () => {
  const asked: unknown[] = [];
  restrictStorageToTrustedContexts({ setAccessLevel: async (o) => void asked.push(o) });
  assert.deepEqual(asked, [{ accessLevel: "TRUSTED_CONTEXTS" }]);
  restrictStorageToTrustedContexts({}); // Chrome before 102: no such call
  restrictStorageToTrustedContexts(undefined);
  restrictStorageToTrustedContexts({ setAccessLevel: () => { throw new Error("not supported"); } });
  restrictStorageToTrustedContexts({ setAccessLevel: () => Promise.reject(new Error("rejected")) });
  await new Promise((r) => setTimeout(r, 10)); // an unhandled rejection would fail the run
});
