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
