// /settings for a student shows one view at a time. The view lives in the URL hash, so links, reloads and the Back
// button keep it, and the old area links (/settings#passwords, #reminders, #account...) open the view that holds that
// area. UI state only: every area stays mounted (the others are hidden), so what each one loads and does is unchanged.

// In the strip's order: the pass (plan and payments) first, then its stubs.
export const SETTINGS_TABS = ["payments", "account", "passwords", "reminders"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

// Each area's id (its anchor) -> the view it is in. Areas without an id (account type, delete) only live in their view.
// Every area stays mounted behind its tab, so each of these ids is always in the page; lib/legal.test.ts checks the
// dictionaries' /settings#... links against this list.
export const AREA_TAB: Record<string, SettingsTab> = {
  account: "account",
  language: "account",
  payments: "payments",
  passwords: "passwords",
  extensions: "passwords",
  reminders: "reminders",
  counselors: "reminders",
  share: "reminders",
};

/** The view for a location hash ("#extensions" -> "passwords"); no hash or an unknown one opens the account view. */
export function tabForHash(hash: string): SettingsTab {
  let id = hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    // a malformed hash: fall through to the default view
  }
  return AREA_TAB[id] ?? "account";
}

const EVENT = "settings-tab";

/** useSyncExternalStore subscriber: the hash changes by a link, Back / Forward, or openTab below. */
export function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export const readHash = (): string => window.location.hash;

/**
 * Opens a view without the browser's jump to the anchor. A click or Enter adds a history entry (so Back returns to the
 * previous view); moving with the arrow keys (`replace`) only updates the current one, so Back doesn't step through
 * every view passed on the way.
 */
export function openTab(tab: SettingsTab, replace = false): void {
  if (window.location.hash !== `#${tab}`) {
    if (replace) window.history.replaceState(null, "", `#${tab}`);
    else window.history.pushState(null, "", `#${tab}`);
  }
  window.dispatchEvent(new Event(EVENT));
}
