// Fixtures for the progress-parity tests: progress-parity.test.ts here, and the weekly email's parity test
// (student-digest-parity.test.ts). A plain module, not a test file, so importing it runs no tests.

import type { Checklist, CollegeContext, CourseInfo, ExtraStep, StepKind } from "./checklist.ts";

/** One college per country: UK, Canada, Australia and a US control. */
export const PARITY_SLUGS = ["ucl", "ubc", "melbourne", "harvard"] as const;
export type ParitySlug = (typeof PARITY_SLUGS)[number];

/** A real course of each non-US parity college (data/application_steps_2026_27); the US college has none. */
export const PARITY_COURSE: Record<ParitySlug, string | null> = {
  ucl: "computer-science-bsc",
  ubc: "computer-science-bsc",
  melbourne: "science-computing-and-software-systems",
  harvard: null,
};

/**
 * Every checklist key set, junk included: a UCAS reference that is false, a step mark that is a string instead of true
 * and a step key no step id can have (ids match ^[a-z0-9_]{1,40}$), so the parent view drops it.
 */
export function fullChecklist(slug: ParitySlug): Checklist {
  const course = PARITY_COURSE[slug];
  return {
    ucas_ps: true,
    ucas_reference: false,
    admissions_test: true,
    transcript: true,
    english_plan: "ielts",
    english_test: true,
    extra_steps: { ok: true, aif: "yes", "Bad-Key": true } as unknown as Record<string, boolean>,
    ...(course ? { course } : {}),
    recommendations: true,
    essay_list: [{ id: "e1", title: "Why us", url: "https://docs.example/1", status: "final" }],
  };
}

/** One UK mark only. */
export const PART: Checklist = { ucas_ps: true };

/** The two checklists every parity college is run with. */
export const parityChecklists = (slug: ParitySlug): Checklist[] => [fullChecklist(slug), PART];

// Hand-built contexts: their items are fixed by construction, so they don't move when the real step data is filled in.

const step = (id: string, kind: StepKind = "supplementary_form"): ExtraStep => ({
  id,
  kind,
  name: `Fixture step ${id}`,
  courses: "all",
  deadlineLabel: null,
  sourceUrl: "https://example.ac.uk/apply",
  verifiedOn: "2026-11-04",
});

const COURSE: CourseInfo = {
  id: "prog-fixture",
  slug: "fixture-course",
  name: "Fixture Course BSc",
  ucasCode: null,
  aLevelOffer: null,
  ibOffer: null,
  apOffer: null,
  atar: null,
  admissionsTest: "TMUA",
  applicationDeadline: null,
};

/** UK, course with an admissions test, two steps ("ok" and "aif"): 7 items, so never the US 5. */
export const GB_FIXTURE_CONTEXT: CollegeContext = {
  country: "GB",
  course: COURSE,
  hasCourses: true,
  steps: [step("ok"), step("aif")],
  researched: true,
  admissionsUrl: "https://example.ac.uk/apply",
};

/** Canada, a supplementary form and a test step (the test step becomes the test_scores item). */
export const CA_FIXTURE_CONTEXT: CollegeContext = {
  country: "CA",
  course: { ...COURSE, admissionsTest: null },
  hasCourses: true,
  steps: [step("ok"), step("casper", "test")],
  researched: true,
  admissionsUrl: "https://example.ca/apply",
};

/** Australia, no courses, one step. */
export const AU_FIXTURE_CONTEXT: CollegeContext = {
  country: "AU",
  course: null,
  hasCourses: false,
  steps: [step("aif")],
  researched: true,
  admissionsUrl: "https://example.edu.au/apply",
};

/** A UK college without courses or steps: personal statement, reference and English test only. */
export const NO_COURSES_CONTEXT: CollegeContext = { country: "GB", course: null, hasCourses: false, steps: [], researched: true, admissionsUrl: null };
