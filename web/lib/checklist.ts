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
/** `prompt_key`: the supplemental prompt this essay answers (lib/supplements.ts); absent on essays added by hand. */
export type Essay = { id: string; title: string; url: string; status: EssayStatus; prompt_key?: string };

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

// Steps only international students have. Stored as booleans in the same checklist jsonb (additive keys), but they
// never count toward progress() or "Ready": Ready means "the application can be submitted", and these come later or
// run on their own clock (most colleges ask for proof of finances after admission, to issue the I-20).
export const INTL_STEPS = [
  ["intl_finances", "Proof of finances sent"],
  ["i20", "I-20 received"],
  ["passport", "Passport valid"],
  ["sevis_fee", "SEVIS I-901 fee paid"],
  ["visa_interview", "Visa interview booked"],
] as const;
export type IntlStepKey = (typeof INTL_STEPS)[number][0];

// Steps that come after the application, for colleges that ask for them (STARS: lib/application-systems-data.ts
// requiresStars). A stored boolean like the international steps; never counts toward progress() or "Ready".
export const AFTER_APPLY = [["stars", "STARS self-reported transcript"]] as const;
export type AfterApplyKey = (typeof AFTER_APPLY)[number][0];

export type Checklist = Partial<Record<Exclude<ChecklistKey, "essays">, boolean>> &
  Partial<Record<IntlStepKey, boolean>> &
  Partial<Record<AfterApplyKey, boolean>> & {
    essay_list?: Essay[];
    no_essays?: boolean;
    test_plan?: TestPlan | null;
    english_plan?: EnglishPlan | null;
    // UK / Canada / Australia (additive keys; US colleges never read them):
    ucas_ps?: boolean;
    ucas_reference?: boolean;
    admissions_test?: boolean;
    extra_steps?: Record<string, boolean>;
    course?: string | null;
    intake?: Intake | null;
  };

export type CountryCode = "US" | "GB" | "CA" | "AU";
export type Intake = "s1" | "s2";
export const STEP_KINDS = ["supplementary_form", "university_form", "written_work", "portfolio", "interview", "test"] as const;
export type StepKind = (typeof STEP_KINDS)[number];
export type ExtraStep = { id: string; kind: StepKind; name: string; courses: "all" | string[]; deadlineLabel: string | null; sourceUrl: string; verifiedOn: string };
export type CourseInfo = {
  id: string; slug: string; name: string; ucasCode: string | null; aLevelOffer: string | null; ibOffer: string | null;
  apOffer: string | null; atar: number | null; admissionsTest: string | null; applicationDeadline: string | null;
};
export type CollegeContext = {
  country: CountryCode; course: CourseInfo | null;
  /** True when the college has courses: its checklist then starts with "course_choice" (never Ready without a course). */
  hasCourses: boolean;
  steps: ExtraStep[]; researched: boolean; admissionsUrl: string | null;
};
export const US_CONTEXT: CollegeContext = { country: "US", course: null, hasCourses: false, steps: [], researched: true, admissionsUrl: null };

export type ItemKey = ChecklistKey | "course_choice" | "ucas_ps" | "ucas_reference" | "admissions_test" | `step:${string}`;
export type ChecklistItem = { key: ItemKey; done: boolean; shared: boolean; step: ExtraStep | null; detail: string | null };

export type IntlStep = {
  key: IntlStepKey;
  done: boolean;
  /** Per-college timing text for the step (e.g. from data/supplements_2026_27 `intl_finance`); null until that data is loaded. */
  when: string | null;
};

/**
 * International steps for one college, in order; empty for a domestic student. Proof of finances applies to every
 * application; the I-20 once admitted; the visa steps only at the college the student committed to (the SEVIS fee and the
 * visa interview use that college's I-20, so they are done once, for one school).
 */
export function intlSteps(c: Checklist, status: string, opts: { international: boolean; financeWhen?: string | null }): IntlStep[] {
  if (!opts.international) return [];
  const step = (key: IntlStepKey, when: string | null = null): IntlStep => ({ key, done: !!c[key], when });
  const out = [step("intl_finances", opts.financeWhen ?? null)];
  if (status === "admitted" || status === "enrolled") out.push(step("i20"));
  if (status === "enrolled") out.push(step("passport"), step("sevis_fee"), step("visa_interview"));
  return out;
}

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

/** A test step about the SAT or the ACT (its name says so, in capitals): a Canadian checklist ticks it with the SAT/ACT plan. */
export function isSatActStep(s: Pick<ExtraStep, "kind" | "name">): boolean {
  return s.kind === "test" && /\b(SAT|ACT)\b/.test(s.name);
}

