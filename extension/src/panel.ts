// Side panel UI. Pure logic lives in runner.ts and chrome-driver.ts; this file only renders and wires clicks. All text goes in with
// textContent (never innerHTML): course names and Common App messages are data, not markup.

import type { TranscriptResult } from "./auth.ts";
import { buildSystemPlan, FILL_SYSTEMS } from "../../web/lib/system-fill.ts";
import { buildStarsPlans } from "../../web/lib/stars-fill.ts";
import { assistView } from "./assist-panel.ts";
import { starsAutoView } from "./stars/panel.ts";
import { csuAutoView } from "./csu/panel.ts";
import { ucAutoView } from "./uc/panel.ts";
import { buildUcPlans } from "../../web/lib/uc-fill.ts";
import { buildCsuPlans } from "../../web/lib/csu-fill.ts";
import { createDriver, type TabsApi } from "./chrome-driver.ts";
import { targetUrl } from "./commonapp/pages.ts";
import type { PanelResponse } from "./messages.ts";
import { SITE_HOME, SITE_LABEL, siteOf, type Site } from "./sites.ts";
import { button, h, type Child } from "./ui.ts";
import {
  askText,
  blankText,
  buildPlans,
  filledText,
  offerText,
  offersFor,
  OPEN_RELOADS_NOTE,
  runFill,
  startFill,
  STATUS,
  needsSaveGuidance,
  STOP_GUIDANCE,
  TICK_REMINDER,
  targetLabel,
  type Driver,
  type FillMode,
  type FillOutcome,
  type Offer,
  type Target,
} from "./runner.ts";

const app = document.getElementById("app")!;

function show(...nodes: Child[]): void {
  app.replaceChildren(h("h1", {}, "College application filler"), ...nodes.filter((n): n is Node | string => !!n));
}

// ---- messages to the background ----------------------------------------------------------------------------------------

async function loadTranscript(): Promise<TranscriptResult> {
  try {
    const r = (await chrome.runtime.sendMessage({ type: "loadTranscript" })) as PanelResponse | undefined;
    return r?.type === "loadTranscript" ? r.result : { ok: false, reason: "network" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
async function signIn(): Promise<boolean> {
  try {
    const r = (await chrome.runtime.sendMessage({ type: "signIn" })) as PanelResponse | undefined;
    return r?.type === "signIn" && r.ok;
  } catch {
    return false;
  }
}
async function signOut(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: "signOut" });
  } catch {
    // nothing to do: the next load tells us whether a token is still there
  }
}

/** The active tab of this window and the application system it is on (null for any other site). */
async function activeTab(): Promise<{ id: number | null; site: Site | null }> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return { id: tab?.id ?? null, site: siteOf(tab?.url) };
  } catch {
    return { id: null, site: null };
  }
}


// ---- views -------------------------------------------------------------------------------------------------------------

let ticked = new Set<Target>();
let transcript: { schools: Parameters<typeof buildPlans>[0]; courses: Parameters<typeof buildPlans>[1] } | null = null;
/** The system the student picked in the panel; null = follow the active tab. */
let picked: Site | null = null;
/** The system shown last, so a tab change re-renders only when it changes what is shown. */
let shownSite: Site | null = null;
let view: "other" | "ready" = "other";
let currentOffers: Offer[] = [];
let stopRequested = false;

function signedOutView(message?: string): void {
  view = "other";
  const note = h("p", { class: "note" }, message ?? "");
  show(
    h("p", {}, "Sign in with your College Tracker account so the extension can read your transcript. It cannot see anything else in your account."),
    message ? note : null,
    button("Sign in", async () => {
      note.textContent = "Waiting for the sign-in window...";
      if (await signIn()) await refresh();
      else signedOutView("Sign in did not finish. Try again.");
    }, "btn primary"),
  );
}

function messageView(text: string, ...actions: HTMLElement[]): void {
  view = "other";
  show(h("p", { class: "note" }, text), h("div", { class: "row" }, ...actions));
}

