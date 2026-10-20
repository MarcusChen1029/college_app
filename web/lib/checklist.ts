// Per-college application checklist. Stored as one jsonb object (student_colleges.checklist):
// simple items are booleans; essays, tests and the English test carry a bit more detail.
// test_scores / english_test booleans mean "scores sent" (same keys older builds wrote).

export const CHECKLIST = [
  ["essays", "Essays"],
  ["recommendations", "Recommendations"],
  ["transcript", "Transcript sent"],
  ["test_scores", "Test scores"],
  ["english_test", "English test"],
  ["fee", "Fee paid / waived"],
  ["aid_forms", "Aid forms (CSS / FAFSA)"],
  ["interview", "Interview"],
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

export function newEssay(): Essay {
  return { id: Math.random().toString(36).slice(2, 10), title: "", url: "", status: "not_started" };
}

/** Only http(s) links are rendered as clickable, so a pasted "javascript:" string can't run. */
export function safeLink(url: string): string | null {
  const u = url.trim();
  return /^https?:\/\//i.test(u) ? u : null;
}
