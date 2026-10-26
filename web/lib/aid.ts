// Financial aid offers: the student types the yearly amount from each award letter; we set it beside the
// college's published cost of attendance. Only the arithmetic lives here. Nothing is invented: with no published
// cost there is no out-of-pocket figure, only the offer.

export type AidRow = {
  slug: string;
  name: string;
  /** Yearly aid offer in USD, as the student entered it. */
  offer: number;
  /** Published total cost of attendance per year in USD, or null when we don't have one. */
  coa: number | null;
};

export type AidComparison = AidRow & {
  /** coa - offer, never below 0. Null when coa is unknown. */
  outOfPocket: number | null;
  /** The offer is larger than the published cost, so the estimate was clamped to 0. */
  coversAll: boolean;
};

/** Parses what the student typed into a whole-dollar offer. Empty or invalid input is null (no offer); 0 is a real offer. */
export function parseOffer(raw: string): number | null {
  const t = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t));
  return Number.isSafeInteger(n) && n <= 2_000_000_000 ? n : null;
}

export function outOfPocket(offer: number, coa: number | null | undefined): number | null {
  if (coa == null) return null;
  return Math.max(0, Number(coa) - offer);
}

/** Lowest estimated out-of-pocket first; colleges without a published cost go last (by name). */
export function compareOffers(rows: AidRow[]): AidComparison[] {
  return rows
    .map((r): AidComparison => {
      const oop = outOfPocket(r.offer, r.coa);
      return { ...r, outOfPocket: oop, coversAll: oop === 0 && r.coa != null && r.offer > r.coa };
    })
    .sort((a, b) => {
      if (a.outOfPocket == null || b.outOfPocket == null) return Number(a.outOfPocket == null) - Number(b.outOfPocket == null) || a.name.localeCompare(b.name);
      return a.outOfPocket - b.outOfPocket || a.name.localeCompare(b.name);
    });
}