async function refresh(): Promise<void> {
  view = "other";
  show(h("p", { class: "muted" }, "Loading your transcript..."));
  const result = await loadTranscript();
  if (!result.ok) {
    if (result.reason === "signed_out") return signedOutView();
    if (result.reason === "students_only") return messageView(STATUS.studentsOnly, button("Sign out", async () => { await signOut(); signedOutView(); }));
    return messageView(STATUS.network, button("Try again", () => void refresh(), "btn primary"));
  }
  transcript = { schools: result.schools, courses: result.courses };
  currentOffers = offersFor(buildPlans(result.schools, result.courses));
  ticked = new Set(currentOffers.map((o) => o.target));
  await readyView();
}

/** "Fill for: [system]" picker; follows the active tab until the student picks one. */
function sitePicker(current: Site): HTMLElement {
  const select = h("select", { "aria-label": "Application system" }) as HTMLSelectElement;
  for (const s of ["common_app", ...FILL_SYSTEMS] as Site[]) {
    const o = h("option", { value: s }, SITE_LABEL[s]) as HTMLOptionElement;
    o.selected = s === current;
    select.append(o);
  }
  select.addEventListener("change", () => {
    picked = select.value as Site;
    void readyView();
  });
  return h("label", { class: "picker" }, "Fill for ", select);
}

async function readyView(): Promise<void> {
  view = "ready";
  const tab = await activeTab();
  if (view !== "ready") return; // the view changed while we looked at the tabs
  const site: Site = picked ?? tab.site ?? "common_app";
  shownSite = site;
  if (site !== "common_app") {
    if (!transcript) return void refresh();
    const onSite = tab.site === site ? tab.id : null;
    const auto =
      onSite == null ? (site === "stars" || site === "uc" || site === "csu" ? h("p", { class: "note" }, `Open ${SITE_LABEL[site]} in this window (signed in), and the extension adds your courses for you.`) : null)
      : site === "stars" ? await starsAutoView(buildStarsPlans(transcript.schools, transcript.courses), onSite)
      : site === "csu" ? csuAutoView(buildCsuPlans(transcript.schools, transcript.courses), onSite)
      : site === "uc" ? ucAutoView(buildUcPlans(transcript.schools, transcript.courses), onSite)
      : null;
    const node = await assistView(buildSystemPlan(site, transcript.schools, transcript.courses), onSite, auto);
    if (view !== "ready" || shownSite !== site) return;
    show(
      sitePicker(site),
      tab.site !== site && button(`Open ${SITE_LABEL[site]}`, () => void chrome.tabs.create({ url: SITE_HOME[site] }), "link"),
      node,
      h("div", { class: "row" }, button("Reload transcript", () => void refresh()), button("Sign out", async () => { await signOut(); signedOutView(); })),
    );
    return;
  }
  const tabId = tab.site === "common_app" ? tab.id : null;
  const boxes = currentOffers.map((o) => {
    const box = h("input", { type: "checkbox" }) as HTMLInputElement;
    box.checked = ticked.has(o.target);
    box.addEventListener("change", () => {
      if (box.checked) ticked.add(o.target);
      else ticked.delete(o.target);
      fill.disabled = tabId === null || ticked.size === 0;
    });
    return h("label", { class: "check" }, box, h("span", {}, offerText(o)));
  });
  const fill = button("Fill selected", () => void run(tabId!), "btn primary", tabId === null || ticked.size === 0);
  show(
    sitePicker("common_app"),
    currentOffers.length ? h("div", { class: "list" }, ...boxes) : h("p", { class: "note" }, "No courses with grades or current-year courses were found in your transcript."),
    tabId === null && h("p", { class: "note" }, "Open your Common App in this window first."),
    h("div", { class: "row" }, fill, button("Sign out", async () => { await signOut(); signedOutView(); })),
  );
}

