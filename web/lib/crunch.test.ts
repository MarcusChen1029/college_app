import assert from "node:assert/strict";
import { test } from "node:test";
import { stage } from "./application.ts";
import { intlSteps, progress, type Checklist } from "./checklist.ts";
import { buildCrunch, type CrunchEntry } from "./crunch.ts";
import type { Deadline } from "./types.ts";

const TODAY = new Date(2026, 9, 27); // Oct 27, 2026 (local), as daysUntil reads it

const dl = (id: string, college: string, due: string, plan_key: string | null = "EA", kind = "application", label: string | null = null): Deadline => ({
  id,
  institution_id: college,
  cycle: "2026-27",
  kind,
  plan_key,
  label,
  due_date: due,
  notification_date: null,
  notification_note: null,
  notes: null,
  source_id: null,
});

const entry = (slug: string, checklist: Checklist = {}, extra: Partial<CrunchEntry> = {}): CrunchEntry => ({
  slug,
  name: slug.toUpperCase(),
  collegeId: slug,
  plan: "EA",
  status: "in_progress",
  checklist,
  ...extra,
});

// Everything except recommendations: essays final, transcript sent, SAT sent, English sent.
const allButRecs: Checklist = {
  essay_list: [{ id: "1", title: "", url: "", status: "final" }],
  transcript: true,
  test_plan: "sat",
  test_scores: true,
  english_plan: "toefl",
  english_test: true,
};

test("same-day cluster: every application due Nov 1 is grouped, shared items read once", () => {
  const slugs = ["a", "b", "c"];
  const deadlines = slugs.map((s) => dl(`${s}-ea`, s, "2026-11-01"));
  const c = buildCrunch(
    slugs.map((s) => entry(s, allButRecs)),
    deadlines,
    TODAY,
  );
  assert.equal(c.kind, "crunch");
  if (c.kind !== "crunch") return;
  assert.equal(c.dates.length, 1);
  assert.equal(c.dates[0].date, "2026-11-01");
  assert.equal(c.dates[0].days, 5);
  assert.equal(c.dates[0].apps.length, 3);
  // Only recommendations are open, as one shared group naming all three colleges.
  assert.deepEqual(
    c.open.map((g) => [g.key, g.shared, g.colleges.length]),
    [["recommendations", true, 3]],
  );
  assert.deepEqual(c.ready, []);
});

test("open items carry the reason: essays per college, undecided test plan vs not sent", () => {
  const deadlines = [dl("a1", "a", "2026-11-01"), dl("b1", "b", "2026-11-01")];
  const c = buildCrunch(
    [
      entry("a", { essay_list: [{ id: "1", title: "", url: "", status: "final" }, { id: "2", title: "", url: "", status: "drafting" }], test_plan: "sat" }),
      entry("b", {}),
    ],
    deadlines,
    TODAY,
  );
  if (c.kind !== "crunch") return assert.fail(c.kind);
  const essays = c.open.find((g) => g.key === "essays")!;
  assert.equal(essays.shared, false);
  assert.deepEqual(essays.colleges, [
    { slug: "a", name: "A", reason: "essays_unfinished", final: 1, total: 2 },
    { slug: "b", name: "B", reason: "no_essays_yet" },
  ]);
  const tests = c.open.find((g) => g.key === "test_scores")!;
  assert.deepEqual(
    tests.colleges.map((x) => [x.slug, x.reason]),
    [["a", "not_sent"], ["b", "plan_undecided"]],
  );
});

test("the cluster spans one week from the next deadline; later dates and submitted applications stay out", () => {
  const deadlines = [dl("a1", "a", "2026-11-01"), dl("b1", "b", "2026-11-07"), dl("c1", "c", "2026-11-08"), dl("d1", "d", "2026-11-01")];
  const c = buildCrunch([entry("a"), entry("b"), entry("c"), entry("d", {}, { status: "submitted" })], deadlines, TODAY);
  if (c.kind !== "crunch") return assert.fail(c.kind);
  assert.deepEqual(
    c.dates.map((d) => [d.date, d.apps.map((a) => a.slug)]),
    [["2026-11-01", ["a"]], ["2026-11-07", ["b"]]],
  );
});

