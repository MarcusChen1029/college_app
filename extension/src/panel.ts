// Side panel UI. Pure logic lives in runner.ts and chrome-driver.ts; this file only renders and wires clicks. All text goes in with
// textContent (never innerHTML): course names and Common App messages are data, not markup.

import type { TranscriptResult } from "./auth.ts";
import { createDriver, type TabsApi } from "./chrome-driver.ts";
import { COMMONAPP_ORIGIN, targetUrl } from "./commonapp/pages.ts";
import type { PanelResponse } from "./messages.ts";
import {
  askText,
  blankText,
  buildPlans,
  filledText,
  offerText,
  offersFor,
  runFill,
  startFill,
  STATUS,
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

type Child = Node | string | null | false;
function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}
function button(label: string, onClick: () => void, cls = "btn", disabled = false): HTMLButtonElement {
  const b = h("button", { type: "button", class: cls }, label) as HTMLButtonElement;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}
function show(...nodes: Child[]): void {
  app.replaceChildren(h("h1", {}, "Common App filler"), ...nodes.filter((n): n is Node | string => !!n));
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

/** The tab to drive: the active tab of this window, only if it is on Common App. */
async function commonAppTabId(): Promise<number | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id !== undefined && tab.url?.startsWith(COMMONAPP_ORIGIN + "/") ? tab.id : null;
  } catch {
    return null;
  }
}

// ---- views -------------------------------------------------------------------------------------------------------------

let ticked = new Set<Target>();
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
  currentOffers = offersFor(buildPlans(result.schools, result.courses));
  ticked = new Set(currentOffers.map((o) => o.target));
  await readyView();
}

async function readyView(): Promise<void> {
  view = "ready";
  const tabId = await commonAppTabId();
  if (view !== "ready") return; // the view changed while we looked at the tabs
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
  const stop = button("Stop", () => {
    stopRequested = true;
    status.textContent = "Stopping after the current field...";
    stop.disabled = true;
    chrome.tabs.sendMessage(tabId, { type: "stop" }).catch(() => {});
  }, "btn danger");
  show(status, prompt, h("div", { class: "row" }, stop));

  const ask = (target: Target, count: number) =>
    new Promise<FillMode>((resolve) => {
      const choose = (mode: FillMode) => {
        prompt.replaceChildren();
        resolve(mode);
      };
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
  const sections = outcome.items.map((item, i) => {
    const stoppedHere = outcome.stopped && i === outcome.items.length - 1;
    return h(
      "section",
      { class: "item" },
      h("h2", {}, targetLabel(item.target)),
      h("p", { class: "done" }, filledText(item)),
      item.note ? h("p", { class: "warn" }, item.note) : false,
      stoppedHere && item.target !== "current" ? h("p", { class: "warn" }, STOP_GUIDANCE) : false,
      item.blanks.length ? h("ul", {}, ...item.blanks.map((b) => h("li", {}, blankText(b)))) : false,
      button(`Open ${targetLabel(item.target)} on Common App`, () => void chrome.tabs.update(tabId, { url: targetUrl(item.target) }), "link"),
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
const retab = () => {
  if (view === "ready") void readyView();
};
chrome.tabs.onActivated.addListener(retab);
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.status === "complete") retab();
});

void refresh();
