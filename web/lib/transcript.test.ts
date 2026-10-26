import assert from "node:assert/strict";
import { test } from "node:test";
import {
  courseIssues,
  courseKey,
  courseStatus,
  emptyCourse,
  emptySchool,
  LIMITS,
  mergeTranscripts,
  SUB_SUBJECTS,
  validateCourse,
  validateSchool,
  type TranscriptCourse,
  type TranscriptSchool,
} from "./transcript.ts";

const base = () => ({ ...emptyCourse("sch-1"), name: "AP Calculus BC", period: "semester" as const, credit: 1, terms: [{ term: "S1", grade: "A", status: "graded" }, { term: "S2", grade: "A-", status: "graded" }] });

const school = (o: Partial<TranscriptSchool>): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Lincoln High", ...o });
const course = (o: Partial<TranscriptCourse>): TranscriptCourse => ({ id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "Biology", ...o });

test("validateCourse trims, defaults and mirrors the table checks", () => {
  const ok = validateCourse({ ...base(), name: "  AP Calculus BC ", notes: " good " });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value.name, "AP Calculus BC");
    assert.equal(ok.value.notes, "good");
    assert.deepEqual(ok.value.terms.map((t) => t.term), ["S1", "S2"]);
  }
  assert.equal(validateCourse({ ...base(), name: "a".repeat(LIMITS.courseName + 1) }).ok, false);
  const badLevel = validateCourse({ ...base(), level: "super_honors" });
  assert.equal(badLevel.ok, false);
  if (!badLevel.ok) assert.ok(badLevel.errors.some((e) => /level/i.test(e)));
  assert.equal(validateCourse({ ...base(), credit: LIMITS.credit + 1 }).ok, false);
  assert.equal(validateCourse({ ...base(), credit: -1 }).ok, false);
  assert.equal(validateCourse({ ...base(), terms: [{ term: "Q1", grade: "A", status: "graded" }] }).ok, false);
  assert.equal(validateCourse({ ...base(), subject: "arts", subSubject: "visual" }).ok, true);
  assert.equal(validateCourse({ ...base(), subject: "english", subSubject: "visual" }).ok, false);
});

test("validateCourse accepts CJK names up to the limit", () => {
  assert.equal(validateCourse({ ...base(), name: "微積分 AP" }).ok, true);
  assert.equal(validateCourse({ ...base(), name: "微".repeat(LIMITS.courseName) }).ok, true);
  assert.equal(validateCourse({ ...base(), name: "微".repeat(LIMITS.courseName + 1) }).ok, false);
});

test("validateCourse collects every error", () => {
  const r = validateCourse({ ...base(), name: "  ", level: "nope" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.length, 2);
});

test("validateSchool requires a name and valid enums", () => {
  assert.equal(validateSchool({ ...emptySchool(), name: "Lincoln High" }).ok, true);
  assert.equal(validateSchool({ ...emptySchool(), name: " " }).ok, false);
  assert.equal(validateSchool({ ...emptySchool(), name: "X", kind: "bogus" }).ok, false);
});

test("courseStatus is derived from the terms", () => {
  const g = { term: "S1", grade: "A", status: "graded" } as const;
  assert.equal(courseStatus({ terms: [g, g], finalGrade: null }), "graded");
  assert.equal(courseStatus({ terms: [g, { ...g, term: "S2", status: "in_progress" }], finalGrade: null }), "in_progress");
  assert.equal(courseStatus({ terms: [{ ...g, status: "planned" }, { ...g, term: "S2", status: "planned" }], finalGrade: null }), "planned");
  assert.equal(courseStatus({ terms: [], finalGrade: "A" }), "graded");
  assert.equal(courseStatus({ terms: [g], finalGrade: null }), "graded");
});

test("courseIssues flags graded terms with no grade, and courses with no grade at all", () => {
  const g = { term: "S1", grade: "A", status: "graded" } as const;
  assert.deepEqual(courseIssues({ terms: [g, { ...g, term: "S2" }], finalGrade: null, isWithdrawn: false }), []);
  assert.deepEqual(courseIssues({ terms: [g, { ...g, term: "S2", grade: "  " }], finalGrade: null, isWithdrawn: false }), ["Semester 2 is marked Graded but has no grade."]);
  // A blank grade is fine while the term is in progress or planned.
  assert.deepEqual(courseIssues({ terms: [{ ...g, grade: "", status: "in_progress" }, { ...g, term: "S2", grade: "", status: "planned" }], finalGrade: null, isWithdrawn: false }), []);
  assert.equal(courseIssues({ terms: [], finalGrade: null, isWithdrawn: false }).length, 1);
  assert.deepEqual(courseIssues({ terms: [], finalGrade: "B+", isWithdrawn: false }), []);
  assert.deepEqual(courseIssues({ terms: [], finalGrade: null, isWithdrawn: true }), []);
  // Withdrawn does not excuse a term that claims a grade it doesn't have.
  assert.equal(courseIssues({ terms: [{ ...g, grade: "" }], finalGrade: null, isWithdrawn: true }).length, 1);
});

test("courseKey ignores case, spacing and full-width characters", () => {
  const a = courseKey("Lincoln High", { academicYear: 2025, name: "AP  Calculus BC", period: "semester" });
  const b = courseKey("lincoln high", { academicYear: 2025, name: "ap calculus bc", period: "semester" });
  const c = courseKey("Lincoln High", { academicYear: 2025, name: "ＡＰ Calculus BC", period: "semester" });
  assert.equal(a, b);
  assert.equal(a, c);
  assert.notEqual(a, courseKey("Lincoln High", { academicYear: 2026, name: "AP Calculus BC", period: "semester" }));
});

test("mergeTranscripts dedupes by key and remaps school ids", () => {
  const remoteSchool = school({ id: "r1", name: "Lincoln High" });
  const remoteCourse = course({ id: "rc1", schoolId: "r1", name: "Biology", academicYear: 2025 });
  const localSchool = school({ id: "l1", name: "lincoln high" });
  const dup = course({ id: "lc1", schoolId: "l1", name: "BIOLOGY", academicYear: 2025 });
  const fresh = course({ id: "lc2", schoolId: "l1", name: "Chemistry", academicYear: 2025 });
  const otherSchool = school({ id: "l2", name: "Taipei Senior High" });
  const m = mergeTranscripts({ schools: [localSchool, otherSchool], courses: [dup, fresh] }, { schools: [remoteSchool], courses: [remoteCourse] });
  assert.deepEqual(m.toInsertSchools.map((s) => s.id), ["l2"]);
  assert.deepEqual(m.toInsertCourses.map((c) => [c.id, c.schoolId]), [["lc2", "r1"]]);
  assert.equal(m.courses.length, 2);
  assert.equal(m.schools.length, 2);
  // merging the same local data again adds nothing
  const again = mergeTranscripts({ schools: [localSchool, otherSchool], courses: [dup, fresh] }, { schools: m.schools, courses: m.courses });
  assert.equal(again.toInsertSchools.length, 0);
  assert.equal(again.toInsertCourses.length, 0);
});

test("arts sub-subjects keep performing arts distinguishable", () => {
  assert.deepEqual(SUB_SUBJECTS.arts, ["visual", "music", "theater", "dance", "interdisciplinary"]);
});

test("numeric grades are kept as text instead of being dropped", () => {
  const r = validateCourse({ ...base(), finalGrade: 95, terms: [{ term: "S1", grade: 92, gradeWeighted: 4.7, status: "graded" }] });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.finalGrade, "95");
    assert.equal(r.value.terms[0].grade, "92");
    assert.equal(r.value.terms[0].gradeWeighted, "4.7");
  }
  assert.equal(validateCourse({ ...base(), finalGrade: true }).ok, false);
});

