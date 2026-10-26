import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPlan, rowValues } from "./system-fill.ts";
import { emptyCourse, emptySchool, type Term, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const school = (o: Partial<TranscriptSchool> = {}): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Lincoln High", country: "United States", ...o });
const course = (o: Partial<TranscriptCourse> = {}): TranscriptCourse => ({
  id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "English 10", subject: "english", academicYear: 2024, gradeLevel: 10, credit: 1,
  period: "semester", terms: [term("S1", "B+"), term("S2", "A-")], ...o,
});
const term = (t: Term["term"], grade: string, extra: Partial<Term> = {}): Term => ({ term: t, grade, status: "graded", ...extra });
const only = (p: ReturnType<typeof buildSystemPlan>) => p.groups.flatMap((g) => g.rows);
const field = (row: { fields: { key: string; value: string }[] }, key: string) => row.fields.find((f) => f.key === key)?.value;

test("groups courses by school, grade level and year, in grade order", () => {
  const p = buildSystemPlan("stars", [school()], [course({ id: "b", gradeLevel: 11, academicYear: 2025 }), course({ id: "a" })]);
  assert.deepEqual(p.groups.map((g) => g.title), ["Grade 10 · 2024-25 · Lincoln High", "Grade 11 · 2025-26 · Lincoln High"]);
});

test("UC drops +/- and writes NO / IP / PL", () => {
  const c = course({ terms: [term("S1", "B+"), { term: "S2", grade: "", status: "in_progress" }] });
  const [row] = only(buildSystemPlan("uc", [school()], [c]));
  assert.deepEqual(row!.grades.map((g) => g.value), ["B", "IP"]);
  const none = course({ terms: [{ term: "S1", grade: "", status: "none" }, { term: "S2", grade: "", status: "planned" }] });
  assert.deepEqual(only(buildSystemPlan("uc", [school()], [none]))[0]!.grades.map((g) => g.value), ["NO", "PL"]);
});

test("UC leaves out college, non-A-G and non-math 7th grade courses, with a reason", () => {
  const p = buildSystemPlan("uc", [school()], [
    course({ id: "1", isCollege: true }), course({ id: "2", subject: "pe_health", name: "PE" }), course({ id: "3", gradeLevel: 8, name: "Art 8", subject: "arts" }),
    course({ id: "4", gradeLevel: 8, name: "Algebra I", subject: "mathematics" }),
  ]);
  assert.equal(p.skipped.length, 3);
  const rows = only(p);
  assert.deepEqual(rows.map((r) => r.name), ["Algebra I"]);
  assert.deepEqual(rows[0]!.grades, []); // UC asks no grades for 7th/8th grade
  assert.equal(field(rows[0]!, "credit"), undefined); // UC has no credit field
});

test("STARS: a printed year grade means Full Year and only that grade", () => {
  const [row] = only(buildSystemPlan("stars", [school()], [course({ finalGrade: "A" })]));
  assert.equal(field(row!, "period"), "Full Year");
  assert.deepEqual(row!.grades, [{ term: "final", label: "Final", value: "A" }]);
});

test("STARS: term grades as printed, IP for unfinished terms, dual enrollment level and college", () => {
  const c = course({ isCollege: true, collegeName: "Austin CC", terms: [term("S1", "A-"), { term: "S2", grade: "", status: "in_progress" }] });
  const [row] = only(buildSystemPlan("stars", [school()], [c]));
  assert.deepEqual(row!.grades.map((g) => g.value), ["A-", "IP"]);
  assert.equal(field(row!, "level"), "Dual Enrollment");
  assert.equal(field(row!, "college"), "Austin CC");
  assert.equal(field(row!, "subject"), "English");
  assert.equal(field(row!, "credit"), "1");
});

test("Cal State Apply: per-term codes and the summer switch", () => {
  const c = course({ isSummer: true, terms: [term("S1", "A"), { term: "S2", grade: "", status: "none" }] });
  const [row] = only(buildSystemPlan("csu", [school()], [c]));
  assert.deepEqual(row!.grades.map((g) => g.value), ["A", "No Grade / No Course"]);
  assert.equal(field(row!, "summer"), "Yes");
  assert.equal(field(row!, "subject"), "B – English");
});

test("UIUC lists term grades and no final when terms exist; a year-only course gets its year grade", () => {
  const [a] = only(buildSystemPlan("uiuc", [school()], [course({ finalGrade: "A" })]));
  assert.deepEqual(a!.grades.map((g) => g.value), ["B+", "A-"]);
  const [b] = only(buildSystemPlan("uiuc", [school()], [course({ period: "full_year", terms: [term("FY", "93")] })]));
  assert.deepEqual(b!.grades, [{ term: "final", label: "Final", value: "93" }]);
  assert.equal(field(b!, "period"), "All Year");
});

test("UT leaves out unfinished courses and keeps the final grade beside term grades", () => {
  const p = buildSystemPlan("ut", [school()], [course({ id: "1", finalGrade: "A" }), course({ id: "2", terms: [{ term: "S1", grade: "", status: "in_progress" }] })]);
  assert.equal(p.skipped.length, 1);
  assert.deepEqual(only(p)[0]!.grades.map((g) => g.value), ["B+", "A-", "A"]);
});

test("overrides win over the map", () => {
  const c = course({ overrides: { stars: { subject: "Other Subject Area" } } });
  assert.equal(field(only(buildSystemPlan("stars", [school()], [c]))[0]!, "subject"), "Other Subject Area");
});

test("rowValues lists fields then grades", () => {
  const [row] = only(buildSystemPlan("uiuc", [school()], [course()]));
  const v = rowValues(row!);
  assert.equal(v[0]!.value, "English 10");
  assert.deepEqual(v.slice(-2).map((x) => x.value), ["B+", "A-"]);
});

test("STARS for a school outside the US uses that page's lists: English is under Languages, with the generic title", () => {
  const [row] = only(buildSystemPlan("stars", [school({ country: "Taiwan" })], [course({ name: "Algebra 1", subject: "mathematics", level: "honors" }), course({ id: "e" })]));
  assert.equal(field(row!, "subject"), "Mathematics");
  assert.equal(field(row!, "genericTitle"), "ALGEBRA 1");
  assert.equal(field(row!, "level"), "Honors");
  const eng = only(buildSystemPlan("stars", [school({ country: "Taiwan" })], [course()]))[0]!;
  assert.equal(field(eng, "subject"), "Languages");
  assert.equal(field(eng, "genericTitle"), "OTHER ENGLISH");
});