test("a picked plan uses only that plan's date; undecided uses the earliest; past dates are skipped", () => {
  const deadlines = [dl("a-ea", "a", "2026-11-01", "EA"), dl("a-rd", "a", "2027-01-01", "RD"), dl("b-old", "b", "2026-10-15", "ED"), dl("b-ea", "b", "2026-11-03", "EA")];
  const c = buildCrunch([entry("a", {}, { plan: "RD" }), entry("b", {}, { plan: null })], deadlines, TODAY);
  if (c.kind !== "crunch") return assert.fail(c.kind);
  assert.deepEqual(
    c.apps.map((a) => [a.slug, a.deadlineId]),
    [["b", "b-ea"]],
  );
});

test("complete checklists are listed as ready; aid dates never form a cluster", () => {
  const done: Checklist = { ...allButRecs, recommendations: true };
  const deadlines = [dl("a1", "a", "2026-11-01"), dl("aid", "b", "2026-10-30", null, "financial_aid", "CSS Profile (EA)")];
  const c = buildCrunch([entry("a", done), entry("b")], deadlines, TODAY);
  if (c.kind !== "crunch") return assert.fail(c.kind);
  assert.deepEqual(c.open, []);
  assert.deepEqual(
    c.ready.map((a) => a.slug),
    ["a"],
  );
});

test("custom colleges count by the date the student typed", () => {
  const c = buildCrunch([entry("custom-x", {}, { plan: null })], [dl("custom-custom-x", "custom-x", "2026-11-02", null, "custom", "Application deadline")], TODAY);
  assert.equal(c.kind, "crunch");
});

test("none due within 21 days: a one-line 'later' summary; nothing upcoming: none", () => {
  const later = buildCrunch([entry("a"), entry("b")], [dl("a1", "a", "2027-01-01"), dl("b1", "b", "2027-01-01")], TODAY);
  assert.deepEqual(later, { kind: "later", date: "2027-01-01", days: 66, count: 2 });
  assert.deepEqual(buildCrunch([entry("a")], [dl("a1", "a", "2026-10-01")], TODAY), { kind: "none" });
  assert.deepEqual(buildCrunch([], [], TODAY), { kind: "none" });
});

test("international steps show only for international students", () => {
  assert.deepEqual(intlSteps({ intl_finances: true }, "admitted", { international: false }), []);
  assert.deepEqual(
    intlSteps({}, "in_progress", { international: true }).map((s) => s.key),
    ["intl_finances"],
  );
  assert.deepEqual(
    intlSteps({ i20: true }, "admitted", { international: true }).map((s) => [s.key, s.done]),
    [["intl_finances", false], ["i20", true]],
  );
  assert.deepEqual(
    intlSteps({}, "enrolled", { international: true }).map((s) => s.key),
    ["intl_finances", "i20", "passport", "sevis_fee", "visa_interview"],
  );
});

test("international steps carry a when-text only once one is passed in", () => {
  assert.equal(intlSteps({}, "in_progress", { international: true })[0].when, null);
  assert.equal(intlSteps({}, "in_progress", { international: true, financeWhen: "With the application" })[0].when, "With the application");
});

test("international steps never block Ready", () => {
  const done: Checklist = { ...allButRecs, recommendations: true };
  assert.deepEqual(progress(done), { done: 5, total: 5, missing: 0 });
  assert.equal(stage("in_progress", done), "ready");
  // Proof of finances still open: the application is Ready all the same.
  assert.equal(intlSteps(done, "in_progress", { international: true })[0].done, false);
  assert.equal(stage("in_progress", { ...done, intl_finances: false }), "ready");
});