test("courseKey tells a repeat or summer course from the original", () => {
  const a = { academicYear: 2025, name: "Algebra", period: "semester" as const };
  assert.notEqual(courseKey("S", a), courseKey("S", { ...a, isRepeat: true }));
  assert.notEqual(courseKey("S", a), courseKey("S", { ...a, isSummer: true }));
  assert.equal(courseKey("S", a), courseKey("S", { ...a, isRepeat: false, isSummer: false }));
});

test("math sub-subjects cover Common App's Pre-Algebra and Trigonometry", () => {
  assert.ok(SUB_SUBJECTS.mathematics.includes("pre_algebra"));
  assert.ok(SUB_SUBJECTS.mathematics.includes("trigonometry"));
});

test("term credits: validated like the course credit, blank is null, and their sum becomes the course credit", () => {
  const t = (term: string, credit: unknown, status = "graded", grade = "A") => ({ term, grade, status, credit });
  const sum = validateCourse({ ...base(), credit: 9, terms: [t("S1", 2), t("S2", "2.5")] });
  assert.equal(sum.ok, true);
  if (sum.ok) {
    assert.deepEqual(sum.value.terms.map((x) => x.credit), [2, 2.5]);
    assert.equal(sum.value.credit, 4.5);
  }
  // Uneven credits add up; a "none" (no grade) term counts as 0 whatever it carries.
  const uneven = validateCourse({ ...base(), credit: null, terms: [t("S1", 3), t("S2", 2)] });
  assert.equal(uneven.ok && uneven.value.credit, 5);
  const none = validateCourse({ ...base(), credit: null, terms: [t("S1", 2), t("S2", 2, "none", "")] });
  assert.equal(none.ok && none.value.credit, 2);
  // Blank term credits are null and leave the course credit as typed.
  const blank = validateCourse({ ...base(), credit: 1, terms: [t("S1", ""), t("S2", null)] });
  assert.equal(blank.ok, true);
  if (blank.ok) {
    assert.deepEqual(blank.value.terms, [{ term: "S1", grade: "A", status: "graded" }, { term: "S2", grade: "A", status: "graded" }]);
    assert.equal(blank.value.credit, 1);
  }
  // Only "none" terms with a credit (0) do not wipe the course credit.
  const onlyNone = validateCourse({ ...base(), credit: 1, terms: [t("S1", null), t("S2", 0, "none", "")] });
  assert.equal(onlyNone.ok && onlyNone.value.credit, 1);
  // Floating-point sums stay tidy.
  const tidy = validateCourse({ ...base(), credit: null, terms: [t("S1", 0.1), t("S2", 0.2)] });
  assert.equal(tidy.ok && tidy.value.credit, 0.3);
  // Same limits as the course credit.
  assert.equal(validateCourse({ ...base(), terms: [t("S1", -1)] }).ok, false);
  assert.equal(validateCourse({ ...base(), terms: [t("S1", LIMITS.credit + 1)] }).ok, false);
  assert.equal(validateCourse({ ...base(), terms: [t("S1", "two")] }).ok, false);
  // A sum over the limit is refused rather than stored.
  assert.equal(validateCourse({ ...base(), terms: [t("S1", 60), t("S2", 60)] }).ok, false);
});
