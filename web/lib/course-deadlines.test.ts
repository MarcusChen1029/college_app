import assert from "node:assert/strict";
import { test } from "node:test";

import type { CourseInfo, Intake } from "./checklist.ts";
import { collegePageDeadlines, deadlinesForEntry, normalIntake, universityDeadlines } from "./course-deadlines.ts";

type Row = { label: string; kind: string; program_id?: string | null; intake?: Intake | null };
const labels = (rows: Row[]) => rows.map((r) => r.label);

const course = (id: string): CourseInfo => ({
  id, slug: id, name: id, ucasCode: null, aLevelOffer: null, ibOffer: null, apOffer: null, atar: null, admissionsTest: null, applicationDeadline: null,
});
const X = course("px");

// GB: U13 = uni application 13 Jan, U15 = uni application 15 Oct, S = uni scholarship, CX = application for program X, CY = for program Y.
const gb: Row[] = [
  { label: "U13", kind: "application", program_id: null },
  { label: "U15", kind: "application", program_id: null },
  { label: "S", kind: "scholarship", program_id: null },
  { label: "CX", kind: "application", program_id: "px" },
  { label: "CY", kind: "application", program_id: "py" },
];
// AU: A1 = uni application Semester 1, A2 = uni application Semester 2, K1 = application for program X, Semester 1.
const au: Row[] = [
  { label: "A1", kind: "application", program_id: null, intake: "s1" },
  { label: "A2", kind: "application", program_id: null, intake: "s2" },
  { label: "K1", kind: "application", program_id: "px", intake: "s1" },
];

test("US rows pass through unchanged", () => {
  const us: Row[] = [
    { label: "ED", kind: "application" },
    { label: "RD", kind: "application" },
    { label: "Aid", kind: "financial_aid" },
  ];
  assert.deepEqual(labels(deadlinesForEntry(us, { course: null, intake: null })), ["ED", "RD", "Aid"]);
  assert.deepEqual(labels(deadlinesForEntry(us, { course: X, intake: "s1" })), ["ED", "RD", "Aid"]);
  assert.deepEqual(labels(deadlinesForEntry(us, { course: null, intake: undefined })), ["ED", "RD", "Aid"]);
});

test("course row replaces university application rows", () => {
  // Only the application rows are replaced: the scholarship stays, in input order (rule 3).
  assert.deepEqual(labels(deadlinesForEntry(gb, { course: X, intake: null })), ["S", "CX"]);
});

test("no course keeps university rows and hides course rows", () => {
  assert.deepEqual(labels(deadlinesForEntry(gb, { course: null, intake: null })), ["U13", "U15", "S"]);
});

test("other courses' rows never show", () => {
  assert.ok(!labels(deadlinesForEntry(gb, { course: X, intake: null })).includes("CY"));
  assert.deepEqual(labels(deadlinesForEntry(gb, { course: course("py"), intake: null })), ["S", "CY"]);
});

test("unknown course falls back to university rows", () => {
  // courseFor returned null for a slug that is no longer in the data.
  assert.deepEqual(labels(deadlinesForEntry(gb, { course: null, intake: "s1" })), ["U13", "U15", "S"]);
});

test("AU intake", () => {
  assert.deepEqual(labels(deadlinesForEntry(au, { course: X, intake: "s2" })), ["A2"]);
  assert.deepEqual(labels(deadlinesForEntry(au, { course: X, intake: "s1" })), ["K1"]);
  assert.deepEqual(labels(deadlinesForEntry(au, { course: X, intake: null })), ["A2", "K1"]);
  assert.deepEqual(labels(deadlinesForEntry(au, { course: null, intake: null })), ["A1", "A2"]);
  assert.deepEqual(labels(deadlinesForEntry(au, { course: null, intake: "s2" })), ["A2"]);
  // An odd stored value counts as no intake.
  assert.deepEqual(labels(deadlinesForEntry(au, { course: X, intake: "s3" as unknown as Intake })), ["A2", "K1"]);
});

test("a course row never removes rows of other kinds or other intakes", () => {
  const rows: Row[] = [
    { label: "U", kind: "application", program_id: null, intake: "s2" },
    { label: "K", kind: "application", program_id: "px", intake: "s1" },
    { label: "F", kind: "financial_aid", program_id: null, intake: null },
  ];
  assert.deepEqual(labels(deadlinesForEntry(rows, { course: X, intake: null })), ["U", "K", "F"]);
});

test("a course's row of another kind (e.g. its admissions test date) shows only for that course and replaces nothing", () => {
  // UCL: "LNAT must be taken by" belongs to Law (py); a Computer Science student (px) never sees it.
  const rows: Row[] = [...gb, { label: "LNAT", kind: "other", program_id: "py" }];
  assert.deepEqual(labels(deadlinesForEntry(rows, { course: X, intake: null })), ["S", "CX"]);
  assert.deepEqual(labels(deadlinesForEntry(rows, { course: course("py"), intake: null })), ["S", "CY", "LNAT"]);
  assert.deepEqual(labels(deadlinesForEntry(rows, { course: null, intake: null })), ["U13", "U15", "S"]);
  // alone (no course application row), it does not replace the university's application rows
  const only: Row[] = [{ label: "U", kind: "application", program_id: null }, { label: "T", kind: "other", program_id: "px" }];
  assert.deepEqual(labels(deadlinesForEntry(only, { course: X, intake: null })), ["U", "T"]);
});

test("collegePageDeadlines keeps the university's rows and a course's rows of other kinds (the course table has its dates)", () => {
  const rows: Row[] = [...gb, { label: "LNAT", kind: "other", program_id: "py" }, { label: "TS", kind: "scholarship", program_id: "px" }];
  assert.deepEqual(labels(collegePageDeadlines(rows)), ["U13", "U15", "S", "LNAT", "TS"]);
  const plain = [{ label: "a", kind: "application" }, { label: "b", kind: "other", program_id: null }];
  assert.deepEqual(collegePageDeadlines(plain).map((r) => r.label), ["a", "b"]);
});

test("normalIntake", () => {
  assert.equal(normalIntake("s1"), "s1");
  assert.equal(normalIntake("s2"), "s2");
  for (const v of ["s3", "", 2, undefined, null, {}]) assert.equal(normalIntake(v), null);
});

test("universityDeadlines drops course rows", () => {
  assert.deepEqual(labels(universityDeadlines(gb)), ["U13", "U15", "S"]);
  const plain = [{ label: "a" }, { label: "b", program_id: null }, { label: "c", program_id: "px" }];
  assert.deepEqual(universityDeadlines(plain).map((r) => r.label), ["a", "b"]);
});
