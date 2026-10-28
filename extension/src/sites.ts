// Which application system a tab is on. Common App has its own page-by-page filler; the others get the fill assistant (assist/*).
// Hosts are the portals' sign-in origins, opened 2026-10-27; keep them in step with manifest.json.

import type { FillSystem } from "../../web/lib/system-fill.ts";

export type Site = "common_app" | FillSystem;

export const SITE_ORIGINS: Record<Site, readonly string[]> = {
  common_app: ["https://apply.commonapp.org"],
  uc: ["https://apply.universityofcalifornia.edu"],
  stars: ["https://srar.selfreportedtranscript.com"],
  csu: ["https://calstate.cas.myliaison.com", "https://calstate.liaisoncas.com"],
  uiuc: ["https://myillini.illinois.edu"],
  ut: ["https://utdirect.utexas.edu", "https://mystatus.admissions.utexas.edu", "https://admissions.utexas.edu"],
};

export const SITE_LABEL: Record<Site, string> = {
  common_app: "Common App",
  uc: "UC application",
  stars: "STARS",
  csu: "Cal State Apply",
  uiuc: "UIUC SRAR (myIllini)",
  ut: "UT Austin (MyStatus)",
};

/** Where the student goes to enter courses, for the "Open …" link when no matching tab is active. */
export const SITE_HOME: Record<Site, string> = {
  common_app: "https://apply.commonapp.org/dashboard",
  uc: "https://apply.universityofcalifornia.edu/my-application/login",
  stars: "https://srar.selfreportedtranscript.com/Login.aspx",
  csu: "https://calstate.cas.myliaison.com/applicant/login",
  uiuc: "https://myillini.illinois.edu/",
  ut: "https://utdirect.utexas.edu/apps/adm/mystatus/",
};

/**
 * True when `url` is an https address on one of `site`'s own origins, with no user:password part. Every tab navigation goes through this
 * (tab-wait.ts, chrome-driver.ts), so a path that was ever built from page content (`@evil.example/`, `//evil.example`) cannot leave the portal.
 */
export function isPortalUrl(url: string, site: Site): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === "https:" && !u.username && !u.password && SITE_ORIGINS[site].includes(u.origin);
}

/** Throws unless `url` is on `site`'s origins; `what` names the portal in the sentence ("STARS"). */
export function assertPortalUrl(url: string, site: Site, what: string): void {
  if (!isPortalUrl(url, site)) throw new Error(`Refused to open an address outside ${what}`);
}

/** The system a URL belongs to, or null. Matches the origin exactly (no look-alike hosts). */
export function siteOf(url: string | undefined | null): Site | null {
  if (!url) return null;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  for (const [site, origins] of Object.entries(SITE_ORIGINS) as [Site, readonly string[]][]) if (origins.includes(origin)) return site;
  return null;
}
