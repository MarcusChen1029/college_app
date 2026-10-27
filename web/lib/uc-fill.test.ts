import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUcPlans, ucDiscipline, ucGrade } from "./uc-fill.ts";
import { emptyCourse, emptySchool, type Term, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const school = (o: Partial<TranscriptSchool> = {}): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Kang Chiao", country: "Taiwan", kind: "high_school", defaultPeriod: "semester", ...o });
const term = (t: Term["term"], grade: string, extra: Partial<Term> = {}): Term => ({ term: t, grade, status: "graded", ...extra });
const course = (o: Partial<TranscriptCourse> = {}): TranscriptCourse => ({
  id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "Algebra 1", subject: "mathematics", subSubject: "algebra_1", level: "regular",
  academicYear: 2023, gradeLevel: 9, scale: "percent_100", period: "semester", terms: [term("S1", "93"), term("S2", "95")], ...o,
});

test("one plan per grade level with UC's year wording; subject, honors and grades", () => {
  const [p] = buildUcPlans([school()], [course()]);
  assert.equal(p!.gradeLevel, 9);
  assert.equal(p!.year, "2023 - 2024");
  const r = p!.rows[0]!;
  assert.deepEqual(r.discipline, { area: "Mathematics", text: "Algebra I", value: "6" });
  assert.equal(r.honors, "NH");
  assert.deepEqual(r.grades, ["93", "95"]);
});

test("UC codes: NO, IP, PL; + and - dropped; Pass/Fail and decimals left blank", () => {
  assert.equal(ucGrade("B+"), "B");
  assert.equal(ucGrade("93"), "93");
  assert.equal(ucGrade("93.5"), null);
  assert.equal(ucGrade("P"), null);
  const [p] = buildUcPlans([school()], [course({ gradeLevel: 12, academicYear: 2026, terms: [{ term: "S1", grade: "", status: "in_progress" }, { term: "S2", grade: "", status: "planned" }] })]);
  assert.deepEqual(p!.rows[0]!.grades, ["IP", "PL"]);
  const [q] = buildUcPlans([school()], [course({ terms: [{ term: "S1", grade: "", status: "none" }, term("S2", "93.5")] })]);
  assert.deepEqual(q!.rows[0]!.grades, ["NO", null]);
});

test("subjects: language year from the name, history by name, unknown left for the student", () => {
  assert.equal(ucDiscipline(course({ subject: "world_language", subSubject: null, name: "Chinese 2" }))?.text, "Yr 2 Lang Other Than English");
  assert.equal(ucDiscipline(course({ subject: "world_language", subSubject: null, name: "Spanish V" }))?.text, "Yr 4+ Lang Other Than English");
  assert.equal(ucDiscipline(course({ subject: "history_social", subSubject: null, name: "AP US History" }))?.text, "U.S. History");
  assert.equal(ucDiscipline(course({ subject: "history_social", subSubject: null, name: "Psychology" })), null);
  assert.equal(ucDiscipline(course({ subject: "english", subSubject: null, name: "ESL 9" }))?.text, "English-ESL/ELD");
  assert.equal(ucDiscipline(course({ subject: "computer_science", subSubject: null, name: "AP CS A" })), null);
  assert.equal(ucDiscipline(course({ overrides: { uc: { subSubject: "Statistics" } } }))?.value, "15");
});

test("college, PE and business courses are left out; honors abroad is NH, AP and IB keep their code", () => {
  const [p] = buildUcPlans([school()], [
    course({ id: "1", isCollege: true }), course({ id: "2", subject: "pe_health", name: "PE" }), course({ id: "3", level: "honors", name: "Hon Chem", subject: "science", subSubject: "chemistry" }),
    course({ id: "4", level: "ap", name: "AP Calc", subSubject: "calculus" }), course({ id: "5", level: "ib_hl", name: "IB Bio", subject: "science", subSubject: "biology" }),
  ]);
  assert.deepEqual(p!.rows.map((r) => [r.name, r.honors]), [["Hon Chem", "NH"], ["AP Calc", "AP"], ["IB Bio", "IB"]]);
  assert.equal(p!.skipped.length, 2);
});

test("language course gets UC's language, Other Language when it isn't listed", () => {
  const [p] = buildUcPlans([school()], [course({ subject: "world_language", subSubject: null, name: "Chinese 1", languageName: "chinese" }), course({ id: "x", subject: "world_language", subSubject: null, name: "Thai 1", languageName: "Thai" })]);
  assert.deepEqual(p!.rows.map((r) => r.language), ["Chinese", "Other Language"]);
});

test("from the transcript: a language's year by its earlier years, computer science and AP Seminar as electives, with a warning each", () => {
  const lang = (id: string, year: number, name: string) =>
    course({ id, academicYear: year, gradeLevel: year - 2014, subject: "world_language", subSubject: null, name, languageName: "Chinese" });
  const plans = buildUcPlans([school()], [
    lang("a", 2023, "Honors Chinese Language and Culture I"), lang("b", 2024, "Honors Chinese Language and Culture II"), lang("c", 2025, "AP Chinese Language and Culture"),
    course({ id: "d", academicYear: 2024, gradeLevel: 10, subject: "computer_science", subSubject: null, name: "Information Technology 10" }),
    course({ id: "e", academicYear: 2024, gradeLevel: 10, subject: "other", subSubject: null, level: "ap", name: "AP Seminar" }),
  ]);
  const row = (name: string) => plans.flatMap((p) => p.rows).find((r) => r.name === name)!;
  assert.equal(row("AP Chinese Language and Culture").discipline?.text, "Yr 3 Lang Other Than English");
  assert.equal(row("Information Technology 10").discipline?.text, "Elective -Math -Computer Science");
  assert.equal(row("AP Seminar").discipline?.text, "Elective -Interdisciplinary");
  assert.equal(plans.flatMap((p) => p.warnings).filter((w) => /entered as/.test(w)).length, 3);
});

test("courses with no A-G area (home economics, counseling) are left out like PE, not left for the student", () => {
  const [p] = buildUcPlans([school()], [course({ id: "h", subject: "other", subSubject: null, name: "Home Economics 9" }), course({ id: "k", subject: "other", subSubject: null, name: "College Counseling 11" })]);
  assert.equal(p!.rows.length, 0);
  assert.deepEqual(p!.skipped.map((s) => s.field), ["course", "course"]);
});
