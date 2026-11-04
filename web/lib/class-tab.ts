// The class pages' tabs live in the URL as `?tab=<id>` (components/classroom/gc/ClassTabs.tsx). Pure helpers, so the
// rules can be unit-tested: which tab a URL names, and the URL after switching tabs.

/** The tab a `?tab=` value names; a missing or unknown value means the first tab. */
export function pickTab(raw: string | null, ids: readonly string[]): string {
  return raw !== null && ids.includes(raw) ? raw : ids[0];
}

/** `href` with `tab=<id>` set; every other query value and the hash stay. Returns a path + query + hash (no origin). */
export function tabHref(href: string, id: string): string {
  const url = new URL(href, "http://tab.invalid");
  url.searchParams.set("tab", id);
  return `${url.pathname}${url.search}${url.hash}`;
}
