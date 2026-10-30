// Twin of the date rules in web/lib/plans.ts (the payment functions run in Deno and can't import from web/).
// web/lib/pass-parity.test.ts checks the two agree on every day from 2026-06-01 to 2029-08-31, so change both together.
// After editing, redeploy every edge function that imports this file.
//
// Dates are ISO "YYYY-MM-DD" strings on the Taipei calendar (UTC+8, no DST). A pass is bought for one entry year,
// ends July 31 of that year and starts on the purchase day, or Jan 1 of the year before entry if that is later.

/** Admission-year pass price in TWD. */
export const PASS_PRICE_TWD = 990;

/** Today's date in Taipei as "YYYY-MM-DD". */
export function taipeiToday(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Year of the application cycle running on `today`: Aug 1 starts the cycle for next year's entry. */
export function currentEntryYear(today: string): number {
  const [year, month] = today.split("-").map(Number);
  return month >= 8 ? year + 1 : year;
}

/** Entry years on sale today, ascending: this cycle's (unless it is July, the last month of the pass) plus the next two. */
export function offeredEntryYears(today: string): number[] {
  const first = currentEntryYear(today);
  const years = [first, first + 1, first + 2];
  const month = Number(today.split("-")[1]);
  return month === 7 ? years.slice(1) : years;
}

/** The first and last day a pass for `entryYear` bought on `paidOn` is valid (both inclusive). */
export function passWindow(entryYear: number, paidOn: string): { from: string; until: string } {
  const earliestStart = `${entryYear - 1}-01-01`;
  const from = paidOn < earliestStart ? earliestStart : paidOn;
  return { from, until: `${entryYear}-07-31` };
}
