// Which admission test (SAT, ACT or both) a student's numbers should be compared on.
// Shared by the profile form, fit labels and the colleges table.

import type { StudentProfile } from "./fit";

export type AdmissionTest = "sat" | "act";

/** Tests whose score the student wants used. An explicit `tests.plan.using` wins (a stored score
 * the student switched away from is ignored); otherwise every test with a score counts. */
export function scoredTests(p: StudentProfile | null | undefined): AdmissionTest[] {
  if (!p) return [];
  const has = (t: AdmissionTest) => (t === "sat" ? p.sat != null : p.act != null);
  const using = p.tests?.plan?.using;
  if (using && using.length > 0) return using.filter(has);
  return (["sat", "act"] as const).filter(has);
}

/** Tests to show college medians for: scored tests, else the planned test, else both. */
export function testsToCompare(p: StudentProfile | null | undefined): AdmissionTest[] {
  const scored = scoredTests(p);
  if (scored.length > 0) return scored;
  const planned = p?.tests?.plan?.planned?.test;
  return planned ? [planned] : ["sat", "act"];
}
