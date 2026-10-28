// "Easy to apply" tags on college rows and pages: no supplemental essays, no application fee. Pure.
// A tag shows only on a sourced fact: unresearched or unknown supplements and a missing fee never earn one.
import { supplementStatus, type CollegeSupplements } from "./supplements.ts";

export const APPLY_TAGS = ["no_supplements", "no_app_fee"] as const;
export type ApplyTag = (typeof APPLY_TAGS)[number];

/** `appFeeUsd`: the latest cycle's application fee (null = not published). */
export function applyTags(supplements: CollegeSupplements | null, appFeeUsd: number | string | null | undefined): ApplyTag[] {
  const out: ApplyTag[] = [];
  if (supplementStatus(supplements) === "none") out.push("no_supplements");
  if (appFeeUsd != null && appFeeUsd !== "" && Number(appFeeUsd) === 0) out.push("no_app_fee");
  return out;
}

/** Tags for every college that has at least one, by slug. `fees` is keyed by institution id. */
export function applyTagsBySlug(
  colleges: readonly { id: string; slug: string }[],
  supplementsOf: (slug: string) => CollegeSupplements | null,
  fees: Record<string, number | null>,
): Record<string, ApplyTag[]> {
  const out: Record<string, ApplyTag[]> = {};
  for (const c of colleges) {
    const tags = applyTags(supplementsOf(c.slug), fees[c.id]);
    if (tags.length) out[c.slug] = tags;
  }
  return out;
}