async function run(tabId: number): Promise<void> {
  view = "other";
  stopRequested = false;
  const status = h("p", { class: "status" }, "Starting...");
  const prompt = h("div", {});
  let dismissPrompt: (() => void) | null = null;
  const stop = button("Stop", () => {
    stopRequested = true;
    dismissPrompt?.(); // a pending Replace/Keep question must not keep the run blocked; runFill sees the stop flag and fills nothing
    status.textContent = "Stopping after the current field...";
    stop.disabled = true;
    chrome.tabs.sendMessage(tabId, { type: "stop" }).catch(() => {});
  }, "btn danger");
  show(status, prompt, h("div", { class: "row" }, stop));

  const ask = (target: Target, count: number) =>
    new Promise<FillMode>((resolve) => {
      const choose = (mode: FillMode) => {
        dismissPrompt = null;
        prompt.replaceChildren();
        resolve(mode);
      };
      dismissPrompt = () => choose("keep");
      prompt.replaceChildren(
        h("div", { class: "ask" }, h("p", {}, askText(target, count)), h("div", { class: "row" }, button("Replace them", () => choose("replace"), "btn"), button("Keep them, add the rest", () => choose("keep"), "btn primary"))),
      );
    });

  const targets = currentOffers.map((o) => o.target).filter((t) => ticked.has(t));
  const outcome = await startFill(loadTranscript, runFill, {
    targets,
    ask,
    shouldStop: () => stopRequested,
    makeDriver: (plans): Driver => {
      const real = createDriver(chrome.tabs as unknown as TabsApi, tabId, plans);
      return {
        ...real,
        async open(t) {
          status.textContent = `Filling ${targetLabel(t)}...`;
          return real.open(t);
        },
      };
    },
  });
  reportView(outcome, targets, tabId);
}

function reportView(outcome: FillOutcome, targets: Target[], tabId: number): void {
  view = "other";
  if (!outcome.ok) {
    if (outcome.reason === "signed_out") return signedOutView(outcome.status);
    return messageView(outcome.status, button("Back", () => void refresh(), "btn primary"));
  }
  const sections = outcome.items.map((item) => {
    return h(
      "section",
      { class: "item" },
      h("h2", {}, targetLabel(item.target)),
      h("p", { class: "done" }, filledText(item)),
      item.note ? h("p", { class: "warn" }, item.note) : false,
      needsSaveGuidance(item) ? h("p", { class: "warn" }, STOP_GUIDANCE) : false,
      ...(item.changes ?? []).map((c) => h("p", { class: "note" }, c)),
      item.blanks.length ? h("ul", {}, ...item.blanks.map((b) => h("li", {}, blankText(b)))) : false,
      button(`Open ${targetLabel(item.target)} on Common App`, () => void chrome.tabs.update(tabId, { url: targetUrl(item.target) }), "link"),
      // After a stop the tab may hold an open dialog with unsaved rows; any of these links navigates that tab away.
      outcome.stopped ? h("p", { class: "note" }, OPEN_RELOADS_NOTE) : false,
    );
  });
  const done = new Set(outcome.items.map((i) => i.target));
  const left = targets.filter((t) => !done.has(t));
  show(
    h("p", { class: outcome.stopped ? "status warn" : "status" }, outcome.status),
    ...sections,
    left.length ? h("p", { class: "note" }, `Not filled: ${left.map(targetLabel).join(", ")}.`) : false,
    outcome.warnings.length ? h("ul", { class: "warnings" }, ...outcome.warnings.map((w) => h("li", {}, w))) : false,
    h("p", { class: "note" }, TICK_REMINDER),
    h("div", { class: "row" }, button("Back", () => void refresh(), "btn primary")),
  );
}

// The Fill button depends on the active tab: re-render when it changes (but never over a run or a report).
const retab = async () => {
  if (view !== "ready") return;
  // The assistant keeps its place (scroll, status) unless the tab moved to another system.
  const { site } = await activeTab();
  if (shownSite !== "common_app" && (picked ?? site ?? "common_app") === shownSite) return;
  void readyView();
};
chrome.tabs.onActivated.addListener(() => void retab());
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.status === "complete") void retab();
});

void refresh();
