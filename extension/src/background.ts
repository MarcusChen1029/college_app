import { loadTranscript, signIn, signOut } from "./auth.ts";
import { createPanelListener, restrictStorageToTrustedContexts, type StorageAreaLike } from "./background-guards.ts";
import type { PanelRequest, PanelResponse } from "./messages.ts";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
// Runs every time the service worker starts. chrome.storage.session (not used) is already limited to trusted contexts by default.
restrictStorageToTrustedContexts(chrome.storage.local as unknown as StorageAreaLike);

async function handle(msg: PanelRequest): Promise<PanelResponse> {
  switch (msg.type) {
    case "signIn":
      return { type: "signIn", ok: await signIn() };
    case "signOut":
      await signOut();
      return { type: "signOut" };
    case "loadTranscript":
      return { type: "loadTranscript", result: await loadTranscript() };
  }
}

// Only the extension's own side panel may ask for the transcript or the token (background-guards.ts).
chrome.runtime.onMessage.addListener(createPanelListener({ extensionId: chrome.runtime.id, extensionUrl: chrome.runtime.getURL(""), handle }));
