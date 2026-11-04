// The UK personal statement and the UCAS reference are one per student, but show as an item on every UK college's checklist.
// The source is profile.essays.ucas; these helpers copy it into each UK college's checklist (like STARS on Portals).

import type { Checklist } from "./checklist.ts";
import { countryOf } from "./application-steps.ts";
import type { PersonalEssays } from "./personal-essays.ts";
import type { ListEntry } from "./student-rows.ts";

/** Element ids on the Essays and Recommenders sections; the checklist links to them. */
export const UCAS_PS_ANCHOR = "ucas-ps";
export const UCAS_REFERENCE_ANCHOR = "ucas-reference";

export function ucasSharedValues(essays: PersonalEssays | undefined | null): { ucas_ps: boolean; ucas_reference: boolean } {
  return { ucas_ps: essays?.ucas?.status === "final", ucas_reference: essays?.ucas?.reference === true };
}

/** Patches for UK (non-custom) entries whose copies differ from the source. Missing keys count as false. Works both ways. */
export function ucasSharedPatches(
  list: readonly Pick<ListEntry, "slug" | "checklist" | "custom">[],
  essays: PersonalEssays | undefined | null,
): { slug: string; checklist: Checklist }[] {
  const { ucas_ps, ucas_reference } = ucasSharedValues(essays);
  return list
    .filter((e) => !e.custom && countryOf(e.slug) === "GB" && (!!e.checklist.ucas_ps !== ucas_ps || !!e.checklist.ucas_reference !== ucas_reference))
    .map((e) => ({ slug: e.slug, checklist: { ...e.checklist, ucas_ps, ucas_reference } }));
}
