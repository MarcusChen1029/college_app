// The real Driver: drives one Common App tab with chrome.tabs. Each page is a full page load (tabs.update to the page's URL), after which we
// wait for the content script's `ready`. We never assume an earlier dialog closed: some stop paths leave a C&G dialog open on purpose,
// and loading the URL again discards it (nothing was saved).

import type { ContentMessage, ContentResponse } from "./messages.ts";
import { CG_GRADE_PATH, targetUrl } from "./commonapp/pages.ts";
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

/** Polls the tab's content script until it answers `ready`. */
export async function waitForReady(tabs: TabsApi, tabId: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await tabs.sendMessage(tabId, { type: "ready" });
      if (r?.type === "ready") return;
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
