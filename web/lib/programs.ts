// Course-level helpers for universities outside the US (UK / Canada / Australia), see types.ts Program.
import type { Program } from "./types.ts";

type FeeFields = Pick<Program, "intl_fee_gbp" | "intl_fee_cad" | "intl_fee_aud">;

// The international fee per year in the course's own currency, e.g. "£39,500", "CA$62,000", "A$54,000"; null if not found.
export const programFee = (p: FeeFields): string | null => {
  if (p.intl_fee_gbp != null) return `£${p.intl_fee_gbp.toLocaleString("en-GB")}`;
  if (p.intl_fee_cad != null) return `CA$${p.intl_fee_cad.toLocaleString("en-CA")}`;
  if (p.intl_fee_aud != null) return `A$${p.intl_fee_aud.toLocaleString("en-AU")}`;
  return null;
};

// How an international student applies to the course. UK rows loaded before migration 0035 have no
// apply_via, and every UK undergraduate course goes through UCAS.
export const programApplyVia = (p: Pick<Program, "apply_via">, country: string): string | null =>
  p.apply_via ?? (country === "GB" ? "UCAS" : null);
