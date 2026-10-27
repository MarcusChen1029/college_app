// Which of a college's deadlines belong on one student's own lists (My list, profile calendar, AI context, MCP).
// Twin: supabase/functions/_shared/fafsa.ts holds the same isFafsaOnly for the reminder emails (Deno can't import
// from web/). deadline-rules.test.ts checks the two agree on every label in the data, so change both together.

import type { Deadline } from "./types.ts";

// FAFSA and the state forms that stand in for it (WASFA, TASFA, ORSAA, CADAA / Dream Act) are for US citizens,
// permanent residents and some state residents. A student on an F-1 visa can file none of them.
const FAFSA_FAMILY = /\b(fafsa|wasfa|tasfa|orsaa|cadaa|dream act)\b/i;
// Anything else a label names keeps it: the CSS Profile, IDOC and ISAFA are used by international applicants,
// and a scholarship or "international" date is not about FAFSA at all.
const OTHER_FORM = /\b(css|idoc|isafa|scholarships?|institutional|international|noncustodial)\b/i;

/** True for an aid date that only concerns FAFSA (e.g. "FAFSA priority filing date"); "CSS Profile / FAFSA (RD)" is false. */
export function isFafsaOnly(label: string | null | undefined): boolean {
  if (!label) return false;
  return FAFSA_FAMILY.test(label) && !OTHER_FORM.test(label);
}

/**
 * Whether a listed college's deadline applies to this student. Once a plan is picked, only that plan's application
 * deadline is kept; an international student never sees FAFSA-only dates.
 */
export function deadlineApplies(d: Pick<Deadline, "kind" | "plan_key" | "label">, who: { plan: string | null; international: boolean }): boolean {
  if (d.kind === "application" && who.plan && d.plan_key !== who.plan) return false;
  if (who.international && d.kind !== "application" && isFafsaOnly(d.label)) return false;
  return true;
}
