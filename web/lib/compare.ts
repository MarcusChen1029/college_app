// The compare page's URL (?c=slug,slug) and limits, shared by its server page and client picker. Pure.

/** One college the picker can add: just enough to search and label it. */
export type CompareOption = { slug: string; label: string; name: string; place: string };

export const MAX_COMPARE = 4;

export const compareHref = (slugs: readonly string[]): string => (slugs.length ? `/compare?c=${slugs.join(",")}` : "/compare");

/** Slugs from the `c` search param: trimmed, de-duplicated, at most MAX_COMPARE. */
export function parseCompare(param: string | string[] | undefined): string[] {
  const raw = Array.isArray(param) ? param.join(",") : (param ?? "");
  const slugs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(slugs)].slice(0, MAX_COMPARE);
}
