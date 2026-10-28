import assert from "node:assert/strict";
import { test } from "node:test";
import { SITE_ORIGINS } from "./sites.ts";
import { navigate } from "./tab-wait.ts";

type Listener = (id: number, change: { status?: string }) => void;

/** A fake chrome.tabs: update() starts a load (loading, then complete) and the content script answers `ready`. */
function fakeChrome() {
  const listeners = new Set<Listener>();
  const updates: unknown[] = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    tabs: {
      async update(_id: number, props: unknown) {
        updates.push(props);
        setTimeout(() => {
          for (const status of ["loading", "complete"]) for (const l of listeners) l(7, { status });
        }, 1);
        return {};
      },
      async sendMessage() {
        return { type: "ready", path: "/" };
      },
      onUpdated: { addListener: (fn: Listener) => void listeners.add(fn), removeListener: (fn: Listener) => void listeners.delete(fn) },
    },
  };
  return { updates, listeners };
}

test("navigate opens an address on the portal's own origin and waits for the page", async () => {
  const { updates, listeners } = fakeChrome();
  await navigate(7, `${SITE_ORIGINS.stars[0]}/srt/EnterSchools.aspx`, "STARS", "stars");
  assert.deepEqual(updates, [{ url: "https://srar.selfreportedtranscript.com/srt/EnterSchools.aspx" }]);
  assert.equal(listeners.size, 0);
});

test("navigate refuses any address outside the portal before it touches the tab", async () => {
  const { updates, listeners } = fakeChrome();
  const origin = SITE_ORIGINS.stars[0];
  for (const url of [
    "https://evil.example/",
    "http://srar.selfreportedtranscript.com/",
    `${origin}@evil.example/`, // a path that was built from page content
    `${origin}.evil.example/`,
    "https://user:pw@srar.selfreportedtranscript.com/",
    "javascript:alert(1)",
    "https://myillini.illinois.edu/", // another portal is not this one
  ]) {
    await assert.rejects(navigate(7, url, "STARS", "stars"), /Refused to open an address outside STARS/, url);
  }
  assert.deepEqual(updates, []);
  assert.equal(listeners.size, 0);
});
