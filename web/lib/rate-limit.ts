// A small fixed-window rate limiter, kept in this process's memory. Pure (the caller passes the clock), so it is unit-tested.
//
// Best-effort only: every server instance (serverless function instance, dev server) has its own counters, so the real
// ceiling is limit x instances, and a restart forgets everything. That is enough for what it protects, which is the cost
// of serving public data, not anyone's account or money.

export type Limiter = ((key: string, now: number) => boolean) & {
  /** How many keys are tracked right now (for tests and for watching memory). */
  size(): number;
};

/**
 * `allow(key, now)` is true while `key` has made at most `limit` calls in the current window, false after that (a blocked call
 * does not extend the window). The window starts at a key's first call and lasts `windowMs`. Expired keys are swept at most once
 * per window, and `maxKeys` (default 10,000) caps the map even inside one window by dropping the oldest key, so memory stays bounded.
 */
export function makeLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }): Limiter {
  const { limit, windowMs, maxKeys = 10_000 } = opts;
  const hits = new Map<string, { start: number; count: number }>();
  let sweptAt = Number.NEGATIVE_INFINITY;

  const allow = (key: string, now: number): boolean => {
    if (now - sweptAt >= windowMs) {
      for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
      sweptAt = now;
    }
    const hit = hits.get(key);
    if (!hit || now - hit.start >= windowMs) {
      // Re-insert so the key moves to the back of the map's insertion order (the first key is always the oldest window).
      hits.delete(key);
      if (hits.size >= maxKeys) {
        const oldest = hits.keys().next();
        if (!oldest.done) hits.delete(oldest.value);
      }
      hits.set(key, { start: now, count: 1 });
      return limit >= 1;
    }
    if (hit.count >= limit) return false;
    hit.count += 1;
    return true;
  };

  return Object.assign(allow, { size: () => hits.size });
}

const MAX_KEY_LENGTH = 64;

/**
 * Who a request is from: the first address in `x-forwarded-for` (the client, as the platform sets it), else "anon". Cut to 64
 * characters (an IPv6 address is at most 45), so a header stuffed with junk can't make the limiter hold huge keys.
 */
export function clientKey(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, MAX_KEY_LENGTH) || "anon";
}
