// Which tracker a build signs in at (build.mjs). The sign-in token comes back from that site, so a build must trust exactly one place.

/** The only non-https tracker a build may trust: the local dev server. Only a build without TRACKER_URL (a dev build) gets it. */
export const DEV_TRACKER_URL = "http://localhost:3000";
/** A live-site build trusts one https origin: no path, query, fragment or user:password. */
export const TRACKER_URL_PATTERN = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/;

/** TRACKER_URL from the environment, or the dev address when unset. Throws on anything else that is not a bare https origin. */
export function resolveTrackerUrl(env = process.env) {
  const url = env.TRACKER_URL || DEV_TRACKER_URL;
  if (url !== DEV_TRACKER_URL && !TRACKER_URL_PATTERN.test(url)) {
    throw new Error(`TRACKER_URL must be an https origin like https://www.example.com (no path), or unset for ${DEV_TRACKER_URL}; got ${url}`);
  }
  return url;
}
