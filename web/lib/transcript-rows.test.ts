import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fromTranscriptCourse,
  fromTranscriptSchool,
  toTranscriptCourse,
  toTranscriptSchool,
  transcriptCourseColumns,
  transcriptSchoolColumns,
  type TranscriptCourseRow,
  type TranscriptSchoolRow,
} from "./student-rows.ts";
import { emptyCourse, emptySchool, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const school: TranscriptSchool = { id: "s1", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Taipei First Girls' High School", country: "Taiwan", curriculum: "other", defaultScale: "percent_100", firstYear: 2023, lastYear: 2026, printedGpa: "92.5", gpaWeighted: false };

const course: TranscriptCourse = {
  id: "c1",
  createdAt: "2026-10-02T00:00:00Z",
  ...emptyCourse("s1"),
  name: "AP Calculus BC",
  academicYear: 2025,
  gradeLevel: 11,
  period: "semester",
  terms: [{ term: "S1", grade: "A", gradeWeighted: "5.0", status: "graded" }, { term: "S2", grade: "", status: "in_progress" }],
  finalGrade: null,
  level: "ap",
  credit: 1.5,
  subject: "mathematics",
  subSubject: "calculus",
  source: "ai_import",
  overrides: { common_app: { level: "Honors" } },
  sortOrder: 3,
};

test("a school survives the round trip through its row", () => {
  const row = { ...fromTranscriptSchool("u1", school), created_at: school.createdAt } as unknown as TranscriptSchoolRow;
  assert.deepEqual(toTranscriptSchool(row), school);
});

test("a course survives the round trip through its row", () => {
  const row = { ...fromTranscriptCourse("u1", course), created_at: course.createdAt } as unknown as TranscriptCourseRow;
  assert.deepEqual(toTranscriptCourse(row), course);
});

test("an empty final grade and null credit round trip as null", () => {
  const c: TranscriptCourse = { ...course, finalGrade: null, credit: null, gradeLevel: null, subSubject: null, scaleMax: null };
  const row = { ...fromTranscriptCourse("u1", c), created_at: c.createdAt } as unknown as TranscriptCourseRow;
  const back = toTranscriptCourse(row);
  assert.equal(back.finalGrade, null);
  assert.equal(back.credit, null);
  assert.equal(back.gradeLevel, null);
});

test("numeric columns that arrive as strings are read as numbers", () => {
  const row = { ...fromTranscriptCourse("u1", course), created_at: course.createdAt, credit: "1.5", scale_max: "100" } as unknown as TranscriptCourseRow;
  const back = toTranscriptCourse(row);
  assert.equal(back.credit, 1.5);
  assert.equal(back.scaleMax, 100);
});

test("writable columns leave out ids and timestamps", () => {
  for (const cols of [transcriptCourseColumns(course), transcriptSchoolColumns(school)] as Record<string, unknown>[]) {
    assert.equal("id" in cols, false);
    assert.equal("user_id" in cols, false);
    assert.equal("created_at" in cols, false);
    assert.equal("updated_at" in cols, false);
  }
  assert.equal(fromTranscriptCourse("u1", course).user_id, "u1");
  assert.equal(fromTranscriptCourse("u1", course).school_id, "s1");
});
