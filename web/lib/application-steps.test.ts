import assert from "node:assert/strict";
import { test } from "node:test";
import { progress, type Checklist, type CourseInfo, type ExtraStep } from "./checklist.ts";
import {
  collegeSteps,
  contextFor,
  countryOf,
  courseFor,
  courseOfferParts,
  listHasCountry,
  progressFor,
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

test("listHasCountry", () => {
  const list = [{ slug: "harvard" }, { slug: "ucl" }];
  assert.equal(listHasCountry(list, "GB"), true);
  assert.equal(listHasCountry(list, "AU"), false);
  assert.equal(listHasCountry(list, "US"), true);
});
