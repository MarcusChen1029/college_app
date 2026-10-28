// The real Driver: drives one Common App tab with chrome.tabs. Each page is a full page load (tabs.update to the page's URL), after which we
// wait for the content script's `ready`. We never assume an earlier dialog closed: some stop paths leave a C&G dialog open on purpose,
// and loading the URL again discards it (nothing was saved).

import type { ContentMessage, ContentResponse } from "./messages.ts";
import { CA_PAGE_FACTS, CG_GRADE_PATH, COMMONAPP_ORIGIN, targetUrl } from "./commonapp/pages.ts";
import type { CaPage } from "../../web/lib/activities-fill.ts";
import type { CaDriver } from "./activities-flow.ts";
import type { Driver, FillMode, Plans, Target } from "./runner.ts";

/** The slice of chrome.tabs this file uses, so tests can fake it. */
export type TabsApi = {
  update(tabId: number, props: { url: string }): Promise<unknown>;
  sendMessage(tabId: number, message: ContentMessage): Promise<ContentResponse | undefined>;
  onUpdated: {
    addListener(fn: (tabId: number, change: { status?: string }) => void): void;
    removeListener(fn: (tabId: number, change: { status?: string }) => void): void;
  };
};

export const DRIVER_TIMING = { loadMs: 30000, noNavigationMs: 3000, readyMs: 20000, readyPollMs: 300 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Starts a full page load of `url` and resolves when the tab reports "complete" after "loading" (or, if no load ever starts, after a grace period). */
export async function navigate(tabs: TabsApi, tabId: number, url: string): Promise<void> {
  let sawLoading = false;
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => (finish = resolve));
  const listener = (id: number, change: { status?: string }) => {
    if (id !== tabId) return;
    if (change.status === "loading") sawLoading = true;
    else if (change.status === "complete" && sawLoading) finish();
  };
  tabs.onUpdated.addListener(listener);
  try {
    await tabs.update(tabId, { url });
    const timers: ReturnType<typeof setTimeout>[] = [];
    const grace = new Promise<void>((resolve) => timers.push(setTimeout(() => (sawLoading ? undefined : resolve()), DRIVER_TIMING.noNavigationMs)));
    const timeout = new Promise<never>((_, reject) => timers.push(setTimeout(() => reject(new Error("Common App did not finish loading")), DRIVER_TIMING.loadMs)));
    try {
      await Promise.race([done, grace, timeout]);
    } finally {
      timers.forEach(clearTimeout);
    }
  } finally {
    tabs.onUpdated.removeListener(listener);
  }
}

/** Polls the tab's content script until it answers `ready`; returns the page's path. */
export async function waitForReady(tabs: TabsApi, tabId: number): Promise<string> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await tabs.sendMessage(tabId, { type: "ready" });
      if (r?.type === "ready") return r.path;
    } catch {
      // no receiver yet: the content script has not started on the new page
    }
    if (Date.now() - start >= DRIVER_TIMING.readyMs) throw new Error("The Common App page did not respond. Reload it and try again");
    await sleep(DRIVER_TIMING.readyPollMs);
  }
}

async function send(tabs: TabsApi, tabId: number, message: ContentMessage): Promise<ContentResponse> {
  let r: ContentResponse | undefined;
  try {
    r = await tabs.sendMessage(tabId, message);
  } catch {
    throw new Error("The Common App page stopped responding");
  }
  if (!r) throw new Error("The Common App page did not answer");
  return r;
}

export function createDriver(tabs: TabsApi, tabId: number, plans: Plans): Driver {
  return {
    async open(target) {
      await navigate(tabs, tabId, targetUrl(target));
      await waitForReady(tabs, tabId);
    },
    async inspect(target) {
      const r = await send(tabs, tabId, { type: "inspect", target });
      if (r.type !== "inspect") throw new Error("Unexpected answer from the Common App page");
      if (!r.ok) throw new Error(r.error);
      return { existing: r.existing };
    },
    async fill(target: Target, mode: FillMode) {
      let message: ContentMessage;
      if (target === "current") {
        if (!plans.current) throw new Error("No current year courses to fill");
        message = { type: "fill", target: "current", plan: plans.current, mode };
      } else {
        const plan = plans.cg.get(target);
        if (!plan || !(target in CG_GRADE_PATH)) throw new Error("No courses to fill for this grade");
        message = { type: "fill", target, plan, mode };
      }
      const r = await send(tabs, tabId, message);
      if (r.type !== "fill") throw new Error("Unexpected answer from the Common App page");
      if (!r.ok) throw new Error(r.error);
      return r.result;
    },
  };
}

/**
 * The activities / honors page of one tab. `reopen` is a fresh load of the page (after Continue nothing is dirty; ruling R19: a full load
 * instead of the in-app link). `inspect` and `read` are answered once the content script saw the page settle (commonapp/activities.ts
 * waitForCaPage), so a page that is still drawing is never read as empty. A `fill` that rejects here (no answer) may have been received.
 */
export function createCaDriver(tabs: TabsApi, tabId: number, page: CaPage): CaDriver {
  return {
    async inspect() {
      const r = await send(tabs, tabId, { type: "caInspect", page });
      if (r.type !== "caInspect") throw new Error("Unexpected answer from the Common App page");
      if (!r.ok) throw new Error(r.error);
      return r.existing;
    },
    async fill(plan, mode, existing) {
      const r = await send(tabs, tabId, { type: "caFill", plan, mode, existing });
      if (r.type !== "caFill") throw new Error("Unexpected answer from the Common App page");
      if (!r.ok) throw new Error(r.error);
      return r.result;
    },
    async reopen() {
      await navigate(tabs, tabId, COMMONAPP_ORIGIN + CA_PAGE_FACTS[page].path);
      await waitForReady(tabs, tabId);
    },
    async read() {
      const r = await send(tabs, tabId, { type: "caRead", page });
      if (r.type !== "caRead") throw new Error("Unexpected answer from the Common App page");
      if (!r.ok) throw new Error(r.error);
      return r.rows;
    },
    // Polls: a redirect to the sign-in page is a full load, during which the content script is briefly absent.
    path: () => waitForReady(tabs, tabId),
  };
}
