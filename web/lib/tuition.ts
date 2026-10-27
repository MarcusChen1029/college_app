// The yearly tuition figure the colleges table shows and the "max tuition" filter uses. Pure.
// US colleges: what an international student would be charged (intl rate, else out-of-state for publics, else the
// published rate). Colleges outside the US charge by course, in their own currency: the cheapest-to-dearest range.
// Never converted between currencies, and housing / fees are not included.
import type { CollegeSummary } from "./types.ts";

export type Currency = "USD" | "GBP" | "CAD" | "AUD";

/** Which figure was used. `published` = the college's one listed tuition (for a public it may be the in-state rate). */
export type TuitionBasis = "intl" | "out_of_state" | "published" | "in_state" | "course_fee";

export type TuitionEstimate = {
  amount: number | null; // per year; for courses the cheapest one
  max: number | null; // courses only: the dearest one when it differs
  currency: Currency;
  basis: TuitionBasis | null;
  /** Domestic students at a public college: the out-of-state rate, shown as a second line. */
  outOfState: number | null;
  /** Public college with a single published figure, used for an international student: may be the in-state rate. */
  maybeLow: boolean;
};

export type ProgramFees = { currency: Currency; min: number; max: number };

type TuitionInput = Pick<CollegeSummary, "country_code" | "control" | "tuition_usd" | "tuition_out_of_state_usd" | "tuition_intl_usd">;
type FeeRow = { intl_fee_gbp: number | null; intl_fee_cad: number | null; intl_fee_aud: number | null };

export const COUNTRY_CURRENCY: Record<string, Currency> = { US: "USD", GB: "GBP", CA: "CAD", AU: "AUD" };
export const currencyFor = (country: string | null | undefined): Currency => COUNTRY_CURRENCY[country ?? "US"] ?? "USD";

/** Budget steps for the max-tuition filter, per currency (amounts per year). */
export const TUITION_CAPS: Record<Currency, number[]> = {
  USD: [10000, 20000, 30000, 40000, 50000, 60000, 70000],
  GBP: [20000, 25000, 30000, 35000, 40000, 50000],
  CAD: [30000, 40000, 50000, 60000, 70000],
  AUD: [30000, 40000, 50000, 60000],
};

const num = (n: number | null | undefined): number | null => (n == null || !Number.isFinite(Number(n)) ? null : Number(n));

export function estimatedTuition(c: TuitionInput, international: boolean, fees?: ProgramFees | null): TuitionEstimate {
  const country = c.country_code ?? "US";
  const none: TuitionEstimate = { amount: null, max: null, currency: currencyFor(country), basis: null, outOfState: null, maybeLow: false };
  if (country !== "US") {
    if (!fees) return none;
    return { ...none, currency: fees.currency, amount: fees.min, max: fees.max > fees.min ? fees.max : null, basis: "course_fee" };
  }
  const isPublic = c.control === "public";
  const intl = num(c.tuition_intl_usd);
  const oos = num(c.tuition_out_of_state_usd);
  const base = num(c.tuition_usd);
  if (international) {
    if (intl != null) return { ...none, amount: intl, basis: "intl" };
    if (isPublic && oos != null) return { ...none, amount: oos, basis: "out_of_state" };
    if (base != null) return { ...none, amount: base, basis: "published", maybeLow: isPublic };
    return none;
  }
  if (base != null) {
    const twoRates = isPublic && oos != null && oos !== base;
    return { ...none, amount: base, basis: twoRates ? "in_state" : "published", outOfState: twoRates ? oos : null };
  }
  if (isPublic && oos != null) return { ...none, amount: oos, basis: "out_of_state" };
  return none;
}

/** Cheapest and dearest international course fee for one college, in its own currency. Null when none is found. */
export function programFeeRange(rows: FeeRow[]): ProgramFees | null {
  const pick = (r: FeeRow): [Currency, number] | null =>
    r.intl_fee_gbp != null ? ["GBP", r.intl_fee_gbp] : r.intl_fee_cad != null ? ["CAD", r.intl_fee_cad] : r.intl_fee_aud != null ? ["AUD", r.intl_fee_aud] : null;
  const fees = rows.map(pick).filter((x): x is [Currency, number] => x != null);
  if (!fees.length) return null;
  const currency = fees[0][0];
  const amounts = fees.filter(([c]) => c === currency).map(([, n]) => Number(n));
  return { currency, min: Math.min(...amounts), max: Math.max(...amounts) };
}

const SYMBOL: Record<Currency, string> = { USD: "$", GBP: "£", CAD: "CA$", AUD: "A$" };

/** "$58,000", "£39,500", "CA$62,000", "A$54,000" (same style as lib/programs.ts). */
export const fmtMoney = (n: number, currency: Currency): string => `${SYMBOL[currency]}${Math.round(n).toLocaleString("en-US")}`;

/** "$30k" style, for filter steps and chips. */
export const fmtMoneyShort = (n: number, currency: Currency): string => `${SYMBOL[currency]}${Math.round(n / 1000)}k`;

/** Max-tuition filter: the figure is known, in the cap's currency, and within the cap (for courses: at least one course is). */
export const withinBudget = (t: TuitionEstimate, cap: number | null, capCurrency: Currency): boolean =>
  cap == null || (t.amount != null && t.currency === capCurrency && t.amount <= cap);
