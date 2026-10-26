// Content script on the UC, STARS, Cal State Apply, UIUC and UT portals: the fill assistant's page side. It remembers the box the student
// last clicked and, when the side panel sends a value, puts it there and moves focus to the next box. On STARS's coursework page it also
// fills one course and presses Save Course when the panel asks (stars/fill.ts). It never submits an application or record.

import { insertValue, labelOf } from "./assist/insert.ts";
import { nextBox } from "./assist/next.ts";
import { fillStarsCourse, StarsStop, starsExistingNames, starsPageYear } from "./stars/fill.ts";
import type { AssistMessage, AssistResponse } from "./messages.ts";
import { SITE_ORIGINS } from "./sites.ts";

let last: Element | null = null;
document.addEventListener("focusin", (e) => {
  if (e.target instanceof Element) last = e.target;
}, true);

/** The box values go into: the last one focused while it is still on the page, else whatever has focus. */
function current(): Element | null {
  if (last && last.isConnected) return last;
  const a = document.activeElement;
  return a && a !== document.body ? a : null;
}

function focus(el: Element | null): void {
  if (!el) return;
  (el as HTMLElement).focus?.();
  last = el;
}

chrome.runtime.onMessage.addListener((raw: unknown, sender, sendResponse: (r: AssistResponse) => void) => {
  if (sender.id !== chrome.runtime.id) return false;
  const msg = raw as AssistMessage | null;
  switch (msg?.type) {
    case "ready":
      sendResponse({ type: "ready", path: location.pathname });
      return false;
    case "assistTarget": {
      const el = current();
      sendResponse({ type: "assistTarget", label: el ? labelOf(el) || el.getAttribute("placeholder") || el.tagName.toLowerCase() : null });
      return false;
    }
    case "assistInsert": {
      const el = current();
      insertValue(el, msg.value).then(
        (result) => {
          const label = el ? labelOf(el) : "";
          if (result.ok && msg.advance && el) focus(nextBox(el));
          sendResponse({ type: "assistInsert", result, label });
        },
        (e: unknown) => sendResponse({ type: "assistInsert", result: { ok: false, reason: e instanceof Error ? e.message : String(e) }, label: "" }),
      );
      return true; // async response
    }
    case "starsPage":
      sendResponse({ type: "starsPage", year: starsPageYear(location), existing: starsExistingNames(document) });
      return false;
    case "starsFill":
      if (!SITE_ORIGINS.stars.includes(location.origin) || starsPageYear(location) == null) {
        sendResponse({ type: "starsFill", ok: false, error: "This is not a STARS coursework page" });
        return false;
      }
      fillStarsCourse(document, msg.row, msg.scale).then(
        (r) => sendResponse({ type: "starsFill", ok: true, saved: r.saved, blanks: r.blanks }),
        (e: unknown) => sendResponse({ type: "starsFill", ok: false, error: e instanceof StarsStop || e instanceof Error ? e.message : String(e) }),
      );
      return true; // async response
    default:
      return false;
  }
});
