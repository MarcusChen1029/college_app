import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCgPlan, gradingScaleFor, schoolYearLabel } from "./commonapp-fill.ts";
import { emptyCourse, emptySchool, type Term, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const school = (o: Partial<TranscriptSchool> = {}): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Lincoln High", country: "United States", ...o });
const course = (o: Partial<TranscriptCourse> = {}): TranscriptCourse => ({ id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "Drama", academicYear: 2023, gradeLevel: 9, credit: 1, terms: [graded("S1", "A")], ...o });
const graded = (term: Term["term"], grade: string, extra: Partial<Term> = {}): Term => ({ term, grade, status: "graded", ...extra });

test("schoolYearLabel writes the two-digit end year", () => {
  assert.equal(schoolYearLabel(2023), "2023-24");
  assert.equal(schoolYearLabel(2099), "2099-00");
});

test("gradingScaleFor maps the tracker scale onto Common App's list", () => {
  assert.equal(gradingScaleFor("percent_100", null), "1-100");
  assert.equal(gradingScaleFor("letter_plus_minus", null), "A-F");
  assert.equal(gradingScaleFor("letter", null), "A-F");
  assert.equal(gradingScaleFor("gpa_decimal", 4), "0.0-4.0");
  assert.equal(gradingScaleFor("gpa_decimal", 5), "0.0-5.0");
  assert.equal(gradingScaleFor("gpa_decimal", 4.3), "Other");
  assert.equal(gradingScaleFor("gpa_decimal", null), "Other");
  assert.equal(gradingScaleFor("ib_7", null), "1-7");
  assert.equal(gradingScaleFor("other", 10), "1-10");
  assert.equal(gradingScaleFor("other", 11), "1-11");
  assert.equal(gradingScaleFor("other", 20), "1-20");
  assert.equal(gradingScaleFor("other", 15), "Other");
  assert.equal(gradingScaleFor("a_level", null), "Other");
  assert.equal(gradingScaleFor("pass_fail", null), "Other");
});

test("fills a graded 9th-grade semester course", () => {
  const name = "Kang Chiao International School - Linkou Campus";
  const plans = buildCgPlan(
    [school({ name })],
    [course({ id: "drama", terms: [graded("S1", "88"), graded("S2", "93")], finalGrade: "91", scale: "percent_100", level: "regular", subject: "other", credit: 4, creditUnit: "carnegie" })],
  );
  assert.equal(plans.length, 1);
  const p = plans[0]!;
  assert.equal(p.grade, "9");
  assert.equal(p.schoolName, name);
  assert.equal(p.schoolYear, "2023-24");
  assert.equal(p.scale, "1-100");
  assert.equal(p.scheduleStem, "semester");
  assert.deepEqual(p.rows[0], {
    trackerId: "drama", name: "Drama", subject: "Other/Elective", level: "Regular/Standard",
    grades: { "1": "88", "2": "93", final: "91" }, credit: "4", creditNA: false,
  });
});

test("maps term codes onto the four term columns and the final column", () => {
  const plans = buildCgPlan(
    [school()],
    [
      course({ id: "q", period: "quarter", terms: [graded("Q1", "A"), graded("Q2", "B"), graded("Q3", "C"), graded("Q4", "D")] }),
      course({ id: "t", name: "Art", period: "trimester", terms: [graded("T1", "A"), graded("T2", "B"), graded("T3", "C")] }),
      course({ id: "f", name: "Band", period: "full_year", terms: [graded("FY", "A-")] }),
    ],
  );
  const rows = plans[0]!.rows;
  assert.deepEqual(rows.find((r) => r.trackerId === "q")!.grades, { "1": "A", "2": "B", "3": "C", "4": "D" });
  assert.deepEqual(rows.find((r) => r.trackerId === "t")!.grades, { "1": "A", "2": "B", "3": "C" });
  assert.deepEqual(rows.find((r) => r.trackerId === "f")!.grades, { final: "A-" });
});

test("only graded terms with a grade are filled", () => {
  const plans = buildCgPlan([school()], [course({ terms: [graded("S1", "B"), { term: "S2", grade: "", status: "in_progress" }, graded("FY", " ")] })]);
  assert.deepEqual(plans[0]!.rows[0]!.grades, { "1": "B" });
});

test("uses the printed grade, not the weighted one", () => {
  const plans = buildCgPlan([school()], [course({ terms: [{ term: "S1", grade: "B+", gradeWeighted: "A", status: "graded" }] })]);
  assert.equal(plans[0]!.rows[0]!.grades["1"], "B+");
});

test("in-progress courses go to Current Year, not C&G", () => {
  const c = course({ id: "ip", name: "AP Physics", gradeLevel: 12, academicYear: 2026, terms: [{ term: "S1", grade: "", status: "in_progress" }] });
  const plans = buildCgPlan([school()], [c]);
  const p = plans.find((x) => x.grade === "12")!;
  assert.equal(p.rows.length, 0);
  assert.deepEqual(p.skipped, [{ where: "12", course: "AP Physics", field: "course", reason: "in progress: goes to Current Year Courses" }]);
});

test("an in-progress course does not displace the graded ones in the same grade", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "a", name: "Done", gradeLevel: 12 }),
    course({ id: "b", name: "Now", gradeLevel: 12, terms: [{ term: "S1", grade: "", status: "in_progress" }] }),
  ]);
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]!.rows.map((r) => r.name), ["Done"]);
  assert.equal(plans[0]!.skipped.length, 1);
  assert.equal(plans[0]!.skipped[0]!.reason, "in progress: goes to Current Year Courses");
});

