// Month-grid maths for the deadline calendar. Dates are "YYYY-MM-DD" strings and everything runs in UTC, so a
// deadline never slips a day with the reader's time zone (same convention as lib/format.ts).

export type DayCell = { iso: string; day: number; inMonth: boolean };

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" for a year, a 0-based month and a day; out-of-range days roll over like Date.UTC does. */
export function isoOf(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month, day));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The month a "YYYY-MM-DD" date falls in. */
export function monthOf(iso: string) {
  const [year, month] = iso.split("-").map(Number);
  return { year, month: month - 1 };
}

/** Moves a month by `by` months, wrapping the year. */
export function shiftMonth(m: { year: number; month: number }, by: number) {
  const d = new Date(Date.UTC(m.year, m.month + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** The weeks (Sunday first) that cover a month, padded with the neighbouring months' days. 5 or 6 rows of 7. */
export function monthGrid(year: number, month: number): DayCell[][] {
  const lead = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const rows = Math.ceil((lead + days) / 7);
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => {
      const d = new Date(Date.UTC(year, month, 1 - lead + r * 7 + c));
      return { iso: isoOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month };
    }),
  );
}

export const monthTitle = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** Groups items by their "YYYY-MM-DD" date. */
export function groupByDate<T>(items: T[], dateOf: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const key = dateOf(item);
    out.set(key, [...(out.get(key) ?? []), item]);
  }
  return out;
}
