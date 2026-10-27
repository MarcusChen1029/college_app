// Which admission test (SAT, ACT or both) a student's numbers should be compared on.
// Shared by the profile form, fit labels and the colleges table.

import type { StudentProfile } from "./fit";
import type { TestPlan } from "./scores.ts";

export type AdmissionTest = "sat" | "act";

/** The one choice the profile form shows. `planned` = will take a test but has no score yet; `none` = applying test-free. */
export type TestChoice = "sat" | "act" | "both" | "planned" | "none";
export const TEST_CHOICES: readonly TestChoice[] = ["sat", "act", "both", "planned", "none"];

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isPlanMonth = (v: unknown): v is string => typeof v === "string" && MONTH.test(v);

/** Tests whose score the student wants used. An explicit `tests.plan.using` wins (a stored score
 * the student switched away from is ignored); "not taking" or "planning to take" use no score at all;
 * with no stored choice every test with a score counts. */
export function scoredTests(p: StudentProfile | null | undefined): AdmissionTest[] {
  if (!p) return [];
  const has = (t: AdmissionTest) => (t === "sat" ? p.sat != null : p.act != null);
  const plan = p.tests?.plan;
  if (plan?.notTaking) return [];
  if (plan?.using && plan.using.length > 0) return plan.using.filter(has);
  if (plan?.planned) return [];
  return (["sat", "act"] as const).filter(has);
}

/** Tests to show college medians for: scored tests, else the chosen test, else the planned test, else both. */
export function testsToCompare(p: StudentProfile | null | undefined): AdmissionTest[] {
  const scored = scoredTests(p);
  if (scored.length > 0) return scored;
  const plan = p?.tests?.plan;
  if (plan?.notTaking) return ["sat", "act"];
  if (plan?.using && plan.using.length > 0) return plan.using;
  const planned = plan?.planned?.test;
  return planned ? [planned] : ["sat", "act"];
}

/** What the form shows as selected. A stored choice wins; with none stored it is read from the scores
 * (both scores = "both"), so existing students see their old setup without anything being written. */
export function testChoice(p: StudentProfile | null | undefined): TestChoice | null {
  if (!p) return null;
  const plan = p.tests?.plan;
  if (plan?.notTaking) return "none";
  const using = new Set(plan?.using ?? []);
  if (using.size > 0) return using.has("sat") && using.has("act") ? "both" : using.has("sat") ? "sat" : "act";
  if (plan?.planned) return "planned";
  if (p.sat != null && p.act != null) return "both";
  if (p.sat != null) return "sat";
  if (p.act != null) return "act";
  return null;
}

/** The plan after the student picks `choice`. Scores are never touched, and an earlier "planned" test is
 * remembered so switching back to "Planning to take" restores it. */
export function withTestChoice(plan: TestPlan | undefined, choice: TestChoice): TestPlan {
  const planned = plan?.planned ?? undefined;
  const keep = planned ? { planned } : {};
  switch (choice) {
    case "sat":
      return { using: ["sat"], ...keep };
    case "act":
      return { using: ["act"], ...keep };
    case "both":
      return { using: ["sat", "act"], ...keep };
    case "planned":
      return { using: [], planned: planned ?? { test: "sat", month: null } };
    case "none":
      return { using: [], notTaking: true, ...keep };
  }
}

/** The plan after the planned test and/or month changed (month `null` = not sure yet). */
export function withPlanned(plan: TestPlan | undefined, patch: { test?: AdmissionTest; month?: string | null }): TestPlan {
  const cur = plan?.planned;
  return { ...plan, planned: { test: patch.test ?? cur?.test ?? "sat", month: patch.month !== undefined ? patch.month : (cur?.month ?? null) } };
}

/** Months to offer for a planned test: `count` months from `nowYM` (YYYY-MM), plus the saved one if it is outside that range.
 * `nowYM` is "" before the client knows the date; only the saved month is offered then. */
export function planMonthOptions(nowYM: string, selected?: string | null, count = 24): string[] {
  const out: string[] = [];
  if (isPlanMonth(nowYM)) {
    let [y, m] = nowYM.split("-").map(Number);
    for (let i = 0; i < count; i++) {
      out.push(`${y}-${String(m).padStart(2, "0")}`);
      if (++m > 12) {
        m = 1;
        y++;
      }
    }
  }
  if (selected && isPlanMonth(selected) && !out.includes(selected)) out.push(selected);
  return out.sort();
}

/** Stored scores that the current choice leaves out, so the form can say so and offer to bring them back. */
export function unusedScores(p: StudentProfile | null | undefined): AdmissionTest[] {
  if (!p) return [];
  const used = scoredTests(p);
  return (["sat", "act"] as const).filter((t) => (t === "sat" ? p.sat != null : p.act != null) && !used.includes(t));
}

/** The choice that brings `test` back without dropping what is already in use. */
export function choiceWith(p: StudentProfile, test: AdmissionTest): TestChoice {
  const cur = testChoice(p);
  return (cur === "sat" && test === "act") || (cur === "act" && test === "sat") ? "both" : test;
}
