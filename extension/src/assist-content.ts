// Content script on the UC, STARS, Cal State Apply, UIUC and UT portals: the fill assistant's page side. It remembers the box the student
// last clicked and, when the side panel sends a value, puts it there and moves focus to the next box. On STARS's coursework page it also
// fills one course and presses Save Course when the panel asks (stars/fill.ts). On myIllini's SRAR courses pages it adds course rows and
// presses Save Progress (uiuc/fill.ts). It never submits an application or record.

import { insertValue, labelOf } from "./assist/insert.ts";
import { nextBox } from "./assist/next.ts";
import { fillStarsCourse, StarsStop, starsErrors, starsExistingNames, starsPageKind, starsPageYear } from "./stars/fill.ts";
import type { AssistMessage, AssistResponse } from "./messages.ts";
import { SITE_ORIGINS } from "./sites.ts";
import { runCsuSchool } from "./csu/run.ts";
import { onCourseworkPage } from "./csu/fill.ts";
import { fillUcPage, ucExistingNames, ucPageGrade, ucSummaryNames } from "./uc/fill.ts";
import { starsSchools, starsSummaryPath, starsYearPath, starsYears } from "./stars/nav.ts";
import { ucClassesLink, ucCoursesButtons } from "./uc/nav.ts";
import { fillUiucArea, uiucPageInfo, uiucSave } from "./uiuc/fill.ts";
import { pageDialogs } from "./uiuc/dialogs.ts";

const onMyIllini = () => SITE_ORIGINS.uiuc.includes(location.origin);
let uiucBusy = false;

/** A STARS page's HTML, read like opening it (same site, the student's own session). null when STARS sent the sign-in page instead. */
async function starsHtml(path: string): Promise<string | null> {
  const r = await fetch(path, { credentials: "same-origin" });
  const html = await r.text();
  // Seen live: an idle session redirects to LogoutBridge.aspx?message=timeout.
  return !r.ok || /login\.aspx|logout/i.test(r.url) ? null : html;
}

let csuStop = false;

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
      sendResponse({ type: "starsPage", year: starsPageYear(location), kind: starsPageKind(location), existing: starsExistingNames(document),
      // The school's code is in the URL (selCeeb), not always on the page; put it first so a code match can find it.
      pageText: `${new URLSearchParams(location.search).get("selCeeb") ?? ""}
${document.body.innerText.slice(0, 4000)}`, errors: starsErrors(document) });
      return false;
    case "starsFill":
      if (!SITE_ORIGINS.stars.includes(location.origin) || starsPageYear(location) == null) {
        sendResponse({ type: "starsFill", ok: false, error: "This is not a STARS coursework page" });
        return false;
      }
      fillStarsCourse(document, msg.row, msg.scale, msg.language).then(
        (r) => sendResponse({ type: "starsFill", ok: true, saved: r.saved, blanks: r.blanks }),
        (e: unknown) => sendResponse({ type: "starsFill", ok: false, error: e instanceof StarsStop || e instanceof Error ? e.message : String(e) }),
      );
      return true; // async response
    case "ucPage": {
      const grade = SITE_ORIGINS.uc.includes(location.origin) ? ucPageGrade(location) : null;
      sendResponse({ type: "ucPage", grade, names: grade != null ? ucExistingNames(document) : ucSummaryNames(document), pageText: document.body.innerText.slice(0, 3000) });
      return false;
    }
    case "ucFill":
      if (!SITE_ORIGINS.uc.includes(location.origin) || ucPageGrade(location) == null) {
        sendResponse({ type: "ucFill", ok: false, error: "Open a grade's Enter courses & grades page on UC first" });
        return false;
      }
      fillUcPage(document, msg.plan).then(
        (result) => sendResponse({ type: "ucFill", ok: true, result }),
        (e: unknown) => sendResponse({ type: "ucFill", ok: false, error: e instanceof Error ? e.message : String(e) }),
      );
      return true; // async response
    case "starsSchools":
      starsHtml("/srt/EnterSchools.aspx").then(
        (html) => sendResponse(html == null ? { type: "starsSchools", ok: false, error: "STARS signed you out: sign in again, then run again" } : { type: "starsSchools", ok: true, schools: starsSchools(html) }),
        () => sendResponse({ type: "starsSchools", ok: false, error: "STARS did not answer: reload the page and try again" }),
      );
      return true; // async response
    case "starsYearPath":
      starsHtml(starsSummaryPath(msg.ceeb)).then(
        (html) => sendResponse({ type: "starsYearPath", path: html == null ? null : starsYearPath(html, msg.ceeb, msg.year), years: html == null ? [] : starsYears(html, msg.ceeb).map((y) => y.year) }),
        () => sendResponse({ type: "starsYearPath", path: null, years: [] }),
      );
      return true; // async response
    case "ucOpenClasses": {
      // UC may draw the school years a moment after the page loads: wait for a courses button before saying there is none.
      void (async () => {
        const start = Date.now();
        while (!ucCoursesButtons(document, msg.grade).length && Date.now() - start < 8000) await new Promise((r) => setTimeout(r, 200));
        const link = ucClassesLink(document, msg.grade, { name: msg.schoolName, code: msg.schoolCode });
        if (typeof link === "string") return sendResponse({ type: "ucOpenClasses", ok: false, error: link });
        sendResponse({ type: "ucOpenClasses", ok: true });
        setTimeout(() => link.click(), 50); // after the answer: the click leaves the page
      })();
      return true; // async response
    }
    case "uiucPage":
      if (!onMyIllini()) return false;
      sendResponse({ type: "uiucPage", page: uiucPageInfo(document, location) });
      return false;
    case "uiucFill":
      if (!onMyIllini()) return false;
      if (uiucBusy) {
        sendResponse({ type: "uiucFill", ok: false, error: "Already adding courses on this page" });
        return false;
      }
      uiucBusy = true;
      fillUiucArea(document, location, msg.area, msg.rows, pageDialogs(window))
        .then(
          (result) => sendResponse({ type: "uiucFill", ok: true, result }),
          (e: unknown) => sendResponse({ type: "uiucFill", ok: false, error: e instanceof Error ? e.message : String(e) }),
        )
        .finally(() => (uiucBusy = false));
      return true; // async response
    case "uiucSave":
      if (!onMyIllini()) return false;
      try {
        uiucSave(document, location); // presses Save Progress just after this answer (the page reloads)
        sendResponse({ type: "uiucSave", ok: true });
      } catch (e) {
        sendResponse({ type: "uiucSave", ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      return false;
    case "csuStop":
      csuStop = true;
      sendResponse({ type: "csuStop" });
      return false;
    case "csuFill":
      if (!SITE_ORIGINS.csu.includes(location.origin) || !onCourseworkPage(document)) {
        sendResponse({ type: "csuFill", result: { added: [], skippedExisting: 0, stopped: "Open Academic History > High School Coursework on Cal State Apply first." } });
        return false;
      }
      csuStop = false;
      runCsuSchool(document, msg.plan, () => csuStop).then(
        (result) => sendResponse({ type: "csuFill", result }),
        (e: unknown) => sendResponse({ type: "csuFill", result: { added: [], skippedExisting: 0, stopped: e instanceof Error ? e.message : String(e) } }),
      );
      return true; // async response
    default:
      return false;
  }
});
