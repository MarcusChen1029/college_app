// The CDS does not publish GPA percentiles — only the share of students in each band (C11).
// We estimate the 25th/50th/75th percentile by assuming students are spread evenly within
// each band and treating "4.0" as a single point. Always label the result as an estimate.

type Band = { lo: number; hi: number; pct: number };

function parseBands(dist: Record<string, number>): Band[] {
  const bands: Band[] = [];
  for (const [key, pct] of Object.entries(dist)) {
    if (!pct) continue;
    if (key === "4.0") {
      bands.push({ lo: 4, hi: 4, pct });
      continue;
    }
    const m = key.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    if (m) bands.push({ lo: Number(m[1]), hi: Number(m[2]) + 0.01, pct });
  }
  return bands.sort((a, b) => a.lo - b.lo);
}

export function estimateGpaPercentiles(dist: Record<string, number> | null | undefined) {
  if (!dist) return null;
  const bands = parseBands(dist);
  const total = bands.reduce((s, b) => s + b.pct, 0);
  if (total < 90) return null; // too incomplete to estimate

  const at = (q: number) => {
    const target = (q / 100) * total;
    let cum = 0;
    for (const b of bands) {
      if (cum + b.pct >= target) {
        if (b.lo === b.hi) return b.lo;
        const frac = (target - cum) / b.pct;
        return Math.min(4, b.lo + frac * (b.hi - b.lo));
      }
      cum += b.pct;
    }
    return bands[bands.length - 1].hi;
  };
  const r = (n: number) => Math.round(n * 100) / 100;
  return { p25: r(at(25)), p50: r(at(50)), p75: r(at(75)) };
}

export const GPA_BAND_ORDER = ["4.0", "3.75-3.99", "3.50-3.74", "3.25-3.49", "3.00-3.24", "2.50-2.99", "2.0-2.49", "1.0-1.99"];
