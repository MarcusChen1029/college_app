import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStarsIntlPlans, starsIntlGrade, starsRowsToAdd, starsScaleFor } from "./stars-fill.ts";
import { starsTitleOverride } from "./transcript-import.ts";
import { emptyCourse, emptySchool, type Term, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const school = (o: Partial<TranscriptSchool> = {}): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Kang Chiao", country: "Taiwan", kind: "high_school", ...o });
const term = (t: Term["term"], grade: string, extra: Partial<Term> = {}): Term => ({ term: t, grade, status: "graded", ...extra });
const course = (o: Partial<TranscriptCourse> = {}): TranscriptCourse => ({
  id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "Algebra 1", subject: "mathematics", level: "regular", academicYear: 2023,
  gradeLevel: 9, credit: null, scale: "percent_100", period: "semester", terms: [term("S1", "93"), term("S2", "95")], ...o,
});
const rows = (cs: TranscriptCourse[], s = school()) => buildStarsIntlPlans([s], cs);

test("one plan per school year, keyed by the year the school year ends", () => {
  const plans = rows([course(), course({ id: "b", academicYear: 2024, gradeLevel: 10 })]);
  assert.deepEqual(plans.map((p) => p.endYear), [2024, 2025]);
  assert.equal(plans[0]!.rows[0]!.academicLevel, "Equivalent to U.S. High School 9th Grade");
});

test("a US school is not on the international page", () => {
  assert.deepEqual(rows([course()], school({ country: "United States" })), []);
});

test("subject, exact generic title, level and semester boxes", () => {
  const [p] = rows([course({ terms: [term("S1", "93", { credit: 0.5 }), term("S2", "95", { credit: 0.5 })] })]);
  const r = p!.rows[0]!;
  assert.equal(r.subject, "Mathematics");
  assert.equal(r.title, "ALGEBRA 1");
  assert.equal(r.level, "Standard");
  assert.equal(r.length, "Semester");
  assert.deepEqual(r.boxes, [{ grade: "93", credit: "0.5" }, { grade: "95", credit: "0.5" }]);
  assert.deepEqual(p!.warnings, []);
});

test("English goes under Languages; no exact title means OTHER ENGLISH with a warning", () => {
  const [p] = rows([course({ name: "English Language Arts 9", subject: "english" })]);
  assert.equal(p!.rows[0]!.subject, "Languages");
  assert.equal(p!.rows[0]!.title, "OTHER ENGLISH");
  assert.deepEqual(p!.warnings, ["English Language Arts 9: Course/Exam Content set to OTHER ENGLISH; pick a closer title on STARS if there is one"]);
});

test("the generic-title override wins when it is in the subject's list", () => {
  const [p] = rows([course({ name: "Honors Pre-Calc", overrides: { stars: { genericTitle: "precalculus" } } })]);
  assert.equal(p!.rows[0]!.title, "PRECALCULUS");
});

test("a printed year grade means Full Year with only that grade; in-progress terms are In Progress; a term not taken is No Grade", () => {
  const [a] = rows([course({ finalGrade: "94", credit: 1 })]);
  assert.equal(a!.rows[0]!.length, "Full Year");
  assert.deepEqual(a!.rows[0]!.boxes, [{ grade: "94", credit: "1" }]);
  const [b] = rows([course({ terms: [term("S1", "88"), { term: "S2", grade: "", status: "in_progress" }] })]);
  assert.deepEqual(b!.rows[0]!.boxes.map((x) => x.grade), ["88", "In Progress"]);
  const [c] = rows([course({ terms: [{ term: "S1", grade: "", status: "none" }, term("S2", "90")] })]);
  assert.deepEqual(c!.rows[0]!.boxes.map((x) => x.grade), ["No Grade - Not In Progress", "90"]);
});

test("grades STARS cannot take are left blank and reported, never converted", () => {
  assert.equal(starsIntlGrade("93"), "93");
  assert.equal(starsIntlGrade("093"), "93");
  assert.equal(starsIntlGrade("93.5"), null);
  assert.equal(starsIntlGrade("pass/fail - pass"), "Pass/Fail - Pass");
  const [p] = rows([course({ terms: [term("S1", "A"), term("S2", "95")] })]);
  assert.equal(p!.rows[0]!.boxes[0]!.grade, null);
  assert.ok(p!.skipped.some((s) => s.field === "S1 grade"));
});

test("a 100-point course asks which passing mark; IB has one scale", () => {
  const [p] = rows([course(), course({ id: "ib", name: "IB Biology HL", subject: "science", level: "ib_hl", scale: "ib_7", terms: [term("S1", "6"), term("S2", "7")] })]);
  assert.equal(p!.scaleQuestions.length, 1);
  assert.equal(starsScaleFor(p!.rows[0]!, []), null);
  assert.equal(starsScaleFor(p!.rows[0]!, ["100-Point (100-90=A, 80-89=B...Pass=60)"]), "100-Point (100-90=A, 80-89=B...Pass=60)");
  assert.equal(starsScaleFor(p!.rows[1]!, []), "IB--Int'l Bac 7-point (7=A  6=A-  5=B...)");
  assert.equal(p!.rows[1]!.level, "IB (Higher/HL)");
});

test("letter grades have no scale on the international page", () => {
  const [p] = rows([course({ scale: "letter_plus_minus", terms: [term("S1", "A")] })]);
  assert.ok(p!.skipped.some((s) => s.field === "Grading Scale"));
});

test("keep mode skips names already on the page (STARS upper-cases them)", () => {
  const [p] = rows([course(), course({ id: "g", name: "Geometry" })]);
  assert.deepEqual(starsRowsToAdd(p!.rows, ["ALGEBRA 1", "ALGEBRA 1"]).map((r) => r.name), ["Geometry"]);
});

test("starsTitle from an AI must be one of STARS's titles", () => {
  assert.deepEqual(starsTitleOverride("calculus", {}).overrides, { stars: { genericTitle: "CALCULUS" } });
  const bad = starsTitleOverride("AP CALC", {});
  assert.deepEqual(bad.overrides, {});
  assert.equal(bad.warnings.length, 1);
});
