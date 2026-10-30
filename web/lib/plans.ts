// Plans and the admission-year pass rules. There are two plans: Free, and the paid "Admission-year pass"
// (DB key stays "senior"). Students do not pick a plan: they buy a pass for one entry year and it is
// active from its start date until July 31 of that entry year. A pass changes how many colleges fit in
// My list, whether "Copy for AI" includes each college's sourced details, and whether Connect AI (the MCP
// server for ChatGPT / Claude) and the Common App filler are available.
//
// All dates are ISO "YYYY-MM-DD" strings on the Taipei calendar (UTC+8, Taiwan has no DST), compared as
// strings. supabase/functions/_shared/pass.ts is the Deno-side twin of the date functions below
// (pass-parity.test.ts checks they agree), so change both together.

export const FREE_LIMIT = 5;
export const PASS_PRICE_TWD = 990;

export const PLANS = [
  { key: "free", name: "Free", priceTwd: 0, limit: FREE_LIMIT, fullAiContext: false, connectAi: false, filler: false },
  { key: "senior", name: "Admission-year pass", priceTwd: PASS_PRICE_TWD, limit: null, fullAiContext: true, connectAi: true, filler: true },
] as const;
export type PlanKey = (typeof PLANS)[number]["key"];
export type Plan = (typeof PLANS)[number];

export const DEFAULT_PLAN: PlanKey = "free";

export function getPlan(key: string | null | undefined): Plan {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}

/** null = unlimited */
export const listLimit = (key: string | null | undefined): number | null => getPlan(key).limit;

export function canAddMore(key: string | null | undefined, listed: number): boolean {
  const limit = listLimit(key);
  return limit == null || listed < limit;
}

/** One purchased pass: ISO dates, both ends inclusive (Taipei). */
export type PlanWindow = { entry_year: number; from: string; until: string };

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Today's date in Taipei as "YYYY-MM-DD". */
export function taipeiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10);
}

const yearOf = (day: string): number => Number(day.slice(0, 4));
const monthOf = (day: string): number => Number(day.slice(5, 7));

/** The entry year of the application cycle running on `today`: next year from Aug 1, else this year. */
export function currentEntryYear(today: string): number {
  return monthOf(today) >= 8 ? yearOf(today) + 1 : yearOf(today);
}

/** Entry years that can be bought today, ascending: the current one (not in July, its last month) and the next two. */
export function offeredEntryYears(today: string): number[] {
  const e0 = currentEntryYear(today);
  return monthOf(today) === 7 ? [e0 + 1, e0 + 2] : [e0, e0 + 1, e0 + 2];
}

/**
 * The span a pass bought on `paidOn` covers: it ends July 31 of the entry year and starts on the purchase day,
 * or on Jan 1 of the year before entry when bought earlier than that.
 */
export function passWindow(entryYear: number, paidOn: string): { from: string; until: string } {
  const earliest = `${entryYear - 1}-01-01`;
  return { from: paidOn > earliest ? paidOn : earliest, until: `${entryYear}-07-31` };
}

/** The window covering `today` (inclusive at both ends); with overlapping windows, the one that lasts longest. */
export function activeWindow(windows: readonly PlanWindow[] | null | undefined, today: string): PlanWindow | null {
  let best: PlanWindow | null = null;
  for (const w of windows ?? []) {
    if (w.from <= today && today <= w.until && (best === null || w.until > best.until)) best = w;
  }
  return best;
}

/** The earliest window that has not started yet (`from > today`). */
export function upcomingWindow(windows: readonly PlanWindow[] | null | undefined, today: string): PlanWindow | null {
  let best: PlanWindow | null = null;
  for (const w of windows ?? []) {
    if (w.from > today && (best === null || w.from < best.from)) best = w;
  }
  return best;
}

/** "senior" while a pass is active today, otherwise "free". */
export function effectivePlanKey(windows: readonly PlanWindow[] | null | undefined, today: string): PlanKey {
  return activeWindow(windows, today) ? "senior" : "free";
}
