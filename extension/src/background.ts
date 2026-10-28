import { loadActivities, loadTranscript, signIn, signOut } from "./auth.ts";
import type { PanelRequest, PanelResponse } from "./messages.ts";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

async function handle(msg: PanelRequest): Promise<PanelResponse> {
  switch (msg.type) {
    case "signIn":
      return { type: "signIn", ok: await signIn() };
    case "signOut":
      await signOut();
      return { type: "signOut" };
    case "loadTranscript":
      return { type: "loadTranscript", result: await loadTranscript() };
    case "loadActivities":
      return { type: "loadActivities", result: await loadActivities() };
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const type = (msg as { type?: unknown } | null)?.type;
  if (type !== "signIn" && type !== "signOut" && type !== "loadTranscript" && type !== "loadActivities") return false;
  handle(msg as PanelRequest).then(sendResponse, () => sendResponse(undefined));
  return true; // async response
});
