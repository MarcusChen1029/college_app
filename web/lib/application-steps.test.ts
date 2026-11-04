import assert from "node:assert/strict";
import { test } from "node:test";
import { checklistItems, markSent, progress, type Checklist, type CourseInfo, type ExtraStep, type SentKind } from "./checklist.ts";
import {
  collegeSteps,
  contextFor,
  countryOf,
  courseFor,
  courseOfferParts,
  listHasCountry,
  progressFor,
  sentPatches,
  stepsForCourse,
} from "./application-steps.ts";

const step = (id: string, courses: "all" | string[]): ExtraStep => ({
  id, kind: "university_form", name: id, courses, deadlineLabel: null, sourceUrl: "https://example.com", verifiedOn: "2026-11-05",
});
const course = (o: Partial<CourseInfo>): CourseInfo => ({
  id: "x", slug: "x", name: "X", ucasCode: null, aLevelOffer: null, ibOffer: null, apOffer: null, atar: null,
  admissionsTest: null, applicationDeadline: null, ...o,
});

test("country lookup", () => {
  assert.equal(countryOf("ucl"), "GB");
  assert.equal(countryOf("ubc"), "CA");
  assert.equal(countryOf("melbourne"), "AU");
  assert.equal(countryOf("harvard"), "US");
  assert.equal(countryOf("custom-123"), "US");
  assert.equal(collegeSteps("harvard"), null);
});

test("collegeSteps carries the admissions link and the courses", () => {
  const ucl = collegeSteps("ucl");
  assert.ok(ucl);
  assert.equal(ucl.country, "GB");
  assert.ok(ucl.admissionsUrl.startsWith("https://"));
  assert.ok(ucl.courses.length > 0);
});

test("contextFor with an unknown course", () => {
  const ctx = contextFor("ucl", { course: "no-such-course" });
  assert.equal(ctx.course, null);
  assert.equal(ctx.country, "GB");
});

test("contextFor a US or custom college is the US context", () => {
  const ctx = contextFor("harvard", { course: "anything" });
  assert.equal(ctx.country, "US");
  assert.equal(ctx.hasCourses, false);
  assert.deepEqual(ctx.steps, []);
});

test("stepsForCourse keeps all-course steps and the course's own", () => {
  const steps = [step("a", "all"), step("b", ["cs"]), step("c", ["econ"])];
  assert.deepEqual(stepsForCourse(steps, "cs").map((s) => s.id), ["a", "b"]);
  assert.deepEqual(stepsForCourse(steps, null).map((s) => s.id), ["a"]);
});

test("courseFor finds a course", () => {
  assert.equal(courseFor("oxford", "medicine")?.slug, "medicine");
  assert.equal(courseFor("oxford", "no-such-course"), null);
  assert.equal(courseFor("oxford", null), null);
  assert.equal(courseFor("harvard", "medicine"), null);
});

test("a college with courses is never Ready without a course", () => {
  assert.equal(contextFor("ucl", {}).hasCourses, true);
  assert.ok(progressFor("ucl", { ucas_ps: true, ucas_reference: true, english_plan: "not_required" }).missing >= 1);
});

test("courseOfferParts order and nulls", () => {
  const parts = courseOfferParts(course({ aLevelOffer: "A*AA", ibOffer: null, apOffer: "5 APs", atar: 90 }));
  assert.deepEqual(parts, [
    { kind: "a_level", text: "A*AA" },
    { kind: "ap", text: "5 APs" },
    { kind: "atar", text: "90" },
  ]);
  assert.deepEqual(courseOfferParts(course({})), []);
  assert.deepEqual(courseOfferParts(course({ ibOffer: "38 points" })), [{ kind: "ib", text: "38 points" }]);
});

test("progressFor equals progress with contextFor", () => {
  const c: Checklist = { ucas_ps: true, english_plan: "not_required", transcript: true };
  for (const slug of ["ucl", "ubc", "melbourne", "harvard"]) {
    assert.deepEqual(progressFor(slug, c), progress(c, contextFor(slug, c)), slug);
  }
});

test("sentPatches marks only colleges whose own checklist has the item", () => {
  // Western lists the Casper test for Engineering only; Toronto has no test step.
  const entries: { slug: string; checklist: Checklist }[] = [
    { slug: "harvard", checklist: {} },
    { slug: "ucl", checklist: {} },
    { slug: "toronto", checklist: {} },
    { slug: "western-university", checklist: { course: "engineering-common-first-year-ee" } },
    { slug: "melbourne", checklist: {} },
  ];
  const slugs = (kind: SentKind, fallback: "sat" | "ielts" | null = null) => sentPatches(entries, kind, fallback).map((p) => p.slug);
  assert.deepEqual(slugs("recommendations"), ["harvard"]);
  assert.deepEqual(slugs("transcript"), ["harvard", "toronto", "western-university", "melbourne"]);
  // Western's Engineering test is the Casper test, its own step: SAT/ACT scores are not sent there.
  assert.deepEqual(slugs("test_scores", "sat"), ["harvard"]);
  assert.deepEqual(slugs("english_test", "ielts"), ["harvard", "ucl", "toronto", "western-university", "melbourne"]);
  assert.deepEqual(sentPatches([{ slug: "western-university", checklist: {} }], "test_scores", "sat"), []);
  // The patch is markSent's own, and an item already sent is skipped.
  assert.deepEqual(sentPatches(entries, "test_scores", "sat")[0].checklist, { test_scores: true, test_plan: "sat" });
  assert.deepEqual(sentPatches([{ slug: "toronto", checklist: { transcript: true } }], "transcript"), []);
});

test("Western Engineering's Casper test is a done / not-done step on the real data, not the SAT/ACT item", () => {
  const eng = { course: "engineering-common-first-year-ee" } satisfies Checklist;
  const keys = (c: Checklist) => checklistItems(c, contextFor("western-university", c)).map((i) => i.key);
  assert.deepEqual(keys(eng), ["course_choice", "transcript", "step:casper", "english_test"]);
  // other courses have no Casper step
  assert.ok(!keys({ course: "computer-science-ecs" }).includes("step:casper"));
  const done = (c: Checklist) => checklistItems(c, contextFor("western-university", c)).find((i) => i.key === "step:casper")!.done;
  assert.equal(done({ ...eng, extra_steps: { casper: true } }), true);
  assert.equal(done({ ...eng, test_plan: "sat", test_scores: true }), false);
});

test("sentPatches on US and custom colleges equals markSent on every entry", () => {
  const checklists: Checklist[] = [{}, { transcript: true }, { test_plan: "optional" }, { english_plan: "not_required" }, { test_scores: true }, { recommendations: true }];
  const us = checklists.flatMap((c, i) => [
    { slug: "harvard", checklist: c },
    { slug: `custom-${i}`, checklist: c },
  ]);
  for (const kind of ["transcript", "recommendations", "test_scores", "english_test"] as const) {
    const fallback = kind === "test_scores" ? "act" : kind === "english_test" ? "toefl" : null;
    const old = us.flatMap((e) => {
      const next = markSent(e.checklist, kind, fallback);
      return next ? [{ slug: e.slug, checklist: next }] : [];
    });
    assert.deepEqual(sentPatches(us, kind, fallback), old, kind);
  }
});

test("listHasCountry", () => {
  const list = [{ slug: "harvard" }, { slug: "ucl" }];
  assert.equal(listHasCountry(list, "GB"), true);
  assert.equal(listHasCountry(list, "AU"), false);
  assert.equal(listHasCountry(list, "US"), true);
});
