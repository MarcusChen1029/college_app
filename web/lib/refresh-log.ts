// The public record of when data was loaded or re-checked (shown at /data-updates, quoted by the weekly "what changed" tool).
// The entries live in data/refresh-log.json, newest first, each with its own English and Traditional Chinese text (data, not
// dictionary keys). They come from the repo's own record of loads (root CLAUDE.md status sections): a new load adds an entry
// at the top, and nothing is written here that CLAUDE.md does not state. refresh-log.test.ts checks shape, order and text.
import raw from "./data/refresh-log.json" with { type: "json" };

export type RefreshEntry = {
  /** The day the load went in, ISO (YYYY-MM-DD). */
  date: string;
  en: { title: string; summary: string };
  zh: { title: string; summary: string };
  /** How many colleges (or other items) the load covers, only where the record states a number. */
  count?: number;
};

// Through unknown: the inferred JSON literal types are wider than the checked shape (and the test checks the shape).
export const REFRESH_LOG: readonly RefreshEntry[] = raw as unknown as readonly RefreshEntry[];

/** The entries dated on or after `fromIso` (ISO days compare as text), in the log's order (newest first). */
export function entriesSince(fromIso: string, log: readonly RefreshEntry[] = REFRESH_LOG): RefreshEntry[] {
  return log.filter((e) => e.date >= fromIso);
}

/** The log as one group per day, so a day with several loads shows its date once. Keeps the log's order. */
export function groupByDate(log: readonly RefreshEntry[] = REFRESH_LOG): { date: string; entries: RefreshEntry[] }[] {
  const groups: { date: string; entries: RefreshEntry[] }[] = [];
  for (const e of log) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.entries.push(e);
    else groups.push({ date: e.date, entries: [e] });
  }
  return groups;
}
