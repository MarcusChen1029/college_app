import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTokenFromRedirect, parseTranscriptResponse } from "./auth.ts";

test("parseTokenFromRedirect reads the token from the fragment", () => {
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#token=ab12"), "ab12");
});

test("parseTokenFromRedirect returns null without a token", () => {
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/"), null);
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#"), null);
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#token="), null);
  assert.equal(parseTokenFromRedirect("not a url"), null);
});

test("parseTokenFromRedirect returns null on access_denied / error", () => {
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#error=denied"), null);
  assert.equal(parseTokenFromRedirect("https://x.chromiumapp.org/#error=access_denied"), null);
});

test("parseTranscriptResponse maps error bodies", () => {
  assert.deepEqual(parseTranscriptResponse({ ok: false, error: "invalid_token" }), { ok: false, reason: "signed_out" });
  assert.deepEqual(parseTranscriptResponse({ ok: false, error: "students_only" }), { ok: false, reason: "students_only" });
  assert.deepEqual(parseTranscriptResponse({ ok: false, error: "something_else" }), { ok: false, reason: "network" });
});

test("parseTranscriptResponse treats garbage as a network failure", () => {
  assert.deepEqual(parseTranscriptResponse("x"), { ok: false, reason: "network" });
  assert.deepEqual(parseTranscriptResponse(null), { ok: false, reason: "network" });
  assert.deepEqual(parseTranscriptResponse({ ok: true }), { ok: false, reason: "network" });
  assert.deepEqual(parseTranscriptResponse({ ok: true, schools: "x", courses: [] }), { ok: false, reason: "network" });
});

test("parseTranscriptResponse camel-cases school and course rows", () => {
  const school = {
    id: "s1", name: "Lincoln High", country: "US", kind: "high_school", curriculum: "us",
    default_scale: "percent", default_period: "semester", first_year: 2022, last_year: 2026,
    printed_gpa: "3.9", printed_gpa_scale: "4.0", gpa_weighted: true, class_rank: null, notes: null,
    created_at: "2026-10-01T00:00:00Z",
  };
  const course = {
    id: "c1", school_id: "s1", academic_year: 2024, grade_level: 11, name: "AP Biology",
    period_type: "year", terms: null, final_grade: "A", grade_scale: "letter", scale_max: "4",
    level: "ap", credit: "1.0", credit_unit: "units", subject: "science", sub_subject: null,
    language_name: null, is_summer: false, is_repeat: false, is_college: false, college_name: null,
    is_withdrawn: false, notes: null, source: "manual", overrides: null, sort_order: 0,
    created_at: "2026-10-01T00:00:00Z",
  };
  const r = parseTranscriptResponse({ ok: true, schools: [school], courses: [course] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.schools.length, 1);
  assert.equal(r.courses.length, 1);
  assert.equal(r.schools[0].defaultScale, "percent");
  assert.equal(r.schools[0].printedGpa, "3.9");
  assert.equal(r.courses[0].academicYear, 2024);
  assert.equal(r.courses[0].gradeLevel, 11);
  assert.equal(r.courses[0].schoolId, "s1");
  assert.equal(r.courses[0].scaleMax, 4);
});
