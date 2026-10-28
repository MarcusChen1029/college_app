// Numbers the landing page shows. Every one is counted from the loaded data, never typed in.

/** "450+" style: rounds down so the "+" is always true (to 50s from 100, to 10s from 10). */
export function countFloor(n: number): number {
  if (n >= 100) return Math.floor(n / 50) * 50;
  if (n >= 10) return Math.floor(n / 10) * 10;
  return n;
}

export function collegeCounts(colleges: readonly { country_code: string }[]): { total: number; us: number; other: number } {
  const us = colleges.filter((c) => c.country_code === "US").length;
  return { total: colleges.length, us, other: colleges.length - us };
}

type DatedDeadline = { institution_id: string; due_date: string | null };

/** Deadlines due today or later (ISO dates compare as strings). */
export function upcomingDeadlines<D extends DatedDeadline>(deadlines: readonly D[], today: string): D[] {
  return deadlines.filter((d) => d.due_date != null && d.due_date >= today);
}

/** A college's next deadline due today or later, or null. */
export function nextDeadline<D extends DatedDeadline>(deadlines: readonly D[], institutionId: string, today: string): D | null {
  let best: D | null = null;
  for (const d of deadlines) {
    if (d.institution_id !== institutionId || d.due_date == null || d.due_date < today) continue;
    if (!best || d.due_date < best.due_date!) best = d;
  }
  return best;
}

/**
 * Social proof for the landing page. Real figures only: leave `students` null and `quotes` empty until there is a
 * counted number or a quote someone agreed to have published. The page hides the block while both are empty.
 */
export const SOCIAL_PROOF: { students: number | null; quotes: readonly { text: string; who: string }[] } = { students: null, quotes: [] };

export const hasSocialProof = (p: typeof SOCIAL_PROOF): boolean => p.students != null || p.quotes.length > 0;
