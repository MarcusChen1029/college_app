import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUiucPlans, UIUC_COLLEGE_SKIP, UIUC_SUBJECT_UNDECIDED, uiucSubject, uiucType } from "./uiuc-fill.ts";
import { emptyCourse, emptySchool, type Term, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const school = (o: Partial<TranscriptSchool> = {}): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Kang Chiao International School - Linkou Campus", country: "Taiwan", kind: "high_school", defaultPeriod: "semester", ...o });
const term = (t: Term["term"], grade: string, extra: Partial<Term> = {}): Term => ({ term: t, grade, status: "graded", ...extra });
const course = (o: Partial<TranscriptCourse> = {}): TranscriptCourse => ({
  id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "Algebra 1", subject: "mathematics", subSubject: "algebra_1", level: "regular",
  academicYear: 2023, gradeLevel: 9, scale: "percent_100", period: "semester", terms: [term("S1", "93"), term("S2", "95")], ...o,
});

test("a semester school: one row per semester grade, on the 9-11 page, with UIUC's option values", () => {
  const [p] = buildUiucPlans([school()], [course()]);
  assert.equal(p!.gradeLevel, 9);
  assert.equal(p!.page, "lower");
  assert.equal(p!.path, "/Apply/Application/FreshmanSRAR");
  assert.equal(p!.year, "2023 - 2024");
  assert.deepEqual(p!.rows.map((r) => [r.name, r.year, r.term, r.subject, r.type, r.grade, r.repeat, r.blocked]), [
    ["Algebra 1", "1", ".2.1", "M", "None", "93", false, null],
    ["Algebra 1", "1", ".2.2", "M", "None", "95", false, null],
  ]);
});

test("a single-semester course gets one row; a not-taken term none; the final grade is never listed beside term grades", () => {
  const [p] = buildUiucPlans([school()], [
    course({ id: "1", name: "Health", subject: "pe_health", subSubject: null, terms: [term("S1", "88"), { term: "S2", grade: "", status: "none" }] }),
    course({ id: "2", name: "Biology", subject: "science", subSubject: "biology", finalGrade: "90", terms: [term("S1", "89"), term("S2", "91"), term("FY", "90")] }),
    course({ id: "3", name: "Chinese", subject: "world_language", subSubject: null, period: "full_year", terms: [term("FY", "97")] }),
  ]);
  assert.deepEqual(p!.rows.map((r) => [r.name, r.term, r.subject, r.grade]), [
    ["Health", ".2.1", "OTH", "88"],
    ["Biology", ".2.1", "SCI", "89"],
    ["Biology", ".2.2", "SCI", "91"],
    ["Chinese", ".1.1", "FL", "97"],
  ]);
});

test("12th grade goes to the Year 12 page with In Progress; an in-progress 9-11 term is left for the student", () => {
  const [p] = buildUiucPlans([school()], [course({ gradeLevel: 12, academicYear: 2026, level: "ap", name: "AP Calculus BC", terms: [{ term: "S1", grade: "", status: "in_progress" }, { term: "S2", grade: "", status: "planned" }] })]);
  assert.equal(p!.page, "upper");
  assert.equal(p!.path, "/Apply/Application/FreshmanSRAR?IsLower=False");
  assert.deepEqual(p!.rows.map((r) => [r.year, r.term, r.type, r.grade, r.blocked]), [["4", ".2.1", "AP", "In Progress", null], ["4", ".2.2", "AP", "In Progress", null]]);
  assert.ok(p!.warnings.some((w) => /planned, entered as In Progress/.test(w)));
  const [q] = buildUiucPlans([school()], [course({ gradeLevel: 11, terms: [term("S1", "90"), { term: "S2", grade: "", status: "in_progress" }] })]);
  assert.deepEqual(q!.rows.map((r) => [r.grade, r.blocked != null]), [["90", false], [null, true]]);
  assert.match(q!.rows[1]!.blocked!, /In Progress only on the Year 12 page/);
});

test("a missing grade is left with a reason; numeric grades are kept exactly as printed", () => {
  const [p] = buildUiucPlans([school()], [course({ terms: [term("S1", " 93.5 "), term("S2", "")] })]);
  assert.deepEqual(p!.rows.map((r) => r.grade), ["93.5", null]);
  assert.match(p!.rows[1]!.blocked!, /grade is missing/);
  assert.equal(p!.skipped.length, 1);
});

test("subjects: the UIUC tag wins, else the map's verified subject; unsure categories are left for the student", () => {
  assert.equal(uiucSubject(course({ subject: "career_technical", subSubject: null, overrides: { uiuc: { subject: "technical" } } })), "TECH");
  assert.equal(uiucSubject(course({ subject: "computer_science", subSubject: null, overrides: { uiuc: { subject: "Mathematics" } } })), "M");
  assert.equal(uiucSubject(course({ subject: "history_social", subSubject: null })), "S");
  assert.equal(uiucSubject(course({ subject: "arts", subSubject: "music" })), "OTH");
  assert.equal(uiucSubject(course({ subject: "computer_science", subSubject: null })), null);
  assert.equal(uiucSubject(course({ subject: "career_technical", subSubject: null })), null);
  const [p] = buildUiucPlans([school()], [course({ subject: "computer_science", subSubject: null, name: "Web Design" })]);
  assert.ok(p!.rows.every((r) => r.blocked === UIUC_SUBJECT_UNDECIDED && r.subject === null));
  assert.deepEqual(p!.skipped.map((s) => [s.course, s.reason]), [["Web Design", UIUC_SUBJECT_UNDECIDED]]);
});

test("types: levels map to UIUC's values, overrides by value or label, A Level never chosen, unknown levels fall back to Regular with a warning", () => {
  const t = (o: Partial<TranscriptCourse>) => uiucType(course(o));
  assert.deepEqual(t({ level: "honors" }), { type: "Honors", warning: null });
  assert.deepEqual(t({ level: "ib_sl" }), { type: "IB SL", warning: null });
  assert.equal(t({ level: "regular", overrides: { uiuc: { level: "AP Course" } } }).type, "AP");
  assert.equal(t({ level: "regular", overrides: { uiuc: { level: "High Honors" } } }).type, "High Honors");
  assert.equal(t({ level: "a_level", overrides: { uiuc: { level: "A Level" } } }).type, null);
  const r = t({ level: "intensive" });
  assert.equal(r.type, "None");
  assert.match(r.warning!, /entered as Regular/);
});

test("college courses are skipped with the Education-page reason; repeats are ticked; summer courses use the Summer term", () => {
  const [p] = buildUiucPlans([school()], [
    course({ id: "1", name: "Calculus I (NTU)", isCollege: true }),
    course({ id: "2", name: "Algebra 1", isRepeat: true }),
    course({ id: "3", name: "Summer Geometry", isSummer: true, subSubject: "geometry", period: "full_year", terms: [], finalGrade: "A" }),
  ]);
  assert.deepEqual(p!.skipped.map((s) => [s.course, s.reason]), [["Calculus I (NTU)", UIUC_COLLEGE_SKIP]]);
  assert.deepEqual(p!.rows.map((r) => [r.name, r.term, r.repeat]), [["Algebra 1", ".2.1", true], ["Algebra 1", ".2.2", true], ["Summer Geometry", ".5.1", false]]);
});

test("plans come per school and grade level in grade order; grades outside 9-12 and other kinds of school are ignored", () => {
  const plans = buildUiucPlans([school(), school({ id: "u", kind: "college", name: "NTU" })], [
    course({ id: "a", gradeLevel: 11, academicYear: 2025 }), course({ id: "b", gradeLevel: 9 }), course({ id: "c", gradeLevel: 8 }), course({ id: "d", schoolId: "u" }),
  ]);
  assert.deepEqual(plans.map((p) => [p.gradeLevel, p.page, p.year]), [[9, "lower", "2023 - 2024"], [11, "lower", "2025 - 2026"]]);
});
