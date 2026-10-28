// The service worker's two security checks, kept free of `chrome.*` calls so node tests can exercise them.

import type { PanelRequest, PanelResponse } from "./messages.ts";

/** The parts of chrome.runtime.MessageSender the check reads. */
export type MessageSender = { id?: string; url?: string; tab?: unknown };

/**
 * True only for a message sent by one of THIS extension's own pages (the side panel). A content script is the extension's id too, but it
 * runs beside the portal page's scripts, so it always has a `tab` and the portal's URL: it must never get the transcript or the token.
 * `extensionUrl` is chrome.runtime.getURL(""), "chrome-extension://<id>/" (the trailing slash rules out look-alike ids).
 */
export function isOwnPageSender(sender: MessageSender | null | undefined, extensionId: string, extensionUrl: string): boolean {
  return !!sender && sender.id === extensionId && !sender.tab && typeof sender.url === "string" && sender.url.startsWith(extensionUrl);
}

const PANEL_TYPES = ["signIn", "signOut", "loadTranscript"];

/**
 * The runtime.onMessage listener for the panel's three requests (sign in, sign out, load the transcript). Every one of them is
 * privileged, so a message from anything but the extension's own page is not answered at all. Content scripts send the background nothing.
 */
export function createPanelListener(deps: { extensionId: string; extensionUrl: string; handle: (msg: PanelRequest) => Promise<PanelResponse> }) {
  return (msg: unknown, sender: MessageSender, sendResponse: (response: PanelResponse | undefined) => void): boolean => {
    const type = (msg as { type?: unknown } | null)?.type;
    if (typeof type !== "string" || !PANEL_TYPES.includes(type)) return false;
    if (!isOwnPageSender(sender, deps.extensionId, deps.extensionUrl)) return false;
    deps.handle(msg as PanelRequest).then(sendResponse, () => sendResponse(undefined));
    return true; // async response
  };
}

/** The slice of a chrome.storage area this uses, so tests can fake it. */
export type StorageAreaLike = { setAccessLevel?: (options: { accessLevel: string }) => Promise<void> | void };

/**
 * storage.local is readable from content scripts by default, and content scripts share a process with the portal page's own scripts. The
 * token and the panel's saved picks are only used by extension pages, so close the area to trusted contexts (service worker, side panel).
 * Chrome before 102 has no setAccessLevel: then this does nothing, and never throws.
 */
export function restrictStorageToTrustedContexts(area: StorageAreaLike | undefined): void {
  try {
    void Promise.resolve(area?.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" })).catch(() => {});
  } catch {
    // an older Chrome, or a storage area without the call
  }
}