test("a final grade alone is enough to be entered", () => {
  const plans = buildCgPlan([school()], [course({ terms: [], finalGrade: "92" })]);
  assert.deepEqual(plans[0]!.rows[0]!.grades, { final: "92" });
});

test("college schools are left out", () => {
  const plans = buildCgPlan(
    [school({ id: "hs" }), school({ id: "col", name: "Community College", kind: "college" })],
    [course({ id: "x", schoolId: "col", name: "Calc at CC" })],
  );
  assert.equal(plans.length, 0);
});

test("a college school's course does not show up in a high-school plan's skipped list", () => {
  const plans = buildCgPlan(
    [school({ id: "hs" }), school({ id: "col", name: "Community College", kind: "college" })],
    [course({ id: "a", schoolId: "hs" }), course({ id: "x", schoolId: "col", name: "Calc at CC" })],
  );
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]!.skipped, []);
});

test("no grade level goes to Other courses", () => {
  const plans = buildCgPlan([school()], [course({ gradeLevel: null }), course({ id: "d", gradeLevel: 8 })]);
  assert.equal(plans.length, 1);
  assert.equal(plans[0]!.grade, "other");
  assert.equal(plans[0]!.rows.length, 2);
});

test("credit: not listed ticks N/A; a missing credit is blank and reported", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "na", name: "NA course", credit: null, creditUnit: "not_listed" }),
    course({ id: "none", name: "No credit", credit: null, creditUnit: "carnegie" }),
    course({ id: "half", name: "Half", credit: 0.5 }),
  ]);
  const rows = plans[0]!.rows;
  const row = (id: string) => rows.find((r) => r.trackerId === id)!;
  assert.equal(row("na").creditNA, true);
  assert.equal(row("na").credit, null);
  assert.equal(row("none").creditNA, false);
  assert.equal(row("none").credit, null);
  assert.equal(row("half").credit, "0.5");
  assert.deepEqual(plans[0]!.skipped, [{ where: "9", course: "No credit", field: "credit", reason: "no credit in tracker" }]);
});

