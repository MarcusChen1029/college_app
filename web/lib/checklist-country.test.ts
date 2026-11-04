import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKLIST, US_CONTEXT, afterOfferSteps, checklistItems, intlSteps, itemLabel, progress, type Checklist, type CollegeContext, type CourseInfo, type ExtraStep, type StepKind } from "./checklist.ts";

const gb = (o: Partial<CollegeContext> = {}): CollegeContext => ({ country: "GB", course: null, hasCourses: false, steps: [], researched: true, admissionsUrl: null, ...o });
const ca = (o: Partial<CollegeContext> = {}): CollegeContext => gb({ country: "CA", ...o });
const au = (o: Partial<CollegeContext> = {}): CollegeContext => gb({ country: "AU", ...o });
const step = (id: string, kind: StepKind, name = id): ExtraStep => ({ id, kind, name, courses: "all", deadlineLabel: null, sourceUrl: "https://example.test", verifiedOn: "2026-11-04" });
const course = (admissionsTest: string | null): CourseInfo => ({
  id: "c1", slug: "economics", name: "Economics", ucasCode: null, aLevelOffer: null, ibOffer: null, apOffer: null, atar: null, admissionsTest, applicationDeadline: null,
});
const keys = (c: Checklist, ctx?: CollegeContext) => checklistItems(c, ctx).map((i) => i.key);

const EMPTY: Checklist = {};
const ALL_DONE: Checklist = { no_essays: true, recommendations: true, transcript: true, test_plan: "sat", test_scores: true, english_plan: "toefl", english_test: true };
const PARTIAL: Checklist = {
  essay_list: [
    { id: "a", title: "", url: "", status: "final" },
    { id: "b", title: "", url: "", status: "drafting" },
  ],
  transcript: true,
  test_plan: "optional",
  english_plan: "not_required",
};
const WITH_NEW_KEYS = { recommendations: true, ucas_ps: true, admissions_test: true, extra_steps: { x: true }, course: "economics" } as unknown as Checklist;
const US_KEYS = CHECKLIST.map(([k]) => k);

test("US default context equals no context", () => {
  for (const f of [EMPTY, ALL_DONE, PARTIAL, WITH_NEW_KEYS]) {
    assert.deepEqual(progress(f, US_CONTEXT), progress(f));
    assert.deepEqual(keys(f), US_KEYS);
    assert.deepEqual(keys(f, US_CONTEXT), US_KEYS);
  }
  assert.deepEqual(US_CONTEXT, { country: "US", course: null, hasCourses: false, steps: [], researched: true, admissionsUrl: null });
});

test("GB items in order", () => {
  const items = checklistItems({}, gb({ course: course("TMUA"), steps: [step("written_work", "written_work")] }));
  assert.deepEqual(items.map((i) => i.key), ["ucas_ps", "ucas_reference", "admissions_test", "step:written_work", "english_test"]);
  assert.equal(items[0].shared, true);
  assert.equal(items[1].shared, true);
  assert.equal(items[2].shared, false);
  assert.equal(items[2].detail, "TMUA");
  assert.equal(items[3].step?.id, "written_work");
  assert.equal(items[0].step, null);
});

test("GB without a course has no admissions test item", () => {
  assert.deepEqual(keys({}, gb()), ["ucas_ps", "ucas_reference", "english_test"]);
  assert.deepEqual(keys({}, gb({ course: course(null) })), ["ucas_ps", "ucas_reference", "english_test"]);
});

test("CA test step becomes test_scores", () => {
  const items = checklistItems({}, ca({ steps: [step("aif", "supplementary_form"), step("sat_disclosure", "test", "SAT/ACT disclosure")] }));
  assert.deepEqual(items.map((i) => i.key), ["transcript", "step:aif", "english_test", "test_scores"]);
  assert.equal(items[3].detail, "SAT/ACT disclosure");
});

test("AU items", () => {
  assert.deepEqual(keys({}, au({ steps: [step("ucat", "test")] })), ["transcript", "step:ucat", "english_test"]);
});

test("step done reads extra_steps", () => {
  const ctx = ca({ steps: [step("aif", "supplementary_form")] });
  const done = (c: Checklist) => checklistItems(c, ctx).find((i) => i.key === "step:aif")?.done;
  assert.equal(done({ extra_steps: { aif: true } }), true);
  assert.equal(done({}), false);
  assert.equal(done({ extra_steps: { aif: "yes" } } as unknown as Checklist), false);
});

test("GB progress ignores US-era keys", () => {
  const c: Checklist = { essay_list: [{ id: "a", title: "", url: "", status: "final" }], recommendations: true, ucas_ps: true, english_plan: "not_required" };
  assert.equal(JSON.stringify(progress(c, gb())), '{"done":2,"total":3,"missing":1}');
});

test("afterOfferSteps is intlSteps for US and empty elsewhere", () => {
  const c: Checklist = { intl_finances: true };
  const opts = { international: true };
  assert.deepEqual(afterOfferSteps(c, "enrolled", US_CONTEXT, opts), intlSteps(c, "enrolled", opts));
  assert.deepEqual(afterOfferSteps(c, "enrolled", gb(), opts), []);
  assert.deepEqual(afterOfferSteps(c, "enrolled", ca(), opts), []);
  assert.deepEqual(afterOfferSteps(c, "enrolled", au(), opts), []);
});

test("itemLabel", () => {
  const item = (key: string, o: Partial<{ detail: string | null; step: ExtraStep | null }> = {}) => ({ key, done: false, shared: false, step: null, detail: null, ...o }) as Parameters<typeof itemLabel>[0];
  assert.equal(itemLabel(item("transcript"), "US"), "Transcript sent");
  assert.equal(itemLabel(item("transcript"), "CA"), "Grades / transcript sent");
  assert.equal(itemLabel(item("transcript"), "AU"), "Documents sent");
  assert.equal(itemLabel(item("step:aif", { step: step("aif", "supplementary_form", "Admission Information Form") }), "CA"), "Admission Information Form");
  assert.equal(itemLabel(item("admissions_test", { detail: "TMUA" }), "GB"), "Admissions test (TMUA)");
  assert.equal(itemLabel(item("ucas_ps"), "GB"), "UCAS personal statement");
  assert.equal(itemLabel(item("ucas_reference"), "GB"), "UCAS reference and predicted grades");
  assert.equal(itemLabel(item("course_choice"), "GB"), "Course chosen");
});

test("itemLabel of every US item equals its label in CHECKLIST", () => {
  const items = checklistItems(EMPTY, US_CONTEXT);
  assert.deepEqual(items.map((i) => itemLabel(i, "US")), CHECKLIST.map(([, label]) => label));
  assert.deepEqual(items.map((i) => itemLabel(i, "US")), ["Essays", "Recommendations", "Transcript sent", "Test scores", "English test"]);
});

test("course_choice comes first when the college has courses", () => {
  for (const make of [gb, ca, au]) {
    const items = checklistItems({}, make({ hasCourses: true }));
    assert.equal(items[0].key, "course_choice");
    assert.equal(items[0].done, false);
    const everything: Checklist = { ucas_ps: true, ucas_reference: true, transcript: true, english_plan: "not_required" };
    assert.ok(progress(everything, make({ hasCourses: true })).missing >= 1);
  }
  const picked = checklistItems({}, gb({ hasCourses: true, course: course(null) }));
  assert.equal(picked[0].key, "course_choice");
  assert.equal(picked[0].done, true);
  assert.equal(picked[0].detail, "Economics");
  assert.ok(!keys({}, US_CONTEXT).includes("course_choice"));
});