/**
 * The items that count toward "Ready" for one college, in order. US: the five CHECKLIST keys. UK / Canada / Australia: the
 * country's own steps (see the item rules in the UK/CA/AU plan). A college with courses starts with "course_choice", so it is
 * never Ready until a course is picked and Ready can't flip off later when that course brings extra steps.
 */
export function checklistItems(c: Checklist, ctx: CollegeContext = US_CONTEXT): ChecklistItem[] {
  const item = (key: ItemKey, done: boolean, o: Partial<ChecklistItem> = {}): ChecklistItem => ({ key, done, shared: false, step: null, detail: null, ...o });
  if (ctx.country === "US") return CHECKLIST.map(([k]) => item(k, isDone(k, c)));
  const stepItem = (s: ExtraStep) => item(`step:${s.id}`, c.extra_steps?.[s.id] === true, { step: s });
  const out: ChecklistItem[] = [];
  if (ctx.hasCourses) out.push(item("course_choice", ctx.course != null, { detail: ctx.course?.name ?? null }));
  if (ctx.country === "GB") {
    out.push(item("ucas_ps", c.ucas_ps === true, { shared: true }), item("ucas_reference", c.ucas_reference === true, { shared: true }));
    if (ctx.course?.admissionsTest) out.push(item("admissions_test", c.admissions_test === true, { detail: ctx.course.admissionsTest }));
    out.push(...ctx.steps.map(stepItem), item("english_test", isDone("english_test", c)));
  } else if (ctx.country === "CA") {
    // An SAT/ACT test step (e.g. a score disclosure) is the SAT/ACT plan item; any other test (Western's Casper) is a plain step.
    const satAct = ctx.steps.find(isSatActStep);
    out.push(item("transcript", isDone("transcript", c)), ...ctx.steps.filter((s) => !isSatActStep(s)).map(stepItem), item("english_test", isDone("english_test", c)));
    if (satAct) out.push(item("test_scores", isDone("test_scores", c), { detail: satAct.name }));
  } else {
    out.push(item("transcript", isDone("transcript", c)), ...ctx.steps.map(stepItem), item("english_test", isDone("english_test", c)));
  }
  return out;
}

export function progress(c: Checklist, ctx: CollegeContext = US_CONTEXT) {
  if (ctx.country === "US") {
    const done = CHECKLIST.filter(([k]) => isDone(k, c)).length;
    return { done, total: CHECKLIST.length, missing: CHECKLIST.length - done };
  }
  const items = checklistItems(c, ctx);
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, missing: items.length - done };
}

/** English label for an item, for AI and email text (the web UI uses the i18n dictionaries). US labels are the CHECKLIST ones. */
export function itemLabel(item: ChecklistItem, country: CountryCode): string {
  if (item.step) return item.step.name;
  switch (item.key) {
    case "course_choice":
      return "Course chosen";
    case "ucas_ps":
      return "UCAS personal statement";
    case "ucas_reference":
      return "UCAS reference and predicted grades";
    case "admissions_test":
      return item.detail ? `Admissions test (${item.detail})` : "Admissions test";
    case "transcript":
      return country === "CA" ? "Grades / transcript sent" : country === "AU" ? "Documents sent" : "Transcript sent";
    case "test_scores":
      // A Canadian university's SAT/ACT item names its test step (e.g. "SAT/ACT disclosure"). US items have no detail.
      return item.detail ? `Test scores (${item.detail})` : "Test scores";
    default:
      return CHECKLIST.find(([k]) => k === item.key)?.[1] ?? item.key;
  }
}

export type AfterOfferStep = { key: string; done: boolean; when: string | null };

/** Steps that come after an offer; never counted in progress(). US: the international steps; other countries add theirs later. */
export function afterOfferSteps(c: Checklist, status: string, ctx: CollegeContext, opts: { international: boolean; financeWhen?: string | null }): AfterOfferStep[] {
  if (ctx.country !== "US") return [];
  return intlSteps(c, status, opts).map(({ key, done, when }) => ({ key, done, when }));
}

export type SentKind = "transcript" | "recommendations" | "test_scores" | "english_test";

/**
 * One college's checklist after the student marks an item sent to every college at once.
 * For scores, an undecided plan takes `fallbackPlan` (the one test the student has a score for), else stays undecided.
 * Null when there is nothing to change: already sent, or the college doesn't get scores (optional / not required).
 */
export function markSent(c: Checklist, kind: SentKind, fallbackPlan: TestPlan | EnglishPlan | null = null): Checklist | null {
  if (kind === "transcript" || kind === "recommendations") return c[kind] ? null : { ...c, [kind]: true };
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