test("second school in the same grade is reported, not filled", () => {
  const plans = buildCgPlan(
    [school({ id: "a", name: "School A" }), school({ id: "b", name: "School B" })],
    [
      course({ id: "1", schoolId: "a", name: "One" }),
      course({ id: "2", schoolId: "a", name: "Two" }),
      course({ id: "3", schoolId: "a", name: "Three" }),
      course({ id: "4", schoolId: "b", name: "Four" }),
    ],
  );
  const p = plans[0]!;
  assert.equal(p.schoolName, "School A");
  assert.equal(p.rows.length, 3);
  assert.equal(p.skipped.length, 1);
  assert.equal(p.skipped[0]!.course, "Four");
  assert.ok(p.skipped[0]!.reason.startsWith("another school (School B)"), p.skipped[0]!.reason);
});

test("a second school year in the same grade is reported, not filled", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "1", name: "One", academicYear: 2023 }),
    course({ id: "2", name: "Two", academicYear: 2023 }),
    course({ id: "3", name: "Summer", academicYear: 2024, isSummer: true }),
  ]);
  const p = plans[0]!;
  assert.equal(p.schoolYear, "2023-24");
  assert.equal(p.rows.length, 2);
  assert.equal(p.skipped.length, 1);
  assert.equal(p.skipped[0]!.course, "Summer");
  assert.ok(p.skipped[0]!.reason.startsWith("another school year (2024-25)"), p.skipped[0]!.reason);
});

test("per-course override wins", () => {
  const plans = buildCgPlan([school()], [course({ overrides: { common_app: { subject: "Religion" } } })]);
  assert.equal(plans[0]!.rows[0]!.subject, "Religion");
});

test("subject and level come from the Common App map", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "n", name: "Club", level: "none" }),
    course({ id: "m", name: "Stats", subject: "mathematics", subSubject: "statistics", level: "ap" }),
  ]);
  const row = (id: string) => plans[0]!.rows.find((r) => r.trackerId === id)!;
  assert.equal(row("n").level, "N/A");
  assert.equal(row("m").subject, "Math (Other)");
  assert.equal(row("m").level, "Advanced Placement (AP)");
});

test("plans come in order 9, 10, 11, 12, other and only for grades with courses", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "o", gradeLevel: null }),
    course({ id: "12", gradeLevel: 12 }),
    course({ id: "9", gradeLevel: 9 }),
    course({ id: "11", gradeLevel: 11 }),
  ]);
  assert.deepEqual(plans.map((p) => p.grade), ["9", "11", "12", "other"]);
});

test("mixed scales in one grade use the most common and name the others", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "1", name: "Math", scale: "percent_100", terms: [graded("S1", "90")] }),
    course({ id: "2", name: "Science", scale: "percent_100", terms: [graded("S1", "85")] }),
    course({ id: "3", name: "Spanish", scale: "letter", terms: [graded("S1", "A")] }),
  ]);
  const p = plans[0]!;
  assert.equal(p.scale, "1-100");
  assert.ok(p.warnings.some((w) => w.includes("Spanish")), p.warnings.join(" | "));
  assert.ok(!p.warnings.some((w) => w.includes("Math")));
});

test("a course with a different term system than the grade's schedule is flagged", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "1", name: "Math", period: "semester" }),
    course({ id: "2", name: "Science", period: "semester" }),
    course({ id: "3", name: "Lab", period: "quarter", terms: [graded("Q1", "A")] }),
  ]);
  const p = plans[0]!;
  assert.equal(p.scheduleStem, "semester");
  assert.ok(p.warnings.some((w) => w.includes("Lab")), p.warnings.join(" | "));
});

test("Common App's own rule warnings are carried into the plan", () => {
  const plans = buildCgPlan([school()], [course({ name: "Chem", terms: [], finalGrade: "90" })]);
  assert.ok(plans[0]!.warnings.some((w) => w.includes("Chem") && w.includes("term grades")), plans[0]!.warnings.join(" | "));
});
