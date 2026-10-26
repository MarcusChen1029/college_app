// Waits for a portal tab to reload (after a save that posts the page) and for its content script to answer again.

import type { AssistMessage, AssistResponse } from "./messages.ts";

const RELOAD_MS = 30000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function sendTo(tabId: number, msg: AssistMessage): Promise<AssistResponse | null> {
  try {
    return ((await chrome.tabs.sendMessage(tabId, msg)) as AssistResponse | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Resolves after the tab goes loading -> complete and its content script answers `ready`; rejects on timeout, naming `what`. */
export function afterReload(tabId: number, what: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let sawLoading = false;
    const timer = setTimeout(() => done(new Error(`${what} did not finish saving (no reload). Check the page for a message`)), RELOAD_MS);
    const listener = (id: number, change: { status?: string }) => {
      if (id !== tabId) return;
      if (change.status === "loading") sawLoading = true;
      else if (change.status === "complete" && sawLoading) void ready();
    };
    const done = (err?: Error) => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      if (err) reject(err);
      else resolve();
    };
    const ready = async () => {
      for (let i = 0; i < 50; i++) {
        if ((await sendTo(tabId, { type: "ready" }))?.type === "ready") return done();
        await sleep(200);
      }
      done(new Error(`The ${what} page did not respond after saving`));
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}
