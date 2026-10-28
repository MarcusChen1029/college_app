import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseActivitiesResponse, parseTokenFromRedirect, parseTranscriptResponse } from "./auth.ts";

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

// ---- activities (extension_activities, migration 0039) ----------------------------------------------------------------

const v1Fixture = JSON.parse(readFileSync(new URL("../../web/lib/fixtures/activities-v1.json", import.meta.url), "utf8")) as {
  student: string;
  activities: unknown;
}[];

test("parseActivitiesResponse maps error bodies (an old transcript-only token must reconnect)", () => {
  assert.deepEqual(parseActivitiesResponse({ ok: false, error: "no_scope" }), { ok: false, reason: "reconnect" });
  assert.deepEqual(parseActivitiesResponse({ ok: false, error: "invalid_token" }), { ok: false, reason: "signed_out" });
  assert.deepEqual(parseActivitiesResponse({ ok: false, error: "students_only" }), { ok: false, reason: "students_only" });
  assert.deepEqual(parseActivitiesResponse({ ok: false, error: "something_else" }), { ok: false, reason: "network" });
});

test("parseActivitiesResponse treats garbage as a network failure", () => {
  assert.deepEqual(parseActivitiesResponse("x"), { ok: false, reason: "network" });
  assert.deepEqual(parseActivitiesResponse(null), { ok: false, reason: "network" });
  assert.deepEqual(parseActivitiesResponse([]), { ok: false, reason: "network" });
  assert.deepEqual(parseActivitiesResponse({ ok: true }), { ok: false, reason: "network" });
  assert.deepEqual(parseActivitiesResponse({ ok: true, activities: "x" }), { ok: false, reason: "network" });
  assert.deepEqual(parseActivitiesResponse({ ok: true, activities: [] }), { ok: false, reason: "network" });
});

test("parseActivitiesResponse upgrades a v1-shaped body to version 2", () => {
  const v1 = v1Fixture.find((f) => f.student === "types-1-10")!.activities;
  const r = parseActivitiesResponse({ ok: true, activities: v1 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.version, 2);
  assert.equal(r.data.commonApp.activities.length, 10);
  assert.equal(r.data.commonApp.activities[0].organization, "Org 01");
  assert.ok(Array.isArray(r.data.commonApp.honors));
  assert.ok(Array.isArray(r.data.uc));
});

test("parseActivitiesResponse keeps a v2 body and reads an empty one as no entries", () => {
  const v2 = { version: 2, commonApp: { activities: [], honors: [{ id: "h1", title: "Science Olympiad medal", grades: ["11"], levels: ["national"] }] }, uc: [] };
  const r = parseActivitiesResponse({ ok: true, activities: v2 });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.data.commonApp.honors, [{ id: "h1", title: "Science Olympiad medal", grades: ["11"], levels: ["national"] }]);
  const empty = parseActivitiesResponse({ ok: true, activities: {} });
  assert.deepEqual(empty, { ok: true, data: { version: 2, commonApp: { activities: [], honors: [] }, uc: [] } });
});
