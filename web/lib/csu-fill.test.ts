import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCsuPlans, csuGrade, csuGradeLevelOption } from "./csu-fill.ts";
import { emptyCourse, emptySchool, type Term, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const school = (o: Partial<TranscriptSchool> = {}): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Central Catholic", country: "United States", kind: "high_school", defaultPeriod: "semester", ...o });
const term = (t: Term["term"], grade: string, extra: Partial<Term> = {}): Term => ({ term: t, grade, status: "graded", ...extra });
const course = (o: Partial<TranscriptCourse> = {}): TranscriptCourse => ({
  id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "English 9", subject: "english", level: "regular", academicYear: 2023,
  gradeLevel: 9, scale: "letter_plus_minus", period: "semester", terms: [term("S1", "A"), term("S2", "B+")], ...o,
});

test("a US school's courses with grade level, year, type, grades and A-G code", () => {
  const [p] = buildCsuPlans([school()], [course()]);
  assert.equal(p!.termType, "Semester");
  const r = p!.rows[0]!;
  assert.equal(csuGradeLevelOption(r), "9th Grade • 2023-2024");
  assert.deepEqual(r.grades, ["A", "B+"]);
  assert.equal(r.courseType, "None");
  assert.equal(r.agCode, "B");
});

test("schools outside the US skip course entry", () => {
  assert.deepEqual(buildCsuPlans([school({ country: "Taiwan" })], [course()]), []);
});

test("No Course, In Progress and Planned", () => {
  const [p] = buildCsuPlans([school()], [course({ terms: [{ term: "S1", grade: "", status: "none" }, { term: "S2", grade: "", status: "in_progress" }] }), course({ id: "p", terms: [{ term: "S1", grade: "", status: "planned" }] })]);
  assert.deepEqual(p!.rows[0]!.grades, ["No Course", "In Progress"]);
  assert.deepEqual(p!.rows[1]!.grades, ["Planned", "No Course"]);
});

test("percentages go through Cal State Apply's chart, flagged", () => {
  assert.deepEqual(csuGrade("90", "percent_100"), { value: "A", converted: true });
  assert.deepEqual(csuGrade("89.5", "percent_100"), { value: "A", converted: true });
  assert.deepEqual(csuGrade("89", "percent_100"), { value: "B", converted: true });
  assert.deepEqual(csuGrade("59", "percent_100"), { value: "F", converted: true });
  assert.deepEqual(csuGrade("a-", "letter_plus_minus"), { value: "A-", converted: false });
  assert.deepEqual(csuGrade("7", "ib_7"), { value: null, converted: false });
  const [p] = buildCsuPlans([school()], [course({ scale: "percent_100", terms: [term("S1", "93"), term("S2", "85")] })]);
  assert.deepEqual(p!.rows[0]!.grades, ["A", "B"]);
  assert.equal(p!.warnings.length, 2);
});

test("PE, college courses and non-math 8th grade courses are left out with a reason", () => {
  const [p] = buildCsuPlans([school()], [
    course({ id: "1", subject: "pe_health", name: "PE" }), course({ id: "2", isCollege: true }), course({ id: "3", gradeLevel: 8, subject: "arts", name: "Art 8" }),
    course({ id: "4", gradeLevel: 8, subject: "mathematics", name: "Algebra 1" }),
  ]);
  assert.deepEqual(p!.rows.map((r) => r.name), ["Algebra 1"]);
  assert.equal(p!.skipped.length, 3);
});

test("a course on another schedule than the school's gets no grades", () => {
  const [p] = buildCsuPlans([school()], [course({ period: "full_year", terms: [term("FY", "A")] })]);
  assert.deepEqual(p!.rows[0]!.grades, [null, null]);
  assert.ok(p!.skipped.some((s) => s.field === "grades"));
});

test("AP and IB course types; science without a sub-subject has no A-G code", () => {
  const [p] = buildCsuPlans([school()], [course({ level: "ap", subject: "science", subSubject: "chemistry" }), course({ id: "x", level: "ib_hl", subject: "science" })]);
  assert.equal(p!.rows[0]!.courseType, "Advanced Placement");
  assert.equal(p!.rows[0]!.agCode, "D2");
  assert.equal(p!.rows[1]!.courseType, "International Baccalaureate");
  assert.equal(p!.rows[1]!.agCode, null);
});
