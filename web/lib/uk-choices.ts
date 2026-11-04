import { countryOf } from "./application-steps.ts";
import type { ListEntry } from "./student-rows.ts";

/** UCAS lets an undergraduate applicant list 5 choices. */
export const UCAS_MAX_CHOICES = 5;

/**
 * Official page that says Oxford and Cambridge can't both be applied to in one year (checked 2026-11-04):
 * "You cannot apply to Cambridge and Oxford in the same year." The page lists no exceptions.
 * (The Oxford page, ox.ac.uk/admissions/undergraduate/applying-to-oxford/guide/ucas-application, returned 403 to fetchers.)
 * Not built: the 4-choice limit for medicine, dentistry and veterinary courses (see CLAUDE.md, Multi-country).
 */
export const OXBRIDGE_RULE_SOURCE: string | null = "https://www.undergraduate.study.cam.ac.uk/apply/how/ucas-application";

export type UkWarning = { kind: "too_many"; count: number } | { kind: "oxbridge" };

/** A UK choice that is in play: a real (not typed-in) UK university the student has moved past "researching" and not withdrawn. Rejected still counts. */
function isActive(e: Pick<ListEntry, "status" | "custom">, country: string): boolean {
  return country === "GB" && !e.custom && e.status !== "researching" && e.status !== "withdrawn";
}

export function ukChoiceWarnings(
  list: readonly Pick<ListEntry, "slug" | "status" | "custom">[],
  lookup: { countryOf: typeof countryOf } = { countryOf },
): UkWarning[] {
  const active = list.filter((e) => isActive(e, lookup.countryOf(e.slug)));
  const warnings: UkWarning[] = [];
  if (active.length > UCAS_MAX_CHOICES) warnings.push({ kind: "too_many", count: active.length });
  if (OXBRIDGE_RULE_SOURCE !== null) {
    const slugs = new Set(active.map((e) => e.slug));
    if (slugs.has("oxford") && slugs.has("cambridge")) warnings.push({ kind: "oxbridge" });
  }
  return warnings;
}
