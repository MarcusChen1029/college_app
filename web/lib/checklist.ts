// Per-college application checklist. Stored as one jsonb object (student_colleges.checklist):
// simple items are booleans; essays, tests and the English test carry a bit more detail.
// test_scores / english_test booleans mean "scores sent" (same keys older builds wrote).

export const CHECKLIST = [
  ["essays", "Essays"],
  ["recommendations", "Recommendations"],
  ["transcript", "Transcript sent"],
  ["test_scores", "Test scores"],
  ["english_test", "English test"],
] as const;
export type ChecklistKey = (typeof CHECKLIST)[number][0];

export const ESSAY_STATUSES = [
  ["not_started", "Not started"],
  ["brainstorming", "Brainstorming"],
  ["drafting", "Drafting"],
  ["revising", "Revising"],
  ["final", "Final"],
] as const;
export type EssayStatus = (typeof ESSAY_STATUSES)[number][0];
export type Essay = { id: string; title: string; url: string; status: EssayStatus };

export const TEST_PLANS = [
  ["sat", "SAT"],
  ["act", "ACT"],
  ["optional", "Test optional (not sending)"],
] as const;
export type TestPlan = (typeof TEST_PLANS)[number][0];

export const ENGLISH_PLANS = [
  ["toefl", "TOEFL iBT"],
  ["ielts", "IELTS"],
  ["duolingo", "Duolingo English Test"],
  ["pte", "PTE Academic"],
  ["cambridge", "Cambridge English"],
  ["not_required", "Not required / waived"],
] as const;
export type EnglishPlan = (typeof ENGLISH_PLANS)[number][0];

export type Checklist = Partial<Record<Exclude<ChecklistKey, "essays">, boolean>> & {
  essay_list?: Essay[];
  no_essays?: boolean;
  test_plan?: TestPlan | null;
  english_plan?: EnglishPlan | null;
};

export function isDone(key: ChecklistKey, c: Checklist): boolean {
  switch (key) {
    case "essays": {
      if (c.no_essays) return true;
      const list = c.essay_list ?? [];
      return list.length > 0 && list.every((e) => e.status === "final");
    }
    case "test_scores":
      return c.test_plan === "optional" || (!!c.test_plan && !!c.test_scores);
    case "english_test":
      return c.english_plan === "not_required" || (!!c.english_plan && !!c.english_test);
    default:
      return !!c[key];
  }
}

export function progress(c: Checklist) {
  const done = CHECKLIST.filter(([k]) => isDone(k, c)).length;
  return { done, total: CHECKLIST.length, missing: CHECKLIST.length - done };
}

export type SentKind = "test_scores" | "english_test";

/**
 * "Scores sent" for one college when the student sends them to every college at once.
 * An undecided plan takes `fallbackPlan` (the one test the student has a score for), else stays undecided.
 * Null when there is nothing to change: already sent, or the college doesn't get scores (optional / not required).
 */
export function markSent(c: Checklist, kind: SentKind, fallbackPlan: TestPlan | EnglishPlan | null): Checklist | null {
  const planKey = kind === "test_scores" ? "test_plan" : "english_plan";
  const plan = c[planKey];
  if (plan === "optional" || plan === "not_required") return null;
  if (c[kind] && plan) return null;
  if (c[kind] && !fallbackPlan) return null;
  return { ...c, [kind]: true, ...(plan ? {} : fallbackPlan ? { [planKey]: fallbackPlan } : {}) };
}

/** The student's only SAT/ACT or English test with a total, as a checklist plan; null when none or more than one. */
export function onlyTestPlan(sat: number | null | undefined, act: number | null | undefined): TestPlan | null {
  if (sat != null && act == null) return "sat";
  if (act != null && sat == null) return "act";
  return null;
}

export function onlyEnglishPlan(english: Partial<Record<string, { total: number | null } | undefined>> | undefined): EnglishPlan | null {
  const known = new Set(ENGLISH_PLANS.map(([k]) => k as string));
  const plans = new Set(
    Object.entries(english ?? {})
      .filter(([, s]) => s?.total != null)
      .map(([k]) => (k === "toefl_band" ? "toefl" : k))
      .filter((k) => known.has(k)),
  );
  return plans.size === 1 ? ([...plans][0] as EnglishPlan) : null;
}

export function newEssay(): Essay {
  return { id: Math.random().toString(36).slice(2, 10), title: "", url: "", status: "not_started" };
}

/** Only http(s) links are rendered as clickable, so a pasted "javascript:" string can't run. */
export function safeLink(url: string): string | null {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : null;
}
