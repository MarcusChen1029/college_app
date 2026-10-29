// Content script on https://apply.commonapp.org/*: answers ready / inspect / fill / stop for the page this tab is on.
// It acts only inside the Courses & Grades grade pages/dialogs, the Current Year Courses page and the Activities / Honors pages (spec anti-goals).

import { fillCaPage, inspectCaPage, readCaPage, waitForCaPage } from "./commonapp/activities.ts";
import { fillCgGrade, inspectCgGrade } from "./commonapp/cg.ts";
import { fillCurrentYear, inspectCurrentYear } from "./commonapp/current-year.ts";
import { requestStop } from "./commonapp/dom.ts";
import { currentPath } from "./commonapp/pages.ts";
import type { ContentMessage, ContentResponse } from "./messages.ts";

let busy = false;

type Busy = Extract<ContentMessage, { type: "inspect" | "fill" | "caInspect" | "caFill" | "caRead" }>;

async function handle(msg: Busy): Promise<ContentResponse> {
  // `ready` answers at document_idle, before Angular draws the section: wait for the page to settle before reading it (never "0 entries").
  if (msg.type === "caInspect") {
    await waitForCaPage(document, msg.page);
    return { type: "caInspect", ok: true, existing: inspectCaPage(document, msg.page).existing };
  }
  if (msg.type === "caRead") {
    await waitForCaPage(document, msg.page);
    return { type: "caRead", ok: true, rows: readCaPage(document, msg.page) };
  }
  if (msg.type === "caFill") return { type: "caFill", ok: true, result: await fillCaPage(document, msg.plan, msg.mode, msg.existing) };
  if (msg.type === "inspect") {
    const { existing } = msg.target === "current" ? await inspectCurrentYear() : await inspectCgGrade(msg.target);
    return { type: "inspect", ok: true, existing };
  }
  const result = msg.target === "current" ? await fillCurrentYear(msg.plan, msg.mode) : await fillCgGrade(msg.plan, msg.mode);
  return { type: "fill", ok: true, result };
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse: (r: ContentResponse) => void) => {
  if (sender.id !== chrome.runtime.id) return false;
  const msg = raw as ContentMessage | null;
  switch (msg?.type) {
    case "ready":
      sendResponse({ type: "ready", path: currentPath() });
      return false;
    case "stop":
      requestStop();
      sendResponse({ type: "stop" });
      return false;
    case "inspect":
    case "fill":
    case "caInspect":
    case "caFill":
    case "caRead": {
      const type = msg.type;
      if (busy) {
        sendResponse({ type, ok: false, error: "Already filling this page" });
        return false;
      }
      busy = true;
      handle(msg)
        .then(sendResponse, (e: unknown) => sendResponse({ type, ok: false, error: e instanceof Error ? e.message : String(e) }))
        .finally(() => (busy = false));
      return true; // async response
    }
    default:
      return false;
  }
});
