// Extra application steps and courses for UK, Canadian and Australian universities.
// Data: data/application_steps_2026_27/*.json via scripts/build_application_steps.py -> ./data/application-steps.json.
// US and custom colleges are not in the file: they get US_CONTEXT, so their checklist and progress never change.
import raw from "./data/application-steps.json" with { type: "json" };
import {
  US_CONTEXT,
  progress,
  type Checklist,
  type CollegeContext,
  type CountryCode,
  type CourseInfo,
  type ExtraStep,
} from "./checklist.ts";

export type CollegeSteps = {
  country: Exclude<CountryCode, "US">;
  researched: boolean;
  admissionsUrl: string;
  steps: ExtraStep[];
  courses: CourseInfo[];
};

const DATA = raw as unknown as Record<string, CollegeSteps>;

/** The extra-steps record of a UK, Canadian or Australian university; null for a US, custom or unknown college. */
export function collegeSteps(slug: string): CollegeSteps | null {
  return Object.hasOwn(DATA, slug) ? DATA[slug] : null;
}

export function countryOf(slug: string): CountryCode {
  return collegeSteps(slug)?.country ?? "US";
}

export function courseFor(slug: string, courseSlug: string | null | undefined): CourseInfo | null {
  if (!courseSlug) return null;
  return collegeSteps(slug)?.courses.find((c) => c.slug === courseSlug) ?? null;
}

/** Steps for every course ("all") plus the ones that name the chosen course. */
export function stepsForCourse(steps: readonly ExtraStep[], courseSlug: string | null): ExtraStep[] {
  return steps.filter((s) => s.courses === "all" || (courseSlug !== null && s.courses.includes(courseSlug)));
}

export function contextFor(slug: string, c: Pick<Checklist, "course">): CollegeContext {
  const college = collegeSteps(slug);
  if (!college) return US_CONTEXT;
  const course = courseFor(slug, c.course);
  return {
    country: college.country,
    course,
    hasCourses: college.courses.length > 0,
    steps: stepsForCourse(college.steps, course?.slug ?? null),
    researched: college.researched,
    admissionsUrl: college.admissionsUrl,
  };
}

export function progressFor(slug: string, c: Checklist) {
  return progress(c, contextFor(slug, c));
}

export function listHasCountry(list: readonly { slug: string }[], country: CountryCode): boolean {
  return list.some((e) => countryOf(e.slug) === country);
}

export type OfferPart = { kind: "a_level" | "ib" | "ap" | "atar"; text: string };

/** The entry requirements a course lists, in a fixed order, nulls skipped. */
export function courseOfferParts(c: CourseInfo): OfferPart[] {
  const parts: OfferPart[] = [];
  if (c.aLevelOffer) parts.push({ kind: "a_level", text: c.aLevelOffer });
  if (c.ibOffer) parts.push({ kind: "ib", text: c.ibOffer });
  if (c.apOffer) parts.push({ kind: "ap", text: c.apOffer });
  if (c.atar !== null) parts.push({ kind: "atar", text: String(c.atar) });
  return parts;
}
